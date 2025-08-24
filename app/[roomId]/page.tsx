"use client"

import { useEffect, useState } from "react"
import { wsClient } from "@/lib/websocket-client"
import { useGameState } from "@/hooks/use-game-state"
import { useSearchParams } from "next/navigation"

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const search = useSearchParams()
  const [playerId] = useState(
    () => search.get("playerId") || Math.random().toString(36).substring(2, 9),
  )

  const { players } = useGameState(playerId)

  useEffect(() => {
    wsClient.connect(params.roomId, playerId)
    return () => {
      wsClient.disconnect()
    }
  }, [params.roomId, playerId])

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">Room {params.roomId}</h1>
      <h2 className="mt-4">Players</h2>
      <ul className="list-disc pl-4">
        {players.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
    </div>
  )
}

