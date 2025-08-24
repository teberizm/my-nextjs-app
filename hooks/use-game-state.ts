"use client"

import { useState, useEffect, useCallback } from "react"
import { assignRoles, getRoleInfo } from "@/lib/game-logic"
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
  deathLog: Player[]
  bombTargets: string[]
  playerNotes: Record<string, string[]>
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

function getWinCondition(players: Player[]): { winner: string | null; gameEnded: boolean } {
  const alivePlayers = players.filter((p) => p.isAlive)
  const aliveTraitors = alivePlayers.filter((p) =>
    ["EVIL_GUARDIAN", "EVIL_WATCHER", "EVIL_DETECTIVE"].includes(p.role!),
  )
  const aliveBombers = alivePlayers.filter((p) => p.role === "BOMBER")
  const aliveNonTraitors = alivePlayers.filter(
    (p) => !["EVIL_GUARDIAN", "EVIL_WATCHER", "EVIL_DETECTIVE"].includes(p.role!) && p.role !== "BOMBER",
  )

  if (aliveBombers.length > 0 && alivePlayers.length - aliveBombers.length <= 1) {
    return { winner: "BOMBER", gameEnded: true }
  }

  if (aliveBombers.length === 0 && aliveTraitors.length >= aliveNonTraitors.length && aliveTraitors.length > 0) {
    return { winner: "TRAITORS", gameEnded: true }
  }

  if (aliveBombers.length === 0 && aliveTraitors.length === 0) {
    return { winner: "INNOCENTS", gameEnded: true }
  }

  return { winner: null, gameEnded: false }
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
  const [deathLog, setDeathLog] = useState<Player[]>([])
  const [bombTargets, setBombTargets] = useState<string[]>([])
  const [playerNotes, setPlayerNotes] = useState<Record<string, string[]>>({})

  const currentPlayer = players.find((p) => p.id === currentPlayerId)
  const isGameOwner = currentPlayer?.isOwner || false

  const addPlayerNote = useCallback((playerId: string, note: string) => {
    setPlayerNotes((prev) => ({
      ...prev,
      [playerId]: [...(prev[playerId] || []), note],
    }))
  }, [])

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
    setDeathLog([])
    setBombTargets([])
    setPlayerNotes({})
  }, [])

  const processNightActions = useCallback(() => {
    // Step 1: Guardians block their targets in timestamp order
    const blockedPlayers = new Set<string>()
    const guardianActions = nightActions
      .filter((action) => {
        const actor = players.find((p) => p.id === action.playerId)
        return (
          action.actionType === "PROTECT" &&
          actor &&
          ["GUARDIAN", "EVIL_GUARDIAN"].includes(actor.role!) &&
          action.targetId
        )
      })
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    guardianActions.forEach((action) => {
      if (!blockedPlayers.has(action.playerId) && action.targetId) {
        blockedPlayers.add(action.targetId)
        addPlayerNote(action.targetId, `${currentTurn}. Gece: Gardiyan tarafından tutuldun`)
      }
    })

    // Step 2: Resolve kills from unblocked killers
    const killers = nightActions.filter(
      (action) => action.actionType === "KILL" && !blockedPlayers.has(action.playerId),
    )
    const killTargets = killers.map((k) => k.targetId).filter(Boolean) as string[]

    // Step 3: Resolve doctor revives after kills
    const revivedPlayers = new Set<string>()
    const doctorResults = new Map<string, { success: boolean }>()
    nightActions
      .filter((action) => {
        const actor = players.find((p) => p.id === action.playerId)
        return action.actionType === "PROTECT" && actor?.role === "DOCTOR"
      })
      .forEach((action) => {
        const actor = players.find((p) => p.id === action.playerId)
        const target = action.targetId ? players.find((p) => p.id === action.targetId) : null
        if (!actor || blockedPlayers.has(actor.id)) {
          doctorResults.set(action.playerId, { success: false })
          return
        }
        if (target && (!target.isAlive || killTargets.includes(target.id))) {
          revivedPlayers.add(target.id)
          doctorResults.set(action.playerId, { success: true })
        } else {
          doctorResults.set(action.playerId, { success: false })
        }
      })

    // Step 4: process remaining actions (watchers, survivors, bombs, etc.)
    const bombPlacers = nightActions.filter(
      (a) => a.actionType === "BOMB_PLANT" && !blockedPlayers.has(a.playerId),
    )
    const detonateAction = nightActions.find(
      (a) => a.actionType === "BOMB_DETONATE" && !blockedPlayers.has(a.playerId),
    )

    let newBombTargets = [...bombTargets]
    bombPlacers.forEach((a) => {
      if (a.targetId && !newBombTargets.includes(a.targetId)) newBombTargets.push(a.targetId)
    })

    const protectedPlayers = new Set<string>()
    const survivorActors = new Set<string>()

    let detonateIndex = -1

    const updatedActions: NightAction[] = nightActions.map((action, idx) => {
      const actor = players.find((p) => p.id === action.playerId)
      const target = action.targetId ? players.find((p) => p.id === action.targetId) : null
      let result: any = null

      if (!actor) return { ...action }

      if (blockedPlayers.has(actor.id)) {
        return { ...action, result: { type: "BLOCKED" } }
      }

      if (action.actionType === "PROTECT" && actor.role !== "DELI") {
        if (["GUARDIAN", "EVIL_GUARDIAN"].includes(actor.role!) && action.targetId) {
          result = { type: "BLOCK" }
        } else if (actor.role === "SURVIVOR") {
          if (actor.survivorShields && actor.survivorShields > 0 && action.targetId === actor.id) {
            protectedPlayers.add(actor.id)
            survivorActors.add(actor.id)
            const remaining = Math.max((actor.survivorShields || 0) - 1, 0)
            result = { type: "PROTECT", remaining }
          }
        } else if (actor.role === "DOCTOR") {
          const docResult = doctorResults.get(actor.id)
          if (docResult) {
            result = { type: "REVIVE", success: docResult.success }
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
                (a) =>
                  a.targetId === target.id &&
                  a.playerId !== actor.id &&
                  a.playerId !== target.id &&
                  !blockedPlayers.has(a.playerId),
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

      if (result) {
        const prefix = `${currentTurn}. Gece:`
        let note = ""
        switch (result.type) {
          case "PROTECT":
            if (actor.role === "SURVIVOR" && action.targetId === actor.id) {
              note = `${prefix} Kendini korudun (${result.remaining} hak kaldı)`
            } else if (target) {
              note = `${prefix} ${target.name} oyuncusunu korudun`
            }
            break
          case "BLOCK":
            if (target) {
              note = `${prefix} ${target.name} oyuncusunu tuttun`
            }
            break
          case "REVIVE":
            if (target) {
              note = result.success
                ? `${prefix} ${target.name} oyuncusunu dirilttin`
                : `${prefix} ${target.name} oyuncusunu diriltmeyi denedin`
            }
            break
          case "WATCH":
            if (target) {
              const visitorsText =
                result.visitors && result.visitors.length > 0
                  ? result.visitors.join(", ")
                  : "kimse gelmedi"
              note = `${prefix} ${target.name} oyuncusunu izledin: ${visitorsText}`
            }
            break
          case "DETECT":
            if (target) {
              const r1 = getRoleInfo(result.roles[0]).name
              const r2 = getRoleInfo(result.roles[1]).name
              note = `${prefix} ${target.name} oyuncusunu soruşturdun: ${r1}, ${r2}`
            }
            break
          case "BOMB_PLANT":
            if (target) {
              note = `${prefix} ${target.name} oyuncusuna bomba yerleştirdin`
            }
            break
        }
        if (note) addPlayerNote(actor.id, note)
      }

      return { ...action, result }
    })

    let bombVictims: Player[] = []
    if (detonateIndex !== -1) {
      bombVictims = players.filter((p) => newBombTargets.includes(p.id) && p.isAlive)
      const victimNames = bombVictims.map((p) => p.name)
      updatedActions[detonateIndex] = {
        ...updatedActions[detonateIndex],
        result: { type: "BOMB_DETONATE", victims: victimNames },
      }
      const actorId = updatedActions[detonateIndex].playerId
      const victimsText = victimNames.length > 0 ? victimNames.join(", ") : "kimse ölmedi"
      addPlayerNote(actorId, `${currentTurn}. Gece: bombaları patlattın: ${victimsText}`)
      newBombTargets = []
    }

    const targetedPlayers = killTargets
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

        if (bombVictimIds.includes(player.id) && !revivedPlayers.has(player.id)) {
          updatedPlayer.isAlive = false
          newDeaths.push(updatedPlayer)
        } else if (
          targetedPlayers.includes(player.id) &&
          !protectedPlayers.has(player.id) &&
          !revivedPlayers.has(player.id)
        ) {
          updatedPlayer.isAlive = false
          newDeaths.push(updatedPlayer)
        }

        return updatedPlayer
      }),
    )

    newBombTargets = newBombTargets.filter((id) => !newDeaths.some((p) => p.id === id))
    setBombTargets(newBombTargets)

    // Add kill notes for attackers
    nightActions
      .filter((a) => a.actionType === "KILL")
      .forEach((action) => {
        const actor = players.find((p) => p.id === action.playerId)
        const target = players.find((p) => p.id === action.targetId)
        if (actor && target) {
          const killed = newDeaths.some((d) => d.id === target.id)
          const note = `${currentTurn}. Gece: ${target.name} oyuncusuna saldırdın${killed ? " ve öldürdün" : ""}`
          addPlayerNote(actor.id, note)
        }
      })

    // Add notes for players without actions
    const actedIds = new Set(nightActions.map((a) => a.playerId))
    players.forEach((p) => {
      if (p.isAlive && !actedIds.has(p.id)) {
        addPlayerNote(p.id, `${currentTurn}. Gece: hiçbir şey yapmadın`)
      }
    })

    setNightActions(updatedActions)

    setDeathsThisTurn(newDeaths)
    if (newDeaths.length > 0) {
      setDeathLog((prev) => [...prev, ...newDeaths])
    }
  }, [nightActions, players, bombTargets, currentTurn, addPlayerNote])

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

    const entries = Object.entries(voteCount)
    entries.forEach(([playerId, count]) => {
      if (count > maxVotes) {
        maxVotes = count
        eliminatedPlayerId = playerId
      }
    })

    const topPlayers = entries.filter(([, count]) => count === maxVotes)
    if (topPlayers.length > 1) {
      eliminatedPlayerId = null
    }

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

    setDeathsThisTurn(newDeaths)
    if (newDeaths.length > 0) {
      setDeathLog((prev) => [...prev, ...newDeaths])
    }
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
        setTimeRemaining(game?.settings.nightDuration || 15)
        break

      case "NIGHT":
        processNightActions()
        setCurrentPhase("NIGHT_RESULTS")
        setTimeRemaining(5)
        break

      case "NIGHT_RESULTS":
        setPlayers((prev) => prev.map((p) => ({ ...p, hasShield: false })))
        setCurrentPhase("DEATH_ANNOUNCEMENT")
        setTimeRemaining(5)
        setNightActions([])
        break

      case "DEATH_ANNOUNCEMENT":
        const alivePlayers = players.filter((p) => p.isAlive)
        const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5)
        const drawCount = game?.settings.cardDrawCount || 0
        const cardDrawers = shuffled.slice(0, Math.min(drawCount, alivePlayers.length))
        setSelectedCardDrawers(cardDrawers.map((p) => p.id))
        setCurrentCardDrawer(cardDrawers[0]?.id || null)
        if (cardDrawers.length > 0) {
          setCurrentPhase("CARD_DRAWING")
          setTimeRemaining(0)
        } else {
          setCurrentPhase("DAY_DISCUSSION")
          setTimeRemaining(game?.settings.dayDuration || 15)
        }
        break

      case "CARD_DRAWING":
        const currentIndex = selectedCardDrawers.indexOf(currentCardDrawer || "")
        if (currentIndex < selectedCardDrawers.length - 1) {
          setCurrentCardDrawer(selectedCardDrawers[currentIndex + 1])
          setTimeRemaining(0)
        } else {
          setCurrentPhase("DAY_DISCUSSION")
          setTimeRemaining(game?.settings.dayDuration || 15)
          setSelectedCardDrawers([])
          setCurrentCardDrawer(null)
        }
        break

      case "DAY_DISCUSSION":
        setCurrentPhase("VOTE")
        setTimeRemaining(game?.settings.voteDuration || 15)
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
          setTimeRemaining(game?.settings.nightDuration || 15)
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
      const actor = players.find((p) => p.id === playerId)
      if (!actor || !actor.isAlive) return

      const newAction: NightAction = {
        playerId,
        targetId,
        actionType,
        timestamp: new Date(),
      }

      setNightActions((prev) => [...prev.filter((action) => action.playerId !== playerId), newAction])
    },
    [players],
  )

  const submitVote = useCallback(
    (voterId: string, targetId: string) => {
      const voter = players.find((p) => p.id === voterId)
      if (!voter?.isAlive) {
        console.log(`[v0] Dead player ${voter?.name} attempted to vote - blocked`)
        return
      }

      setVotes((prev) => {
        const newVotes = { ...prev, [voterId]: targetId }
        const aliveCount = players.filter((p) => p.isAlive).length
        if (Object.keys(newVotes).length >= aliveCount) {
          setTimeRemaining(0)
        }
        return newVotes
      })
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
    setDeathLog([])
    setBombTargets([])
  }, [])

  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining((prev) => prev - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else if (
      timeRemaining === 0 &&
      currentPhase !== "LOBBY" &&
      currentPhase !== "END" &&
      currentPhase !== "CARD_DRAWING"
    ) {
      const phaseTimer = setTimeout(() => {
        advancePhase()
      }, 100)
      return () => clearTimeout(phaseTimer)
    }
  }, [timeRemaining, currentPhase, advancePhase])

  // Bot simulation removed for realtime play

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
    deathLog,
    bombTargets,
    playerNotes,
    startGame,
    advancePhase,
    submitNightAction,
    submitVote,
    resetGame,
  }
}
