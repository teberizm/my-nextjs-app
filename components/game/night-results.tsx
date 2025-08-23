"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Shield, Skull, Heart, Eye } from "lucide-react"
import type { Player, NightAction } from "@/lib/types"
import { getBaseRole, isTraitorRole } from "@/lib/game-logic"

interface NightResultsProps {
  currentPlayer: Player
  allPlayers: Player[]
  nightActions: NightAction[]
  timeRemaining: number
  onContinue: () => void
}

export function NightResults({
  currentPlayer,
  allPlayers,
  nightActions,
  timeRemaining,
  onContinue,
}: NightResultsProps) {
  // Find the current player's night action
  const myAction = nightActions.find((action) => action.playerId === currentPlayer.id)
  const targetPlayer = myAction?.targetId ? allPlayers.find((p) => p.id === myAction.targetId) : null
  const visibleRole = currentPlayer.displayRole || currentPlayer.role

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "KILL":
        return <Skull className="w-6 h-6 text-red-400" />
      case "PROTECT":
        return <Shield className="w-6 h-6 text-blue-400" />
      case "INVESTIGATE":
        return <Eye className="w-6 h-6 text-purple-400" />
      default:
        return <Heart className="w-6 h-6 text-gray-400" />
    }
  }

  const getActionMessage = () => {
    if (!myAction || !targetPlayer) {
      return {
        title: "Gece Boyunca",
        message: "Bu gece herhangi bir aksiyon yapmadın.",
        icon: <Heart className="w-8 h-8 text-gray-400" />,
      }
    }

    switch (myAction.actionType) {
      case "KILL":
        return {
          title: "Saldırı Gerçekleştirildi",
          message: `${targetPlayer.name} adlı oyuncuya saldırdın. ${targetPlayer.isAlive ? "Ancak korunmuş olabilir..." : "Başarılı!"}`,
          icon: <Skull className="w-8 h-8 text-red-400" />,
        }
      case "PROTECT":
        return {
          title: "Koruma Sağlandı",
          message: `${targetPlayer.name} adlı oyuncuyu bu gece korudun. Saldırılara karşı güvende.`,
          icon: <Shield className="w-8 h-8 text-blue-400" />,
        }
      case "INVESTIGATE":
        const isWatcher = ["WATCHER", "EVIL_WATCHER"].includes(
          isTraitorRole(currentPlayer.role!) ? getBaseRole(currentPlayer.role!) : visibleRole!,
        )
        if (currentPlayer.role === "DELI") {
          if (currentPlayer.displayRole === "WATCHER") {
            const others = allPlayers.filter((p) => p.id !== targetPlayer.id)
            const randomVisitors = others
              .sort(() => Math.random() - 0.5)
              .slice(0, Math.min(2, others.length))
              .map((p) => p.name)
            return {
              title: "Gözetleme Sonucu",
              message: `${targetPlayer.name} ziyaret edenler: ${randomVisitors.join(", ") || "Kimse"}`,
              icon: <Eye className="w-8 h-8 text-purple-400" />,
            }
          }
          if (currentPlayer.displayRole === "DETECTIVE") {
            const roles: string[] = ["DOCTOR", "GUARDIAN", "WATCHER", "DETECTIVE", "BOMBER", "SURVIVOR"]
            const fake = roles.sort(() => Math.random() - 0.5).slice(0, 2)
            return {
              title: "Soruşturma Sonucu",
              message: `${targetPlayer.name} için olası roller: ${fake[0]} veya ${fake[1]}`,
              icon: <Eye className="w-8 h-8 text-purple-400" />,
            }
          }
        }

        if (isWatcher) {
          const visitors = nightActions
            .filter((a) => a.targetId === targetPlayer.id && a.playerId !== currentPlayer.id)
            .map((a) => allPlayers.find((p) => p.id === a.playerId)?.name || "")
          return {
            title: "Gözetleme Sonucu",
            message: `${targetPlayer.name} ziyaret edenler: ${visitors.filter(Boolean).join(", ") || "Kimse"}`,
            icon: <Eye className="w-8 h-8 text-purple-400" />,
          }
        } else {
          const actualRole = allPlayers.find((p) => p.id === targetPlayer.id)?.role
          const roles: string[] = ["DOCTOR", "GUARDIAN", "WATCHER", "DETECTIVE", "BOMBER", "SURVIVOR"]
          const fakeRole = roles.filter((r) => r !== actualRole)[Math.floor(Math.random() * (roles.length - 1))]
          const shown = [actualRole, fakeRole].sort(() => Math.random() - 0.5)
          return {
            title: "Soruşturma Sonucu",
            message: `${targetPlayer.name} için olası roller: ${shown[0]} veya ${shown[1]}`,
            icon: <Eye className="w-8 h-8 text-purple-400" />,
          }
        }
      default:
        return {
          title: "Aksiyon Tamamlandı",
          message: `${targetPlayer.name} üzerinde aksiyon gerçekleştirdin.`,
          icon: <Heart className="w-8 h-8 text-gray-400" />,
        }
    }
  }

  const actionResult = getActionMessage()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center border-primary/20 bg-card/50 backdrop-blur-sm">
        <div className="mb-6">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 pulse-glow">
            {actionResult.icon}
          </div>
          <h2 className="text-2xl font-bold font-work-sans mb-2 text-foreground">{actionResult.title}</h2>
          <p className="text-muted-foreground leading-relaxed">{actionResult.message}</p>
        </div>

        {/* Personal summary */}
        <div className="bg-muted/20 rounded-lg p-4 mb-6 border border-primary/10">
          <h3 className="font-semibold text-sm text-primary mb-2">Kişisel Özet</h3>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Rolün:</span>
            <span className="font-medium text-foreground">{visibleRole}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-muted-foreground">Durum:</span>
            <span className={`font-medium ${currentPlayer.isAlive ? "text-green-400" : "text-red-400"}`}>
              {currentPlayer.isAlive ? "Hayatta" : "Ölü"}
            </span>
          </div>
          {currentPlayer.hasShield && (
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">Koruma:</span>
              <span className="font-medium text-blue-400 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Korunuyor
              </span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">Gündüz fazına geçiliyor...</div>
          <div className="text-lg font-bold text-primary">{timeRemaining}s</div>
          <Button onClick={onContinue} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
            Devam Et
          </Button>
        </div>
      </Card>
    </div>
  )
}
