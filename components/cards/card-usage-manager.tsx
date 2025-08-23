"use client"

import { useState } from "react"
import { QRScanner } from "./qr-scanner"
import { CardEffectDisplay } from "./card-effect-display"
import { getCardById } from "@/lib/card-database"
import { applyCardEffect } from "@/lib/card-effects"
import type { Card, Player } from "@/lib/types"

interface CardUsageManagerProps {
  isOpen: boolean
  onClose: () => void
  currentPlayer: Player
  allPlayers: Player[]
  onCardUsed: (cardId: string, effect: any) => void
  usedCards: string[]
  currentPhase: string
}

export function CardUsageManager({
  isOpen,
  onClose,
  currentPlayer,
  allPlayers,
  onCardUsed,
  usedCards,
  currentPhase,
}: CardUsageManagerProps) {
  const [scannedCard, setScannedCard] = useState<Card | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [showScanner, setShowScanner] = useState(true)
  const [showCardEffect, setShowCardEffect] = useState(false)

  const handleCardScanned = (cardId: string) => {
    const card = getCardById(cardId)

    if (!card) {
      alert("Geçersiz kart kodu!")
      return
    }

    // Check if card can be used in current phase
    if (!card.phase.includes(currentPhase as any)) {
      alert(`Bu kart ${currentPhase} fazında kullanılamaz!`)
      return
    }

    // Check if card was already used (for once per game cards)
    if (card.oncePerGame && usedCards.includes(cardId)) {
      alert("Bu kart zaten kullanılmış!")
      return
    }

    setScannedCard(card)
    setShowScanner(false)
    setShowCardEffect(true)
  }

  const handleEffectConfirm = () => {
    if (!scannedCard) return

    const targetPlayer = selectedTarget ? allPlayers.find((p) => p.id === selectedTarget) : null
    const effect = applyCardEffect(scannedCard, currentPlayer, targetPlayer, allPlayers, {})

    onCardUsed(scannedCard.id, effect)
    handleClose()
  }

  const handleClose = () => {
    setScannedCard(null)
    setSelectedTarget(null)
    setShowScanner(true)
    setShowCardEffect(false)
    onClose()
  }

  const needsTarget =
    scannedCard?.effect.type === "mute_player" ||
    scannedCard?.effect.type === "shield_player" ||
    scannedCard?.effect.type === "ban_vote" ||
    scannedCard?.effect.type === "reveal_role"

  const availableTargets = needsTarget ? allPlayers.filter((p) => p.id !== currentPlayer.id && p.isAlive) : []

  return (
    <>
      <QRScanner
        isOpen={isOpen && showScanner}
        onClose={handleClose}
        onCardScanned={handleCardScanned}
        playerName={currentPlayer.name}
      />

      <CardEffectDisplay
        card={scannedCard}
        isOpen={showCardEffect}
        onClose={handleClose}
        onSelectTarget={setSelectedTarget}
        onConfirmEffect={handleEffectConfirm}
        availableTargets={availableTargets}
        actor={currentPlayer}
        needsTarget={needsTarget}
      />
    </>
  )
}
