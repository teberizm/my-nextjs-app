"use client"

import type React from "react"

import { useRealtimeGame } from "@/hooks/use-realtime-game"

interface RealtimeWrapperProps {
  roomId: string
  playerId: string
  children: React.ReactNode
}

export function RealtimeWrapper({ roomId, playerId, children }: RealtimeWrapperProps) {
  useRealtimeGame(roomId, playerId)
  return <>{children}</>
}
