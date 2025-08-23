"use client"

import type { Player } from "@/lib/types"

interface DeathAnnouncementProps {
  deaths: Player[]
  timeRemaining: number
}

export function DeathAnnouncement({ deaths, timeRemaining }: DeathAnnouncementProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-white mb-2">Gece Sona Erdi</h1>
          <div className="text-cyan-400 text-lg">Süre: {timeRemaining}s</div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-purple-500/30 rounded-xl p-8 shadow-2xl">
          {deaths.length > 0 ? (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-red-400 mb-4">💀 Bu Gece Ölenler</h2>
              <div className="space-y-4">
                {deaths.map((player) => (
                  <div key={player.id} className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 text-center">
                    <div className="text-xl font-semibold text-white mb-2">{player.name}</div>
                    <div className="text-red-300 text-sm">Oyundan elendi</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-green-400">✨ Kimse Ölmedi</h2>
              <p className="text-gray-300">Bu gece herkes güvende kaldı.</p>
            </div>
          )}
        </div>

        <div className="text-purple-300 text-sm">Kart çekme aşamasına geçiliyor...</div>
      </div>
    </div>
  )
}
