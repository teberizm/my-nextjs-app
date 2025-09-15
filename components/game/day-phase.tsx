"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sun, Clock } from "lucide-react";
import type { Player } from "@/lib/types";
import { wsClient } from "@/lib/websocket-client";
import { PlayerStatus } from "@/components/game/player-status";

interface DayPhaseProps {
  currentPlayer: Player;
  allPlayers: Player[];
  timeRemaining: number;
  currentTurn: number;
  playerNotes: Record<string, string[]>;
  deaths: Player[];
  secretMsgReq?: { actorId: string; turn: number; targets: { id: string; name: string }[] } | null;
  onSubmitSecretMessage?: (targetId: string, text: string) => void;
}

export function DayPhase({
  currentPlayer,
  allPlayers,
  timeRemaining,
  currentTurn,
  playerNotes,
  deaths,
  secretMsgReq,
  onSubmitSecretMessage,
}: DayPhaseProps) {
  const notes = playerNotes[currentPlayer.id] || [];

  const [progress, setProgress] = useState<{ votes: number; total: number }>({ votes: 0, total: 0 });

  const [selTarget, setSelTarget] = useState<string>("");
  const [secretText, setSecretText] = useState<string>("");

  const isMySecret = !!secretMsgReq && secretMsgReq.actorId === currentPlayer.id;

  const SecretModal = isMySecret ? (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-card border shadow-lg p-4 space-y-3">
        <div className="text-lg font-semibold">Gizli Mesaj Gönder</div>

        <div>
          <label className="text-sm opacity-70">Hedef</label>
          <select
            className="w-full mt-1 rounded-md border bg-background p-2"
            value={selTarget}
            onChange={(e) => setSelTarget(e.target.value)}
          >
            <option value="">Seçiniz…</option>
            {secretMsgReq!.targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm opacity-70">Mesaj</label>
          <textarea
            className="w-full mt-1 rounded-md border bg-background p-2 h-28 resize-none"
            maxLength={280}
            value={secretText}
            onChange={(e) => setSecretText(e.target.value)}
            placeholder="Mesajını yaz… (max 280)"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button
            className="px-4 py-2 rounded-md border"
            onClick={() => {
              // İstersen burada lokal kapatma yapabilirsin;
              // normalde sunucu SUCCESS gönderince modal kapanır (SECRET_MESSAGE_RESULT).
            }}
          >
            Vazgeç
          </button>
          <button
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            disabled={!selTarget || !secretText.trim()}
            onClick={() => onSubmitSecretMessage?.(selTarget, secretText)}
          >
            Gönder
          </button>
        </div>
      </div>
    </div>
  ) : null;

  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === "DISCUSSION_END_PROGRESS") {
        setProgress(msg.payload);
      }
    };
    wsClient.on("DISCUSSION_END_PROGRESS", handler);
    return () => wsClient.off("DISCUSSION_END_PROGRESS", handler);
  }, []);

  function renderNote(line: string) {
  // [[secret:<fromId>]] veya [[secret:<fromId>:<fromName>]]
  const m = line.match(/^\d+\. (Gün|Gece): \[\[secret:([^:\]]+)(?::([^\]]+))?\]\]\s*(.+)$/);
  if (m) {
    const fromId = m[2];
    const providedName = m[3];          // varsa, sunucunun koyduğu isim
    const text = m[4];

    // allPlayers'tan gerçek adı çöz
    const sender = (typeof fromId === 'string')
      ? (/* DayPhase props'undaki listeyi kullanıyoruz */ (Array.isArray(allPlayers) ? allPlayers : [])).find(p => p.id === fromId)
      : undefined;

    const fromName = sender?.name || providedName || "Biri";

    return (
      <div className="p-2 rounded-md border border-fuchsia-400/50 bg-fuchsia-400/10">
        <div className="text-xs uppercase tracking-wide text-fuchsia-400 mb-1">
          Gizli mesaj — {fromName}
        </div>
        <div>{text}</div>
      </div>
    );
  }
  return <div>{line}</div>;
}

  return (
    <>
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto space-y-6">
          {/* Header */}
          <Card className="neon-border bg-card/50 backdrop-blur-sm">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-yellow-400/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sun className="w-8 h-8 text-yellow-400" />
              </div>
              <CardTitle className="font-work-sans">Gündüz - Tur {currentTurn}</CardTitle>
              <CardDescription>Tartışma zamanı</CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="text-2xl font-bold text-primary">{timeRemaining}s</div>
              <p className="text-sm text-muted-foreground">Tartışma süresi</p>
            </CardContent>
          </Card>

          {/* Notes */}
          {notes.length > 0 && (
            <Card className="neon-border bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-work-sans text-sm">Notlar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {notes.map((note, idx) => (
                  <div key={idx}>{renderNote(note)}</div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* General Notes */}
          <Card className="bg-destructive/10 border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive font-work-sans">Genel Notlar</CardTitle>
            </CardHeader>
            <CardContent>
              {deaths.length > 0 ? (
                <div className="space-y-2">
                  {deaths.map((player, idx) => (
                    <div key={player.id} className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-xs">
                        {idx + 1}.
                      </Badge>
                      <span className="font-medium">{player.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Henüz kimse ölmedi</p>
              )}
            </CardContent>
          </Card>

          {/* Player Status */}
          <PlayerStatus players={allPlayers} currentPlayer={currentPlayer} showRoles={false} />

          {/* Phase Info + New Buttons */}
          <Card className="bg-muted/10 border-muted/30">
            <CardContent className="space-y-3 pt-6 text-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
                <Clock className="w-4 h-4" />
                <span>Tartışma sonrası oylama başlayacak</span>
              </div>

              <Button
                onClick={() => wsClient.sendEvent("REQUEST_END_DISCUSSION" as any, {})}
                className="w-full bg-primary hover:bg-primary/90"
              >
                Tartışmayı Bitir
              </Button>
              <p className="text-sm text-muted-foreground">
                Oy vermeye geçmek için {progress.votes}/{progress.total} oyuncu onayladı
              </p>

              {currentPlayer.isOwner && (
                <Button
                  onClick={() => wsClient.sendEvent("OWNER_START_VOTE_NOW" as any, {})}
                  className="w-full bg-destructive hover:bg-destructive/90"
                >
                  Hemen Oylamaya Geç (Yönetici)
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Gizli Mesaj Modal */}
      {SecretModal}
    </>
  );
}
