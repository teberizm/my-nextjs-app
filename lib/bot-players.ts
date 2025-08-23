import type { Player } from "./types"

export const BOT_NAMES = [
  "AI-Alpha",
  "CyberBot",
  "NeonGhost",
  "QuantumX",
  "DataMind",
  "HoloBot",
  "SynthWave",
  "PixelSage",
  "CodePhantom",
  "TechSpirit",
]

export function createBotPlayer(name: string, id: string): Player {
  return {
    id,
    name,
    isOwner: false,
    isAlive: true,
    isMuted: false,
    isShielded: false,
    role: null,
    isBot: true,
    joinedAt: new Date(),
  }
}

export function generateBotPlayers(count: number): Player[] {
  const shuffledNames = [...BOT_NAMES].sort(() => Math.random() - 0.5)
  return shuffledNames.slice(0, count).map((name, index) => createBotPlayer(name, `bot-${index + 1}`))
}

export class BotBehavior {
  private static getRandomDelay(min = 2000, max = 8000): number {
    return Math.random() * (max - min) + min
  }

  static simulateVote(botPlayer: Player, alivePlayers: Player[]): Promise<string | null> {
    return new Promise((resolve) => {
      setTimeout(
        () => {
          const votableTargets = alivePlayers.filter((p) => p.id !== botPlayer.id && p.isAlive)
          if (votableTargets.length === 0) {
            resolve(null)
            return
          }

          // Bot voting logic - slightly favor voting for other bots to keep humans in game longer
          const target =
            Math.random() < 0.3
              ? votableTargets.find((p) => p.isBot) || votableTargets[Math.floor(Math.random() * votableTargets.length)]
              : votableTargets[Math.floor(Math.random() * votableTargets.length)]

          resolve(target.id)
        },
        this.getRandomDelay(1000, 5000),
      )
    })
  }

  static simulateNightAction(botPlayer: Player, alivePlayers: Player[]): Promise<string | null> {
    return new Promise((resolve) => {
      setTimeout(
        () => {
          if (!botPlayer.role) {
            resolve(null)
            return
          }

          const targets = alivePlayers.filter((p) => p.id !== botPlayer.id && p.isAlive)
          if (targets.length === 0) {
            resolve(null)
            return
          }

          let target: Player | null = null

          switch (botPlayer.role.id) {
            case "doctor":
              // Doctor protects randomly, slight preference for humans
              target =
                Math.random() < 0.6
                  ? targets.find((p) => !p.isBot) || targets[Math.floor(Math.random() * targets.length)]
                  : targets[Math.floor(Math.random() * targets.length)]
              break

            case "detective":
              // Detective investigates randomly
              target = targets[Math.floor(Math.random() * targets.length)]
              break

            case "traitor":
              // Traitor eliminates, slight preference for humans
              target =
                Math.random() < 0.7
                  ? targets.find((p) => !p.isBot) || targets[Math.floor(Math.random() * targets.length)]
                  : targets[Math.floor(Math.random() * targets.length)]
              break
          }

          resolve(target?.id || null)
        },
        this.getRandomDelay(2000, 6000),
      )
    })
  }
}
