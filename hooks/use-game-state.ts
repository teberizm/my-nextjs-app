"use client"

import { useState, useEffect, useCallback } from "react"
import { assignRoles, getWinCondition } from "@/lib/game-logic"
import { BotBehavior } from "@/lib/bot-players"
import type { GamePhase, Player, Game, GameSettings, NightAction } from "@/lib/types"
import { wsClient, type GameEventData } from "@/lib/websocket-client"

interface GameStateHook {
  game: Game | null
  players: Player[]
  currentPhase: GamePhase
  timeRemaining: number
  currentTurn: number
  nightActions: NightAction[]
  votes: Record<string, string>
  isGameOwner: boolean
  selectedCardDrawers: string[]
  currentCardDrawer: string | null
  deathsThisTurn: Player[]
  startGame: (players: Player[], settings: GameSettings) => void
  advancePhase: () => void
  submitNightAction: (playerId: string, targetId: string | null, actionType: "KILL" | "PROTECT") => void
  submitVote: (voterId: string, targetId: string) => void
  resetGame: () => void
}

export function useGameState(currentPlayerId: string): GameStateHook {
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPhase, setCurrentPhase] = useState<GamePhase>("LOBBY")
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [currentTurn, setCurrentTurn] = useState(1)
  const [nightActions, setNightActions] = useState<NightAction[]>([])
  const [votes, setVotes] = useState<Record<string, string>>({})
  const [selectedCardDrawers, setSelectedCardDrawers] = useState<string[]>([])
  const [currentCardDrawer, setCurrentCardDrawer] = useState<string | null>(null)
  const [deathsThisTurn, setDeathsThisTurn] = useState<Player[]>([])

  const currentPlayer = players.find((p) => p.id === currentPlayerId)
  const isGameOwner = currentPlayer?.isOwner || false

  useEffect(() => {
    const toPlayer = (id: string): Player => ({
      id,
      name: id,
      isOwner: false,
      isAlive: true,
      isMuted: false,
      hasShield: false,
      connectedAt: new Date(),
    })

    const normalize = (raw: any[]): Player[] =>
      raw.map((p: any) => (typeof p === "string" ? toPlayer(p) : { ...toPlayer(p.id), ...p }))

    const handleRoomJoined = (data: GameEventData) => {
      if (data.payload?.players) {
        setPlayers(normalize(data.payload.players))
      } else if (data.payload?.playerId) {
        setPlayers((prev) => {
          const exists = prev.some((p) => p.id === data.payload.playerId)
          return exists ? prev : [...prev, toPlayer(data.payload.playerId as string)]
        })
      }
    }

    const handlePlayerListUpdated = (data: GameEventData) => {
      if (data.payload?.players) {
        setPlayers(normalize(data.payload.players))
      }
    }

    wsClient.on("ROOM_JOINED", handleRoomJoined)
    wsClient.on("PLAYER_LIST_UPDATED", handlePlayerListUpdated)

    return () => {
      wsClient.off("ROOM_JOINED", handleRoomJoined)
      wsClient.off("PLAYER_LIST_UPDATED", handlePlayerListUpdated)
    }
  }, [])

  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining((prev) => prev - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (timeRemaining === 0 && currentPhase !== "LOBBY" && currentPhase !== "END") {
      const phaseTimer = setTimeout(() => {
        advancePhase()
      }, 100)
      return () => clearTimeout(phaseTimer)
    }
  }, [timeRemaining, currentPhase])

  const startGame = useCallback((gamePlayers: Player[], settings: GameSettings) => {
    const playersWithRoles = assignRoles(gamePlayers, settings)

    const newGame: Game = {
      id: Math.random().toString(36).substring(2, 15),
      roomId: Math.random().toString(36).substring(2, 15),
      phase: "ROLE_REVEAL",
      currentTurn: 1,
      settings,
      seed: Math.random().toString(36).substring(2, 15),
      startedAt: new Date(),
    }

    setGame(newGame)
    setPlayers(playersWithRoles)
    setCurrentPhase("ROLE_REVEAL")
    setTimeRemaining(15)
    setCurrentTurn(1)
    setNightActions([])
    setVotes({})
    setSelectedCardDrawers([])
    setCurrentCardDrawer(null)
    setDeathsThisTurn([])
  }, [])

  const processNightActions = useCallback(() => {
    const killers = nightActions.filter((action) => action.actionType === "KILL")
    const protectors = nightActions.filter((action) => action.actionType === "PROTECT")

    const protectedPlayers = new Set(protectors.map((action) => action.targetId).filter(Boolean))
    const targetedPlayers = killers.map((action) => action.targetId).filter(Boolean)

    const newDeaths: Player[] = []

    setPlayers((prevPlayers) =>
      prevPlayers.map((player) => {
        const updatedPlayer = { ...player, hasShield: false }

        if (protectedPlayers.has(player.id)) {
          updatedPlayer.hasShield = true
        }

        if (targetedPlayers.includes(player.id) && !protectedPlayers.has(player.id)) {
          updatedPlayer.isAlive = false
          newDeaths.push(updatedPlayer)
        }

        return updatedPlayer
      }),
    )

    setDeathsThisTurn(newDeaths)

    setNightActions([])
  }, [nightActions])

  const processVotes = useCallback(() => {
    const voteCount: Record<string, number> = {}
    const alivePlayers = players.filter((p) => p.isAlive)

    Object.entries(votes).forEach(([voterId, targetId]) => {
      const voter = players.find((p) => p.id === voterId)
      if (voter?.isAlive && targetId !== "SKIP") {
        voteCount[targetId] = (voteCount[targetId] || 0) + 1
      }
    })

    let maxVotes = 0
    let eliminatedPlayerId: string | null = null

    Object.entries(voteCount).forEach(([playerId, count]) => {
      if (count > maxVotes) {
        maxVotes = count
        eliminatedPlayerId = playerId
      }
    })

    const newDeaths: Player[] = []

    if (eliminatedPlayerId && maxVotes > 0) {
      setPlayers((prevPlayers) =>
        prevPlayers.map((player) => {
          if (player.id === eliminatedPlayerId) {
            const deadPlayer = { ...player, isAlive: false }
            newDeaths.push(deadPlayer)
            return deadPlayer
          }
          return player
        }),
      )

      const eliminatedPlayer = players.find((p) => p.id === eliminatedPlayerId)
      if (eliminatedPlayer?.role === "BOMBER") {
        const randomVictims = alivePlayers
          .filter((p) => p.id !== eliminatedPlayerId)
          .sort(() => Math.random() - 0.5)
          .slice(0, 2)

        setPlayers((prevPlayers) =>
          prevPlayers.map((player) => {
            if (randomVictims.some((victim) => victim.id === player.id)) {
              const deadPlayer = { ...player, isAlive: false }
              newDeaths.push(deadPlayer)
              return deadPlayer
            }
            return player
          }),
        )
      }
    }

    setDeathsThisTurn((prev) => [...prev, ...newDeaths])
    setVotes({})
  }, [votes, players])

  const advancePhase = useCallback(() => {
    const { winner, gameEnded } = getWinCondition(players)

    if (gameEnded) {
      setGame((prev) => (prev ? { ...prev, phase: "END", winningSide: winner as any, endedAt: new Date() } : null))
      setCurrentPhase("END")
      setTimeRemaining(0)
      return
    }

    switch (currentPhase) {
      case "ROLE_REVEAL":
        setCurrentPhase("NIGHT")
        setTimeRemaining(15)
        break

      case "NIGHT":
        processNightActions()
        setCurrentPhase("NIGHT_RESULTS")
        setTimeRemaining(5)
        break

      case "NIGHT_RESULTS":
        setCurrentPhase("DEATH_ANNOUNCEMENT")
        setTimeRemaining(5)
        break

      case "DEATH_ANNOUNCEMENT":
        const alivePlayers = players.filter((p) => p.isAlive)
        const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5)
        const cardDrawers = shuffled.slice(0, Math.min(2, alivePlayers.length))
        setSelectedCardDrawers(cardDrawers.map((p) => p.id))
        setCurrentCardDrawer(cardDrawers[0]?.id || null)
        setCurrentPhase("CARD_DRAWING")
        setTimeRemaining(10)
        break

      case "CARD_DRAWING":
        const currentIndex = selectedCardDrawers.indexOf(currentCardDrawer || "")
        if (currentIndex < selectedCardDrawers.length - 1) {
          setCurrentCardDrawer(selectedCardDrawers[currentIndex + 1])
          setTimeRemaining(10)
        } else {
          setCurrentPhase("DAY_DISCUSSION")
          setTimeRemaining(15)
          setSelectedCardDrawers([])
          setCurrentCardDrawer(null)
        }
        break

      case "DAY_DISCUSSION":
        setCurrentPhase("VOTE")
        setTimeRemaining(15)
        break

      case "VOTE":
        processVotes()
        setCurrentPhase("RESOLVE")
        setTimeRemaining(3)
        break

      case "RESOLVE":
        const { winner: newWinner, gameEnded: newGameEnded } = getWinCondition(players)
        if (newGameEnded) {
          setGame((prev) =>
            prev ? { ...prev, phase: "END", winningSide: newWinner as any, endedAt: new Date() } : null,
          )
          setCurrentPhase("END")
          setTimeRemaining(0)
        } else {
          setCurrentTurn((prev) => prev + 1)
          setCurrentPhase("NIGHT")
          setTimeRemaining(15)
          setDeathsThisTurn([])
        }
        break

      default:
        break
    }
  }, [currentPhase, game, players, processNightActions, processVotes, selectedCardDrawers, currentCardDrawer])

  const submitNightAction = useCallback((playerId: string, targetId: string | null, actionType: "KILL" | "PROTECT") => {
    const newAction: NightAction = {
      playerId,
      targetId,
      actionType,
      timestamp: new Date(),
    }

    setNightActions((prev) => [...prev.filter((action) => action.playerId !== playerId), newAction])
  }, [])

  const submitVote = useCallback(
    (voterId: string, targetId: string) => {
      const voter = players.find((p) => p.id === voterId)
      if (!voter?.isAlive) {
        console.log(`[v0] Dead player ${voter?.name} attempted to vote - blocked`)
        return
      }

      setVotes((prev) => ({
        ...prev,
        [voterId]: targetId,
      }))
    },
    [players],
  )

  const resetGame = useCallback(() => {
    setGame(null)
    setPlayers([])
    setCurrentPhase("LOBBY")
    setTimeRemaining(0)
    setCurrentTurn(1)
    setNightActions([])
    setVotes({})
    setSelectedCardDrawers([])
    setCurrentCardDrawer(null)
    setDeathsThisTurn([])
  }, [])

  useEffect(() => {
    if (currentPhase === "NIGHT") {
      const botPlayers = players.filter((p) => p.isBot && p.isAlive && p.role)

      botPlayers.forEach((bot) => {
        const hasAction = nightActions.some((action) => action.playerId === bot.id)
        if (!hasAction) {
          const delay = Math.random() * 2000 + 1000 // 1-3 seconds delay
          setTimeout(() => {
            BotBehavior.simulateNightAction(bot, players).then((targetId) => {
              if (targetId && bot.role) {
                let actionType: "KILL" | "PROTECT" = "KILL"
                if (bot.role.id === "doctor") actionType = "PROTECT"

                submitNightAction(bot.id, targetId, actionType)
                console.log(
                  `[v0] Bot ${bot.name} performed ${actionType} on ${players.find((p) => p.id === targetId)?.name}`,
                )
              }
            })
          }, delay)
        }
      })
    }
  }, [currentPhase, players, nightActions, submitNightAction])

  useEffect(() => {
    if (currentPhase === "VOTE") {
      const botPlayers = players.filter((p) => p.isBot && p.isAlive)

      botPlayers.forEach((bot) => {
        if (!votes[bot.id]) {
          const delay = Math.random() * 3000 + 1000 // 1-4 seconds delay
          setTimeout(() => {
            // Double check bot hasn't voted yet to prevent race conditions
            setVotes((currentVotes) => {
              if (currentVotes[bot.id]) {
                return currentVotes // Bot already voted, don't vote again
              }

              BotBehavior.simulateVote(bot, players).then((targetId) => {
                if (targetId) {
                  submitVote(bot.id, targetId)
                  console.log(`[v0] Bot ${bot.name} voted for ${players.find((p) => p.id === targetId)?.name}`)
                }
              })

              return currentVotes
            })
          }, delay)
        }
      })
    }
  }, [currentPhase, players]) // Removed votes from dependency array to prevent infinite loops

  useEffect(() => {
    if (currentPhase === "CARD_DRAWING" && currentCardDrawer) {
      const currentDrawer = players.find((p) => p.id === currentCardDrawer)

      if (currentDrawer?.isBot) {
        const delay = Math.random() * 3000 + 2000 // 2-5 seconds
        setTimeout(() => {
          console.log(`[v0] Bot ${currentDrawer.name} automatically drew a card`)
          advancePhase()
        }, delay)
      }
    }
  }, [currentPhase, currentCardDrawer, players, advancePhase])

  return {
    game,
    players,
    currentPhase,
    timeRemaining,
    currentTurn,
    nightActions,
    votes,
    isGameOwner,
    selectedCardDrawers,
    currentCardDrawer,
    deathsThisTurn,
    startGame,
    advancePhase,
    submitNightAction,
    submitVote,
    resetGame,
  }
}
