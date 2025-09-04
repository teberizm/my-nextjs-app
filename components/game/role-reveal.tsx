"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Eye, EyeOff } from "lucide-react"
import { getRoleInfo } from "@/lib/game-logic"
import type { Player, PlayerRole } from "@/lib/types"
import { wsClient } from "@/lib/websocket-client"
interface RoleRevealProps {
  player: Player
  onContinue: () => void
}

export function RoleReveal({ player }: RoleRevealProps) {
  const [isRevealed, setIsRevealed] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [readyProgress, setReadyProgress] = useState<{ ready: number; total: number }>({
    ready: 0,
    total: 0,
  })

  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === "ROLE_REVEAL_READY_UPDATED") {
        setReadyProgress(msg.payload)
      }
    }
    wsClient.subscribe(handler)
    return () => wsClient.unsubscribe(handler)
  }, [])

  // Henüz rol yoksa loading ekranı
  const rawRole: PlayerRole | undefined =
    (player?.displayRole as PlayerRole | undefined) ?? (player?.role as PlayerRole | undefined)
  if (!rawRole) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full neon-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="font-work-sans text-2xl">Roller Hazırlanıyor</CardTitle>
            <CardDescription>Lütfen bekleyin…</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </CardContent>
        </Card>
      </div>
    )
  }

  const roleInfo = getRoleInfo(rawRole)

  // Rolü henüz göstermedi
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

  // Rolü gördü ama hazır değil
  if (isRevealed && !isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full neon-border backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="text-6xl mb-4">{roleInfo.icon}</div>
            <CardTitle className={`font-work-sans text-3xl ${roleInfo.color}`}>{roleInfo.name}</CardTitle>
            <CardDescription className="text-lg">{roleInfo.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <Button
              onClick={() => {
                wsClient.sendEvent("PLAYER_READY" as any, {})
                setIsReady(true)
              }}
              className="w-full bg-secondary hover:bg-secondary/90"
            >
              Hazırım
            </Button>
            <p className="text-sm text-muted-foreground">
              Hazır olan: {readyProgress.ready} / {readyProgress.total}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Hazır oldu → diğer oyuncular bekleniyor
  if (isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">
          Diğer oyuncuların hazır olması bekleniyor… ({readyProgress.ready}/{readyProgress.total})
        </p>
      </div>
    )
  }

  return null
}

