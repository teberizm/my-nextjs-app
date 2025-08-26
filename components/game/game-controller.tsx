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
    // submitVote, // ❌ artık doğrudan wsClient kullanıyoruz
    resetGame,
    nightActions,
    selectedCardDrawers,
    currentCardDrawer,
    deathsThisTurn,
    deathLog,
    bombTargets,
    playerNotes,
  } = useGameState(currentPlayerId);

  // Owner bilgisini initialPlayers'tan (WS snapshot) belirle – oyun başlamadan önce de doğru olur
  const isOwnerFromInitial = useMemo(() => {
    return initialPlayers.find((p) => p.id === currentPlayerId)?.isOwner === true;
  }, [initialPlayers, currentPlayerId]);

  /**
   * Emniyet ağı:
   * - Oyun başlamadıysa,
   * - owner bizsek ve odada en az 4 kişi varsa
   * bir defa GAME_STARTED yayınla.
   */
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

  // 🔴 Kritik: Oy artık doğrudan wsClient ile sunucuya gider
  const handleVote = (targetId: string) => {
    console.log("[UI] SUBMIT_VOTE click ->", targetId);
    wsClient.sendEvent("SUBMIT_VOTE" as any, { targetId });
  };

  // ✅ Yeni: QR okut (test) butonu — sabit token gönderir
  const handleMockScan = () => {
    wsClient.sendEvent("CARD_QR_SCANNED" as any, { token: "94138491230" });
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
        <>
          <CardDrawingPhase
            players={players}
            selectedCardDrawers={selectedCardDrawers}
            currentCardDrawer={currentCardDrawer}
            currentPlayerId={currentPlayerId}
            onCardDrawn={advancePhase}
          />

          {/* Sadece sıra sendeyse ve faz CARD_DRAWING ise test butonunu göster */}
          {currentPlayerId === currentCardDrawer && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={handleMockScan}
                className="px-3 py-2 rounded bg-indigo-600 text-white"
              >
                QR kodu okut (test)
              </button>
            </div>
          )}
        </>
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
