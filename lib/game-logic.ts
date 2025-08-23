import type { Player, PlayerRole, GameSettings } from "./types"

export function isTraitorRole(role: PlayerRole) {
  return ["EVIL_GUARDIAN", "EVIL_WATCHER", "EVIL_DETECTIVE"].includes(role)
}

export function getBaseRole(role: PlayerRole): PlayerRole {
  switch (role) {
    case "EVIL_GUARDIAN":
      return "GUARDIAN"
    case "EVIL_WATCHER":
      return "WATCHER"
    case "EVIL_DETECTIVE":
      return "DETECTIVE"
    default:
      return role
  }
}

export function isInnocentRole(role: PlayerRole) {
  return ["DOCTOR", "DELI", "GUARDIAN", "WATCHER", "DETECTIVE"].includes(role)
}

export function isSpecialRole(role: PlayerRole) {
  return ["BOMBER", "SURVIVOR"].includes(role)
}

export function assignRoles(players: Player[], settings: GameSettings): Player[] {
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5)
  const roles: PlayerRole[] = []

  const innocentRoles: PlayerRole[] = ["DOCTOR", "DELI", "GUARDIAN", "WATCHER", "DETECTIVE"]
  const specialRoles: PlayerRole[] = ["BOMBER", "SURVIVOR"]

  const specialCount = Math.min(settings.specialRoleCount, players.length)
  for (let i = 0; i < specialCount; i++) {
    const role = specialRoles[Math.floor(Math.random() * specialRoles.length)]
    roles.push(role)
  }

  while (roles.length < players.length) {
    const role = innocentRoles[Math.floor(Math.random() * innocentRoles.length)]
    roles.push(role)
  }

  // Convert some roles to traitor variants
  const convertibleIndices = roles
    .map((role, index) => ({ role, index }))
    .filter((r) => ["GUARDIAN", "WATCHER", "DETECTIVE"].includes(r.role))
  const traitorSlots = convertibleIndices.sort(() => Math.random() - 0.5).slice(0, settings.traitorCount)
  traitorSlots.forEach(({ role, index }) => {
    if (role === "GUARDIAN") roles[index] = "EVIL_GUARDIAN"
    if (role === "WATCHER") roles[index] = "EVIL_WATCHER"
    if (role === "DETECTIVE") roles[index] = "EVIL_DETECTIVE"
  })

  const shuffledRoles = roles.sort(() => Math.random() - 0.5)

  return shuffledPlayers.map((player, index) => {
    const role = shuffledRoles[index]
    if (role === "DELI") {
      const innocentRoles: PlayerRole[] = ["DOCTOR", "GUARDIAN", "WATCHER", "DETECTIVE"]
      const fakeRole = innocentRoles[Math.floor(Math.random() * innocentRoles.length)]
      return { ...player, role, displayRole: fakeRole, survivorShields: 0 }
    }
    return {
      ...player,
      role,
      displayRole: role,
      survivorShields: role === "SURVIVOR" ? 2 : 0,
    }
  })
}

export function getRoleInfo(role: PlayerRole) {
  const roleData = {
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
      nightAction: true,
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
  const aliveBomber = alivePlayers.find((p) => p.role === "BOMBER")
  const aliveNonTraitors = alivePlayers.filter(
    (p) => !isTraitorRole(p.role!) && p.role !== "BOMBER",
  )

  if (aliveBomber) {
    if (alivePlayers.length === 1) {
      return { winner: "BOMBER", gameEnded: true }
    }
    if (aliveTraitors.length === 0 && aliveNonTraitors.length === 1) {
      return { winner: "BOMBER", gameEnded: true }
    }
  }

  if (
    !aliveBomber &&
    aliveTraitors.length >= aliveNonTraitors.length &&
    aliveTraitors.length > 0
  ) {
    return { winner: "TRAITORS", gameEnded: true }
  }

  if (!aliveBomber && aliveTraitors.length === 0) {
    return { winner: "INNOCENTS", gameEnded: true }
  }

  return { winner: null, gameEnded: false }
}
