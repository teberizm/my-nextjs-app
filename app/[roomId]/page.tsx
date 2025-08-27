"use client";

import { useEffect, useState } from "react";
import { RoomLobby } from "@/components/room/room-lobby";
import { GameController } from "@/components/game/game-controller";
import { JoinRoomDialog } from "@/components/room/join-room-dialog";
import { wsClient } from "@/lib/websocket-client";
import type { Room, Player, GameSettings, GamePhase } from "@/lib/types";

const ROOM_PASSWORD = "1234";

export default function RoomPage({ params }: { params: { roomId: string } }) {
  const { roomId } = params;

  // Oda durumu (oyuncu listesi her zaman SUNUCU’dan gelir)
  const [currentRoom, setCurrentRoom] = useState<Room>({
    id: roomId,
    inviteCode: roomId,
    ownerId: "",
    players: [],
    maxPlayers: 12,
    isLocked: false,
    createdAt: new Date(),
  });

  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [gamePhase, setGamePhase] = useState<GamePhase>("LOBBY");

  const [gameSettings, setGameSettings] = useState<GameSettings>({
    traitorCount: 2,
    specialRoleCount: 2,
    cardDrawCount: 2,
    nightDuration: 60,
    dayDuration: 120,
    voteDuration: 45,
  });
  const [game, setGame] = useState<any | null>(null);

  // --- Kart çekme akışına dair istemci durumları (basit) ---
  const [currentCardDrawer, setCurrentCardDrawer] = useState<string | null>(null);

  // Odaya giriş (sadece kendi kimliğimizi oluşturuyoruz; oyuncu listesi sunucudan gelecek)
  const handleJoin = (name: string, isAdmin: boolean, password?: string): boolean => {
    if (isAdmin && password !== ROOM_PASSWORD) return false;

    const id = Math.random().toString(36).substring(2, 9);
    const me: Player = {
      id,
      name,
      isOwner: isAdmin,
      isAlive: true,
      isMuted: false,
      hasShield: false,
      connectedAt: new Date(),
    };

    // Owner bilgisini UI’da göstermek için tutuyoruz; oyuncu listesine EKLEME yapmıyoruz.
    setCurrentRoom((prev) => ({
      ...prev,
      ownerId: isAdmin ? id : prev.ownerId,
    }));

    setCurrentPlayer(me);
    return true;
  };

  useEffect(() => {
    if (!currentPlayer) return;

    // Bağlan ve odaya katıl
    wsClient.connect(currentRoom.inviteCode, currentPlayer);

    // Bağlanır bağlanmaz full snapshot iste
    wsClient.sendEvent("REQUEST_SNAPSHOT" as any, {});

    // --- Event handlers ---
    const onPlayerList = (data: any) => {
      const players = data?.payload?.players || [];
      setCurrentRoom((prev) => ({ ...prev, players }));
    };

    const onKicked = (data: any) => {
      if (data?.payload?.playerId === currentPlayer.id) {
        setCurrentPlayer(null);
        setGamePhase("LOBBY");
        setCurrentRoom((prev) => ({ ...prev, players: [] }));
      }
    };

    // Oyun başladı → sunucunun gönderdiği ayarları al
    const onGameStarted = (data: any) => {
      const settings = data?.payload?.settings as GameSettings | undefined;
      if (settings) setGameSettings(settings);
      console.log("[client] GAME_STARTED received");
    };

    const onPhaseChanged = (data: any) => {
      const next = data?.payload?.phase as GamePhase | undefined;
      const drawer = data?.payload?.currentCardDrawer ?? null;
      if (next) {
        console.log("[client] PHASE_CHANGED", data.payload);
        setGamePhase(next);
      }
      // kart çekme sırasında sıradaki oyuncu id'sini tutalım (bekleme ekranı için)
      setCurrentCardDrawer(drawer);
    };

    // Sunucu snapshot (oyuncular + faz). (Not: settings snapshot içinde gelmiyor.)
    const onSnapshot = (data: any) => {
      const s = data?.payload?.state;
      if (!s) return;
      console.log("[client] STATE_SNAPSHOT received", s);

      if (Array.isArray(s.players)) {
        setCurrentRoom((prev) => ({ ...prev, players: s.players }));
      }
      if (s.phase) setGamePhase(s.phase as GamePhase);
      if ("currentCardDrawer" in s) setCurrentCardDrawer(s.currentCardDrawer ?? null);
    };

    // 🔥 Ayarlar güncellendi → tüm istemcilerde UI'ı senkronla
    const onSettingsUpdated = (data: any) => {
      const settings = data?.payload?.settings as GameSettings | undefined;
      if (settings) setGameSettings(settings);
    };

    // --- Kart çekme akışı: sadece sırası gelen oyuncuya özel mesajlar ---
    const onCardDrawReady = () => {
      // Basit test akışı: prompt ile QR (token) iste
      const token = typeof window !== "undefined" ? window.prompt("QR kodunu okut / değeri gir:") : null;
      if (token && token.trim().length > 0) {
        wsClient.sendEvent("CARD_QR_SCANNED", { token: token.trim() });
      }
    };

    const onCardPreview = (data: any) => {
      const { text, effectId, error } = data?.payload || {};
      if (error) {
        if (typeof window !== "undefined") window.alert(error);
        return;
      }
      // Basit onay: “TAMAM!” deyince CARD_CONFIRM gönder
      const ok = typeof window !== "undefined" ? window.confirm(String(text || "Kart")) : true;
      if (ok && effectId) {
        wsClient.sendEvent("CARD_CONFIRM", { effectId });
      }
    };

    const onCardAppliedPrivate = (data: any) => {
      console.log("[client] CARD_APPLIED_PRIVATE", data?.payload);
      // İstersen burada küçük bir toast gösterebilirsin
    };

    // --- Subscribe ---
    wsClient.on("PLAYER_LIST_UPDATED", onPlayerList);
    wsClient.on("PLAYER_KICKED", onKicked);
    wsClient.on("GAME_STARTED", onGameStarted);
    wsClient.on("PHASE_CHANGED", onPhaseChanged);
    wsClient.on("STATE_SNAPSHOT", onSnapshot);
    wsClient.on("SETTINGS_UPDATED", onSettingsUpdated);

    wsClient.on("CARD_DRAW_READY", onCardDrawReady);
    wsClient.on("CARD_PREVIEW", onCardPreview);
    wsClient.on("CARD_APPLIED_PRIVATE", onCardAppliedPrivate);

    // --- Cleanup ---
    return () => {
      wsClient.off("PLAYER_LIST_UPDATED", onPlayerList);
      wsClient.off("PLAYER_KICKED", onKicked);
      wsClient.off("GAME_STARTED", onGameStarted);
      wsClient.off("PHASE_CHANGED", onPhaseChanged);
      wsClient.off("STATE_SNAPSHOT", onSnapshot);
      wsClient.off("SETTINGS_UPDATED", onSettingsUpdated);

      wsClient.off("CARD_DRAW_READY", onCardDrawReady);
      wsClient.off("CARD_PREVIEW", onCardPreview);
      wsClient.off("CARD_APPLIED_PRIVATE", onCardAppliedPrivate);

      wsClient.disconnect();
    };
  }, [currentPlayer, currentRoom.inviteCode]);

  // Owner “Başlat” → server-authoritative GAME_STARTED
  const handleStartGame = () => {
    if (gamePhase !== "LOBBY") return;
    if (!currentPlayer?.isOwner) return;

    console.log("[ui] handleStartGame click by owner");
    wsClient.sendEvent("GAME_STARTED" as any, {
      players: currentRoom.players, // Roller yoksa server dağıtacak
      settings: gameSettings,
    });
    // Lokal faz değiştirmiyoruz; server PHASE_CHANGED yayınlar.
  };

  const handleKickPlayer = (playerId: string) => {
    wsClient.sendEvent("KICK_PLAYER", { playerId });
  };

  const handleToggleLock = () => {
    if (!currentPlayer?.isOwner) return;
    setCurrentRoom((prev) => ({ ...prev, isLocked: !prev.isLocked }));
  };

  const handleGameEnd = () => {
    // UI reset — otorite server; bir sonraki snapshot ile tüm detaylar senkron olur
    setGamePhase("LOBBY");
    setCurrentRoom((prev) => ({
      ...prev,
      players: prev.players.map((p) => ({
        ...p,
        role: undefined,
        displayRole: undefined,
        isAlive: true,
        isMuted: false,
        hasShield: false,
      })),
    }));
    if (currentPlayer?.isOwner) {
      wsClient.sendEvent("RESET_GAME" as any, {});
    }
  };

  if (!currentPlayer) {
    return <JoinRoomDialog onJoin={handleJoin} />;
  }

  const isLobby = gamePhase === "LOBBY";

  return (
    <>
      {isLobby ? (
        <RoomLobby
          room={currentRoom}
          currentPlayer={currentPlayer}
          gameSettings={game?.settings ?? gameSettings}
          onStartGame={handleStartGame}
          onKickPlayer={handleKickPlayer}
          onToggleLock={handleToggleLock}
          onUpdateSettings={setGameSettings}
        />
      ) : (
        <GameController
          initialPlayers={currentRoom.players}
          gameSettings={game?.settings ?? gameSettings}
          currentPlayerId={currentPlayer.id}
          onGameEnd={handleGameEnd}
          // İstersen GameController içinde bekleme yazısı için bu bilgiyi kullan:
          // currentCardDrawer={currentCardDrawer}
        />
      )}
    </>
  );
}
