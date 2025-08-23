"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Crown, Shield, VolumeX, Skull } from "lucide-react"
import { getRoleInfo } from "@/lib/game-logic"
import type { Player } from "@/lib/types"

interface PlayerStatusProps {
  players: Player[]
  currentPlayer: Player
  showRoles?: boolean
}

export function PlayerStatus({ players, currentPlayer, showRoles = false }: PlayerStatusProps) {
  const getPlayerInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getPlayerStatusColor = (player: Player) => {
    if (!player.isAlive) return "border-gray-500"
    if (player.isMuted) return "border-orange-400"
    if (player.hasShield) return "border-green-400"
    return "border-primary/30"
  }

  const getPlayerBgColor = (player: Player) => {
    if (!player.isAlive) return "bg-gray-500/20"
    if (player.isMuted) return "bg-orange-400/20"
    if (player.hasShield) return "bg-green-400/20"
    return "bg-primary/20"
  }

  return (
    <Card className="neon-border bg-card/50 backdrop-blur-sm">
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 gap-3">
          {players.map((player) => {
            const roleInfo = player.role ? getRoleInfo(player.role) : null
            const isCurrentPlayer = player.id === currentPlayer.id

            return (
              <div
                key={player.id}
                className={`p-3 rounded-lg border transition-all ${
                  isCurrentPlayer ? "ring-2 ring-primary/50" : ""
                } ${getPlayerStatusColor(player)}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Avatar className={`w-8 h-8 border-2 ${getPlayerStatusColor(player)}`}>
                    <AvatarFallback className={`${getPlayerBgColor(player)} text-xs font-semibold`}>
                      {getPlayerInitials(player.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{player.name}</div>
                    <div className="flex items-center gap-1">
                      {player.isOwner && <Crown className="w-3 h-3 text-accent" />}
                      {player.hasShield && <Shield className="w-3 h-3 text-green-400" />}
                      {player.isMuted && <VolumeX className="w-3 h-3 text-orange-400" />}
                      {!player.isAlive && <Skull className="w-3 h-3 text-gray-400" />}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Badge variant={player.isAlive ? "secondary" : "outline"} className="text-xs w-full justify-center">
                    {player.isAlive ? "Hayatta" : "Ölü"}
                  </Badge>

                  {showRoles && roleInfo && (
                    <Badge className={`text-xs w-full justify-center ${roleInfo.bgColor} ${roleInfo.color} border-0`}>
                      {roleInfo.name}
                    </Badge>
                  )}

                  {isCurrentPlayer && (
                    <Badge variant="outline" className="text-xs w-full justify-center border-primary text-primary">
                      Sen
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
