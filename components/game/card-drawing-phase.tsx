"use client";

import { useEffect, useState } from "react";
import type { Player } from "@/lib/types";
import { wsClient } from "@/lib/websocket-client";
import QrScanner from "@/components/qr-scanner";

interface CardDrawingPhaseProps {
  players: Player[];
  selectedCardDrawers: string[];
  currentCardDrawer: string | null;
  currentPlayerId: string;
  onCardDrawn: () => void;
}

type PreviewPayload = { effectId?: string; text?: string; error?: string };

export function CardDrawingPhase({
  players,
  selectedCardDrawers,
  currentCardDrawer,
  currentPlayerId,
  onCardDrawn,
}: CardDrawingPhaseProps) {
  const [openScanner, setOpenScanner] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentDrawerPlayer = players.find((p) => p.id === currentCardDrawer);
  const isMyTurn = currentCardDrawer === currentPlayerId;
  const currentDrawerIndex = selectedCardDrawers.indexOf(currentCardDrawer || "") + 1;

  // Sunucudan gelen özel event'leri dinle
  useEffect(() => {
    const onReady = () => {
      if (isMyTurn) setOpenScanner(true);
    };
    const onPreview = (evt: any) => {
      const payload = evt?.payload as PreviewPayload;
      if (payload?.error) {
        setError(payload.error);
        setWaiting(false);
        setOpenScanner(true); // tekrar okutalım
        setPreview(null);
      } else if (payload?.effectId) {
        setPreview(payload);
        setWaiting(false);
      }
    };
    const onAppliedPrivate = () => {
      setPreview(null);
      setWaiting(false);
      setOpenScanner(false);
      onCardDrawn();
    };

    wsClient.on("CARD_DRAW_READY", onReady);
    wsClient.on("CARD_PREVIEW", onPreview);
    wsClient.on("CARD_APPLIED_PRIVATE", onAppliedPrivate);

    return () => {
      wsClient.off("CARD_DRAW_READY", onReady);
      wsClient.off("CARD_PREVIEW", onPreview);
      wsClient.off("CARD_APPLIED_PRIVATE", onAppliedPrivate);
    };
  }, [isMyTurn, onCardDrawn]);

  function handleOpen() {
    setError(null);
    setPreview(null);
    setOpenScanner(true);
  }

  function handleDetected(token: string) {
    setOpenScanner(false);
    setWaiting(true);
    setError(null);
    setPreview(null);
    // Gerçek QR → sunucuya yolla
    wsClient.sendCardQrScanned(token);
  }

  function confirmCard() {
    if (!preview?.effectId) return;
    setWaiting(true);
    wsClient.sendEvent("CARD_CONFIRM" as any, { effectId: preview.effectId });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-white mb-2">🎴 Kart Çekme Zamanı</h1>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-purple-500/30 rounded-xl p-8 shadow-2xl">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-purple-300 mb-4">
                Sıra: {currentDrawerIndex}/{selectedCardDrawers.length}
              </h2>

              {currentDrawerPlayer && (
                <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-6">
                  <div className="text-3xl font-bold text-white mb-2">{currentDrawerPlayer.name}</div>
                  <div className="text-purple-300">{isMyTurn ? "Kartını çek!" : "Kart çekiyor..."}</div>
                </div>
              )}
            </div>

            {/* Sadece sıra sendeyse */}
            {isMyTurn && !preview && !waiting && (
              <div className="space-y-4">
                <button
                  onClick={handleOpen}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-4 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
                >
                  📱 QR Kodunu Oku
                </button>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                {!error && <p className="text-gray-400 text-sm">Kamerayı açıp QR’ı okut.</p>}
              </div>
            )}

            {waiting && (
              <div className="bg-black/40 border border-purple-400 rounded-lg p-6 text-white">
                ⏳ Sunucuya iletiliyor…
              </div>
            )}

            {preview && !waiting && (
              <div className="bg-slate-900/60 border border-emerald-400 rounded-lg p-6 text-left">
                <div className="text-emerald-400 text-lg mb-1">✅ Kart bulundu</div>
                <div className="text-white">
                  <div className="font-semibold">Efekt: {preview.effectId}</div>
                  {preview.text && <div className="opacity-80 mt-1">{preview.text}</div>}
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={confirmCard}
                    className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Onayla
                  </button>
                  <button
                    onClick={() => {
                      setPreview(null);
                      setError(null);
                      setOpenScanner(true);
                    }}
                    className="px-4 py-2 rounded bg-slate-600 hover:bg-slate-700 text-white"
                  >
                    Yeniden Oku
                  </button>
                </div>
              </div>
            )}

            {!isMyTurn && (
              <div className="text-center">
                <div className="animate-pulse text-yellow-400 text-lg">
                  {currentDrawerPlayer?.name} kartını çekmesi bekleniyor...
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center space-x-4">
          {selectedCardDrawers.map((playerId, index) => {
            const player = players.find((p) => p.id === playerId);
            const isCurrentDrawer = playerId === currentCardDrawer;
            const hasDrawn = selectedCardDrawers.indexOf(currentCardDrawer || "") > index;

            return (
              <div
                key={playerId}
                className={`px-4 py-2 rounded-lg border ${
                  isCurrentDrawer
                    ? "bg-purple-600 border-purple-400 text-white"
                    : hasDrawn
                    ? "bg-green-600 border-green-400 text-white"
                    : "bg-slate-700 border-slate-500 text-gray-300"
                }`}
              >
                {player?.name}
                {hasDrawn && " ✓"}
                {isCurrentDrawer && " 🎴"}
              </div>
            );
          })}
        </div>
      </div>

      {openScanner && <QrScanner open={openScanner} onDetected={handleDetected} onClose={() => setOpenScanner(false)} />}
    </div>
  );
}
