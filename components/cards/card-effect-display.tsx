"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Zap, Target, Users, Shuffle, AlertTriangle } from "lucide-react"
import { getCardEffectDescription } from "@/lib/card-effects"
import type { Card as CardType, Player } from "@/lib/types"

interface CardEffectDisplayProps {
  card: CardType | null
  isOpen: boolean
  onClose: () => void
  onSelectTarget?: (targetId: string) => void
  onConfirmEffect: () => void
  availableTargets?: Player[]
  actor: Player
  needsTarget: boolean
}

export function CardEffectDisplay({
  card,
  isOpen,
  onClose,
  onSelectTarget,
  onConfirmEffect,
  availableTargets = [],
  actor,
  needsTarget,
}: CardEffectDisplayProps) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setSelectedTarget(null)
    }
  }, [isOpen])

  if (!card) return null

  const getCategoryIcon = () => {
    switch (card.category) {
      case "INDIVIDUAL":
        return <Target className="w-5 h-5 text-primary" />
      case "TARGET":
        return <Target className="w-5 h-5 text-secondary" />
      case "GROUP":
        return <Users className="w-5 h-5 text-accent" />
      case "CHAOS":
        return <Shuffle className="w-5 h-5 text-destructive" />
      default:
        return <Zap className="w-5 h-5 text-primary" />
    }
  }

  const getCategoryColor = () => {
    switch (card.category) {
      case "INDIVIDUAL":
        return "border-primary/30 bg-primary/10"
      case "TARGET":
        return "border-secondary/30 bg-secondary/10"
      case "GROUP":
        return "border-accent/30 bg-accent/10"
      case "CHAOS":
        return "border-destructive/30 bg-destructive/10"
      default:
        return "border-primary/30 bg-primary/10"
    }
  }

  const getPlayerInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const handleConfirm = () => {
    if (needsTarget && !selectedTarget) return

    if (onSelectTarget && selectedTarget) {
      onSelectTarget(selectedTarget)
    }
    onConfirmEffect()
  }

  const canConfirm = !needsTarget || selectedTarget !== null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-work-sans">
            {getCategoryIcon()}
            Kart Etkisi
          </DialogTitle>
          <DialogDescription>Çekilen kartın etkisini uygula</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Card Display */}
          <Card className={`${getCategoryColor()} border-2`}>
            <CardHeader className="text-center pb-3">
              <div className="text-4xl mb-2">
                {card.category === "INDIVIDUAL" && "🎯"}
                {card.category === "TARGET" && "👤"}
                {card.category === "GROUP" && "👥"}
                {card.category === "CHAOS" && "🌀"}
              </div>
              <CardTitle className="font-work-sans text-xl">{card.title}</CardTitle>
              <div className="flex justify-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {card.category}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {card.id}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-center text-sm text-muted-foreground leading-relaxed">
                {getCardEffectDescription(card)}
              </p>
            </CardContent>
          </Card>

          {/* Actor Info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/50">
            <Avatar className="w-10 h-10 border-2 border-primary/30">
              <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                {getPlayerInitials(actor.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{actor.name}</div>
              <div className="text-sm text-muted-foreground">Kart kullanıcısı</div>
            </div>
          </div>

          {/* Target Selection */}
          {needsTarget && availableTargets.length > 0 && (
            <Card className="border-secondary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-work-sans text-base">
                  <Target className="w-4 h-4 text-secondary" />
                  Hedef Seç
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {availableTargets.map((player) => (
                    <div
                      key={player.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedTarget === player.id
                          ? "border-secondary bg-secondary/20"
                          : "border-border hover:border-secondary/50"
                      }`}
                      onClick={() => setSelectedTarget(player.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8 border-2 border-primary/30">
                          <AvatarFallback className="bg-primary/20 text-primary font-semibold text-xs">
                            {getPlayerInitials(player.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-sm">{player.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {player.hasShield && "🛡️ Korumalı"}
                            {player.isMuted && "🔇 Susturulmuş"}
                            {!player.isAlive && "💀 Ölü"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Visibility Warning */}
          {card.visibility === "PRIVATE_TO_ACTOR" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/10 border border-accent/30">
              <AlertTriangle className="w-4 h-4 text-accent" />
              <span className="text-sm text-accent">Bu kartın etkisi sadece sana gösterilecek</span>
            </div>
          )}

          {card.visibility === "PRIVATE_TO_TARGET" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/10 border border-secondary/30">
              <AlertTriangle className="w-4 h-4 text-secondary" />
              <span className="text-sm text-secondary">Bu kartın etkisi sadece hedefe gösterilecek</span>
            </div>
          )}

          {/* Once per game warning */}
          {card.oncePerGame && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive">Bu kart oyun boyunca sadece bir kez kullanılabilir</span>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 bg-transparent">
            İptal
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 bg-primary hover:bg-primary/90 holographic-glow"
          >
            <Zap className="w-4 h-4 mr-2" />
            Etkiyi Uygula
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
