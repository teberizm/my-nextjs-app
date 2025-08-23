"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Player } from "@/lib/types"

interface VoteResultsProps {
  players: Player[]
  votes: Record<string, string>
  deaths: Player[]
  timeRemaining: number
}

export function VoteResults({ players, votes, deaths, timeRemaining }: VoteResultsProps) {
  const voteCount: Record<string, number> = {}
  Object.values(votes).forEach((targetId) => {
    if (targetId !== "SKIP") {
      voteCount[targetId] = (voteCount[targetId] || 0) + 1
    }
  })

  const eliminated = deaths[0]

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center border-primary/20 bg-card/50 backdrop-blur-sm">
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
    </div>
  )
}
