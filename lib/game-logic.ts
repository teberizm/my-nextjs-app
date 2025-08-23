import type { Player, PlayerRole, GameSettings } from "./types"

export function assignRoles(players: Player[], settings: GameSettings): Player[] {
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5)
  const roles: PlayerRole[] = []

  // Add traitors
  for (let i = 0; i < settings.traitorCount; i++) {
    roles.push("TRAITOR")
  }

  // Add special roles
  const specialRoles: PlayerRole[] = ["DOCTOR", "SERIAL_KILLER", "BOMBER", "SURVIVOR"]
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
      description: "Her gece bir kişiyi koru. Kendini de koruyabilirsin.",
      color: "text-green-400",
      bgColor: "bg-green-400/20",
      icon: "⚕️",
      team: "INNOCENTS",
      nightAction: true,
    },
    SERIAL_KILLER: {
      name: "Seri Katil",
      description: "Tek başına kazan. Her gece birini öldür.",
      color: "text-purple-400",
      bgColor: "bg-purple-400/20",
      icon: "🔪",
      team: "SERIAL_KILLER",
      nightAction: true,
    },
    BOMBER: {
      name: "Bombacı",
      description: "Elendiğinde yanındaki oyuncuları da öldür.",
      color: "text-orange-400",
      bgColor: "bg-orange-400/20",
      icon: "💣",
      team: "INNOCENTS",
      nightAction: false,
    },
    SURVIVOR: {
      name: "Hayatta Kalan",
      description: "Sadece hayatta kal. Oyun sonuna kadar yaşa.",
      color: "text-yellow-400",
      bgColor: "bg-yellow-400/20",
      icon: "🛡️",
      team: "SURVIVOR",
      nightAction: false,
    },
  }

  return roleData[role]
}

export function getWinCondition(players: Player[]): { winner: string | null; gameEnded: boolean } {
  const alivePlayers = players.filter((p) => p.isAlive)
  const aliveTraitors = alivePlayers.filter((p) => p.role === "TRAITOR")
  const aliveInnocents = alivePlayers.filter((p) => p.role === "INNOCENT" || p.role === "DOCTOR" || p.role === "BOMBER")
  const aliveSerialKiller = alivePlayers.find((p) => p.role === "SERIAL_KILLER")
  const aliveSurvivor = alivePlayers.find((p) => p.role === "SURVIVOR")

  // Serial Killer wins if they're the last one standing or only with survivor
  if (aliveSerialKiller && (alivePlayers.length === 1 || (alivePlayers.length === 2 && aliveSurvivor))) {
    return { winner: "SERIAL_KILLER", gameEnded: true }
  }

  // Traitors win if they equal or outnumber innocents
  if (aliveTraitors.length >= aliveInnocents.length && aliveTraitors.length > 0) {
    return { winner: "TRAITORS", gameEnded: true }
  }

  // Innocents win if no traitors or serial killer left
  if (aliveTraitors.length === 0 && !aliveSerialKiller) {
    return { winner: "INNOCENTS", gameEnded: true }
  }

  return { winner: null, gameEnded: false }
}
