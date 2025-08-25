// use-game-state.ts
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { assignRoles, getRoleInfo } from "@/lib/game-logic" // rolleri dağıtmak için (yalnız OWNER)
import type {
  GamePhase,
  Player,
  Game,
  GameSettings,
  NightAction,
  PlayerRole,
} from "@/lib/types"
import { wsClient } from "@/lib/websocket-client"

/** WS event adları (server ile uyumlu) */
type WSEvent =
  | "GAME_STARTED"
  | "PHASE_CHANGED"
  | "STATE_SNAPSHOT"
  | "NIGHT_ACTION_UPDATED"
  | "VOTE_CAST"
  | "PLAYER_LIST_UPDATED"

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

/** Kazanma koşulları (owner hesaplar) */
function getWinCondition(players: Player[]): { winner: string | null; gameEnded: boolean } {
  const alivePlayers = players.filter((p) => p.isAlive)
  const aliveTraitors = alivePlayers.filter((p) =>
    ["EVIL_GUARDIAN", "EVIL_WATCHER", "EVIL_DETECTIVE"].includes(p.role!),
  )
  const aliveBombers = alivePlayers.filter((p) => p.role === "BOMBER")
  const aliveNonTraitors = alivePlayers.filter(
    (p) =>
      !["EVIL_GUARDIAN", "EVIL_WATCHER", "EVIL_DETECTIVE"].includes(p.role!) &&
      p.role !== "BOMBER",
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

  /** Player’a özel not ekleme (owner hesaplar ve snapshot ile dağıtır) */
  const addPlayerNote = useCallback((playerId: string, note: string) => {
    setPlayerNotes((prev) => ({
      ...prev,
      [playerId]: [...(prev[playerId] || []), note],
    }))
  }, [])

  /** ----------------- OWNER-ONLY: Oyun başlat ----------------- */
  const startGame = useCallback((gamePlayers: Player[], settings: GameSettings) => {
  // SADECE OWNER assignRoles çalıştırmalı
  if (isGameOwner) {
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

    // Local state’i set et
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

    // *** KRİTİK: Herkese aynı rollerin gönderilmesi ***
    wsClient.sendEvent("GAME_STARTED", {
      game: {
        id: newGame.id,
        phase: "ROLE_REVEAL",
        currentTurn: 1,
        settings,
        seed: newGame.seed,
        startedAt: newGame.startedAt,
      },
      players: playersWithRoles,
    })
  } else {
    // Non-owner: burada hiçbir şey yapma; GAME_STARTED bekle
  }
}, [isGameOwner])

  /** ----------------- OWNER-ONLY: Gece çözümleyici ----------------- */
  const processNightActions = useCallback(() => {
    // OWNER dışında kimse hesap yapmasın
    if (!isGameOwner) return

    // 1) Guard’lar: block hedefleri
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

    // 2) Engellenmeyen KILL’ler
    const killers = nightActions.filter(
      (action) => action.actionType === "KILL" && !blockedPlayers.has(action.playerId),
    )
    const killTargets = killers.map((k) => k.targetId).filter(Boolean) as string[]

    // 3) Doktor reviveleri (KILL’lerden sonra)
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

    // 4) Bomba, Survivor, Watch/Detective vs.
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
            const fakeRole = roles.filter((r) => r !== actualRole)[
              Math.floor(Math.random() * (roles.length - 1))
            ]
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
            if (target) note = `${prefix} ${target.name} oyuncusunu tuttun`
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
                result.visitors && result.visitors.length > 0 ? result.visitors.join(", ") : "kimse gelmedi"
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
            if (target) note = `${prefix} ${target.name} oyuncusuna bomba yerleştirdin`
            break
        }
        if (note) addPlayerNote(actor.id, note)
      }

      return { ...action, result }
    })

    // 5) Bombalar patlarsa
    let bombVictims: Player[] = []
    if (detonateAction) {
      bombVictims = players.filter((p) => newBombTargets.includes(p.id) && p.isAlive)
      const victimNames = bombVictims.map((p) => p.name)
      const idx = updatedActions.findIndex(
        (a) => a.actionType === "BOMB_DETONATE" && !blockedPlayers.has(a.playerId),
      )
      if (idx >= 0) {
        updatedActions[idx] = {
          ...updatedActions[idx],
          result: { type: "BOMB_DETONATE", victims: victimNames },
        }
        const actorId = updatedActions[idx].playerId
        const victimsText = victimNames.length > 0 ? victimNames.join(", ") : "kimse ölmedi"
        addPlayerNote(actorId, `${currentTurn}. Gece: bombaları patlattın: ${victimsText}`)
      }
      newBombTargets = []
    }

    const targetedPlayers = killTargets
    const bombVictimIds = bombVictims.map((p) => p.id)

    const newDeaths: Player[] = []

    setPlayers((prev) =>
      prev.map((player) => {
        const updated: Player = { ...player, hasShield: false }

        if (protectedPlayers.has(player.id)) {
          updated.hasShield = true
        }

        if (survivorActors.has(player.id)) {
          updated.survivorShields = Math.max((player.survivorShields || 0) - 1, 0)
        }

        if (revivedPlayers.has(player.id)) {
          updated.isAlive = true
        }

        if (bombVictimIds.includes(player.id) && !revivedPlayers.has(player.id)) {
          updated.isAlive = false
          newDeaths.push(updated)
        } else if (
          targetedPlayers.includes(player.id) &&
          !protectedPlayers.has(player.id) &&
          !revivedPlayers.has(player.id)
        ) {
          updated.isAlive = false
          newDeaths.push(updated)
        }

        return updated
      }),
    )

    newBombTargets = newBombTargets.filter((id) => !newDeaths.some((p) => p.id === id))
    setBombTargets(newBombTargets)

    // 6) Saldırı notları
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

    setNightActions(updatedActions)
    setDeathsThisTurn(newDeaths)
    if (newDeaths.length > 0) {
      setDeathLog((prev) => [...prev, ...newDeaths])
    }
  }, [isGameOwner, nightActions, players, bombTargets, currentTurn, addPlayerNote])

  /** ----------------- OWNER-ONLY: Oyları say ----------------- */
  const processVotes = useCallback(() => {
    if (!isGameOwner) return

    const voteCount: Record<string, number> = {}
    players
      .filter((p) => p.isAlive)
      .forEach((p) => {
        // init 0
        voteCount[p.id] = voteCount[p.id] || 0
      })

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
    }

    setDeathsThisTurn(newDeaths)
    if (newDeaths.length > 0) {
      setDeathLog((prev) => [...prev, ...newDeaths])
    }
  }, [isGameOwner, votes, players])

  /** ----------------- Faz İlerle (OWNER hesaplar + yayınlar) ----------------- */
  const advancePhase = useCallback(() => {
    if (!isGameOwner) return // non-owner faz ilerletmez

    const publishPhase = (phase: GamePhase, extra: Record<string, any> = {}) => {
      wsClient.sendEvent("PHASE_CHANGED" as WSEvent, {
        phase,
        timeRemaining: extra.timeRemaining ?? timeRemaining,
        currentTurn: extra.currentTurn ?? currentTurn,
        selectedCardDrawers: extra.selectedCardDrawers ?? selectedCardDrawers,
        currentCardDrawer: extra.currentCardDrawer ?? currentCardDrawer,
        initiatorId: currentPlayerId,
      })
    }

    const publishSnapshot = () => {
      wsClient.sendEvent("STATE_SNAPSHOT" as WSEvent, {
        players,
        deathLog,
        playerNotes,
        votes,
        bombTargets,
        currentPhase,
        timeRemaining,
        currentTurn,
        selectedCardDrawers,
        currentCardDrawer,
        initiatorId: currentPlayerId,
      })
    }

    const { winner, gameEnded } = getWinCondition(players)
    if (gameEnded) {
      setGame((prev) =>
        prev ? { ...prev, phase: "END", winningSide: winner as any, endedAt: new Date() } : null,
      )
      setCurrentPhase("END")
      setTimeRemaining(0)
      publishPhase("END", { timeRemaining: 0 })
      publishSnapshot()
      return
    }

    switch (currentPhase) {
      case "ROLE_REVEAL": {
        const t = game?.settings.nightDuration || 15
        setCurrentPhase("NIGHT")
        setTimeRemaining(t)
        publishPhase("NIGHT", { timeRemaining: t })
        publishSnapshot()
        break
      }

      case "NIGHT": {
        processNightActions()
        setCurrentPhase("NIGHT_RESULTS")
        setTimeRemaining(5)
        publishPhase("NIGHT_RESULTS", { timeRemaining: 5 })
        publishSnapshot()
        break
      }

      case "NIGHT_RESULTS": {
        setPlayers((prev) => prev.map((p) => ({ ...p, hasShield: false })))
        setCurrentPhase("DEATH_ANNOUNCEMENT")
        setTimeRemaining(5)
        setNightActions([])
        publishPhase("DEATH_ANNOUNCEMENT", { timeRemaining: 5 })
        publishSnapshot()
        break
      }

      case "DEATH_ANNOUNCEMENT": {
        const alivePlayers = players.filter((p) => p.isAlive)
        const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5)
        const drawCount = game?.settings.cardDrawCount || 0
        const cardDrawers = shuffled.slice(0, Math.min(drawCount, alivePlayers.length))
        setSelectedCardDrawers(cardDrawers.map((p) => p.id))
        setCurrentCardDrawer(cardDrawers[0]?.id || null)
        if (cardDrawers.length > 0) {
          setCurrentPhase("CARD_DRAWING")
          setTimeRemaining(0)
          publishPhase("CARD_DRAWING", { timeRemaining: 0, selectedCardDrawers: cardDrawers.map((p) => p.id), currentCardDrawer: cardDrawers[0]?.id || null })
        } else {
          const t = game?.settings.dayDuration || 15
          setCurrentPhase("DAY_DISCUSSION")
          setTimeRemaining(t)
          publishPhase("DAY_DISCUSSION", { timeRemaining: t })
        }
        publishSnapshot()
        break
      }

      case "CARD_DRAWING": {
        const currentIndex = selectedCardDrawers.indexOf(currentCardDrawer || "")
        if (currentIndex < selectedCardDrawers.length - 1) {
          const nextId = selectedCardDrawers[currentIndex + 1]
          setCurrentCardDrawer(nextId)
          setTimeRemaining(0)
          publishPhase("CARD_DRAWING", { timeRemaining: 0, currentCardDrawer: nextId })
        } else {
          const t = game?.settings.dayDuration || 15
          setCurrentPhase("DAY_DISCUSSION")
          setTimeRemaining(t)
          setSelectedCardDrawers([])
          setCurrentCardDrawer(null)
          publishPhase("DAY_DISCUSSION", { timeRemaining: t, selectedCardDrawers: [], currentCardDrawer: null })
        }
        publishSnapshot()
        break
      }

      case "DAY_DISCUSSION": {
        const t = game?.settings.voteDuration || 15
        setCurrentPhase("VOTE")
        setTimeRemaining(t)
        publishPhase("VOTE", { timeRemaining: t })
        publishSnapshot()
        break
      }

      case "VOTE": {
        processVotes()
        setCurrentPhase("RESOLVE")
        setTimeRemaining(3)
        publishPhase("RESOLVE", { timeRemaining: 3 })
        publishSnapshot()
        break
      }

      case "RESOLVE": {
        const { winner: newWinner, gameEnded: newGameEnded } = getWinCondition(players)
        if (newGameEnded) {
          setGame((prev) =>
            prev ? { ...prev, phase: "END", winningSide: newWinner as any, endedAt: new Date() } : null,
          )
          setCurrentPhase("END")
          setTimeRemaining(0)
          publishPhase("END", { timeRemaining: 0 })
        } else {
          const t = game?.settings.nightDuration || 15
          setCurrentTurn((prev) => prev + 1)
          setCurrentPhase("NIGHT")
          setTimeRemaining(t)
          setDeathsThisTurn([])
          setVotes({})
          publishPhase("NIGHT", { timeRemaining: t, currentTurn: currentTurn + 1 })
        }
        publishSnapshot()
        break
      }

      default:
        break
    }
  }, [
    isGameOwner,
    game,
    players,
    currentPhase,
    timeRemaining,
    currentTurn,
    votes,
    selectedCardDrawers,
    currentCardDrawer,
    deathLog,
    playerNotes,
    bombTargets,
    processNightActions,
    processVotes,
    currentPlayerId,
  ])

  /** TDZ koruması: advancePhase’i ref ile hoist et */
  const advancePhaseRef = useRef<() => void>(() => {})
  useEffect(() => {
    advancePhaseRef.current = advancePhase
  }, [advancePhase])
  function handlePhaseTimeout() {
    if (isGameOwner) {
      // fazı sadece OWNER ilerletir
      advancePhaseRef.current()
    }
  }

  /** --------- Aksiyon gönderimleri (oyuncular) --------- */
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

      // Kendi ekranda anında gör (özellikle non-owner için UX)
      setNightActions((prev) => [
        ...prev.filter((a) => a.playerId !== playerId),
        newAction,
      ])

      // Owner tüm aksiyonları toplar (server sadece broadcast yapıyor)
      wsClient.sendEvent("NIGHT_ACTION_UPDATED" as WSEvent, {
        action: newAction,
        initiatorId: currentPlayerId,
      })
    },
    [players, currentPlayerId],
  )

  const submitVote = useCallback(
    (voterId: string, targetId: string) => {
      const voter = players.find((p) => p.id === voterId)
      if (!voter?.isAlive) return

      setVotes((prev) => {
        const newVotes = { ...prev, [voterId]: targetId }
        const aliveCount = players.filter((p) => p.isAlive).length
        if (Object.keys(newVotes).length >= aliveCount && isGameOwner) {
          // OWNER erken kapatabilir
          setTimeRemaining(0)
        }
        return newVotes
      })

      wsClient.sendEvent("VOTE_CAST" as WSEvent, {
        voterId,
        targetId,
        initiatorId: currentPlayerId,
      })
    },
    [players, isGameOwner, currentPlayerId],
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
    setPlayerNotes({})
  }, [])

  /** ----------------- WS Dinleyicileri (herkes) ----------------- */
  useEffect(() => {
    /** GAME_STARTED: Owner rolleri dağıttı → herkese geldi */
    const onGameStarted = (data: any) => {
      const { players: payloadPlayers, settings, initiatorId } = data?.payload || {}
      if (!payloadPlayers || !settings) return

      // Owner zaten set etti, kendini tekrar kurmasın
      if (initiatorId && initiatorId === currentPlayerId) return

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
      setPlayers(payloadPlayers) // DİKKAT: assignRoles yok!
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
    }

    /** PHASE_CHANGED: herkes faz/timer eşitlesin */
    const onPhaseChanged = (data: any) => {
      const { phase, timeRemaining: t, currentTurn: ct, selectedCardDrawers: sel, currentCardDrawer: curr, initiatorId } =
        data?.payload || {}
      if (initiatorId && initiatorId === currentPlayerId) return
      if (phase) setCurrentPhase(phase)
      if (typeof t === "number") setTimeRemaining(t)
      if (typeof ct === "number") setCurrentTurn(ct)
      if (Array.isArray(sel)) setSelectedCardDrawers(sel)
      setCurrentCardDrawer(curr ?? null)
    }

    /** STATE_SNAPSHOT: owner’ın authoritative state’i */
    const onSnapshot = (data: any) => {
      const p = data?.payload
      if (!p) return
      if (p.initiatorId && p.initiatorId === currentPlayerId) return

      if (Array.isArray(p.players)) setPlayers(p.players)
      if (Array.isArray(p.deathLog)) setDeathLog(p.deathLog)
      if (p.playerNotes) setPlayerNotes(p.playerNotes)
      if (p.votes) setVotes(p.votes)
      if (Array.isArray(p.bombTargets)) setBombTargets(p.bombTargets)
      if (p.currentPhase) setCurrentPhase(p.currentPhase)
      if (typeof p.timeRemaining === "number") setTimeRemaining(p.timeRemaining)
      if (typeof p.currentTurn === "number") setCurrentTurn(p.currentTurn)
      if (Array.isArray(p.selectedCardDrawers)) setSelectedCardDrawers(p.selectedCardDrawers)
      setCurrentCardDrawer(p.currentCardDrawer ?? null)
    }

    /** NIGHT_ACTION_UPDATED: owner aksiyonu toplar */
    const onNightAction = (data: any) => {
      const { action, initiatorId } = data?.payload || {}
      if (!action) return

      // OWNER: herkesten gelen aksiyonları biriktir
      if (isGameOwner) {
        setNightActions((prev) => [
          ...prev.filter((a) => a.playerId !== action.playerId),
          action,
        ])
      } else {
        // Non-owner için bir şey yapmaya gerek yok (kendi aksiyonunu zaten lokalde set etti)
        // istersen UI senkronu için de gösterebilirsin ama authoritative değil
      }
    }

    /** VOTE_CAST: owner oyları toplar */
    const onVoteCast = (data: any) => {
      const { voterId, targetId, initiatorId } = data?.payload || {}
      if (!voterId) return

      // OWNER oyları authoritative olarak toplar
      if (isGameOwner) {
        setVotes((prev) => ({ ...prev, [voterId]: targetId }))
      } else {
        // Non-owner tarafında da UI için gösterebiliriz (opsiyonel)
        setVotes((prev) => ({ ...prev, [voterId]: targetId }))
      }
    }

    wsClient.on("GAME_STARTED", onGameStarted)
    wsClient.on("PHASE_CHANGED", onPhaseChanged)
    wsClient.on("STATE_SNAPSHOT", onSnapshot)
    wsClient.on("NIGHT_ACTION_UPDATED", onNightAction)
    wsClient.on("VOTE_CAST", onVoteCast)

    return () => {
      wsClient.off("GAME_STARTED", onGameStarted)
      wsClient.off("PHASE_CHANGED", onPhaseChanged)
      wsClient.off("STATE_SNAPSHOT", onSnapshot)
      wsClient.off("NIGHT_ACTION_UPDATED", onNightAction)
      wsClient.off("VOTE_CAST", onVoteCast)
    }
  }, [currentPlayerId, isGameOwner])

  /** ----------------- Zamanlayıcı (owner auto-advance) ----------------- */
  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining((prev) => prev - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
    // Faz otomatik ilerlemesini SADECE OWNER yapar
    if (
      isGameOwner &&
      timeRemaining === 0 &&
      currentPhase !== "LOBBY" &&
      currentPhase !== "END" &&
      currentPhase !== "CARD_DRAWING"
    ) {
      const t = setTimeout(handlePhaseTimeout, 120) // küçük gecikme
      return () => clearTimeout(t)
    }
  }, [timeRemaining, currentPhase, isGameOwner])

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
