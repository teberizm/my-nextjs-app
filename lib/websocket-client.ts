"use client"

import { EventEmitter } from "events"
import type { Player } from "./types"

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
  | "PLAYER_KICKED"
  | "KICK_PLAYER"

export interface GameEventData {
  type: GameEvent
  payload: any
  timestamp: Date
  roomId?: string
  gameId?: string
  playerId?: string
}

// Determine the websocket server URL. If NEXT_PUBLIC_WS_URL is provided it
// takes precedence; otherwise, attempt to use the same host as the current
// page so multiple devices hitting the same domain will connect to the same
// websocket relay. Fallback to localhost for local development.
const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001`
    : "ws://localhost:3001")

export class WebSocketClient extends EventEmitter {
  private socket: WebSocket | null = null
  private roomId: string | null = null
  private player: Player | null = null

  connect(roomId: string, player: Player) {
    this.roomId = roomId
    this.player = player
    this.socket = new WebSocket(WS_URL)

    this.socket.onopen = () => {
      this.emit("CONNECTION_STATUS", { connected: true, timestamp: new Date() })
      this.sendEvent("JOIN_ROOM" as GameEvent, { roomId, player })
    }

    this.socket.onclose = () => {
      this.emit("CONNECTION_STATUS", { connected: false, timestamp: new Date() })
    }

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string)
        this.emit(data.type, { ...data, timestamp: new Date() })
      } catch (e) {
        console.error("Invalid message", e)
      }
    }
  }

  disconnect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close()
    }
    this.socket = null
    this.roomId = null
    this.player = null
  }

  sendEvent(eventType: GameEvent, payload: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: eventType,
          payload,
          roomId: this.roomId,
          playerId: this.player?.id,
        }),
      )
    } else {
      this.emit("ERROR", { message: "Not connected to server" })
    }
  }
}

export const wsClient = new WebSocketClient()
