"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Vote, Users, Skull } from "lucide-react"
import type { Player } from "@/lib/types"
import { isTraitorRole } from "@/lib/game-logic"

interface VotingPhaseProps {
  currentPlayer: Player
  allPlayers: Player[]
  votes: Record<string, string>
  onSubmitVote: (targetId: string) => void
  timeRemaining: number
  hasVoted: boolean
  playerNotes: Record<string, string[]>
  deaths: Player[]
}

export function VotingPhase({
  currentPlayer,
  allPlayers,
  votes,
  onSubmitVote,
  timeRemaining,
  hasVoted,
  playerNotes,
  deaths,
}: VotingPhaseProps) {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)

  const alivePlayers = allPlayers.filter((p) => p.isAlive && p.id !== currentPlayer.id)
  const totalVotes = Object.keys(votes).length
  const aliveCount = allPlayers.filter((p) => p.isAlive).length
  const notes = playerNotes[currentPlayer.id] || []

  const getPlayerInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const getVoteCount = (playerId: string) => {
    return Object.values(votes).filter((vote) => vote === playerId).length
  }

  const handleVote = () => {
    if (selectedTarget) {
      onSubmitVote(selectedTarget)
    }
  }

  if (hasVoted) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <Card className="neon-border bg-card/50 backdrop-blur-sm mb-6">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-green-400/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Vote className="w-8 h-8 text-green-400" />
              </div>
              <CardTitle className="font-work-sans">Oy Verildi</CardTitle>
              <CardDescription>Diğer oyuncuları bekle</CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">Oyun başarıyla verildi. Oylama sonuçlarını bekle.</p>
              <div className="text-2xl font-bold text-primary">{timeRemaining}s</div>
              <Badge className="bg-green-400/20 text-green-400">
                {totalVotes}/{aliveCount} oy verildi
              </Badge>
            </CardContent>
          </Card>
          {notes.length > 0 && (
            <Card className="neon-border bg-card/50 backdrop-blur-sm mb-6">
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

          {deaths.length > 0 && (
            <Card className="bg-destructive/10 border-destructive/30 mb-6">
              <CardHeader>
                <CardTitle className="text-destructive font-work-sans">Genel Sonuçlar</CardTitle>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          )}

          {/* Vote Progress */}
          <Card className="neon-border bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-work-sans">
                <Users className="w-5 h-5 text-secondary" />
                Oylama Durumu
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {allPlayers
                  .filter((p) => p.isAlive)
                  .map((player) => {
                    const voteCount = getVoteCount(player.id)
                    return (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/50"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8 border-2 border-primary/30">
                            <AvatarFallback className="bg-primary/20 text-primary font-semibold text-xs">
                              {getPlayerInitials(player.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium flex items-center gap-1">
                            {player.name}
                            {isTraitorRole(currentPlayer.role!) &&
                              isTraitorRole(player.role!) &&
                              currentPlayer.id !== player.id && (
                                <Skull className="w-3 h-3 text-destructive" />
                              )}
                          </span>
                        </div>
                        <Badge variant={voteCount > 0 ? "destructive" : "secondary"}>{voteCount} oy</Badge>
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <Card className="neon-border bg-card/50 backdrop-blur-sm mb-6">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Vote className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="font-work-sans">Oylama Zamanı</CardTitle>
            <CardDescription>Şüphelini seç ve oy ver</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{timeRemaining}s</div>
                <p className="text-sm text-muted-foreground">Kalan süre</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-secondary">
                  {totalVotes}/{aliveCount}
                </div>
                <p className="text-sm text-muted-foreground">Oy verildi</p>
              </div>
            </div>
          </CardContent>
        </Card>

          {notes.length > 0 && (
            <Card className="neon-border bg-card/50 backdrop-blur-sm mb-6">
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

          {deaths.length > 0 && (
            <Card className="bg-destructive/10 border-destructive/30 mb-6">
              <CardHeader>
                <CardTitle className="text-destructive font-work-sans">Genel Sonuçlar</CardTitle>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          )}

        {/* Player Selection */}
        <Card className="neon-border bg-card/50 backdrop-blur-sm mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-work-sans">
              <Vote className="w-5 h-5 text-destructive" />
              Kimi Elemek İstiyorsun?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alivePlayers.map((player) => {
                const voteCount = getVoteCount(player.id)
                return (
                  <div
                    key={player.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedTarget === player.id
                        ? "border-destructive bg-destructive/20"
                        : "border-border hover:border-destructive/50"
                    }`}
                    onClick={() => setSelectedTarget(player.id)}
                  >
                    <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10 border-2 border-primary/30">
                        <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                          {getPlayerInitials(player.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium flex items-center gap-1">
                          {player.name}
                          {isTraitorRole(currentPlayer.role!) &&
                            isTraitorRole(player.role!) && (
                              <Skull className="w-3 h-3 text-destructive" />
                            )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {player.hasShield && "🛡️ Korumalı"}
                          {player.isMuted && "🔇 Susturulmuş"}
                        </div>
                      </div>
                      </div>
                      {voteCount > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {voteCount} oy
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Vote Button */}
        <div className="space-y-3">
          {selectedTarget && (
            <div className="text-sm text-muted-foreground text-center">
              Seçilen: {allPlayers.find((p) => p.id === selectedTarget)?.name}
            </div>
          )}
          <Button
            onClick={handleVote}
            disabled={!selectedTarget}
            className="w-full h-14 bg-destructive hover:bg-destructive/90 holographic-glow text-lg font-work-sans"
          >
            <Vote className="w-5 h-5 mr-2" />
            Oy Ver
          </Button>

          <Button onClick={() => onSubmitVote("SKIP")} variant="outline" className="w-full">
            Bu Turda Kimseyi Elememe
          </Button>
        </div>
      </div>
    </div>
  )
}
