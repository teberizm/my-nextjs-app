"use client"

import type React from "react"

import { useRealtimeGame } from "@/hooks/use-realtime-game"
import { NotificationSystem } from "./notification-system"
import { ConnectionStatus } from "./connection-status"

interface RealtimeWrapperProps {
  roomId: string
  playerId: string
  children: React.ReactNode
}

export function RealtimeWrapper({ roomId, playerId, children }: RealtimeWrapperProps) {
  const { connected, connectionStatus, players, notifications, removeNotification, sendEvent } = useRealtimeGame(
    roomId,
    playerId,
  )

  return (
    <>
      {children}

      <ConnectionStatus connected={connected} connectionStatus={connectionStatus} playerCount={players.length} />

      <NotificationSystem notifications={notifications} onRemoveNotification={removeNotification} />
    </>
  )
}
