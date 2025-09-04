"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Crown, Shield, VolumeX, Skull, Heart } from "lucide-react"
import { getRoleInfo, isTraitorRole } from "@/lib/game-logic"
import type { Player } from "@/lib/types"

interface PlayerStatusProps {
  players: Player[]
  currentPlayer: Player
  showRoles?: boolean
}

/** Kartın etrafına küçük kalplerden oluşan dekoratif çerçeve */
function HeartBorder() {
  const top = Array.from({ length: 12 }, (_, i) => i)
  const bottom = top
  const left = Array.from({ length: 8 }, (_, i) => i)
  const right = left

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* üst */}
      {top.map((i) => (
        <Heart
          key={`t-${i}`}
          className="absolute w-3 h-3 text-pink-500 drop-shadow"
          style={{ top: -6, left: `${(i + 0.5) * (100 / 12)}%`, transform: "translateX(-50%)" }}
        />
      ))}
      {/* alt */}
      {bottom.map((i) => (
        <Heart
          key={`b-${i}`}
          className="absolute w-3 h-3 text-pink-500 drop-shadow"
          style={{ bottom: -6, left: `${(i + 0.5) * (100 / 12)}%`, transform: "translateX(-50%)" }}
        />
      ))}
      {/* sol */}
      {left.map((i) => (
        <Heart
          key={`l-${i}`}
          className="absolute w-3 h-3 text-pink-500 drop-shadow"
          style={{ left: -6, top: `${(i + 0.5) * (100 / 8)}%`, transform: "translateY(-50%)" }}
        />
      ))}
      {/* sağ */}
      {right.map((i) => (
        <Heart
          key={`r-${i}`}
          className="absolute w-3 h-3 text-pink-500 drop-shadow"
          style={{ right: -6, top: `${(i + 0.5) * (100 / 8)}%`, transform: "translateY(-50%)" }}
        />
      ))}
    </div>
  )
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
    if (player.hasShield && player.id === currentPlayer.id) return "border-green-400"
    return "border-primary/30"
  }

  const getPlayerBgColor = (player: Player) => {
    if (!player.isAlive) return "bg-gray-500/20"
    if (player.isMuted) return "bg-orange-400/20"
    if (player.hasShield && player.id === currentPlayer.id) return "bg-green-400/20"
    return "bg-primary/20"
  }

  return (
    <Card className="neon-border bg-card/50 backdrop-blur-sm">
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 gap-3">
          {players.map((player) => {
            const roleInfo = player.role ? getRoleInfo(player.role) : null
            const isCurrentPlayer = player.id === currentPlayer.id

            // 🔹 Özel kullanıcı adı (case-insensitive)
            const isSpecial = (player.name || "").toLowerCase() === "boylu1907"

            return (
              <div
                key={player.id}
                className={[
                  "relative overflow-hidden p-3 rounded-lg border transition-all",
                  isCurrentPlayer ? "ring-2 ring-primary/50" : "",
                  isSpecial ? "bg-[#001a4d] ring-2 ring-yellow-400/60" : getPlayerStatusColor(player),
                ].join(" ")}
              >
                {isSpecial && <HeartBorder />}

                <div className="flex items-center gap-2 mb-2">
                  <Avatar
                    className={[
                      "w-8 h-8 border-2",
                      isSpecial ? "border-yellow-300" : getPlayerStatusColor(player),
                    ].join(" ")}
                  >
                    <AvatarFallback
                      className={[
                        "text-xs font-semibold",
                        isSpecial ? "bg-[#0a2a6b] text-yellow-300" : getPlayerBgColor(player),
                      ].join(" ")}
                    >
                      {getPlayerInitials(player.name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div
                      className={[
                        "text-sm font-medium truncate",
                        isSpecial ? "text-yellow-300" : "",
                      ].join(" ")}
                    >
                      {player.name}
                    </div>

                    <div className="flex items-center gap-1">
                      {player.isOwner && (
                        <Crown className={isSpecial ? "w-3 h-3 text-yellow-300" : "w-3 h-3 text-accent"} />
                      )}
                      {player.hasShield && isCurrentPlayer && (
                        <Shield className={isSpecial ? "w-3 h-3 text-yellow-300" : "w-3 h-3 text-green-400"} />
                      )}
                      {player.isMuted && (
                        <VolumeX className={isSpecial ? "w-3 h-3 text-yellow-300" : "w-3 h-3 text-orange-400"} />
                      )}
                      {!player.isAlive && (
                        <Skull className={isSpecial ? "w-3 h-3 text-yellow-300" : "w-3 h-3 text-gray-400"} />
                      )}
                      {isTraitorRole(currentPlayer.role!) &&
                        isTraitorRole(player.role!) &&
                        player.isAlive &&
                        player.id !== currentPlayer.id && (
                          <Skull className={isSpecial ? "w-3 h-3 text-yellow-300" : "w-3 h-3 text-destructive"} />
                        )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Badge
                    variant={player.isAlive ? "secondary" : "outline"}
                    className={[
                      "text-xs w-full justify-center",
                      isSpecial ? "bg-[#0a2a6b] text-yellow-200 border-0" : "",
                    ].join(" ")}
                  >
                    {player.isAlive ? "Hayatta" : "Ölü"}
                  </Badge>

                  {showRoles && roleInfo && (
                    <Badge
                      className={[
                        "text-xs w-full justify-center border-0",
                        isSpecial ? "bg-[#0a2a6b] text-yellow-200" : `${roleInfo.bgColor} ${roleInfo.color}`,
                      ].join(" ")}
                    >
                      {roleInfo.name}
                    </Badge>
                  )}

                  {isCurrentPlayer && (
                    <Badge
                      variant="outline"
                      className={[
                        "text-xs w-full justify-center",
                        isSpecial ? "border-yellow-300 text-yellow-300" : "border-primary text-primary",
                      ].join(" ")}
                    >
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
