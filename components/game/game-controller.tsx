"use client";

import { useEffect, useMemo } from "react";
import { useGameState } from "@/hooks/use-game-state";
import { RoleReveal } from "./role-reveal";
import { NightActions } from "./night-actions";
import { DayPhase } from "./day-phase";
import { VotingPhase } from "./voting-phase";
import { GameEnd } from "./game-end";
import { NightResults } from "./night-results";
import { DeathAnnouncement } from "./death-announcement";
import { VoteResults } from "./vote-results";
import { CardDrawingPhase } from "./card-drawing-phase";
import type { Player, GameSettings } from "@/lib/types";
import { wsClient } from "@/lib/websocket-client";

interface GameControllerProps {
  initialPlayers: Player[];
  gameSettings: GameSettings;
  currentPlayerId: string;
  onGameEnd: () => void;
}

export function GameController({
  initialPlayers,
  gameSettings,
  currentPlayerId,
  onGameEnd,
}: GameControllerProps) {
  const {
    game,
    players,
    currentPhase,
    timeRemaining,
    currentTurn,
    votes,
    advancePhase,
    submitNightAction,
    // submitVote,
    resetGame,
    nightActions,
    selectedCardDrawers,
    currentCardDrawer,
    deathsThisTurn,
    deathLog,
    bombTargets,
    playerNotes,
    secretMsgReq,
    submitSecretMessage,
  } = useGameState(currentPlayerId);

  const isOwnerFromInitial = useMemo(() => {
    return initialPlayers.find((p) => p.id === currentPlayerId)?.isOwner === true;
  }, [initialPlayers, currentPlayerId]);

  useEffect(() => {
    if (!game && isOwnerFromInitial && initialPlayers.length >= 4) {
      const t = setTimeout(() => {
        wsClient.sendEvent("GAME_STARTED" as any, {
          players: initialPlayers,
          settings: gameSettings,
        });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [game, isOwnerFromInitial, initialPlayers, gameSettings]);

  const currentPlayer = players.find((p) => p.id === currentPlayerId);

  if (!currentPlayer || !game) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        </div>
      </div>
    );
  }

  const handleNightAction = (
    targetId: string | null,
    actionType: "KILL" | "PROTECT" | "INVESTIGATE" | "BOMB_PLANT" | "BOMB_DETONATE",
  ) => {
    submitNightAction(currentPlayer.id, targetId, actionType);
  };

  const handleVote = (targetId: string) => {
    console.log("[UI] SUBMIT_VOTE click ->", targetId);
    wsClient.sendEvent("SUBMIT_VOTE" as any, { targetId });
  };

  // ✅ QR kodu okut (test): Sunucu rastgele QR-ID seçsin
  const handleMockScan = () => {
    // Önerilen yol: sunucuda DRAW_QR_CARD_TEST case'i
    wsClient.sendEvent("DRAW_QR_CARD_TEST" as any, {
      roomId: game.roomId,
      playerId: currentPlayerId,
    });

    // Eğer sunucuda test case'i yoksa şu alternatifi kullanın:
    // wsClient.sendEvent("DRAW_QR_CARD" as any, {
    //   roomId: game.roomId,
    //   playerId: currentPlayerId,
    //   payload: { qrId: "__RANDOM__" } // sunucu '__RANDOM__' gelirse random seçsin
    // });
  };

  const hasVoted = currentPlayer.id in votes;

  switch (currentPhase) {
    case "ROLE_REVEAL":
      return <RoleReveal player={currentPlayer} onContinue={advancePhase} />;

    case "NIGHT":
      return (
        <NightActions
          currentPlayer={currentPlayer}
          allPlayers={players}
          deaths={deathLog}
          bombTargets={bombTargets}
          onSubmitAction={handleNightAction}
          timeRemaining={timeRemaining}
          playerNotes={playerNotes}
        />
      );

    case "NIGHT_RESULTS":
      return (
        <NightResults
          currentPlayer={currentPlayer}
          allPlayers={players}
          nightActions={nightActions}
          timeRemaining={timeRemaining}
          onContinue={advancePhase}
        />
      );

    case "DEATH_ANNOUNCEMENT":
      return <DeathAnnouncement deaths={deathsThisTurn} timeRemaining={timeRemaining} />;

    case "CARD_DRAWING":
  return (
    <CardDrawingPhase
      players={players}
      selectedCardDrawers={selectedCardDrawers}
      currentCardDrawer={currentCardDrawer}
      currentPlayerId={currentPlayerId}
      onCardDrawn={advancePhase}
    />
  );

    case "DAY_DISCUSSION":
      return (
        <DayPhase
          currentPlayer={currentPlayer}
          allPlayers={players}
          timeRemaining={timeRemaining}
          currentTurn={currentTurn}
          playerNotes={playerNotes}
          deaths={deathLog}
          secretMsgReq={secretMsgReq}
          onSubmitSecretMessage={submitSecretMessage}
        />
      );

    case "VOTE":
      return (
        <VotingPhase
          currentPlayer={currentPlayer}
          allPlayers={players}
          votes={votes}
          onSubmitVote={handleVote}
          timeRemaining={timeRemaining}
          hasVoted={hasVoted}
          playerNotes={playerNotes}
          deaths={deathLog}
        />
      );

    case "RESOLVE":
      return (
        <VoteResults
          players={players}
          votes={votes}
          deaths={deathsThisTurn}
          deathLog={deathLog}
          timeRemaining={timeRemaining}
        />
      );

    case "END":
      return (
        <GameEnd
          game={game}
          players={players}
          currentPlayer={currentPlayer}
          onPlayAgain={() => {
            resetGame();
            onGameEnd();
          }}
          onBackToLobby={onGameEnd}
        />
      );

    default:
      return null;
  }
}
