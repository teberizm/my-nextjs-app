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
  private socket: WebSocket | null = null
  private roomId: string | null = null
  private playerId: string | null = null

  connect(roomId: string, playerId: string) {
    this.roomId = roomId
    this.playerId = playerId

    const defaultUrl =
      typeof window !== "undefined"
        ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}${window.location.port ? `:${parseInt(window.location.port) + 1}` : ""}`
        : "ws://localhost:3001"
    const url = process.env.NEXT_PUBLIC_WS_URL || defaultUrl
    this.socket = new WebSocket(url)

    this.socket.onopen = () => {
      this.emit("CONNECTION_STATUS", { connected: true, timestamp: new Date() })
      this.socket?.send(
        JSON.stringify({ type: "CONNECT", roomId: this.roomId, playerId: this.playerId }),
      )
    }

    this.socket.onclose = () => {
      this.emit("CONNECTION_STATUS", { connected: false, timestamp: new Date() })
    }

    this.socket.onerror = () => {
      this.emit("ERROR", { message: "WebSocket error" })
    }

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const message: GameEventData = { ...data, timestamp: new Date() }
        this.emit(data.type, message)
      } catch (err) {
        this.emit("ERROR", { message: "Invalid message from server" })
      }
    }
  }

  disconnect() {
    this.socket?.close()
    this.socket = null
    this.roomId = null
    this.playerId = null
  }

  sendEvent(eventType: GameEvent, payload: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: eventType,
          payload,
          roomId: this.roomId,
          playerId: this.playerId,
        }),
      )
    } else {
      this.emit("ERROR", { message: "Not connected to server" })
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected(),
      roomId: this.roomId,
      playerId: this.playerId,
    }
  }
}

export const wsClient = new WebSocketClient()

