"use client"

import { useState } from "react"
import { PlayerNameModal } from "@/components/room/player-name-modal"
import { useRealtimeGame } from "@/hooks/use-realtime-game"
import type { Player } from "@/lib/types"

const ROOM_PASSWORDS: Record<string, string> = {
  "210899": "1234",
}

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const { roomId } = params
  const [player, setPlayer] = useState<Player | null>(null)

  const handleJoin = (name: string, isAdmin: boolean) => {
    const id = "player-" + Math.random().toString(36).substring(2, 9)
    setPlayer({
      id,
      name,
      isOwner: isAdmin,
      isAlive: true,
      isMuted: false,
      hasShield: false,
      connectedAt: new Date(),
    })
  }

  if (!player) {
    return (
      <PlayerNameModal
        roomId={roomId}
        adminPassword={ROOM_PASSWORDS[roomId]}
        onSubmit={handleJoin}
      />
    )
  }

  const { players, connectionStatus, sendEvent } = useRealtimeGame(
    roomId,
    player.id,
    player.name,
    player.isOwner,
  )

  const handleKick = (id: string) => {
    sendEvent("PLAYER_KICKED", { playerId: id })
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Oda {roomId}</h1>
      <p className="text-sm text-muted-foreground">Durum: {connectionStatus}</p>
      <ul className="space-y-1">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <span>
              {p.name}
              {p.id === player.id ? " (sen)" : ""}
              {p.isOwner ? " [yönetici]" : ""}
            </span>
            {player.isOwner && p.id !== player.id && (
              <button
                className="text-red-500 text-sm"
                onClick={() => handleKick(p.id)}
              >
                At
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

