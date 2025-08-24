"use client"

import { useState, useEffect, useCallback } from "react"
import { wsClient, type GameEvent, type GameEventData } from "@/lib/websocket-client"
import type { Player, GamePhase, Room } from "@/lib/types"

interface RealtimeGameState {
  connected: boolean
  room: Room | null
  players: Player[]
  currentPhase: GamePhase
  notifications: GameNotification[]
  connectionStatus: string
}

interface GameNotification {
  id: string
  type: "info" | "success" | "warning" | "error"
  title: string
  message: string
  timestamp: Date
  autoHide?: boolean
}

export function useRealtimeGame(
  roomId: string,
  playerId: string,
  playerName = "Player",
  isOwner = false,
) {
  const [gameState, setGameState] = useState<RealtimeGameState>({
    connected: false,
    room: null,
    players: [],
    currentPhase: "LOBBY",
    notifications: [],
    connectionStatus: "Connecting...",
  })

  const addNotification = useCallback((notification: Omit<GameNotification, "id" | "timestamp">) => {
    const newNotification: GameNotification = {
      ...notification,
      id: Math.random().toString(36).substring(2, 15),
      timestamp: new Date(),
    }

    setGameState((prev) => ({
      ...prev,
      notifications: [...prev.notifications.slice(-4), newNotification], // Keep last 5 notifications
    }))

    // Auto-hide notifications after 5 seconds
    if (notification.autoHide !== false) {
      setTimeout(() => {
        setGameState((prev) => ({
          ...prev,
          notifications: prev.notifications.filter((n) => n.id !== newNotification.id),
        }))
      }, 5000)
    }
  }, [])

  const removeNotification = useCallback((notificationId: string) => {
    setGameState((prev) => ({
      ...prev,
      notifications: prev.notifications.filter((n) => n.id !== notificationId),
    }))
  }, [])

  // Event handlers
  const handleConnectionStatus = useCallback(
    (data: any) => {
      setGameState((prev) => ({
        ...prev,
        connected: data.connected,
        connectionStatus: data.connected ? "Connected" : "Disconnected",
      }))

      if (data.connected) {
        addNotification({
          type: "success",
          title: "Connected",
          message: "Successfully connected to game server",
          autoHide: true,
        })
      } else {
        addNotification({
          type: "error",
          title: "Disconnected",
          message: "Lost connection to game server",
          autoHide: false,
        })
      }
    },
    [addNotification],
  )

  const handleRoomJoined = useCallback(
    (data: GameEventData) => {
      addNotification({
        type: "success",
        title: "Room Joined",
        message: `Successfully joined room ${data.payload.roomId}`,
        autoHide: true,
      })
    },
    [addNotification],
  )

  const handlePlayerListUpdated = useCallback(
    (data: GameEventData) => {
      setGameState((prev) => ({
        ...prev,
        players: data.payload.players,
      }))

      if (data.payload.newPlayer) {
        addNotification({
          type: "info",
          title: "Player Joined",
          message: `${data.payload.newPlayer.name} joined the game`,
          autoHide: true,
        })
      }

      if (data.payload.removedPlayer) {
        addNotification({
          type: "warning",
          title: "Player Left",
          message: `${data.payload.removedPlayer.name} left the game`,
          autoHide: true,
        })
      }
    },
    [addNotification],
  )

  const handleGameStarted = useCallback(
    (data: GameEventData) => {
      setGameState((prev) => ({
        ...prev,
        currentPhase: "ROLE_REVEAL",
      }))

      addNotification({
        type: "success",
        title: "Game Started",
        message: "The game has begun! Check your role.",
        autoHide: false,
      })
    },
    [addNotification],
  )

  const handlePhaseChanged = useCallback(
    (data: GameEventData) => {
      setGameState((prev) => ({
        ...prev,
        currentPhase: data.payload.phase,
      }))

      const phaseMessages = {
        ROLE_REVEAL: "Role reveal phase - Check your role",
        NIGHT: "Night phase - Special roles take action",
        DAY: "Day phase - Discussion time",
        VOTE: "Voting phase - Cast your vote",
        RESOLVE: "Resolving votes...",
        END: "Game ended",
      }

      addNotification({
        type: "info",
        title: "Phase Changed",
        message: phaseMessages[data.payload.phase as keyof typeof phaseMessages] || "Phase changed",
        autoHide: true,
      })
    },
    [addNotification],
  )

  const handleCardApplied = useCallback(
    (data: GameEventData) => {
      const { card, actor, target, effect } = data.payload

      let message = `${actor.name} used card: ${card.title}`
      if (target) {
        message += ` on ${target.name}`
      }

      addNotification({
        type: "warning",
        title: "Card Used",
        message,
        autoHide: true,
      })
    },
    [addNotification],
  )

  const handleVoteCast = useCallback(
    (data: GameEventData) => {
      if (data.payload.isPublic) {
        addNotification({
          type: "info",
          title: "Vote Cast",
          message: `${data.payload.voter.name} voted for ${data.payload.target.name}`,
          autoHide: true,
        })
      }
    },
    [addNotification],
  )

  const handlePlayerEliminated = useCallback(
    (data: GameEventData) => {
      addNotification({
        type: "error",
        title: "Player Eliminated",
        message: `${data.payload.player.name} has been eliminated`,
        autoHide: false,
      })
    },
    [addNotification],
  )

  const handlePlayerRevived = useCallback(
    (data: GameEventData) => {
      addNotification({
        type: "success",
        title: "Player Revived",
        message: `${data.payload.player.name} has been revived!`,
        autoHide: false,
      })
    },
    [addNotification],
  )

  const handlePlayerKicked = useCallback(
    (data: GameEventData) => {
      setGameState((prev) => ({
        ...prev,
        players: prev.players.filter((p) => p.id !== data.payload.playerId),
      }))

      addNotification({
        type: "warning",
        title: "Oyuncu Atıldı",
        message: "Bir oyuncu odadan atıldı",
        autoHide: true,
      })
    },
    [addNotification],
  )

  const handleWinnerDeclared = useCallback(
    (data: GameEventData) => {
      const winnerMessages = {
        INNOCENTS: "Innocents Win! All traitors eliminated.",
        TRAITORS: "Traitors Win! They've taken control.",
        SERIAL_KILLER: "Serial Killer Wins! Last one standing.",
      }

      addNotification({
        type: "success",
        title: "Game Over",
        message: winnerMessages[data.payload.winner as keyof typeof winnerMessages] || "Game ended",
        autoHide: false,
      })
    },
    [addNotification],
  )

  const handleError = useCallback(
    (data: any) => {
      addNotification({
        type: "error",
        title: "Error",
        message: data.message || "An error occurred",
        autoHide: false,
      })
    },
    [addNotification],
  )

  // Set up event listeners
  useEffect(() => {
    wsClient.on("CONNECTION_STATUS", handleConnectionStatus)
    wsClient.on("ROOM_JOINED", handleRoomJoined)
    wsClient.on("PLAYER_LIST_UPDATED", handlePlayerListUpdated)
    wsClient.on("GAME_STARTED", handleGameStarted)
    wsClient.on("PHASE_CHANGED", handlePhaseChanged)
    wsClient.on("CARD_APPLIED", handleCardApplied)
    wsClient.on("VOTE_CAST", handleVoteCast)
    wsClient.on("PLAYER_ELIMINATED", handlePlayerEliminated)
    wsClient.on("PLAYER_KICKED", handlePlayerKicked)
    wsClient.on("PLAYER_REVIVED", handlePlayerRevived)
    wsClient.on("WINNER_DECLARED", handleWinnerDeclared)
    wsClient.on("ERROR", handleError)

    return () => {
      wsClient.off("CONNECTION_STATUS", handleConnectionStatus)
      wsClient.off("ROOM_JOINED", handleRoomJoined)
      wsClient.off("PLAYER_LIST_UPDATED", handlePlayerListUpdated)
      wsClient.off("GAME_STARTED", handleGameStarted)
      wsClient.off("PHASE_CHANGED", handlePhaseChanged)
      wsClient.off("CARD_APPLIED", handleCardApplied)
      wsClient.off("VOTE_CAST", handleVoteCast)
      wsClient.off("PLAYER_ELIMINATED", handlePlayerEliminated)
      wsClient.off("PLAYER_KICKED", handlePlayerKicked)
      wsClient.off("PLAYER_REVIVED", handlePlayerRevived)
      wsClient.off("WINNER_DECLARED", handleWinnerDeclared)
      wsClient.off("ERROR", handleError)
    }
  }, [
    handleConnectionStatus,
    handleRoomJoined,
    handlePlayerListUpdated,
    handleGameStarted,
    handlePhaseChanged,
    handleCardApplied,
    handleVoteCast,
    handlePlayerEliminated,
    handlePlayerRevived,
    handleWinnerDeclared,
    handleError,
  ])

  // Connect to room on mount
  useEffect(() => {
    wsClient.connect(roomId, playerId, playerName, isOwner)

    return () => {
      wsClient.disconnect()
    }
  }, [roomId, playerId, playerName, isOwner])

  // Demo placeholder - real server should broadcast player updates

  const sendEvent = useCallback((eventType: GameEvent, payload: any) => {
    wsClient.sendEvent(eventType, payload)
  }, [])

  return {
    ...gameState,
    addNotification,
    removeNotification,
    sendEvent,
  }
}
