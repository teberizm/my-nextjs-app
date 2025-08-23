"use client"

import { useState, useEffect, useRef } from "react"

export interface LogEntry {
  id: string
  timestamp: Date
  type: "info" | "warning" | "error" | "success"
  message: string
  playerName?: string
}

interface GameLogProps {
  entries: LogEntry[]
  maxEntries?: number
  className?: string
}

export function GameLog({ entries, maxEntries = 50, className = "" }: GameLogProps) {
  const [visibleEntries, setVisibleEntries] = useState<LogEntry[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setVisibleEntries(entries.slice(-maxEntries))
  }, [entries, maxEntries])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [visibleEntries])

  const getTypeColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "info":
        return "text-cyan-400"
      case "warning":
        return "text-yellow-500"
      case "error":
        return "text-red-500"
      case "success":
        return "text-green-500"
      default:
        return "text-gray-300"
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  return (
    <div className={`bg-gray-900/50 border border-purple-500/30 rounded-lg ${className}`}>
      <div className="p-3 border-b border-purple-500/30">
        <h3 className="text-sm font-semibold text-purple-400">Oyun Günlüğü</h3>
      </div>
      <div ref={scrollRef} className="h-32 overflow-y-auto p-3 space-y-1 text-xs font-mono">
        {visibleEntries.map((entry) => (
          <div key={entry.id} className="flex gap-2">
            <span className="text-gray-500 shrink-0">{formatTime(entry.timestamp)}</span>
            <span className={getTypeColor(entry.type)}>
              {entry.playerName && <span className="font-semibold">{entry.playerName}: </span>}
              {entry.message}
            </span>
          </div>
        ))}
        {visibleEntries.length === 0 && <div className="text-gray-500 text-center py-4">Henüz log kaydı yok...</div>}
      </div>
    </div>
  )
}
