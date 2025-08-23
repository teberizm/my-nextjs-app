"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Shield, Skull, Heart, Eye, Bomb } from "lucide-react"
import type { Player, NightAction } from "@/lib/types"
import { getRoleInfo } from "@/lib/game-logic"

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
  const targetPlayer = myAction?.targetId
    ? allPlayers.find((p) => p.id === myAction.targetId)
    : null
  const visibleRole = currentPlayer.displayRole || currentPlayer.role
  const roleName = visibleRole ? getRoleInfo(visibleRole).name : ""

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "KILL":
        return <Skull className="w-6 h-6 text-red-400" />
      case "PROTECT":
        return <Shield className="w-6 h-6 text-blue-400" />
      case "INVESTIGATE":
        return <Eye className="w-6 h-6 text-purple-400" />
      case "BOMB_PLANT":
      case "BOMB_DETONATE":
        return <Bomb className="w-6 h-6 text-orange-400" />
      default:
        return <Heart className="w-6 h-6 text-gray-400" />
    }
  }

  const getActionMessage = () => {
    if (!myAction) {
      return {
        title: "Gece Boyunca",
        message: "Bu gece herhangi bir aksiyon yapmadın.",
        icon: <Heart className="w-8 h-8 text-gray-400" />,
      }
    }

    switch (myAction.actionType) {
      case "KILL":
        if (!targetPlayer)
          return {
            title: "Aksiyon Tamamlanamadı",
            message: "Hedef bulunamadı.",
            icon: <Heart className="w-8 h-8 text-gray-400" />,
          }
        return {
          title: "Saldırı Gerçekleştirildi",
          message: `${targetPlayer.name} adlı oyuncuya saldırdın. ${targetPlayer.isAlive ? "Ancak korunmuş olabilir..." : "Başarılı!"}`,
          icon: <Skull className="w-8 h-8 text-red-400" />,
        }
      case "PROTECT":
        if (!targetPlayer)
          return {
            title: "Aksiyon Tamamlanamadı",
            message: "Hedef bulunamadı.",
            icon: <Heart className="w-8 h-8 text-gray-400" />,
          }
        if (myAction.result?.type === "BLOCK") {
          return {
            title: "Engelleme",
            message: `${targetPlayer.name} adlı oyuncuyu bu gece engelledin.`,
            icon: <Shield className="w-8 h-8 text-blue-400" />,
          }
        }
        if (currentPlayer.role === "DOCTOR") {
          return {
            title: "İyileştirme",
            message: myAction.result?.success
              ? `${targetPlayer.name} adlı oyuncuyu dirilttin!`
              : `${targetPlayer.name} adlı oyuncuyu iyileştirdin fakat bir şey olmadı.`,
            icon: <Shield className="w-8 h-8 text-blue-400" />,
          }
        }
        return {
          title: "Koruma Sağlandı",
          message: `${targetPlayer.name} adlı oyuncuyu bu gece korudun. Saldırılara karşı güvende.`,
          icon: <Shield className="w-8 h-8 text-blue-400" />,
        }
      case "INVESTIGATE":
        if (!targetPlayer)
          return {
            title: "Aksiyon Tamamlanamadı",
            message: "Hedef bulunamadı.",
            icon: <Heart className="w-8 h-8 text-gray-400" />,
          }
        if (myAction.result?.type === "WATCH") {
          return {
            title: "Gözetleme Sonucu",
            message: `${targetPlayer.name} ziyaret edenler: ${
              (myAction.result.visitors as string[]).join(", ") || "Kimse"
            }`,
            icon: <Eye className="w-8 h-8 text-purple-400" />,
          }
        }
        if (myAction.result?.type === "DETECT") {
          const roles = myAction.result.roles as string[]
          const roleNames = roles.map((r) => getRoleInfo(r as any).name)
          return {
            title: "Soruşturma Sonucu",
            message: `${targetPlayer.name} için olası roller: ${roleNames[0]} veya ${roleNames[1]}`,
            icon: <Eye className="w-8 h-8 text-purple-400" />,
          }
        }
        return {
          title: "Soruşturma Sonucu",
          message: `${targetPlayer.name} hakkında bilgi edinilemedi.`,
          icon: <Eye className="w-8 h-8 text-purple-400" />,
        }
      case "BOMB_PLANT":
        if (!targetPlayer)
          return {
            title: "Aksiyon Tamamlanamadı",
            message: "Hedef bulunamadı.",
            icon: <Heart className="w-8 h-8 text-gray-400" />,
          }
        return {
          title: "Bomba Yerleştirildi",
          message: `${targetPlayer.name} adlı oyuncuya bomba yerleştirdin.`,
          icon: <Bomb className="w-8 h-8 text-orange-400" />,
        }
      case "BOMB_DETONATE":
        const victims = (myAction.result?.victims as string[]) || []
        return {
          title: "Bombalar Patladı",
          message: victims.length ? `${victims.join(", ")} öldü.` : "Bombaları patlattın fakat kimse ölmedi.",
          icon: <Bomb className="w-8 h-8 text-orange-400" />,
        }
      default:
        return {
          title: "Aksiyon Tamamlandı",
          message: targetPlayer
            ? `${targetPlayer.name} üzerinde aksiyon gerçekleştirdin.`
            : "Bir aksiyon gerçekleştirdin.",
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
            <span className="font-medium text-foreground">{roleName}</span>
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
