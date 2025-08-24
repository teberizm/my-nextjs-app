"use client"

import { useState } from "react"
import { RoomLobby } from "@/components/room/room-lobby"
import { GameController } from "@/components/game/game-controller"
import { RealtimeWrapper } from "@/components/realtime/realtime-wrapper"
import { JoinRoomDialog } from "@/components/room/join-room-dialog"
import type { Room, Player, GameSettings, GamePhase } from "@/lib/types"

const ROOM_PASSWORD = "1234"

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const { roomId } = params
  const [currentRoom, setCurrentRoom] = useState<Room>({
    id: roomId,
    inviteCode: roomId,
    ownerId: "",
    players: [],
    maxPlayers: 12,
    isLocked: false,
    createdAt: new Date(),
  })
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [gamePhase, setGamePhase] = useState<GamePhase>("LOBBY")
  const [gameSettings, setGameSettings] = useState<GameSettings>({
    traitorCount: 2,
    specialRoleCount: 2,
    cardDrawCount: 2,
    nightDuration: 60,
    dayDuration: 120,
    voteDuration: 45,
  })

  const handleJoin = (name: string, isAdmin: boolean, password?: string): boolean => {
    if (isAdmin && password !== ROOM_PASSWORD) {
      return false
    }
    const id = Math.random().toString(36).substring(2, 9)
    const newPlayer: Player = {
      id,
      name,
      isOwner: isAdmin,
      isAlive: true,
      isMuted: false,
      hasShield: false,
      connectedAt: new Date(),
    }
    setCurrentRoom((prev) => ({
      ...prev,
      ownerId: isAdmin ? id : prev.ownerId,
      players: [...prev.players, newPlayer],
    }))
    setCurrentPlayer(newPlayer)
    return true
  }

  const handleStartGame = () => {
    if (gamePhase === "LOBBY") {
      setGamePhase("ROLE_REVEAL")
    }
  }

  const handleKickPlayer = (playerId: string) => {
    setCurrentRoom((prev) => ({
      ...prev,
      players: prev.players.filter((p) => p.id !== playerId),
    }))
    if (currentPlayer?.id === playerId) {
      setCurrentPlayer(null)
    }
  }

  const handleToggleLock = () => {
    if (!currentPlayer?.isOwner) return
    setCurrentRoom((prev) => ({ ...prev, isLocked: !prev.isLocked }))
  }

  const handleGameEnd = () => {
    setGamePhase("LOBBY")
    setCurrentRoom((prev) => ({
      ...prev,
      players: prev.players.map((p) => ({
        ...p,
        role: undefined,
        displayRole: undefined,
        isAlive: true,
        isMuted: false,
        hasShield: false,
      })),
    }))
  }

  if (!currentPlayer) {
    return <JoinRoomDialog onJoin={handleJoin} />
  }

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
