"use client"

import { useState, useEffect } from "react"
import { RoomLobby } from "@/components/room/room-lobby"
import { GameController } from "@/components/game/game-controller"
import { RealtimeWrapper } from "@/components/realtime/realtime-wrapper"
import { generateBotPlayers } from "@/lib/bot-players"
import type { Room, Player, GameSettings, GamePhase } from "@/lib/types"

export default function HomePage() {
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [gamePhase, setGamePhase] = useState<GamePhase>("LOBBY")
  const [gameSettings, setGameSettings] = useState<GameSettings>({
    traitorCount: 2,
    specialRoleCount: 2,
    nightDuration: 60,
    dayDuration: 120,
    voteDuration: 45,
  })

  useEffect(() => {
    const playerId = "human-player-1"
    const roomId = "demo-room-1"
    const roomCode = "DEMO01"

    // Create human player
    const humanPlayer: Player = {
      id: playerId,
      name: "Sen",
      isOwner: true,
      isAlive: true,
      isMuted: false,
      isShielded: false,
      role: null,
      isBot: false,
      joinedAt: new Date(),
    }

    // Generate 5 bot players
    const botPlayers = generateBotPlayers(5)

    // Create pre-configured room
    const demoRoom: Room = {
      id: roomId,
      inviteCode: roomCode,
      ownerId: playerId,
      players: [humanPlayer, ...botPlayers],
      maxPlayers: 8,
      isLocked: false,
      createdAt: new Date(),
    }

    setCurrentRoom(demoRoom)
    setCurrentPlayer(humanPlayer)
  }, [])

  const handleStartGame = () => {
    console.log(
      "[v0] Starting game with players:",
      currentRoom?.players.map((p) => p.name),
    )
    setGamePhase("ROLE_REVEAL")
  }

  const handleKickPlayer = (playerId: string) => {
    if (!currentRoom || !currentPlayer?.isOwner) return

    setCurrentRoom({
      ...currentRoom,
      players: currentRoom.players.filter((p) => p.id !== playerId),
    })
  }

  const handleToggleLock = () => {
    if (!currentRoom || !currentPlayer?.isOwner) return

    setCurrentRoom({
      ...currentRoom,
      isLocked: !currentRoom.isLocked,
    })
  }

  const handleGameEnd = () => {
    setGamePhase("LOBBY")
    // Reset player states
    if (currentRoom) {
      const resetPlayers = currentRoom.players.map((player) => ({
        ...player,
        role: null,
        isAlive: true,
        isMuted: false,
        isShielded: false,
      }))
      setCurrentRoom({
        ...currentRoom,
        players: resetPlayers,
      })
    }
  }

  if (currentRoom && currentPlayer) {
    return (
      <RealtimeWrapper roomId={currentRoom.id} playerId={currentPlayer.id}>
        {gamePhase === "LOBBY" ? (
          <RoomLobby
            room={currentRoom}
            currentPlayer={currentPlayer}
            gameSettings={gameSettings}
            onStartGame={handleStartGame}
            onKickPlayer={handleKickPlayer}
            onToggleLock={handleToggleLock}
            onUpdateSettings={setGameSettings}
          />
        ) : (
          <GameController
            initialPlayers={currentRoom.players}
            gameSettings={gameSettings}
            currentPlayerId={currentPlayer.id}
            onGameEnd={handleGameEnd}
          />
        )}
      </RealtimeWrapper>
    )
  }

  // Loading state while room is being set up
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-primary/20 rounded-lg flex items-center justify-center mx-auto mb-4 holographic-glow animate-pulse">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <h2 className="text-xl font-semibold text-primary mb-2">HoloDeck Başlatılıyor...</h2>
        <p className="text-muted-foreground">Demo odası hazırlanıyor</p>
      </div>
    </div>
  )
}
