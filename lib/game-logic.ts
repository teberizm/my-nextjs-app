import type { Player, PlayerRole, GameSettings } from "./types"

export function isTraitorRole(role: PlayerRole) {
  return ["TRAITOR", "EVIL_GUARDIAN", "EVIL_WATCHER", "EVIL_DETECTIVE"].includes(role)
}

export function isInnocentRole(role: PlayerRole) {
  return ["INNOCENT", "DOCTOR", "DELI", "GUARDIAN", "WATCHER", "DETECTIVE"].includes(role)
}

export function assignRoles(players: Player[], settings: GameSettings): Player[] {
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5)
  const roles: PlayerRole[] = []

  // Add traitors
  for (let i = 0; i < settings.traitorCount; i++) {
    roles.push("TRAITOR")
  }

  // Add special roles
  const specialRoles: PlayerRole[] = [
    "DOCTOR",
    "DELI",
    "GUARDIAN",
    "EVIL_GUARDIAN",
    "WATCHER",
    "EVIL_WATCHER",
    "DETECTIVE",
    "EVIL_DETECTIVE",
    "BOMBER",
    "SURVIVOR",
  ]
  const selectedSpecialRoles = specialRoles.sort(() => Math.random() - 0.5).slice(0, settings.specialRoleCount)

  roles.push(...selectedSpecialRoles)

  // Fill remaining with innocents
  while (roles.length < players.length) {
    roles.push("INNOCENT")
  }

  // Shuffle roles and assign
  const shuffledRoles = roles.sort(() => Math.random() - 0.5)

  return shuffledPlayers.map((player, index) => ({
    ...player,
    role: shuffledRoles[index],
  }))
}

export function getRoleInfo(role: PlayerRole) {
  const roleData = {
    INNOCENT: {
      name: "Masum",
      description: "Hainleri bul ve onları elendir. Çoğunluk kazanır.",
      color: "text-blue-400",
      bgColor: "bg-blue-400/20",
      icon: "👤",
      team: "INNOCENTS",
      nightAction: false,
    },
    TRAITOR: {
      name: "Hain",
      description: "Gece masumları öldür. Sayıları eşitlene kadar saklan.",
      color: "text-red-400",
      bgColor: "bg-red-400/20",
      icon: "🗡️",
      team: "TRAITORS",
      nightAction: true,
    },
    DOCTOR: {
      name: "Doktor",
      description: "Bir kişiyi seçer. Ölü ise diriltir.",
      color: "text-green-400",
      bgColor: "bg-green-400/20",
      icon: "⚕️",
      team: "INNOCENTS",
      nightAction: true,
    },
    DELI: {
      name: "Deli",
      description: "Masum görünümlü; verdiğin bilgiler her zaman yanlış.",
      color: "text-pink-400",
      bgColor: "bg-pink-400/20",
      icon: "🤪",
      team: "INNOCENTS",
      nightAction: false,
    },
    GUARDIAN: {
      name: "Gardiyan",
      description: "Bir kişiyi seçer. O gece rolünü kullanamaz.",
      color: "text-blue-400",
      bgColor: "bg-blue-400/20",
      icon: "🛡️",
      team: "INNOCENTS",
      nightAction: true,
    },
    EVIL_GUARDIAN: {
      name: "Hain Gardiyan",
      description: "Bir kişiyi engelleyebilir veya hainlerle öldürmeye katılabilir.",
      color: "text-red-400",
      bgColor: "bg-red-400/20",
      icon: "🛡️",
      team: "TRAITORS",
      nightAction: true,
    },
    WATCHER: {
      name: "Gözcü",
      description: "Bir kişiyi seçer. Ziyaret edenleri görür.",
      color: "text-yellow-400",
      bgColor: "bg-yellow-400/20",
      icon: "👁️",
      team: "INNOCENTS",
      nightAction: true,
    },
    EVIL_WATCHER: {
      name: "Hain Gözcü",
      description: "Bir kişiyi izleyebilir veya hainlerle öldürmeye katılabilir.",
      color: "text-red-400",
      bgColor: "bg-red-400/20",
      icon: "👁️",
      team: "TRAITORS",
      nightAction: true,
    },
    DETECTIVE: {
      name: "Dedektif",
      description: "Bir kişiyi seçer. Sistem iki rol gösterir, biri doğru biri yanlış.",
      color: "text-indigo-400",
      bgColor: "bg-indigo-400/20",
      icon: "🕵️",
      team: "INNOCENTS",
      nightAction: true,
    },
    EVIL_DETECTIVE: {
      name: "Hain Dedektif",
      description: "Birini soruşturabilir veya hainlerle öldürmeye katılabilir.",
      color: "text-red-400",
      bgColor: "bg-red-400/20",
      icon: "🕵️",
      team: "TRAITORS",
      nightAction: true,
    },
    BOMBER: {
      name: "Bombacı",
      description: "Bomba yerleştirip istediğinde patlatır. Tek başına kalırsa kazanır.",
      color: "text-orange-400",
      bgColor: "bg-orange-400/20",
      icon: "💣",
      team: "BOMBER",
      nightAction: false,
    },
    SURVIVOR: {
      name: "Survivor",
      description: "Oyun sonuna kadar hayatta kal. İki kez kendini koru.",
      color: "text-yellow-400",
      bgColor: "bg-yellow-400/20",
      icon: "🛡️",
      team: "SURVIVOR",
      nightAction: true,
    },
  }

  return roleData[role]
}

export function getWinCondition(players: Player[]): { winner: string | null; gameEnded: boolean } {
  const alivePlayers = players.filter((p) => p.isAlive)
  const aliveTraitors = alivePlayers.filter((p) => isTraitorRole(p.role!))
  const aliveInnocents = alivePlayers.filter((p) => isInnocentRole(p.role!))
  const aliveBomber = alivePlayers.find((p) => p.role === "BOMBER")

  // Bomber wins if last one standing
  if (aliveBomber && alivePlayers.length === 1) {
    return { winner: "BOMBER", gameEnded: true }
  }

  // Traitors win if they equal or outnumber innocents
  if (aliveTraitors.length >= aliveInnocents.length && aliveTraitors.length > 0) {
    return { winner: "TRAITORS", gameEnded: true }
  }

  // Innocents win if no traitors left
  if (aliveTraitors.length === 0) {
    return { winner: "INNOCENTS", gameEnded: true }
  }

  return { winner: null, gameEnded: false }
}
