"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { assignRoles, getRoleInfo } from "@/lib/game-logic"
import type { GamePhase, Player, Game, GameSettings, NightAction, PlayerRole } from "@/lib/types"
import { wsClient } from "@/lib/websocket-client"

/** İstemci tarafı hook arayüzü (değişmedi) */
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

/** Yardımcılar */
function mergePlayersKeepRoles(local: Player[], incoming: Player[]): Player[] {
  const map = new Map(local.map(p => [p.id, p]))
  const out: Player[] = []
  for (const inc of incoming) {
    const cur = map.get(inc.id)
    if (cur) {
      // snapshot'tan gelen oyuncuda role/displayRole yoksa yerel rolleri koru
      out.push({
        ...inc,
        role: cur.role ?? inc.role,
        displayRole: cur.displayRole ?? inc.displayRole,
        survivorShields: cur.survivorShields ?? inc.survivorShields,
        hasShield: cur.hasShield ?? inc.hasShield,
        isOwner: inc.isOwner ?? cur.isOwner,
        isAlive: inc.isAlive ?? cur.isAlive,
      })
    } else {
      out.push(inc)
    }
  }
  // local'de olup incoming'te olmayanları (ör. WS'ten silinmiş) çıkar
  return out
}

function clamp(n: number, min = 0) {
  return n < min ? min : n
}

/** Ana hook */
export function useGameState(currentPlayerId: string): GameStateHook {
  // ----- Local state -----
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentPhase, setCurrentPhase] = useState<GamePhase>("LOBBY")
  const [phaseEndsAt, setPhaseEndsAt] = useState<number>(0) // epoch ms (server otoritesi)
  const [timeRemaining, setTimeRemaining] = useState(0)

  const [currentTurn, setCurrentTurn] = useState(1)
  const [nightActions, setNightActions] = useState<NightAction[]>([])
  const [votes, setVotes] = useState<Record<string, string>>({})

  // Aşağıdakiler client-side UI alanları; server tarafı henüz işlemiyor olabilir
  const [selectedCardDrawers, setSelectedCardDrawers] = useState<string[]>([])
  const [currentCardDrawer, setCurrentCardDrawer] = useState<string | null>(null)
  const [deathsThisTurn, setDeathsThisTurn] = useState<Player[]>([])
  const [deathLog, setDeathLog] = useState<Player[]>([])
  const [bombTargets, setBombTargets] = useState<string[]>([])
  const [playerNotes, setPlayerNotes] = useState<Record<string, string[]>>({})

  // Refs
  const tickRef = useRef<number | null>(null)

  const me = players.find(p => p.id === currentPlayerId)
  const isGameOwner = !!me?.isOwner

  // ----- Zamanlayıcı: server phaseEndsAt otoritesi -----
  useEffect(() => {
    // var olan timer'ı temizle
    if (tickRef.current) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
    if (!phaseEndsAt) {
      setTimeRemaining(0)
      return
    }
    const update = () => {
      const leftMs = phaseEndsAt - Date.now()
      setTimeRemaining(Math.max(0, Math.ceil(leftMs / 1000)))
    }
    update()
    tickRef.current = window.setInterval(update, 250) as unknown as number
    return () => {
      if (tickRef.current) {
        window.clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
  }, [phaseEndsAt])

  // ----- Not ekleyici (yalnızca UI/yerel) -----
  const addPlayerNote = useCallback((playerId: string, note: string) => {
    setPlayerNotes(prev => ({
      ...prev,
      [playerId]: [...(prev[playerId] || []), note],
    }))
  }, [])

  // ----- Oyunu başlat (yalnız owner çağırır) -----
  const startGame = useCallback((gamePlayers: Player[], settings: GameSettings) => {
    if (!gamePlayers || gamePlayers.length === 0) return

    if (isGameOwner) {
      // Roller tek kaynak: Sadece owner dağıtır ve WS ile herkese yollar
      const playersWithRoles = assignRoles(gamePlayers, settings)

      // Local state’i de aynı paketle doldur (ekran gecikmesiz)
      const newGame: Game = {
        id: Math.random().toString(36).slice(2),
        roomId: Math.random().toString(36).slice(2),
        phase: "ROLE_REVEAL",
        currentTurn: 1,
        settings,
        seed: Math.random().toString(36).slice(2),
        startedAt: new Date(),
      }
      setGame(newGame)
      setPlayers(playersWithRoles)
      setCurrentPhase("ROLE_REVEAL")
      // phaseEndsAt server'dan gelecek; burada set etmiyoruz

      // Herkese yayın: server bu payload’ı olduğu gibi yayınlıyor
      wsClient.sendEvent("GAME_STARTED" as any, {
        settings,
        players: playersWithRoles,
      })
    }
    // Owner olmayanlar herhangi bir şey yapmaz; GAME_STARTED’ı bekler
  }, [isGameOwner])

  // ----- Fazı manuel ilerlet (artık server otoritesi; minimal tut) -----
  const advancePhase = useCallback(() => {
    // Artık fazlar server tarafından ilerliyor.
    // Burada sadece UI akışında yerel geçiş gerekiyorsa yapılabilir; normalde no-op.
    // İstersen server’dan snapshot isteyebilirsin:
    wsClient.sendEvent("REQUEST_SNAPSHOT" as any, {})
  }, [])

  // ----- Gece aksiyonu gönder -----
  const submitNightAction = useCallback((
    playerId: string,
    targetId: string | null,
    actionType: "KILL" | "PROTECT" | "INVESTIGATE" | "BOMB_PLANT" | "BOMB_DETONATE",
  ) => {
    const actor = players.find(p => p.id === playerId)
    if (!actor || !actor.isAlive) return

    const action: NightAction = {
      playerId,
      targetId,
      actionType,
      timestamp: new Date(),
    }

    // UI hissiyatı için local’da da güncelle
    setNightActions(prev => [...prev.filter(a => a.playerId !== playerId), action])

    // Server’a gönder (otorite toplasın)
    wsClient.sendEvent("NIGHT_ACTION_SUBMITTED" as any, { action })
  }, [players])

  // ----- Oy gönder -----
  const submitVote = useCallback((voterId: string, targetId: string) => {
    const voter = players.find(p => p.id === voterId)
    if (!voter?.isAlive) return

    // Local’da da anında göster
    setVotes(prev => ({ ...prev, [voterId]: targetId }))

    // Server’a gönder (server yayınlar)
    wsClient.sendEvent("SUBMIT_VOTE" as any, { voterId, targetId })
  }, [players])

  // ----- Reset (UI tarafı) -----
  const resetGame = useCallback(() => {
    setGame(null)
    setPlayers([])
    setCurrentPhase("LOBBY")
    setPhaseEndsAt(0)
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

  // ----- WS olayları -----
  useEffect(() => {
    // Oyuncu listesi (lobideyken)
    const onPlayerList = (data: any) => {
      const incoming = data?.payload?.players || []
      setPlayers(prev => mergePlayersKeepRoles(prev, incoming))
    }

    // Oyun başladı: owner roller yolladı → hepsinde aynı set edelim
    const onGameStarted = (data: any) => {
      const payload = data?.payload || {}
      const incomingPlayers: Player[] = payload.players || []
      if (incomingPlayers.length) {
        setPlayers(incomingPlayers)
      }
      // Game local
      setGame({
        id: Math.random().toString(36).slice(2),
        roomId: Math.random().toString(36).slice(2),
        phase: "ROLE_REVEAL",
        currentTurn: 1,
        settings: payload.settings,
        seed: Math.random().toString(36).slice(2),
        startedAt: new Date(),
      })
      setCurrentPhase("ROLE_REVEAL")
      // phaseEndsAt server 'PHASE_CHANGED' ile gelecek
    }

    // Sunucunun authoritative faz bildirimi
    const onPhaseChanged = (data: any) => {
      const next = data?.payload?.phase as GamePhase | undefined
      const endsAt = data?.payload?.phaseEndsAt as number | undefined
      if (next) setCurrentPhase(next)
      if (endsAt) setPhaseEndsAt(endsAt)
    }

    // Sunucu snapshot: faz/oyuncular/aksiyonlar vs
    const onSnapshot = (data: any) => {
      const state = data?.payload?.state
      if (!state) return

      if (state.phase) setCurrentPhase(state.phase as GamePhase)
      if (state.phaseEndsAt) setPhaseEndsAt(state.phaseEndsAt as number)
      if (state.currentTurn) setCurrentTurn(state.currentTurn)

      if (Array.isArray(state.players)) {
        setPlayers(prev => mergePlayersKeepRoles(prev, state.players))
      }

      if (Array.isArray(state.nightActions)) {
        setNightActions(state.nightActions.map((a: any) => ({
          ...a,
          timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
        })))
      }

      if (state.votes) setVotes(state.votes)
      if (Array.isArray(state.deathsThisTurn)) setDeathsThisTurn(state.deathsThisTurn)
      if (Array.isArray(state.deathLog)) setDeathLog(state.deathLog)
      if (Array.isArray(state.bombTargets)) setBombTargets(state.bombTargets)
      if (state.playerNotes) setPlayerNotes(state.playerNotes)
    }

    const onNightActionsUpdated = (data: any) => {
      const actions = data?.payload?.actions || []
      setNightActions(actions.map((a: any) => ({
        ...a,
        timestamp: a.timestamp ? new Date(a.timestamp) : new Date(),
      })))
    }

    const onVotesUpdated = (data: any) => {
      const v = data?.payload?.votes || {}
      setVotes(v)
    }

    wsClient.on("PLAYER_LIST_UPDATED", onPlayerList)
    wsClient.on("GAME_STARTED", onGameStarted)
    wsClient.on("PHASE_CHANGED", onPhaseChanged)
    wsClient.on("STATE_SNAPSHOT", onSnapshot)
    wsClient.on("NIGHT_ACTIONS_UPDATED", onNightActionsUpdated)
    wsClient.on("VOTES_UPDATED", onVotesUpdated)

    // İlk bağlanışta snapshot iste (UI hemen senkron olsun)
    wsClient.sendEvent("REQUEST_SNAPSHOT" as any, {})

    return () => {
      wsClient.off("PLAYER_LIST_UPDATED", onPlayerList)
      wsClient.off("GAME_STARTED", onGameStarted)
      wsClient.off("PHASE_CHANGED", onPhaseChanged)
      wsClient.off("STATE_SNAPSHOT", onSnapshot)
      wsClient.off("NIGHT_ACTIONS_UPDATED", onNightActionsUpdated)
      wsClient.off("VOTES_UPDATED", onVotesUpdated)
    }
  }, [])

  // ----- Dönüş -----
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
