"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Moon, Target, Shield, Skull } from "lucide-react"
import { getRoleInfo } from "@/lib/game-logic"
import type { Player } from "@/lib/types"

interface NightActionsProps {
  currentPlayer: Player
  allPlayers: Player[]
  onSubmitAction: (targetId: string | null) => void
  timeRemaining: number
}

export function NightActions({ currentPlayer, allPlayers, onSubmitAction, timeRemaining }: NightActionsProps) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [actionSubmitted, setActionSubmitted] = useState(false)

  const roleInfo = getRoleInfo(currentPlayer.role!)
  const alivePlayers = allPlayers.filter((p) => {
    if (!p.isAlive || p.id === currentPlayer.id) return false
    // Traitors cannot target other traitors
    if (currentPlayer.role === "TRAITOR" && p.role === "TRAITOR") return false
    return true
  })
  const aliveTraitors = allPlayers.filter((p) => p.isAlive && p.role === "TRAITOR")

  const handleSubmitAction = () => {
    onSubmitAction(selectedTarget)
    setActionSubmitted(true)
  }

  const getPlayerInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getActionText = () => {
    switch (currentPlayer.role) {
      case "TRAITOR":
        return "Öldürmek istediğin kişiyi seç"
      case "DOCTOR":
        return "Korumak istediğin kişiyi seç"
      case "SERIAL_KILLER":
        return "Öldürmek istediğin kişiyi seç"
      default:
        return "Bu gece bir aksiyon yapman gerekmiyor"
    }
  }

  const getActionIcon = () => {
    switch (currentPlayer.role) {
      case "TRAITOR":
      case "SERIAL_KILLER":
        return <Skull className="w-5 h-5 text-destructive" />
      case "DOCTOR":
        return <Shield className="w-5 h-5 text-green-400" />
      default:
        return <Moon className="w-5 h-5 text-primary" />
    }
  }

  if (!roleInfo.nightAction) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full neon-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Moon className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="font-work-sans">Gece Vakti</CardTitle>
            <CardDescription>Diğer oyuncuların aksiyonlarını bekle</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">Bu gece herhangi bir aksiyon yapman gerekmiyor. Rahatla ve bekle.</p>
            <div className="text-2xl font-bold text-primary">{timeRemaining}s</div>
            <Badge variant="secondary">Bekleniyor...</Badge>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (actionSubmitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full neon-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-400/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-green-400" />
            </div>
            <CardTitle className="font-work-sans">Aksiyon Gönderildi</CardTitle>
            <CardDescription>Diğer oyuncuları bekle</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">Aksiyonun başarıyla gönderildi. Gece sonuçlarını bekle.</p>
            <div className="text-2xl font-bold text-primary">{timeRemaining}s</div>
            <Badge className="bg-green-400/20 text-green-400">Tamamlandı</Badge>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <Card className="neon-border bg-card/50 backdrop-blur-sm mb-6">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Moon className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="font-work-sans">Gece Vakti</CardTitle>
            <CardDescription>
              <Badge className={`${roleInfo.bgColor} ${roleInfo.color} border-0 mb-2`}>{roleInfo.name}</Badge>
              <br />
              {getActionText()}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-2xl font-bold text-primary mb-2">{timeRemaining}s</div>
            <p className="text-sm text-muted-foreground">Kalan süre</p>
          </CardContent>
        </Card>

        {/* Special Info for Traitors */}
        {currentPlayer.role === "TRAITOR" && aliveTraitors.length > 1 && (
          <Card className="bg-destructive/10 border-destructive/30 mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Skull className="w-4 h-4 text-destructive" />
                <span className="font-semibold text-destructive">Diğer Hainler</span>
              </div>
              <div className="flex gap-2">
                {aliveTraitors
                  .filter((p) => p.id !== currentPlayer.id)
                  .map((traitor) => (
                    <Badge key={traitor.id} variant="destructive" className="text-xs">
                      {traitor.name}
                    </Badge>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Target Selection */}
        <Card className="neon-border bg-card/50 backdrop-blur-sm mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-work-sans">
              {getActionIcon()}
              Hedef Seç
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {currentPlayer.role === "DOCTOR" && (
                <div
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedTarget === currentPlayer.id
                      ? "border-green-400 bg-green-400/20"
                      : "border-border hover:border-green-400/50"
                  }`}
                  onClick={() => setSelectedTarget(currentPlayer.id)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 border-2 border-green-400/30">
                      <AvatarFallback className="bg-green-400/20 text-green-400 font-semibold">
                        {getPlayerInitials(currentPlayer.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{currentPlayer.name}</div>
                      <div className="text-sm text-muted-foreground">Kendini koru</div>
                    </div>
                  </div>
                </div>
              )}

              {alivePlayers.map((player) => (
                <div
                  key={player.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedTarget === player.id
                      ? "border-primary bg-primary/20"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedTarget(player.id)}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 border-2 border-primary/30">
                      <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                        {getPlayerInitials(player.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{player.name}</div>
                      <div className="text-sm text-muted-foreground">{player.hasShield && "🛡️ Korumalı"}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Action Button */}
        <div className="space-y-3">
          <Button
            onClick={handleSubmitAction}
            disabled={!selectedTarget}
            className="w-full h-14 bg-primary hover:bg-primary/90 holographic-glow text-lg font-work-sans"
          >
            {getActionIcon()}
            <span className="ml-2">Aksiyonu Gönder</span>
          </Button>

          {currentPlayer.role === "TRAITOR" && (
            <Button onClick={() => handleSubmitAction()} variant="outline" className="w-full">
              Bu Gece Kimseyi Öldürme
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
