"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Eye, EyeOff } from "lucide-react"
import { getRoleInfo } from "@/lib/game-logic"
import type { Player } from "@/lib/types"

interface RoleRevealProps {
  player: Player
  onContinue: () => void
}

export function RoleReveal({ player, onContinue }: RoleRevealProps) {
  const [isRevealed, setIsRevealed] = useState(false)
  const [timeLeft, setTimeLeft] = useState(10)

  const roleInfo = getRoleInfo(player.displayRole || player.role!)

  useEffect(() => {
    if (isRevealed && timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    } else if (timeLeft === 0) {
      onContinue()
    }
  }, [isRevealed, timeLeft, onContinue])

  if (!isRevealed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full neon-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="font-work-sans text-2xl">Rolün Hazır</CardTitle>
            <CardDescription>Rolünü görmek için butona bas. Sadece sen görebilirsin!</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center mx-auto holographic-glow">
              <EyeOff className="w-12 h-12 text-primary" />
            </div>
            <Button
              onClick={() => setIsRevealed(true)}
              className="w-full h-14 bg-primary hover:bg-primary/90 holographic-glow text-lg font-work-sans"
            >
              <Eye className="w-5 h-5 mr-2" />
              Rolümü Göster
            </Button>
            <p className="text-sm text-muted-foreground">⚠️ Ekranını kimseye gösterme!</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className={`max-w-md w-full neon-border backdrop-blur-sm ${roleInfo.bgColor}`}>
        <CardHeader className="text-center">
          <div className="text-6xl mb-4">{roleInfo.icon}</div>
          <CardTitle className={`font-work-sans text-3xl ${roleInfo.color}`}>{roleInfo.name}</CardTitle>
          <CardDescription className="text-lg">
            Sen bir <Badge className={`${roleInfo.bgColor} ${roleInfo.color} border-0`}>{roleInfo.name}</Badge>sın
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 rounded-lg bg-card/50 border border-border/50">
            <p className="text-center text-foreground leading-relaxed">{roleInfo.description}</p>
          </div>

          {roleInfo.nightAction && (
            <div className="p-3 rounded-lg bg-accent/10 border border-accent/30">
              <p className="text-sm text-center text-accent">🌙 Gece turlarında özel yeteneğin var!</p>
            </div>
          )}

          <div className="text-center">
            <div className="text-2xl font-bold text-primary mb-2">{timeLeft}</div>
            <p className="text-sm text-muted-foreground">Otomatik devam ({timeLeft}s)</p>
          </div>

          <Button onClick={onContinue} className="w-full bg-secondary hover:bg-secondary/90 holographic-glow">
            Devam Et
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
