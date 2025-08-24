"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { RoomLobby } from "@/components/room/room-lobby"
import { GameController } from "@/components/game/game-controller"
import { JoinRoomDialog } from "@/components/room/join-room-dialog"
import { wsClient } from "@/lib/websocket-client"
import { useRealtimeGame } from "@/hooks/use-realtime-game"
import type { Room, Player, GameSettings, GamePhase } from "@/lib/types"

const LeafletMap = dynamic(() => import("@/components/leaflet-map"), {
  ssr: false,
})

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
      wsClient.sendEvent("GAME_STARTED", {})
      setGamePhase("ROLE_REVEAL")
    }
  }

  const handleKickPlayer = (playerId: string) => {
    wsClient.sendEvent("KICK_PLAYER", { playerId })
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

  const realtime = useRealtimeGame(currentRoom.id, currentPlayer)

  useEffect(() => {
    const handleKicked = (data: any) => {
      if (data.payload.playerId === currentPlayer?.id) {
        setCurrentPlayer(null)
      }
    }
    wsClient.on("PLAYER_KICKED", handleKicked)
    const handlePlayerList = (data: any) => {
      setCurrentRoom((prev) => ({ ...prev, players: data.payload.players }))
    }
    wsClient.on("PLAYER_LIST_UPDATED", handlePlayerList)
    return () => {
      wsClient.off("PLAYER_KICKED", handleKicked)
      wsClient.off("PLAYER_LIST_UPDATED", handlePlayerList)
    }
  }, [currentPlayer])

  if (!currentPlayer) {
    return <JoinRoomDialog onJoin={handleJoin} />
  }

  const roomWithPlayers = {
    ...currentRoom,
    players: realtime.players.length ? realtime.players : currentRoom.players,
  }

  return (
    <>
      {gamePhase === "LOBBY" ? (
        <RoomLobby
          room={roomWithPlayers}
          currentPlayer={currentPlayer}
          gameSettings={gameSettings}
          onStartGame={handleStartGame}
          onKickPlayer={handleKickPlayer}
          onToggleLock={handleToggleLock}
          onUpdateSettings={setGameSettings}
        />
      ) : (
        <GameController
          initialPlayers={roomWithPlayers.players}
          gameSettings={gameSettings}
          currentPlayerId={currentPlayer.id}
          onGameEnd={handleGameEnd}
        />
      )}
      <LeafletMap />
    </>
  )
}
