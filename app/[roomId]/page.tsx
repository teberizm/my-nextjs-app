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

  const handleJoin = (name: string, isAdmin: boolean, password?: string): boolean => {
    if (isAdmin && password !== ROOM_PASSWORD) {
      return false;
    }
    const id = Math.random().toString(36).substring(2, 9);
    const newPlayer: Player = {
      id,
      name,
      isOwner: isAdmin,
      isAlive: true,
      isMuted: false,
      hasShield: false,
      connectedAt: new Date(),
    };

    setCurrentRoom((prev) => ({
      ...prev,
      ownerId: isAdmin ? id : prev.ownerId,
      players: [...prev.players, newPlayer],
    }));
    setCurrentPlayer(newPlayer);
    return true;
  };

  useEffect(() => {
    if (!currentPlayer) return;

    wsClient.connect(currentRoom.inviteCode, currentPlayer);

    // bağlanır bağlanmaz oda snapshot'ı iste
    wsClient.sendEvent("REQUEST_SNAPSHOT" as any, {});

    const handlePlayerList = (data: any) => {
      const players = data?.payload?.players || [];
      setCurrentRoom((prev) => ({ ...prev, players }));
    };
    wsClient.on("PLAYER_LIST_UPDATED", handlePlayerList);

    const handleKicked = (data: any) => {
      if (data?.payload?.playerId === currentPlayer.id) {
        setCurrentPlayer(null);
        setGamePhase("LOBBY");
      }
    };
    wsClient.on("PLAYER_KICKED", handleKicked);

    const onGameStarted = () => {
      // server faz yayınlayacağı için sadece log
      console.log("[client] GAME_STARTED received");
    };
    wsClient.on("GAME_STARTED", onGameStarted);

    const onPhaseChanged = (data: any) => {
      const next = data?.payload?.phase as GamePhase | undefined;
      if (next) {
        console.log("[client] PHASE_CHANGED", data.payload);
        setGamePhase(next);
      }
    };
    wsClient.on("PHASE_CHANGED", onPhaseChanged);

    const onSnapshot = (data: any) => {
      const s = data?.payload?.state;
      if (!s) return;
      console.log("[client] STATE_SNAPSHOT received", s);
      if (Array.isArray(s.players)) {
        setCurrentRoom((prev) => ({ ...prev, players: s.players }));
      }
      if (s.phase) {
        setGamePhase(s.phase as GamePhase);
      }
    };
    wsClient.on("STATE_SNAPSHOT", onSnapshot);

    return () => {
      wsClient.off("PLAYER_LIST_UPDATED", handlePlayerList);
      wsClient.off("PLAYER_KICKED", handleKicked);
      wsClient.off("GAME_STARTED", onGameStarted);
      wsClient.off("PHASE_CHANGED", onPhaseChanged);
      wsClient.off("STATE_SNAPSHOT", onSnapshot);
      wsClient.disconnect();
    };
  }, [currentPlayer, currentRoom.inviteCode]);

  // Owner "Başlat" → server-authoritative GAME_STARTED
  const handleStartGame = () => {
    if (gamePhase !== "LOBBY") return;
    console.log("[ui] handleStartGame click by owner");
    wsClient.sendEvent("GAME_STARTED" as any, {
      players: currentRoom.players,      // roller yoksa server dağıtacak
      settings: gameSettings,
    });
    // Fazı local değiştirmiyoruz; server PHASE_CHANGED yayınlar.
  };

  const handleKickPlayer = (playerId: string) => {
    wsClient.sendEvent("KICK_PLAYER", { playerId });
  };

  const handleToggleLock = () => {
    if (!currentPlayer?.isOwner) return;
    setCurrentRoom((prev) => ({ ...prev, isLocked: !prev.isLocked }));
  };

  const handleGameEnd = () => {
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
          gameSettings={gameSettings}
          onStartGame={handleStartGame}
          onKickPlayer={handleKickPlayer}
          onToggleLock={handleToggleLock}
          onUpdateSettings={setGameSettings}
        />
      ) : (
        <GameController
          initialPlayers={currentRoom.players}
          gameSettings={gameSettings}
          currentPlayerId={currentPlayer.id}
          onGameEnd={handleGameEnd}
        />
      )}
    </>
  );
}
