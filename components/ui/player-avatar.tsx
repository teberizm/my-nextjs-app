"use client"

import type { Player } from "@/lib/types"

interface PlayerAvatarProps {
  player: Player
  size?: "sm" | "md" | "lg"
  showStatus?: boolean
  className?: string
}

export function PlayerAvatar({ player, size = "md", showStatus = true, className = "" }: PlayerAvatarProps) {
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-sm",
    lg: "w-16 h-16 text-base",
  }

  const getStatusColor = () => {
    if (!player.isAlive) return "border-red-500 bg-red-500/20"
    if (player.isShielded) return "border-cyan-400 bg-cyan-400/20"
    if (player.isMuted) return "border-yellow-500 bg-yellow-500/20"
    return "border-purple-500 bg-purple-500/20"
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className={`
        ${sizeClasses[size]} 
        rounded-full border-2 ${getStatusColor()}
        flex items-center justify-center font-bold
        ${!player.isAlive ? "opacity-50 grayscale" : ""}
        transition-all duration-300
      `}
      >
        {getInitials(player.name)}
      </div>

      {showStatus && (
        <div className="absolute -bottom-1 -right-1 flex gap-1">
          {player.isOwner && (
            <div className="w-3 h-3 bg-yellow-500 rounded-full border border-gray-900" title="Room Owner" />
          )}
          {player.isShielded && (
            <div className="w-3 h-3 bg-cyan-400 rounded-full border border-gray-900" title="Protected" />
          )}
          {player.isMuted && (
            <div className="w-3 h-3 bg-yellow-500 rounded-full border border-gray-900" title="Muted" />
          )}
        </div>
      )}
    </div>
  )
}
