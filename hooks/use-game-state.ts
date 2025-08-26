"use client";

import { useState, useEffect, useCallback } from "react";
import { assignRoles } from "@/lib/game-logic";
import { wsClient } from "@/lib/websocket-client";
import type {
  GamePhase,
  Player,
  Game,
  GameSettings,
  NightAction,
} from "@/lib/types";

/** Hook dönen tip */
interface GameStateHook {
  game: Game | null;
  players: Player[];
  currentPhase: GamePhase;
  timeRemaining: number;
  currentTurn: number;
  nightActions: NightAction[];
  votes: Record<string, string>;
  voteCount: Record<string, number>;
  isGameOwner: boolean;
  selectedCardDrawers: string[];
  currentCardDrawer: string | null;
  deathsThisTurn: Player[];
  deathLog: Player[];
  bombTargets: string[];
  playerNotes: Record<string, string[]>;
  startGame: (players: Player[], settings: GameSettings) => void;
  advancePhase: () => void;
  submitNightAction: (
    playerId: string,
    targetId: string | null,
    actionType:
      | "KILL"
      | "PROTECT"
      | "INVESTIGATE"
      | "BOMB_PLANT"
      | "BOMB_DETONATE",
  ) => void;
  submitVote: (voterId: string, targetId: string) => void;
  resetGame: () => void;
}

export function useGameState(currentPlayerId: string): GameStateHook {
  // ---- temel state
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPhase, setCurrentPhase] = useState<GamePhase>("LOBBY");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [voteCount, setVoteCount] = useState<Record<string, number>>({});
  const [phaseEndsAt, setPhaseEndsAt] = useState<number>(0);

  const [currentTurn, setCurrentTurn] = useState(1);
  const [nightActions, setNightActions] = useState<NightAction[]>([]);
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [selectedCardDrawers, setSelectedCardDrawers] = useState<string[]>([]);
  const [currentCardDrawer, setCurrentCardDrawer] = useState<string | null>(null);
  const [deathsThisTurn, setDeathsThisTurn] = useState<Player[]>([]);
  const [deathLog, setDeathLog] = useState<Player[]>([]);
  const [bombTargets, setBombTargets] = useState<string[]>([]);
  const [playerNotes, setPlayerNotes] = useState<Record<string, string[]>>({});

  const currentPlayer = players.find((p) => p.id === currentPlayerId);
  const isGameOwner = currentPlayer?.isOwner || false;

  // ---- resetGame helper
  const resetGame = useCallback(() => {
    setGame(null);
    setPlayers([]);
    setCurrentPhase("LOBBY");
    setTimeRemaining(0);
    setPhaseEndsAt(0);
    setCurrentTurn(1);
    setNightActions([]);
    setVotes({});
    setVoteCount({});
    setSelectedCardDrawers([]);
    setCurrentCardDrawer(null);
    setDeathsThisTurn([]);
    setDeathLog([]);
    setBombTargets([]);
    setPlayerNotes({});
  }, []);

  // ---- WS dinleyicileri
  useEffect(() => {
    const onGameStarted = (evt: any) => {
      const payload = evt?.payload || {};

      // Ayarlar herkeste güncellensin
      if (payload.settings) {
        setGame((prev) =>
          prev
            ? { ...prev, settings: payload.settings }
            : {
                id: Math.random().toString(36).slice(2),
                roomId: payload.roomId ?? "",
                phase: "ROLE_REVEAL",
                currentTurn: 1,
                settings: payload.settings,
                seed: Math.random().toString(36).slice(2),
                startedAt: new Date(),
              },
        );
      }

      if (Array.isArray(payload.players)) {
        setPlayers(payload.players);
      }
    };

    const onPhaseChanged = (evt: any) => {
      const { phase, phaseEndsAt, turn, selectedCardDrawers, currentCardDrawer } = evt?.payload || {};
      if (phase) setCurrentPhase(phase);
      if (typeof phaseEndsAt === "number") setPhaseEndsAt(phaseEndsAt);
      if (typeof turn === "number") setCurrentTurn(turn);
      if (Array.isArray(selectedCardDrawers)) setSelectedCardDrawers(selectedCardDrawers);
      if (typeof currentCardDrawer === "string" || currentCardDrawer === null)
        setCurrentCardDrawer(currentCardDrawer ?? null);

      if (phase && phase !== "VOTE") {
        setVotes({});
        setVoteCount({});
      }
    };

    const onSnapshot = (evt: any) => {
      const raw = evt?.payload;
      const s = raw?.state ?? raw;
      if (!s) return;

      const reviveDate = (v: any) => (typeof v === 'string' ? new Date(v) : v);

      if (s.game) {
        setGame({
          ...s.game,
          startedAt: reviveDate(s.game.startedAt),
          endedAt: reviveDate(s.game.endedAt),
        } as Game);
      }

      if (Array.isArray(s.players)) setPlayers(s.players);
      if (s.phase) setCurrentPhase(s.phase as GamePhase);
      if (typeof s.phaseEndsAt === 'number') setPhaseEndsAt(s.phaseEndsAt);
      if (typeof s.currentTurn === 'number') setCurrentTurn(s.currentTurn);
      if (Array.isArray(s.nightActions)) setNightActions(s.nightActions);

      if (s.votes && typeof s.votes === "object") {
        setVotes(s.votes as Record<string, string>);
      } else {
        setVotes({});
      }

      if (Array.isArray(s.deathsThisTurn)) setDeathsThisTurn(s.deathsThisTurn);
      if (Array.isArray(s.deathLog)) setDeathLog(s.deathLog);
      if (Array.isArray(s.bombTargets)) setBombTargets(s.bombTargets);
      if (s.playerNotes) setPlayerNotes(s.playerNotes);
      if (Array.isArray(s.selectedCardDrawers)) setSelectedCardDrawers(s.selectedCardDrawers);
      if ('currentCardDrawer' in s) setCurrentCardDrawer(s.currentCardDrawer ?? null);
    };

    const onVotes = (evt: any) => {
      const serverVotes = evt?.payload?.votes && typeof evt.payload.votes === "object"
        ? (evt.payload.votes as Record<string, string>)
        : {};
      setVotes(serverVotes);
    };

    const onVoteResult = (evt: any) => {
      if (evt?.payload?.voteCount) {
        setVoteCount(evt.payload.voteCount as Record<string, number>);
      } else {
        setVoteCount({});
      }
    };

    const onNotes = (evt: any) => {
      if (evt?.payload?.playerNotes) setPlayerNotes(evt.payload.playerNotes);
    };
   const onUpdateSettings = (evt: any) => {
  if (evt?.payload?.settings) {
    setGame((prev) =>
      prev ? { ...prev, settings: evt.payload.settings } : null
    );
  }
};
    const onReset = () => {
      resetGame();
    };

    wsClient.on("GAME_STARTED", onGameStarted);
    wsClient.on("PHASE_CHANGED", onPhaseChanged);
    wsClient.on("STATE_SNAPSHOT", onSnapshot);
    wsClient.on("VOTES_UPDATED", onVotes);
    wsClient.on("VOTE_RESULT", onVoteResult);
    wsClient.on("NOTES_UPDATED", onNotes);
    wsClient.on("UPDATE_SETTINGS", onUpdateSettings);
    wsClient.on("RESET_GAME", onReset);

    wsClient.sendEvent("REQUEST_SNAPSHOT" as any, {});

    return () => {
      wsClient.off("GAME_STARTED", onGameStarted);
      wsClient.off("PHASE_CHANGED", onPhaseChanged);
      wsClient.off("STATE_SNAPSHOT", onSnapshot);
      wsClient.off("VOTES_UPDATED", onVotes);
      wsClient.off("VOTE_RESULT", onVoteResult);
      wsClient.off("NOTES_UPDATED", onNotes);
      wsClient.off("UPDATE_SETTINGS", onSettingsUpdated);
      wsClient.off("RESET_GAME", onReset);
    };
  }, [resetGame]);

  // ---- timer
  useEffect(() => {
    if (!phaseEndsAt) {
      setTimeRemaining(0);
      return;
    }
    const tick = () => {
      const ms = phaseEndsAt - Date.now();
      setTimeRemaining(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [phaseEndsAt]);

  // ---- owner: startGame
  const startGame = useCallback(
    (gamePlayers: Player[], settings: GameSettings) => {
      if (!gamePlayers || gamePlayers.length === 0) return;
      const amOwner = !!gamePlayers.find((p) => p.id === currentPlayerId && p.isOwner);
      if (!amOwner) return;

      const playersWithRoles = assignRoles(gamePlayers, settings);

      const newGame: Game = {
        id: Math.random().toString(36).slice(2),
        roomId: Math.random().toString(36).slice(2),
        phase: "ROLE_REVEAL",
        currentTurn: 1,
        settings,
        seed: Math.random().toString(36).slice(2),
        startedAt: new Date(),
      };
      setGame(newGame);
      setPlayers(playersWithRoles);
      setCurrentPhase("ROLE_REVEAL");

      const phase = 'ROLE_REVEAL';
      const phaseEndsAt = Date.now() + 15_000;

      const snapshot = {
        game: { ...newGame, startedAt: newGame.startedAt.toISOString() },
        players: playersWithRoles,
        phase,
        phaseEndsAt,
        currentTurn: 1,
        nightActions: [],
        votes: {},
        deathsThisTurn: [],
        deathLog: [],
        bombTargets: [],
        playerNotes: {},
        selectedCardDrawers: [],
        currentCardDrawer: null,
      };

      wsClient.sendEvent('STATE_SNAPSHOT' as any, { state: snapshot });
      wsClient.sendEvent('PHASE_CHANGED' as any, { phase, phaseEndsAt, turn: 1 });
      wsClient.sendEvent("GAME_STARTED" as any, { settings, players: playersWithRoles });
    },
    [currentPlayerId],
  );

  const advancePhase = useCallback(() => {}, []);

  const submitNightAction = useCallback(
    (playerId: string, targetId: string | null, actionType: any) => {
      const actor = players.find((p) => p.id === playerId);
      if (!actor || !actor.isAlive) return;
      const action: NightAction = { playerId, targetId, actionType, timestamp: new Date() };
      setNightActions((prev) => [...prev.filter((a) => a.playerId !== playerId), action]);
      wsClient.sendEvent("NIGHT_ACTION_SUBMITTED" as any, { action });
    },
    [players],
  );

  const submitVote = useCallback(
    (voterId: string, targetId: string) => {
      const voter = players.find((p) => p.id === voterId);
      if (!voter?.isAlive) return;
      wsClient.sendEvent("SUBMIT_VOTE" as any, { targetId });
    },
    [players],
  );

  return {
    game,
    players,
    currentPhase,
    timeRemaining,
    currentTurn,
    nightActions,
    votes,
    voteCount,
    isGameOwner,
    selectedCardDrawers,
    currentCardDrawer,
    deathsThisTurn,
    deathLog,
    bombTargets,
    playerNotes,
    startGame,
    advancePhase,
    submitNightAction,
    submitVote,
    resetGame,
  };
}
