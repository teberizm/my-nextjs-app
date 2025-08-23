import type { Card } from "./types"

export const CARD_DATABASE: Card[] = [
  // Individual Cards
  {
    id: "KRT-0001",
    title: "Suskunluk",
    category: "INDIVIDUAL",
    phase: ["DAY", "VOTE"],
    visibility: "PUBLIC",
    effect: {
      type: "mute_player",
      params: { duration: 1, chooser: "actor" },
    },
    oncePerGame: false,
    weight: 1,
  },
  {
    id: "KRT-0002",
    title: "Koruma Kalkanı",
    category: "INDIVIDUAL",
    phase: ["DAY"],
    visibility: "PRIVATE_TO_TARGET",
    effect: {
      type: "shield_player",
      params: { duration: 1, chooser: "actor" },
    },
    oncePerGame: false,
    weight: 1,
  },
  {
    id: "KRT-0003",
    title: "Oy Yasağı",
    category: "INDIVIDUAL",
    phase: ["DAY"],
    visibility: "PUBLIC",
    effect: {
      type: "ban_vote",
      params: { duration: 1, chooser: "actor" },
    },
    oncePerGame: false,
    weight: 1,
  },

  // Target Cards
  {
    id: "KRT-0010",
    title: "Gizli Bilgi",
    category: "TARGET",
    phase: ["DAY"],
    visibility: "PRIVATE_TO_ACTOR",
    effect: {
      type: "reveal_role",
      params: { chooser: "actor" },
    },
    oncePerGame: false,
    weight: 1,
  },
  {
    id: "KRT-0011",
    title: "Çifte Vuruş",
    category: "TARGET",
    phase: ["NIGHT"],
    visibility: "PRIVATE_TO_ACTOR",
    effect: {
      type: "double_kill_night",
      params: { extraKills: 1 },
    },
    oncePerGame: true,
    weight: 0.5,
  },
  {
    id: "KRT-0012",
    title: "Diriliş",
    category: "TARGET",
    phase: ["DAY"],
    visibility: "PUBLIC",
    effect: {
      type: "revive_player",
      params: { chooser: "random" },
    },
    oncePerGame: true,
    weight: 0.3,
  },

  // Group Cards
  {
    id: "KRT-0020",
    title: "Toplu Suskunluk",
    category: "GROUP",
    phase: ["DAY"],
    visibility: "PUBLIC",
    effect: {
      type: "limit_speakers",
      params: { maxSpeakers: 3, chooser: "owner" },
    },
    oncePerGame: true,
    weight: 0.7,
  },
  {
    id: "KRT-0021",
    title: "Açık Oylama",
    category: "GROUP",
    phase: ["DAY"],
    visibility: "PUBLIC",
    effect: {
      type: "open_vote_mode",
      params: { duration: 1 },
    },
    oncePerGame: false,
    weight: 1,
  },
  {
    id: "KRT-0022",
    title: "Çifte Eleme",
    category: "GROUP",
    phase: ["VOTE"],
    visibility: "PUBLIC",
    effect: {
      type: "double_elimination_today",
      params: {},
    },
    oncePerGame: true,
    weight: 0.4,
  },

  // Chaos Cards
  {
    id: "KRT-0030",
    title: "Rol Karmaşası",
    category: "CHAOS",
    phase: ["DAY"],
    visibility: "PUBLIC",
    effect: {
      type: "swap_roles_temp",
      params: { duration: 1, swapCount: 2 },
    },
    oncePerGame: true,
    weight: 0.2,
  },
  {
    id: "KRT-0031",
    title: "Eleme Yok",
    category: "CHAOS",
    phase: ["VOTE"],
    visibility: "PUBLIC",
    effect: {
      type: "no_elimination_today",
      params: {},
    },
    oncePerGame: true,
    weight: 0.5,
  },
  {
    id: "KRT-0032",
    title: "Zaman Durması",
    category: "CHAOS",
    phase: ["DAY", "VOTE"],
    visibility: "PUBLIC",
    effect: {
      type: "extend_time",
      params: { extraTime: 60 },
    },
    oncePerGame: false,
    weight: 0.8,
  },
]

export function getCardById(cardId: string): Card | null {
  return CARD_DATABASE.find((card) => card.id === cardId) || null
}

export function getAvailableCards(phase: string, usedCards: string[]): Card[] {
  return CARD_DATABASE.filter(
    (card) => card.phase.includes(phase as any) && (!card.oncePerGame || !usedCards.includes(card.id)),
  )
}

export function getCardsByCategory(category: string): Card[] {
  return CARD_DATABASE.filter((card) => card.category === category)
}
