"use client"

import { useState, useEffect, useCallback } from "react"
import { assignRoles, getWinCondition } from "@/lib/game-logic"
import { BotBehavior } from "@/lib/bot-players"
import type { GamePhase, Player, Game, GameSettings, NightAction, PlayerRole } from "@/lib/types"

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
  submitNightAction: (
    playerId: string,
    targetId: string | null,
    actionType: "KILL" | "PROTECT" | "INVESTIGATE" | "BOMB_PLANT" | "BOMB_DETONATE",
  ) => void
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
  const [bombTargets, setBombTargets] = useState<string[]>([])

  const currentPlayer = players.find((p) => p.id === currentPlayerId)
  const isGameOwner = currentPlayer?.isOwner || false

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
    setBombTargets([])
  }, [])

  const processNightActions = useCallback(() => {
    const killers = nightActions.filter((action) => action.actionType === "KILL")
    const bombPlacers = nightActions.filter((a) => a.actionType === "BOMB_PLANT")
    const detonateAction = nightActions.find((a) => a.actionType === "BOMB_DETONATE")

    let newBombTargets = [...bombTargets]
    bombPlacers.forEach((a) => {
      if (a.targetId) newBombTargets.push(a.targetId)
    })

    const protectedPlayers = new Set<string>()
    const survivorActors = new Set<string>()
    const revivedPlayers = new Set<string>()

    let detonateIndex = -1

    const updatedActions: NightAction[] = nightActions.map((action, idx) => {
      const actor = players.find((p) => p.id === action.playerId)
      const target = action.targetId ? players.find((p) => p.id === action.targetId) : null
      let result: any = null

      if (!actor) return { ...action }

      if (action.actionType === "PROTECT" && actor.role !== "DELI") {
        if (actor.role === "SURVIVOR") {
          if (actor.survivorShields && actor.survivorShields > 0 && action.targetId === actor.id) {
            protectedPlayers.add(actor.id)
            survivorActors.add(actor.id)
          }
          result = { type: "PROTECT" }
        } else if (actor.role === "DOCTOR") {
          if (target && !target.isAlive) {
            revivedPlayers.add(target.id)
            result = { type: "REVIVE", success: true }
          } else {
            result = { type: "REVIVE", success: false }
          }
        } else if (action.targetId) {
          protectedPlayers.add(action.targetId)
          result = { type: "PROTECT" }
        }
      }

      if (action.actionType === "INVESTIGATE" && target) {
        if (actor.role === "DELI") {
          if (actor.displayRole === "WATCHER") {
            const others = players.filter((p) => p.id !== target.id && p.id !== actor.id)
            const randomVisitors = others
              .sort(() => Math.random() - 0.5)
              .slice(0, Math.min(2, others.length))
              .map((p) => p.name)
            result = { type: "WATCH", visitors: randomVisitors }
          } else if (actor.displayRole === "DETECTIVE") {
            const roles: PlayerRole[] = ["DOCTOR", "GUARDIAN", "WATCHER", "DETECTIVE", "BOMBER", "SURVIVOR"]
            const fake = roles.sort(() => Math.random() - 0.5).slice(0, 2)
            result = { type: "DETECT", roles: [fake[0], fake[1]] }
          }
        } else {
          if (["WATCHER", "EVIL_WATCHER"].includes(actor.role!)) {
            const visitors = nightActions
              .filter(
                (a) => a.targetId === target.id && a.playerId !== actor.id && a.playerId !== target.id,
              )
              .map((a) => players.find((p) => p.id === a.playerId)?.name || "")
              .filter(Boolean)
            result = { type: "WATCH", visitors }
          } else if (["DETECTIVE", "EVIL_DETECTIVE"].includes(actor.role!)) {
            const roles: PlayerRole[] = ["DOCTOR", "GUARDIAN", "WATCHER", "DETECTIVE", "BOMBER", "SURVIVOR"]
            const actualRole = target.role
            const fakeRole = roles.filter((r) => r !== actualRole)[Math.floor(Math.random() * (roles.length - 1))]
            const shown = [actualRole, fakeRole].sort(() => Math.random() - 0.5)
            result = { type: "DETECT", roles: [shown[0], shown[1]] }
          }
        }
      }

      if (action.actionType === "BOMB_PLANT") {
        result = { type: "BOMB_PLANT" }
      } else if (action.actionType === "BOMB_DETONATE") {
        detonateIndex = idx
      }

      return { ...action, result }
    })

    let bombVictims: Player[] = []
    if (detonateIndex !== -1) {
      bombVictims = players.filter((p) => newBombTargets.includes(p.id))
      const victimNames = bombVictims.map((p) => p.name)
      updatedActions[detonateIndex] = {
        ...updatedActions[detonateIndex],
        result: { type: "BOMB_DETONATE", victims: victimNames },
      }
      newBombTargets = []
    }

    const targetedPlayers = killers.map((action) => action.targetId).filter(Boolean) as string[]
    const bombVictimIds = bombVictims.map((p) => p.id)

    const newDeaths: Player[] = []

    setPlayers((prevPlayers) =>
      prevPlayers.map((player) => {
        const updatedPlayer: Player = { ...player, hasShield: false }

        if (protectedPlayers.has(player.id)) {
          updatedPlayer.hasShield = true
        }

        if (survivorActors.has(player.id)) {
          updatedPlayer.survivorShields = Math.max((player.survivorShields || 0) - 1, 0)
        }

        if (revivedPlayers.has(player.id)) {
          updatedPlayer.isAlive = true
        }

        if (bombVictimIds.includes(player.id)) {
          updatedPlayer.isAlive = false
          newDeaths.push(updatedPlayer)
        } else if (targetedPlayers.includes(player.id) && !protectedPlayers.has(player.id)) {
          updatedPlayer.isAlive = false
          newDeaths.push(updatedPlayer)
        }

        return updatedPlayer
      }),
    )

    newBombTargets = newBombTargets.filter((id) => !newDeaths.some((p) => p.id === id))
    setBombTargets(newBombTargets)

    setNightActions(updatedActions)

    setDeathsThisTurn(newDeaths)
  }, [nightActions, players, bombTargets])

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

      // Bomber no longer causes extra deaths upon elimination
    }

    setDeathsThisTurn((prev) => [...prev, ...newDeaths])
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
        setNightActions([])
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
          setVotes({})
        }
        break

      default:
        break
    }
  }, [currentPhase, game, players, processNightActions, processVotes, selectedCardDrawers, currentCardDrawer])

  const submitNightAction = useCallback(
    (
      playerId: string,
      targetId: string | null,
      actionType: "KILL" | "PROTECT" | "INVESTIGATE" | "BOMB_PLANT" | "BOMB_DETONATE",
    ) => {
      const newAction: NightAction = {
        playerId,
        targetId,
        actionType,
        timestamp: new Date(),
      }

      setNightActions((prev) => [...prev.filter((action) => action.playerId !== playerId), newAction])
    },
    [],
  )

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
    setBombTargets([])
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
                let actionType: "KILL" | "PROTECT" | "INVESTIGATE" = "KILL"
                if (bot.role.id === "doctor") actionType = "PROTECT"
                if (["watcher", "detective"].includes(bot.role.id)) actionType = "INVESTIGATE"

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
