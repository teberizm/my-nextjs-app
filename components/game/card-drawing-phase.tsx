"use client"

import { useState } from "react"
import type { Player } from "@/lib/types"

interface CardDrawingPhaseProps {
  players: Player[]
  selectedCardDrawers: string[]
  currentCardDrawer: string | null
  currentPlayerId: string
  timeRemaining: number
  onCardDrawn: () => void
}

export function CardDrawingPhase({
  players,
  selectedCardDrawers,
  currentCardDrawer,
  currentPlayerId,
  timeRemaining,
  onCardDrawn,
}: CardDrawingPhaseProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [scannedCard, setScannedCard] = useState<string | null>(null)

  const currentDrawerPlayer = players.find((p) => p.id === currentCardDrawer)
  const isMyTurn = currentCardDrawer === currentPlayerId
  const currentDrawerIndex = selectedCardDrawers.indexOf(currentCardDrawer || "") + 1

  const handleQRScan = () => {
    setIsScanning(true)
    setTimeout(() => {
      setIsScanning(false)
      setScannedCard("QR Kodu Okundu!")
      // Auto advance after successful scan
      setTimeout(() => {
        onCardDrawn()
      }, 1500)
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-white mb-2">🎴 Kart Çekme Zamanı</h1>
          <div className="text-cyan-400 text-lg">Süre: {timeRemaining}s</div>
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

            {isMyTurn && !scannedCard && (
              <div className="space-y-4">
                {!isScanning ? (
                  <>
                    <button
                      onClick={handleQRScan}
                      className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-4 px-8 rounded-lg transition-all duration-200 transform hover:scale-105 shadow-lg"
                    >
                      📱 Kart Çek ve QR Okut
                    </button>
                    <p className="text-gray-400 text-sm">QR kodu okutmak için butona tıkla</p>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-black/50 border-2 border-cyan-400 rounded-lg p-8 animate-pulse">
                      <div className="text-cyan-400 text-xl mb-2">📷 Kamera Açık</div>
                      <div className="text-white">QR kodu kameraya gösterin...</div>
                      <div className="mt-4 w-32 h-32 border-2 border-cyan-400 mx-auto rounded-lg flex items-center justify-center">
                        <div className="animate-spin text-cyan-400 text-2xl">⟲</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {scannedCard && (
              <div className="bg-green-600/20 border border-green-400 rounded-lg p-6">
                <div className="text-green-400 text-xl">✅ {scannedCard}</div>
                <div className="text-white mt-2">Kart başarıyla okundu!</div>
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
            const player = players.find((p) => p.id === playerId)
            const isCurrentDrawer = playerId === currentCardDrawer
            const hasDrawn = selectedCardDrawers.indexOf(currentCardDrawer || "") > index

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
            )
          })}
        </div>
      </div>
    </div>
  )
}
