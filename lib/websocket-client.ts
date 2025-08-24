"use client"

import { EventEmitter } from "events"

export type GameEvent =
  | "ROOM_JOINED"
  | "PLAYER_LIST_UPDATED"
  | "GAME_STARTED"
  | "PHASE_CHANGED"
  | "ROLE_ASSIGNED_PRIVATE"
  | "RANDOM_PLAYERS_PICKED_FOR_CARD"
  | "CARD_SCANNED"
  | "CARD_APPLIED"
  | "VOTE_OPENED"
  | "VOTE_CAST"
  | "VOTE_RESULT"
  | "PLAYER_ELIMINATED"
  | "PLAYER_KICKED"
  | "PLAYER_REVIVED"
  | "WINNER_DECLARED"
  | "GAME_ENDED"
  | "CONNECTION_STATUS"
  | "ERROR"

export interface GameEventData {
  type: GameEvent
  payload: any
  timestamp: Date
  roomId?: string
  gameId?: string
  playerId?: string
}

export class WebSocketClient extends EventEmitter {
  private connected = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectInterval = 3000
  private roomId: string | null = null
  private playerId: string | null = null
  private playerName: string | null = null
  private isOwner = false

  constructor() {
    super()
    this.simulateConnection()
  }

  private simulateConnection() {
    // Simulate WebSocket connection
    setTimeout(() => {
      this.connected = true
      this.emit("CONNECTION_STATUS", { connected: true, timestamp: new Date() })
    }, 1000)
  }

  connect(roomId: string, playerId: string, playerName: string, isOwner: boolean) {
    this.roomId = roomId
    this.playerId = playerId
    this.playerName = playerName
    this.isOwner = isOwner

    if (!this.connected) {
      this.simulateConnection()
    }

    // Simulate joining room
    setTimeout(() => {
      this.emit("ROOM_JOINED", {
        type: "ROOM_JOINED",
        payload: { roomId, playerId },
        timestamp: new Date(),
        roomId,
        playerId,
      })

      this.emit("PLAYER_LIST_UPDATED", {
        type: "PLAYER_LIST_UPDATED",
        payload: {
          players: [
            {
              id: playerId,
              name: playerName,
              isOwner,
              isAlive: true,
              isMuted: false,
              hasShield: false,
            },
          ],
          newPlayer: { name: playerName },
        },
        timestamp: new Date(),
        roomId,
        playerId,
      })
    }, 500)
  }

  disconnect() {
    this.connected = false
    this.roomId = null
    this.playerId = null
    this.emit("CONNECTION_STATUS", { connected: false, timestamp: new Date() })
  }

  sendEvent(eventType: GameEvent, payload: any) {
    if (!this.connected) {
      this.emit("ERROR", { message: "Not connected to server" })
      return
    }

    // Simulate server processing and broadcasting
    setTimeout(
      () => {
        this.emit(eventType, {
          type: eventType,
          payload,
          timestamp: new Date(),
          roomId: this.roomId,
          playerId: this.playerId,
        })
      },
      100 + Math.random() * 200,
    ) // Simulate network latency
  }

  // Simulate receiving events from other players
  simulateEvent(eventType: GameEvent, payload: any, fromPlayerId?: string) {
    if (!this.connected) return

    this.emit(eventType, {
      type: eventType,
      payload,
      timestamp: new Date(),
      roomId: this.roomId,
      playerId: fromPlayerId || "other_player",
    })
  }

  isConnected(): boolean {
    return this.connected
  }

  getConnectionStatus() {
    return {
      connected: this.connected,
      roomId: this.roomId,
      playerId: this.playerId,
      reconnectAttempts: this.reconnectAttempts,
    }
  }
}

// Singleton instance
export const wsClient = new WebSocketClient()
