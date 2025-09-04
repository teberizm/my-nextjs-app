"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Trophy, RotateCcw, Home, Crown } from "lucide-react"
import { getRoleInfo, isTraitorRole, isInnocentRole } from "@/lib/game-logic"
import type { Game, Player } from "@/lib/types"

interface GameEndProps {
  game: Game
  players: Player[]
  currentPlayer: Player
  onPlayAgain: () => void
  onBackToLobby: () => void
}

export function GameEnd({ game, players, currentPlayer, onPlayAgain, onBackToLobby }: GameEndProps) {
  // ---- Güvenli tarih dönüşümü (WS string gelebilir) ----
  const startedAtDate = game?.startedAt ? new Date(game.startedAt as unknown as string) : null
  const endedAtDate = game?.endedAt ? new Date(game.endedAt as unknown as string) : null
  const durationMin =
    startedAtDate && endedAtDate
      ? Math.max(0, Math.round((endedAtDate.getTime() - startedAtDate.getTime()) / 60000))
      : 0

  // LOVERS desteği: server GAME_ENDED ile loversPairs gönderebilir
  const loversPairs = (game as any)?.loversPairs as [string, string][] | undefined
  const loversSet = new Set<string>((loversPairs ?? []).flatMap(([a, b]) => [String(a), String(b)]))

  
  const getWinnerInfo = () => {
    switch (game.winningSide) {
      case "INNOCENTS":
        return {
          title: "Masumlar Kazandı!",
          description: "Tüm hainler elenmiş durumda",
          color: "text-green-400",
          bgColor: "bg-green-400/20",
          icon: "👥",
        }
      case "TRAITORS":
        return {
          title: "Hainler Kazandı!",
          description: "Hainler çoğunluğu ele geçirdi",
          color: "text-red-400",
          bgColor: "bg-red-400/20",
          icon: "🗡️",
        }
      case "BOMBER":
        return {
          title: "Bombacı Kazandı!",
          description: "Tek başına hayatta kaldı",
          color: "text-orange-400",
          bgColor: "bg-orange-400/20",
          icon: "💣",
        }
      case "LOVERS":
        return {
          title: "Âşıklar Kazandı!",
          description: "Son 3’te iki âşık birlikte hayatta kaldı",
          color: "text-pink-400",
          bgColor: "bg-pink-400/20",
          icon: "💞",
        }
      default:
        return {
          title: "Oyun Bitti",
          description: "Sonuç belirsiz",
          color: "text-muted-foreground",
          bgColor: "bg-muted/20",
          icon: "🎮",
        }
    }
  }

  const winnerInfo = getWinnerInfo()
  const isWinner = () => {
    if (!currentPlayer.role) return false
    switch (game.winningSide) {
      case "INNOCENTS":
        return isInnocentRole(currentPlayer.role) || currentPlayer.role === "SURVIVOR"
      case "TRAITORS":
        return isTraitorRole(currentPlayer.role)
      case "BOMBER":
        return currentPlayer.role === "BOMBER"
      case "LOVERS":
        return loversSet.has(String(currentPlayer.id))
      default:
        return false
    }
  }

  const getPlayerInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)

  const winners = players.filter((player) => {
    if (!player.role) return false
    switch (game.winningSide) {
      case "INNOCENTS":
        return isInnocentRole(player.role) || player.role === "SURVIVOR"
      case "TRAITORS":
        return isTraitorRole(player.role)
      case "BOMBER":
        return player.role === "BOMBER"
      case "LOVERS":
        return loversSet.has(String(player.id))
      default:
        return false
    }
  })

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Winner Announcement */}
        <Card className={`neon-border backdrop-blur-sm ${winnerInfo.bgColor}`}>
          <CardHeader className="text-center">
            <div className="text-8xl mb-4">{winnerInfo.icon}</div>
            <CardTitle className={`font-work-sans text-3xl ${winnerInfo.color}`}>{winnerInfo.title}</CardTitle>
            <CardDescription className="text-lg">{winnerInfo.description}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            {isWinner() ? (
              <div className="p-4 rounded-lg bg-green-400/10 border border-green-400/30">
                <Trophy className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-green-400 font-semibold">Tebrikler! Sen kazandın!</p>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-red-400/10 border border-red-400/30">
                <p className="text-red-400">Bu sefer kaybettin, ama bir dahaki sefere!</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Winners List */}
        <Card className={`neon-border bg-card/50 backdrop-blur-sm ${game.winningSide==="LOVERS" ? "ring-1 ring-pink-400/40" : ""}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-work-sans">
              <Crown className="w-5 h-5 text-accent" />
              Kazananlar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {winners.map((player) => {
                const roleInfo = getRoleInfo(player.role!)
                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${game.winningSide==="LOVERS" ? "bg-pink-400/10 border border-pink-400/30" : "bg-green-400/10 border border-green-400/30"}`
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className={`w-10 h-10 border-2 ${game.winningSide==="LOVERS" ? "border-pink-400/50" : "border-green-400/50"}`>
                        <AvatarFallback className={`font-semibold ${game.winningSide==="LOVERS" ? "bg-pink-400/20 text-pink-400" : "bg-green-400/20 text-green-400"}`>
                          {getPlayerInitials(player.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{player.name}</div>
                        <Badge className={`text-xs ${roleInfo.bgColor} ${roleInfo.color} border-0`}>
                          {roleInfo.name}
                        </Badge>
                      </div>
                    </div>
                    <Trophy className={`w-5 h-5 ${game.winningSide==="LOVERS" ? "text-pink-400" : "text-green-400"}`} />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* All Players with Roles */}
        <Card className={`neon-border bg-card/50 backdrop-blur-sm ${game.winningSide==="LOVERS" ? "ring-1 ring-pink-400/40" : ""}`}>
          <CardHeader>
            <CardTitle className="font-work-sans">Tüm Roller</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {players.map((player) => {
                const roleInfo = player.role ? getRoleInfo(player.role) : null
                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      player.isAlive ? "bg-muted/20 border-border/50" : "bg-gray-500/10 border-gray-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        className={`w-10 h-10 border-2 ${player.isAlive ? "border-primary/30" : "border-gray-500/30"}`}
                      >
                        <AvatarFallback
                          className={`font-semibold ${
                            player.isAlive ? "bg-primary/20 text-primary" : "bg-gray-500/20 text-gray-400"
                          }`}
                        >
                          {getPlayerInitials(player.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className={`font-medium ${!player.isAlive ? "line-through text-gray-400" : ""}`}>
                          {player.name}
                        </div>
                        {roleInfo && (
                          <Badge className={`text-xs ${roleInfo.bgColor} ${roleInfo.color} border-0`}>
                            {roleInfo.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Badge variant={player.isAlive ? "secondary" : "outline"} className="text-xs">
                      {player.isAlive ? "Hayatta" : "Ölü"}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Game Stats */}
        <Card className="bg-muted/10 border-muted/30">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Oyun Süresi:</span>
                <span className="ml-2 font-semibold">{durationMin} dk</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tur Sayısı:</span>
                <span className="ml-2 font-semibold">{Math.floor((game.currentTurn - 1) / 2) + 1}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          {currentPlayer.isOwner && (
            <Button
              onClick={onPlayAgain}
              className="w-full h-14 bg-primary hover:bg-primary/90 holographic-glow text-lg font-work-sans"
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              Tekrar Oyna
            </Button>
          )}

          <Button onClick={onBackToLobby} variant="outline" className="w-full h-12 bg-transparent">
            <Home className="w-4 h-4 mr-2" />
            Lobby'ye Dön
          </Button>
        </div>
      </div>
    </div>
  )
}
