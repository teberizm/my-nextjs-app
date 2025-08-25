"use client"

import { useEffect, useState } from "react"
import { RoomLobby } from "@/components/room/room-lobby"
import { GameController } from "@/components/game/game-controller"
import { JoinRoomDialog } from "@/components/room/join-room-dialog"
import { wsClient } from "@/lib/websocket-client"
import type { Room, Player, GameSettings, GamePhase } from "@/lib/types"

const ROOM_PASSWORD = "1234"

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const { roomId } = params

  // ---- Oda & Oyuncu durumu ----
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

  // UI fazı (LOBBY / oyun içi fazlar)
  const [gamePhase, setGamePhase] = useState<GamePhase>("LOBBY")

  // Varsayılan oyun ayarları
  const [gameSettings, setGameSettings] = useState<GameSettings>({
    traitorCount: 2,
    specialRoleCount: 2,
    cardDrawCount: 2,
    nightDuration: 60,
    dayDuration: 120,
    voteDuration: 45,
  })

  // -----------------------------
  // 1) Odaya katıl
  // -----------------------------
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

  // -----------------------------
  // 2) WS’e bağlan / dinle
  // -----------------------------
  useEffect(() => {
    if (!currentPlayer) return

    // Odaya bağlan
    wsClient.connect(currentRoom.inviteCode, currentPlayer)

    // Sunucudan oyuncu listesi geldikçe state’i güncelle
    const handlePlayerList = (data: any) => {
      const players = data?.payload?.players || []
      setCurrentRoom((prev) => ({ ...prev, players }))
    }
    wsClient.on("PLAYER_LIST_UPDATED", handlePlayerList)

    // Kick edilirse lobiye dön
    const handleKicked = (data: any) => {
      if (data?.payload?.playerId === currentPlayer.id) {
        setCurrentPlayer(null)
        setGamePhase("LOBBY")
      }
    }
    wsClient.on("PLAYER_KICKED", handleKicked)

    // Oyun server’dan başladı -> UI oyun ekranına geçsin
    const onGameStarted = () => {
      setGamePhase("ROLE_REVEAL")
    }
    wsClient.on("GAME_STARTED", onGameStarted)

    // Faz yayınları (ileride ekleyebiliriz)
    const onPhaseChanged = (data: any) => {
      const next = data?.payload?.phase as GamePhase | undefined
      if (next) setGamePhase(next)
    }
    wsClient.on("PHASE_CHANGED", onPhaseChanged)

    return () => {
      wsClient.off("PLAYER_LIST_UPDATED", handlePlayerList)
      wsClient.off("PLAYER_KICKED", handleKicked)
      wsClient.off("GAME_STARTED", onGameStarted)
      wsClient.off("PHASE_CHANGED", onPhaseChanged)
      wsClient.disconnect()
    }
  }, [currentPlayer, currentRoom.inviteCode])

  // -----------------------------
  // 3) Lobideki buton aksiyonları
  // -----------------------------
  const handleStartGame = () => {
    // Buton sadece owner’a gösteriliyor; 4+ kişi şartını RoomLobby zaten kontrol ediyor.
    if (gamePhase !== "LOBBY") return

    // Herkese “GAME_STARTED” yayınlat (server tüm odaya yayacak).
    // Not: ŞU AN payload’ı snapshot olarak gönderiyoruz; use-game-state tarafında
    // owner deterministik rolleri dağıtıp STATE_SNAPSHOT yayınlıyorsa, orayı kullanın.
    wsClient.sendEvent("GAME_STARTED", {
      players: currentRoom.players,
      settings: gameSettings,
    })

    // kendi UI’ımızı da oyun ekranına alalım
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

  // -----------------------------
  // 4) Render
  // -----------------------------
  if (!currentPlayer) {
    return <JoinRoomDialog onJoin={handleJoin} />
  }

  const isLobby = gamePhase === "LOBBY"

  return (
    <>
      {isLobby ? (
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
          initialPlayers={currentRoom.players} // otoritatif liste WS’ten geliyor
          gameSettings={gameSettings}
          currentPlayerId={currentPlayer.id}
          onGameEnd={handleGameEnd}
        />
      )}
    </>
  )
}
