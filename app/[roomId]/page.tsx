"use client"

import { useState, useEffect } from "react"
import { RoomLobby } from "@/components/room/room-lobby"
import { GameController } from "@/components/game/game-controller"
import { JoinRoomDialog } from "@/components/room/join-room-dialog"
import { wsClient } from "@/lib/websocket-client"
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

  // 1) Odaya katılma
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

  // 2) WS’e bağlan / ayrılırken kapat
  useEffect(() => {
    if (!currentPlayer) return
    wsClient.connect(currentRoom.inviteCode, currentPlayer)

    const onConn = (e: any) => console.log("WS connected?", e)
    wsClient.on("CONNECTION_STATUS", onConn)

    // Oda oyuncu listesi güncellemesi
    const handlePlayerList = (data: any) => {
      setCurrentRoom((prev) => ({ ...prev, players: data.payload.players }))
    }
    wsClient.on("PLAYER_LIST_UPDATED", handlePlayerList)

    // Kick olayı
    const handleKicked = (data: any) => {
      if (data.payload.playerId === currentPlayer.id) {
        setCurrentPlayer(null)
        setGamePhase("LOBBY")
      }
    }
    wsClient.on("PLAYER_KICKED", handleKicked)

    // Oyun başlangıcı ve faz değişimleri — sayfa tarafında faz geçişini gösterelim
    const onGameStarted = (data: any) => {
      setGamePhase("ROLE_REVEAL") // GameController render edilsin
    }
    wsClient.on("GAME_STARTED", onGameStarted)

    const onPhaseChanged = (data: any) => {
      const next = data?.payload?.phase
      if (next) setGamePhase(next)
    }
    wsClient.on("PHASE_CHANGED", onPhaseChanged)

    return () => {
      wsClient.off("CONNECTION_STATUS", onConn)
      wsClient.off("PLAYER_LIST_UPDATED", handlePlayerList)
      wsClient.off("PLAYER_KICKED", handleKicked)
      wsClient.off("GAME_STARTED", onGameStarted)
      wsClient.off("PHASE_CHANGED", onPhaseChanged)
      wsClient.disconnect()
    }
  }, [currentPlayer, currentRoom.inviteCode])

  // 3) Oyunu başlat — SADECE owner ve DOĞRU payload ile
  const handleStartGame = () => {
    if (!currentPlayer?.isOwner) return
    if (gamePhase !== "LOBBY") return

    // ÖNEMLİ: use-game-state.ts içindeki GAME_STARTED listener’ı players + settings bekliyor.
    wsClient.sendEvent("GAME_STARTED", {
      players: currentRoom.players,
      settings: gameSettings,
      initiatorId: currentPlayer.id,
    })

    // Yerelde fazı hemen ROLE_REVEAL’e çekmemiz, sayfanın GameController’ı göstermesi için faydalı.
    // (Asıl rol dağıtımı ve gerçek state, GameController/use-game-state’te yapılacak)
    setGamePhase("ROLE_REVEAL")
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

  if (!currentPlayer) {
    return <JoinRoomDialog onJoin={handleJoin} />
  }

  return (
    <>
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
    </>
  )
}
