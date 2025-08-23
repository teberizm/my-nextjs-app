"use client"

import { useEffect, useState } from "react"
import { useGameState } from "@/hooks/use-game-state"
import { RoleReveal } from "./role-reveal"
import { NightActions } from "./night-actions"
import { DayPhase } from "./day-phase"
import { VotingPhase } from "./voting-phase"
import { GameEnd } from "./game-end"
import { NightResults } from "./night-results"
import { DeathAnnouncement } from "./death-announcement"
import { VoteResults } from "./vote-results"
import { CardDrawingPhase } from "./card-drawing-phase"
import type { Player, GameSettings } from "@/lib/types"

interface GameControllerProps {
  initialPlayers: Player[]
  gameSettings: GameSettings
  currentPlayerId: string
  onGameEnd: () => void
}

export function GameController({ initialPlayers, gameSettings, currentPlayerId, onGameEnd }: GameControllerProps) {
  const {
    game,
    players,
    currentPhase,
    timeRemaining,
    currentTurn,
    votes,
    startGame,
    advancePhase,
    submitNightAction,
    submitVote,
    resetGame,
    nightActions,
    selectedCardDrawers,
    currentCardDrawer,
    deathsThisTurn,
    playerNotes,
  } = useGameState(currentPlayerId)

  useEffect(() => {
    if (!game) {
      startGame(initialPlayers, gameSettings)
    }
  }, [game, initialPlayers, gameSettings, startGame])

  const currentPlayer = players.find((p) => p.id === currentPlayerId)

  if (!currentPlayer || !game) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Oyun başlatılıyor...</p>
        </div>
      </div>
    )
  }

  const handleNightAction = (
    targetId: string | null,
    actionType: "KILL" | "PROTECT" | "INVESTIGATE" | "BOMB_PLANT" | "BOMB_DETONATE",
  ) => {
    submitNightAction(currentPlayer.id, targetId, actionType)
  }

  const handleVote = (targetId: string) => {
    submitVote(currentPlayer.id, targetId)
  }

  const hasVoted = currentPlayer.id in votes

  switch (currentPhase) {
    case "ROLE_REVEAL":
      return <RoleReveal player={currentPlayer} onContinue={advancePhase} />

    case "NIGHT":
      return (
        <NightActions
          currentPlayer={currentPlayer}
          allPlayers={players}
          onSubmitAction={handleNightAction}
          timeRemaining={timeRemaining}
          playerNotes={playerNotes}
        />
      )

    case "NIGHT_RESULTS":
      return (
        <NightResults
          currentPlayer={currentPlayer}
          allPlayers={players}
          nightActions={nightActions}
          timeRemaining={timeRemaining}
          onContinue={advancePhase}
        />
      )

    case "DEATH_ANNOUNCEMENT":
      return <DeathAnnouncement deaths={deathsThisTurn} timeRemaining={timeRemaining} />

    case "CARD_DRAWING":
      return (
        <CardDrawingPhase
          players={players}
          selectedCardDrawers={selectedCardDrawers}
          currentCardDrawer={currentCardDrawer}
          currentPlayerId={currentPlayerId}
          timeRemaining={timeRemaining}
          onCardDrawn={advancePhase}
        />
      )

    case "DAY_DISCUSSION":
      return (
        <DayPhase
          currentPlayer={currentPlayer}
          allPlayers={players}
          timeRemaining={timeRemaining}
          currentTurn={currentTurn}
          playerNotes={playerNotes}
          deaths={deathsThisTurn}
        />
      )

    case "VOTE":
      return (
        <VotingPhase
          currentPlayer={currentPlayer}
          allPlayers={players}
          votes={votes}
          onSubmitVote={handleVote}
          timeRemaining={timeRemaining}
          hasVoted={hasVoted}
        />
      )

    case "RESOLVE":
      return (
        <VoteResults
          players={players}
          votes={votes}
          deaths={deathsThisTurn}
          timeRemaining={timeRemaining}
        />
      )

    case "END":
      return (
        <GameEnd
          game={game}
          players={players}
          currentPlayer={currentPlayer}
          onPlayAgain={() => {
            resetGame()
            onGameEnd()
          }}
          onBackToLobby={onGameEnd}
        />
      )

    default:
      return null
  }
}
