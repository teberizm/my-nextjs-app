"use client";

import { EventEmitter } from "events";
import type { Player } from "./types";

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
  // server-only types we still pass through
  | "JOIN_ROOM"
  // ------------------ (EKLENENLER) ------------------
  | "SETTINGS_UPDATED"
  | "RESET_GAME"
  // Card draw (server & client)
  | "CARD_DRAW_READY"      // server → yalnızca sırası gelen oyuncu
  | "CARD_QR_SCANNED"      // client → server { token }
  | "CARD_PREVIEW"         // server → yalnızca sırası gelen oyuncu { text, effectId } | { error }
  | "CARD_CONFIRM"         // client → server { effectId }
  | "CARD_APPLIED_PRIVATE" // server → yalnızca sırası gelen oyuncu { result }
  // ---------------------------------------------------
  ;

export interface GameEventData {
  type: GameEvent;
  payload: any;
  timestamp: Date;
  roomId?: string;
  gameId?: string;
  playerId?: string;
}

/** WS URL kuralları:
 *  - NEXT_PUBLIC_WS_URL tanımlıysa onu kullan (ör: wss://play.tebova.com/ws)
 *  - Aksi halde tarayıcıdaysak ws(s)://<hostname>:3001
 *  - SSR fallback: ws://127.0.0.1:3001
 */
function computeWsUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envUrl && typeof envUrl === "string" && (envUrl.startsWith("ws://") || envUrl.startsWith("wss://"))) {
    return envUrl;
  }
  if (typeof window !== "undefined") {
    const isSecure = window.location.protocol === "https:";
    const proto = isSecure ? "wss" : "ws";
    const host = window.location.host; // dikkat: host = domain + port (eğer varsa)
    return `${proto}://${host}/socket`;
  }
  return "ws://127.0.0.1:3001";
}

type Handler = (evt: any) => void;

export class WebSocketClient extends EventEmitter {
  private socket: WebSocket | null = null;
  private roomId: string | null = null;
  private player: Player | null = null;

  /** Bağlantı açılana dek gönderilecek mesajların kuyruğu */
  private outbox: Array<{ type: GameEvent; payload?: any; roomId?: string; playerId?: string }> = [];

  /** Tekrar connect çağrılırsa aynı soketi yeniden kullanır */
   connect(roomId: string, player: Player, opts?: { adminPassword?: string; gameId?: string }) {
    this.roomId = roomId;
    this.player = player;

    // Açık bir soket varsa ve OPEN ise sadece JOIN gönder
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendRaw({
  type: "JOIN_ROOM",
  payload: { roomId, player, adminPassword: opts?.adminPassword, gameId: opts?.gameId },
  roomId,
  playerId: player.id
});
      // Katılır katılmaz tam senkron için:
      this.sendEvent("REQUEST_SNAPSHOT", {});
      return;
    }

    const url = computeWsUrl();
    console.log("[ws] connecting to:", url);

    try {
      this.socket = new WebSocket(url);
    } catch (err) {
      console.error("[ws] invalid WebSocket URL:", url, err);
      this.emit("ERROR", { message: "Invalid WebSocket URL", url });
      return;
    }

    this.socket.onopen = () => {
      console.log("[ws] open", url);
      this.emit("CONNECTION_STATUS", { connected: true, timestamp: new Date() });

      // Odaya katıl
      this.sendRaw({ type: "JOIN_ROOM", payload: { roomId, player }, roomId, playerId: player.id });

      // Snapshot iste (bazı yerlerde ayrıca isteniyor; iki kez gelse de sorun değil)
      this.sendEvent("REQUEST_SNAPSHOT", {});

      // Outbox'ı flush et
      if (this.outbox.length > 0) {
        const pending = [...this.outbox];
        this.outbox = [];
        pending.forEach((m) =>
          this.sendRaw({ ...m, roomId: m.roomId ?? this.roomId ?? roomId, playerId: m.playerId ?? this.player?.id }),
        );
      }
    };

    this.socket.onmessage = (event: MessageEvent) => {
      let data: any;
      try {
        data = JSON.parse(event.data as string);
      } catch (e) {
        console.error("[ws] invalid message JSON", e, event.data);
        return;
      }
      const { type } = data || {};
      // Debug log:
      console.log("[server→ws]", type, data?.payload ?? "");

      // EventEmitter ile dışarı yayınla
      this.emit(type, { ...data, timestamp: new Date() });
    };

    this.socket.onclose = (ev) => {
      console.warn("[ws] close", { code: ev.code, reason: ev.reason });
      this.emit("CONNECTION_STATUS", { connected: false, timestamp: new Date() });
    };

    this.socket.onerror = (ev) => {
      console.error("[ws] error", ev);
      this.emit("ERROR", { message: "WebSocket error", event: ev });
    };
  }

  disconnect() {
    try {
      if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
        this.socket.close();
      }
    } catch {}
    this.socket = null;
    this.roomId = null;
    this.player = null;
    this.outbox = [];
  }

  /** Kullan: wsClient.sendEvent("SUBMIT_VOTE", { targetId }) */
  sendEvent(eventType: GameEvent, payload: any) {
    const msg = {
      type: eventType,
      payload: payload ?? {},
      roomId: this.roomId ?? undefined,
      playerId: this.player?.id ?? undefined,
    };

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      // Bağlı değilken güvenle kuyruğa al
      console.warn("[ws] queueing (socket not open):", eventType, msg);
      this.outbox.push(msg);
      return;
    }

    this.sendRaw(msg);
  }

  /** Düşük seviye gönderim (OPEN değilse outbox’a bırakır) */
  private sendRaw(obj: { type: GameEvent; payload?: any; roomId?: string; playerId?: string }) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.outbox.push(obj);
      return;
    }
    try {
      this.socket.send(JSON.stringify(obj));
      // Debug için:
      console.log("[ws→server]", obj.type, obj);
    } catch (e) {
      console.error("[ws] send error", e, obj);
      this.emit("ERROR", { message: "Failed to send event", eventType: obj.type, error: String(e) });
    }
  }

  /** Event abonelikleri (EventEmitter kullanımıyla uyumlu) */
  on(type: GameEvent | string, fn: Handler) {
    return super.on(type, fn);
  }
  off(type: GameEvent | string, fn: Handler) {
    // @ts-ignore
    return super.off(type, fn);
  }

  // ------------------ (EKLENEN YARDIMCILAR) ------------------
  /** QR tarama sonucu token'ı server'a gönderir */
  sendCardQrScanned(token: string) {
    this.sendEvent("CARD_QR_SCANNED", { token });
  }
  /** Kart metni onaylandığında seçilen efekti server'a bildirir */
  sendCardConfirm(effectId: string) {
    this.sendEvent("CARD_CONFIRM", { effectId });
  }
  // -----------------------------------------------------------
}

export const wsClient = new WebSocketClient();
export default wsClient;
