"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { assignRoles, getWinCondition, getRoleInfo } from "@/lib/game-logic"
import type { GamePhase, Player, Game, GameSettings, NightAction, PlayerRole } from "@/lib/types"
import { wsClient } from "@/lib/websocket-client"

/**
 * NOT:
 * - Sunucunuz şu an yalnızca JOIN_ROOM / PLAYER_LIST_UPDATED / GAME_STARTED destekliyor.
 * - Bu hook, rollerin HERKESTE AYNI görünmesi için owner’ı tek otorite yapar:
 *   Owner start edince assignRoles çalıştırır ve {game, players} snapshot’ını GAME_STARTED ile yayınlar.
 *   Diğer client’lar assignRoles ÇALIŞTIRMAZ; gelen snapshot’ı doğrudan set eder.
 * - Faz/Not/Ölüm senkronu için opsiyonel olarak PHASE_CHANGED ve STATE_SNAPSHOT da gönderiliyor.
 *   ws-server’a bu event’leri eklediğinde anında tam senkron olursun.
 */

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

export function useGameState(currentPlayerId: string): GameStateHook {
  // ---- STATE ----
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

  // Mevcut oyuncu / owner bilgisi (players değiştikçe yeniden hesaplanır)
  const currentPlayer = players.find((p) => p.id === currentPlayerId)
  const isGameOwner = Boolean(currentPlayer?.isOwner)

  // ---- HELPERS ----
  const addPlayerNote = useCallback((playerId: string, note: string) => {
    setPlayerNotes((prev) => ({
      ...prev,
      [playerId]: [...(prev[playerId] || []), note],
    }))
  }, [])

  // ---- OWNER-ONLY: Full snapshot yayınla (opsiyonel, ws-server'a STATE_SNAPSHOT eklendiğinde çalışır) ----
  const publishSnapshot = useCallback(() => {
    if (!isGameOwner) return
    wsClient.sendEvent("STATE_SNAPSHOT" as any, {
      game,
      players,
      currentPhase,
      timeRemaining,
      currentTurn,
      nightActions,
      votes,
      selectedCardDrawers,
      currentCardDrawer,
      deathsThisTurn,
      deathLog,
      bombTargets,
      playerNotes,
    })
  }, [
    isGameOwner,
    game,
    players,
    currentPhase,
    timeRemaining,
    currentTurn,
    nightActions,
    votes,
    selectedCardDrawers,
    currentCardDrawer,
    deathsThisTurn,
    deathLog,
    bombTargets,
    playerNotes,
  ])

  // ---- GAME START (owner authoritative) ----
  const startGame = useCallback(
    (gamePlayers: Player[], settings: GameSettings) => {
      // Bu aşamada players[] henüz boş olabilir; owner bilgisini initial listeden belirleyelim.
      const me = gamePlayers.find((p) => p.id === currentPlayerId)
      const iAmOwner = Boolean(me?.isOwner)

      if (!iAmOwner) {
        // Non-owner burada hiçbir şey yapmaz; GAME_STARTED snapshot’ını bekler.
        return
      }

      // OWNER → roller tek yerde dağıtılır
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

      // Local set
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

      // BÜYÜK NOKTA: Aynı snapshot HERKESE yayınlanır
      wsClient.sendEvent("GAME_STARTED" as any, {
        game: {
          id: newGame.id,
          roomId: newGame.roomId,
          phase: newGame.phase,
          currentTurn: newGame.currentTurn,
          settings: newGame.settings,
          seed: newGame.seed,
          startedAt: newGame.startedAt,
        },
        players: playersWithRoles,
      })
    },
    [currentPlayerId],
  )

  // ---- EVENTS: GAME_STARTED (NON-OWNER) & opsiyonel STATE_SNAPSHOT/PHASE_CHANGED dinleyicileri ----
  useEffect(() => {
    // GAME_STARTED → snapshot kur
    const onGameStarted = (data: any) => {
      const payload = data?.payload
      if (!payload) return

      const incomingGame = payload.game as Partial<Game> | undefined
      const incomingPlayers = payload.players as Player[] | undefined
      if (!incomingGame || !incomingPlayers || incomingPlayers.length === 0) return

      // Owner da bu olayı alabilir; ancak owner zaten local state’i set etti.
      // Non-owner için kritik: assignRoles çalıştırmadan snapshot’ı doğrudan set eder.
      setGame({
        id: incomingGame.id || Math.random().toString(36).substring(2, 15),
        roomId: incomingGame.roomId || "",
        phase: (incomingGame.phase as GamePhase) || "ROLE_REVEAL",
        currentTurn: incomingGame.currentTurn ?? 1,
        settings: (incomingGame.settings as GameSettings)!,
        seed: incomingGame.seed || "",
        startedAt: incomingGame.startedAt ? new Date(incomingGame.startedAt) : new Date(),
      })
      setPlayers(incomingPlayers)
      setCurrentPhase((incomingGame.phase as GamePhase) || "ROLE_REVEAL")
      setTimeRemaining(15)
      setCurrentTurn(incomingGame.currentTurn ?? 1)
      setNightActions([])
      setVotes({})
      setSelectedCardDrawers([])
      setCurrentCardDrawer(null)
      setDeathsThisTurn([])
      setDeathLog([])
      setBombTargets([])
      setPlayerNotes({})
    }

    // PHASE_CHANGED → (opsiyonel) faz eşitle
    const onPhaseChanged = (data: any) => {
      const p = data?.payload
      if (!p) return
      const nextPhase = p.phase as GamePhase | undefined
      const tr = typeof p.timeRemaining === "number" ? p.timeRemaining : undefined
      if (nextPhase) setCurrentPhase(nextPhase)
      if (typeof tr === "number") setTimeRemaining(tr)
      if (typeof p.currentTurn === "number") setCurrentTurn(p.currentTurn)
    }

    // STATE_SNAPSHOT → (opsiyonel) tam eşitle
    const onSnapshot = (data: any) => {
      const s = data?.payload
      if (!s) return
      // Owner gönderir; diğerleri aynen uygular
      setGame(s.game || null)
      setPlayers(Array.isArray(s.players) ? s.players : [])
      setCurrentPhase(s.currentPhase ?? "LOBBY")
      setTimeRemaining(typeof s.timeRemaining === "number" ? s.timeRemaining : 0)
      setCurrentTurn(typeof s.currentTurn === "number" ? s.currentTurn : 1)
      setNightActions(Array.isArray(s.nightActions) ? s.nightActions : [])
      setVotes(s.votes || {})
      setSelectedCardDrawers(Array.isArray(s.selectedCardDrawers) ? s.selectedCardDrawers : [])
      setCurrentCardDrawer(s.currentCardDrawer ?? null)
      setDeathsThisTurn(Array.isArray(s.deathsThisTurn) ? s.deathsThisTurn : [])
      setDeathLog(Array.isArray(s.deathLog) ? s.deathLog : [])
      setBombTargets(Array.isArray(s.bombTargets) ? s.bombTargets : [])
      setPlayerNotes(s.playerNotes || {})
    }

    wsClient.on("GAME_STARTED" as any, onGameStarted)
    wsClient.on("PHASE_CHANGED" as any, onPhaseChanged)
    wsClient.on("STATE_SNAPSHOT" as any, onSnapshot)
    return () => {
      wsClient.off("GAME_STARTED" as any, onGameStarted)
      wsClient.off("PHASE_CHANGED" as any, onPhaseChanged)
      wsClient.off("STATE_SNAPSHOT" as any, onSnapshot)
    }
  }, [])

  // ---- GECE ÇÖZÜMLEME ----
  const processNightActions = useCallback(() => {
    // 1) Engellemeler (Guardian)
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

    // 2) Öldürmeler (engellenmemiş)
    const killers = nightActions.filter(
      (a) => a.actionType === "KILL" && !blockedPlayers.has(a.playerId),
    )
    const killTargets = killers.map((k) => k.targetId).filter(Boolean) as string[]

    // 3) Doktor diriltmeleri
    const revivedPlayers = new Set<string>()
    const doctorResults = new Map<string, { success: boolean }>()
    nightActions
      .filter((a) => {
        const actor = players.find((p) => p.id === a.playerId)
        return a.actionType === "PROTECT" && actor?.role === "DOCTOR"
      })
      .forEach((a) => {
        const actor = players.find((p) => p.id === a.playerId)
        const target = a.targetId ? players.find((p) => p.id === a.targetId) : null
        if (!actor || blockedPlayers.has(actor.id)) {
          doctorResults.set(a.playerId, { success: false })
          return
        }
        if (target && (!target.isAlive || killTargets.includes(target.id))) {
          revivedPlayers.add(target.id)
          doctorResults.set(a.playerId, { success: true })
        } else {
          doctorResults.set(a.playerId, { success: false })
        }
      })

    // 4) Bombalar / Survivor korumaları vs.
    const bombPlacers = nightActions.filter(
      (a) => a.actionType === "BOMB_PLANT" && !blockedPlayers.has(a.playerId),
    )
    const detonateActionIndex = nightActions.findIndex(
      (a) => a.actionType === "BOMB_DETONATE" && !blockedPlayers.has(a.playerId),
    )

    let newBombTargets = [...bombTargets]
    bombPlacers.forEach((a) => {
      if (a.targetId && !newBombTargets.includes(a.targetId)) newBombTargets.push(a.targetId)
    })

    const protectedPlayers = new Set<string>()
    const survivorActors = new Set<string>()

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
          if (docResult) result = { type: "REVIVE", success: docResult.success }
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
              const visitorsText = result.visitors && result.visitors.length > 0 ? result.visitors.join(", ") : "kimse gelmedi"
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

    // 5) Patlatma
    let bombVictims: Player[] = []
    if (detonateActionIndex !== -1) {
      bombVictims = players.filter((p) => newBombTargets.includes(p.id) && p.isAlive)
      const victimNames = bombVictims.map((p) => p.name)
      updatedActions[detonateActionIndex] = {
        ...updatedActions[detonateActionIndex],
        result: { type: "BOMB_DETONATE", victims: victimNames },
      }
      const actorId = updatedActions[detonateActionIndex].playerId
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

    // Saldırı notları
    nightActions
      .filter((a) => a.actionType === "KILL")
      .forEach((a) => {
        const actor = players.find((p) => p.id === a.playerId)
        const target = players.find((p) => p.id === a.targetId)
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
  }, [nightActions, players, bombTargets, currentTurn, addPlayerNote])

  // ---- OYLAMA ----
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
    }

    setDeathsThisTurn(newDeaths)
    if (newDeaths.length > 0) {
      setDeathLog((prev) => [...prev, ...newDeaths])
    }
  }, [votes, players])

  // ---- PHASE ADVANCE (owner authoritative) ----
  const _advancePhase = useCallback(() => {
    const { winner, gameEnded } = getWinCondition(players)

    if (gameEnded) {
      setGame((prev) => (prev ? { ...prev, phase: "END", winningSide: winner as any, endedAt: new Date() } : null))
      setCurrentPhase("END")
      setTimeRemaining(0)
      // Opsiyonel: snapshot yayınla
      publishSnapshot()
      return
    }

    switch (currentPhase) {
      case "ROLE_REVEAL": {
        setCurrentPhase("NIGHT")
        const tr = game?.settings.nightDuration || 15
        setTimeRemaining(tr)
        // Publish phase (opsiyonel)
        if (isGameOwner) {
          wsClient.sendEvent("PHASE_CHANGED" as any, { phase: "NIGHT", timeRemaining: tr, currentTurn })
        }
        break
      }

      case "NIGHT": {
        processNightActions()
        setCurrentPhase("NIGHT_RESULTS")
        setTimeRemaining(5)
        if (isGameOwner) {
          wsClient.sendEvent("PHASE_CHANGED" as any, { phase: "NIGHT_RESULTS", timeRemaining: 5, currentTurn })
        }
        break
      }

      case "NIGHT_RESULTS": {
        setPlayers((prev) => prev.map((p) => ({ ...p, hasShield: false })))
        setCurrentPhase("DEATH_ANNOUNCEMENT")
        setTimeRemaining(5)
        setNightActions([])
        if (isGameOwner) {
          wsClient.sendEvent("PHASE_CHANGED" as any, { phase: "DEATH_ANNOUNCEMENT", timeRemaining: 5, currentTurn })
          publishSnapshot()
        }
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
          if (isGameOwner) {
            wsClient.sendEvent("PHASE_CHANGED" as any, { phase: "CARD_DRAWING", timeRemaining: 0, currentTurn })
          }
        } else {
          setCurrentPhase("DAY_DISCUSSION")
          const tr = game?.settings.dayDuration || 15
          setTimeRemaining(tr)
          if (isGameOwner) {
            wsClient.sendEvent("PHASE_CHANGED" as any, { phase: "DAY_DISCUSSION", timeRemaining: tr, currentTurn })
          }
        }
        break
      }

      case "CARD_DRAWING": {
        const idx = selectedCardDrawers.indexOf(currentCardDrawer || "")
        if (idx < selectedCardDrawers.length - 1) {
          setCurrentCardDrawer(selectedCardDrawers[idx + 1])
          setTimeRemaining(0)
          // faz aynı kalır
        } else {
          setCurrentPhase("DAY_DISCUSSION")
          const tr = game?.settings.dayDuration || 15
          setTimeRemaining(tr)
          setSelectedCardDrawers([])
          setCurrentCardDrawer(null)
          if (isGameOwner) {
            wsClient.sendEvent("PHASE_CHANGED" as any, { phase: "DAY_DISCUSSION", timeRemaining: tr, currentTurn })
          }
        }
        break
      }

      case "DAY_DISCUSSION": {
        setCurrentPhase("VOTE")
        const tr = game?.settings.voteDuration || 15
        setTimeRemaining(tr)
        if (isGameOwner) {
          wsClient.sendEvent("PHASE_CHANGED" as any, { phase: "VOTE", timeRemaining: tr, currentTurn })
        }
        break
      }

      case "VOTE": {
        processVotes()
        setCurrentPhase("RESOLVE")
        setTimeRemaining(3)
        if (isGameOwner) {
          wsClient.sendEvent("PHASE_CHANGED" as any, { phase: "RESOLVE", timeRemaining: 3, currentTurn })
          publishSnapshot()
        }
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
          if (isGameOwner) {
            wsClient.sendEvent("PHASE_CHANGED" as any, { phase: "END", timeRemaining: 0, currentTurn })
            publishSnapshot()
          }
        } else {
          setCurrentTurn((prev) => prev + 1)
          setCurrentPhase("NIGHT")
          const tr = game?.settings.nightDuration || 15
          setTimeRemaining(tr)
          setDeathsThisTurn([])
          setVotes({})
          if (isGameOwner) {
            wsClient.sendEvent("PHASE_CHANGED" as any, { phase: "NIGHT", timeRemaining: tr, currentTurn: currentTurn + 1 })
            publishSnapshot()
          }
        }
        break
      }

      default:
        break
    }
  }, [
    players,
    currentPhase,
    game,
    currentTurn,
    processNightActions,
    isGameOwner,
    publishSnapshot,
  ])

  // TDZ koruması: advancePhase’i ref üstünden çağıracağız
  const advancePhaseRef = useRef<() => void>(() => {})
  useEffect(() => {
    advancePhaseRef.current = _advancePhase
  }, [_advancePhase])
  const advancePhase = useCallback(() => advancePhaseRef.current(), [])

  // ---- NIGHT ACTION & VOTE API ----
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
      setNightActions((prev) => [...prev.filter((a) => a.playerId !== playerId), newAction])
    },
    [players],
  )

  const submitVote = useCallback(
    (voterId: string, targetId: string) => {
      const voter = players.find((p) => p.id === voterId)
      if (!voter?.isAlive) return

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

  // ---- RESET ----
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

  // ---- TIMER (owner authoritative) ----
  useEffect(() => {
    // Herkes kalan süreyi görsün diye local countdown var;
    // ancak faz ilerletmeyi SADECE OWNER yapar.
    if (timeRemaining > 0) {
      const t = setTimeout(() => setTimeRemaining((s) => s - 1), 1000)
      return () => clearTimeout(t)
    }

    if (
      timeRemaining === 0 &&
      currentPhase !== "LOBBY" &&
      currentPhase !== "END" &&
      currentPhase !== "CARD_DRAWING"
    ) {
      if (isGameOwner) {
        const t = setTimeout(() => advancePhaseRef.current(), 120)
        return () => clearTimeout(t)
      }
    }
  }, [timeRemaining, currentPhase, isGameOwner])

  // ---- RETURN ----
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
