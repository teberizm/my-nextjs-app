// Game State Types
export type GamePhase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "NIGHT"
  | "NIGHT_RESULTS"
  | "DEATH_ANNOUNCEMENT"
  | "CARD_DRAWING"
  | "DAY_DISCUSSION"
  | "VOTE"
  | "RESOLVE"
  | "END"

export type PlayerRole =
  | "DOCTOR"
  | "DELI"
  | "GUARDIAN"
  | "EVIL_GUARDIAN"
  | "WATCHER"
  | "EVIL_WATCHER"
  | "DETECTIVE"
  | "EVIL_DETECTIVE"
  | "BOMBER"
  | "SURVIVOR"

export interface Player {
  id: string
  name: string
  role?: PlayerRole
  isOwner: boolean
  isAlive: boolean
  isMuted: boolean
  hasShield: boolean
  connectedAt: Date
}

export interface Room {
  id: string
  inviteCode: string
  ownerId: string
  players: Player[]
  maxPlayers: number
  isLocked: boolean
  createdAt: Date
}

export interface GameSettings {
  traitorCount: number
  specialRoleCount: number
  nightDuration: number
  dayDuration: number
  voteDuration: number
  cardProfile: "STANDARD" | "CHAOS" | "QUICK"
}

export interface Game {
  id: string
  roomId: string
  phase: GamePhase
  currentTurn: number
  settings: GameSettings
  seed: string
  startedAt?: Date
  endedAt?: Date
  winningSide?: "INNOCENTS" | "TRAITORS" | "BOMBER"
}

export interface Card {
  id: string
  title: string
  category: "INDIVIDUAL" | "TARGET" | "GROUP" | "CHAOS"
  phase: GamePhase[]
  visibility: "PUBLIC" | "PRIVATE_TO_ACTOR" | "PRIVATE_TO_TARGET"
  effect: {
    type: string
    params: Record<string, any>
  }
  oncePerGame: boolean
  weight: number
}

export interface GameState {
  room: Room | null
  game: Game | null
  currentPlayer: Player | null
  phase: GamePhase
  timeRemaining: number
  selectedPlayers: string[]
  lastCardUsed: Card | null
}

export interface NightAction {
  playerId: string
  targetId: string | null
  actionType: "KILL" | "PROTECT" | "INVESTIGATE"
  timestamp: Date
}

export interface GameEvent {
  id: string
  gameId: string
  type: "PLAYER_KILLED" | "PLAYER_PROTECTED" | "PLAYER_REVIVED" | "CARD_USED" | "VOTE_CAST"
  actorId?: string
  targetId?: string
  data?: Record<string, any>
  timestamp: Date
}
