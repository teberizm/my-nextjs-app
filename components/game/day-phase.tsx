"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sun, Clock } from "lucide-react"
import { PlayerStatus } from "./player-status"
import type { Player } from "@/lib/types"
import { wsClient } from "@/lib/websocket-client"
interface DayPhaseProps {
  currentPlayer: Player
  allPlayers: Player[]
  timeRemaining: number
  currentTurn: number
  playerNotes: Record<string, string[]>
  deaths: Player[]
}

export function DayPhase({
  currentPlayer,
  allPlayers,
  timeRemaining,
  currentTurn,
  playerNotes,
  deaths,
}: DayPhaseProps) {
  const notes = playerNotes[currentPlayer.id] || []

  const [progress, setProgress] = useState<{ votes: number; total: number }>({ votes: 0, total: 0 })

  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === "DISCUSSION_END_PROGRESS") {
        setProgress(msg.payload)
      }
    }
    wsClient.subscribe(handler)
    return () => wsClient.unsubscribe(handler)
  }, [])

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

        {/* Notes */}
        {notes.length > 0 && (
          <Card className="neon-border bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="font-work-sans text-sm">Notlar</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {notes.map((note, idx) => (
                <div key={idx}>{note}</div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* General Notes */}
        <Card className="bg-destructive/10 border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive font-work-sans">Genel Notlar</CardTitle>
          </CardHeader>
          <CardContent>
            {deaths.length > 0 ? (
              <div className="space-y-2">
                {deaths.map((player, idx) => (
                  <div key={player.id} className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">
                      {idx + 1}.
                    </Badge>
                    <span className="font-medium">{player.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Henüz kimse ölmedi</p>
            )}
          </CardContent>
        </Card>

        {/* Player Status */}
        <PlayerStatus players={allPlayers} currentPlayer={currentPlayer} showRoles={false} />

        {/* Phase Info + New Buttons */}
        <Card className="bg-muted/10 border-muted/30">
          <CardContent className="space-y-3 pt-6 text-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground justify-center">
              <Clock className="w-4 h-4" />
              <span>Tartışma sonrası oylama başlayacak</span>
            </div>

            <Button
              onClick={() => wsClient.sendEvent("REQUEST_END_DISCUSSION" as any, {})}
              className="w-full bg-primary hover:bg-primary/90"
            >
              Tartışmayı Bitir
            </Button>
            <p className="text-sm text-muted-foreground">
              Oy vermeye geçmek için {progress.votes}/{progress.total} oyuncu onayladı
            </p>

            {currentPlayer.isOwner && (
              <Button
                onClick={() => wsClient.sendEvent("OWNER_START_VOTE_NOW" as any, {})}
                className="w-full bg-destructive hover:bg-destructive/90"
              >
                Hemen Oylamaya Geç (Yönetici)
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
