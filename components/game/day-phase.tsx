"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sun, Clock } from "lucide-react"
import { PlayerStatus } from "./player-status"
import { CardUsageManager } from "../cards/card-usage-manager"
import type { Player } from "@/lib/types"

interface DayPhaseProps {
  currentPlayer: Player
  allPlayers: Player[]
  timeRemaining: number
  currentTurn: number
  onCardUsed?: (cardId: string, effect: any) => void
  selectedPlayersForCard?: string[]
  usedCards?: string[]
  currentPhase: string
}

export function DayPhase({
  currentPlayer,
  allPlayers,
  timeRemaining,
  currentTurn,
  onCardUsed,
  selectedPlayersForCard = [],
  usedCards = [],
  currentPhase,
}: DayPhaseProps) {
  const [showCardManager, setShowCardManager] = useState(false)

  const deadLastNight = allPlayers.filter((p) => !p.isAlive)

  const handleCardUsed = (cardId: string, effect: any) => {
    if (onCardUsed) {
      onCardUsed(cardId, effect)
    }
    setShowCardManager(false)
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <Card className="neon-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-yellow-400/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sun className="w-8 h-8 text-yellow-400" />
            </div>
            <CardTitle className="font-work-sans">Gündüz - Tur {currentTurn}</CardTitle>
            <CardDescription>Tartışma zamanı</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="text-2xl font-bold text-primary">{timeRemaining}s</div>
            <p className="text-sm text-muted-foreground">Tartışma süresi</p>
          </CardContent>
        </Card>

        {/* Night Results */}
        {deadLastNight.length > 0 && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive font-work-sans">Gece Sonuçları</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {deadLastNight.map((player) => (
                  <div key={player.id} className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">
                      Öldürüldü
                    </Badge>
                    <span className="font-medium">{player.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Player Status */}
        <PlayerStatus players={allPlayers} currentPlayer={currentPlayer} showRoles={false} />

        {/* Phase Info */}
        <Card className="bg-muted/10 border-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Tartışma sonrası oylama başlayacak</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <CardUsageManager
        isOpen={showCardManager}
        onClose={() => setShowCardManager(false)}
        currentPlayer={currentPlayer}
        allPlayers={allPlayers}
        onCardUsed={handleCardUsed}
        usedCards={usedCards}
        currentPhase={currentPhase}
      />
    </div>
  )
}
