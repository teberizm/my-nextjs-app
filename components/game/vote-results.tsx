"use client"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Player } from "@/lib/types"

interface VoteResultsProps {
  players: Player[]
  votes: Record<string, string>
  deaths: Player[]
  deathLog: Player[]
  timeRemaining: number
}

export function VoteResults({ players, votes, deaths, deathLog, timeRemaining }: VoteResultsProps) {
  const voteCount: Record<string, number> = {}
  Object.values(votes).forEach((targetId) => {
    if (targetId !== "SKIP") {
      voteCount[targetId] = (voteCount[targetId] || 0) + 1
    }
  })

  const eliminated = deaths[0]

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-6">
        <Card className="p-8 text-center border-primary/20 bg-card/50 backdrop-blur-sm">
          <h2 className="text-2xl font-bold font-work-sans mb-4">Oylama Sonuçları</h2>
          {eliminated ? (
            <p className="text-muted-foreground mb-4">
              {eliminated.name} {voteCount[eliminated.id] || 0} oyla elendi.
            </p>
          ) : (
            <p className="text-muted-foreground mb-4">Kimse elenmedi.</p>
          )}
          <div className="space-y-2 mb-4">
            {players
              .filter((p) => p.isAlive)
              .map((player) => (
                <div key={player.id} className="flex items-center justify-between text-sm">
                  <span>{player.name}</span>
                  <Badge variant={voteCount[player.id] ? "destructive" : "secondary"}>
                    {voteCount[player.id] || 0} oy
                  </Badge>
                </div>
              ))}
          </div>
          <div className="text-sm text-muted-foreground">Gece fazına geçiliyor... {timeRemaining}s</div>
        </Card>

        <Card className="bg-destructive/10 border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive font-work-sans">Genel Notlar</CardTitle>
          </CardHeader>
          <CardContent>
            {deathLog.length > 0 ? (
              <div className="space-y-2">
                {deathLog.map((player, idx) => (
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
      </div>
    </div>
  )
}
