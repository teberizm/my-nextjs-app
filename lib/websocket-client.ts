"use client"

import { EventEmitter } from "events"
import type { Player } from "./types"

// Olası tüm event tiplerini toplu tanımlayalım (server/client’ta kullandıklarımız)
export type GameEvent =
  | "ROOM_JOINED"
  | "PLAYER_LIST_UPDATED"
  | "GAME_STARTED"
  | "PHASE_CHANGED"
  | "STATE_SNAPSHOT"
  | "REQUEST_SNAPSHOT"
  | "NIGHT_ACTION_SUBMITTED"
  | "NIGHT_ACTIONS_UPDATED"
  | "SUBMIT_VOTE"
  | "VOTES_UPDATED"
  | "NOTES_UPDATED"
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
  | "PLAYER_KICKED"
  | "KICK_PLAYER"
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

/** URL’i güvenli şekilde hesapla (env > window origin > local fallback) */
function computeWsUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_WS_URL
  if (envUrl && typeof envUrl === "string" && envUrl.startsWith("ws")) {
    return envUrl
  }

  if (typeof window !== "undefined") {
    const isSecure = window.location.protocol === "https:"
    const proto = isSecure ? "wss" : "ws"
    // Aynı host + /socket path
    return `${proto}://${window.location.host}/socket`
  }

  // SSR / fallback (lokal dev server)
  return "ws://127.0.0.1:3001"
}

export class WebSocketClient extends EventEmitter {
  private socket: WebSocket | null = null
  private roomId: string | null = null
  private player: Player | null = null

  connect(roomId: string, player: Player) {
    this.roomId = roomId
    this.player = player

    const url = computeWsUrl()
    console.log("[ws] connecting to:", url)

    try {
      this.socket = new WebSocket(url)
    } catch (err) {
      console.error("[ws] invalid WebSocket URL:", url, err)
      this.emit("ERROR", { message: "Invalid WebSocket URL", url })
      return
    }

    this.socket.onopen = () => {
      console.log("[ws] open")
      this.emit("CONNECTION_STATUS", { connected: true, timestamp: new Date() })
      // Odaya katıl
      this.sendEvent("JOIN_ROOM", { roomId, player })
    }

    this.socket.onclose = (ev) => {
      console.warn("[ws] close", { code: ev.code, reason: ev.reason })
      this.emit("CONNECTION_STATUS", { connected: false, timestamp: new Date() })
    }

    this.socket.onerror = (ev) => {
      console.error("[ws] error", ev)
      this.emit("ERROR", { message: "WebSocket error", event: ev })
    }

    this.socket.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string)
        // Debug için istersen aç: console.log("[ws] message", data.type, data)
        this.emit(data.type, { ...data, timestamp: new Date() })
      } catch (e) {
        console.error("[ws] invalid message", e, event.data)
      }
    }
  }

  disconnect() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.close()
      } catch {}
    }
    this.socket = null
    this.roomId = null
    this.player = null
  }

  sendEvent(eventType: GameEvent, payload: any) {
    if (!this.socket) {
      console.warn("[ws] sendEvent: no socket", eventType)
      this.emit("ERROR", { message: "Socket is not created", eventType })
      return
    }
    if (this.socket.readyState !== WebSocket.OPEN) {
      console.warn("[ws] sendEvent while not open:", eventType)
      this.emit("ERROR", { message: "Not connected to server", eventType })
      return
    }

    const msg = {
      type: eventType,
      payload,
      roomId: this.roomId,
      playerId: this.player?.id,
    }
    try {
      this.socket.send(JSON.stringify(msg))
    } catch (e) {
      console.error("[ws] sendEvent failed", e, msg)
      this.emit("ERROR", { message: "Failed to send event", eventType, error: String(e) })
    }
  }
}

export const wsClient = new WebSocketClient()
