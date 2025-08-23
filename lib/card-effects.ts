import type { Player, Card } from "./types"

export interface CardEffectResult {
  success: boolean
  message: string
  affectedPlayers: string[]
  gameStateChanges: Record<string, any>
}

export function applyCardEffect(
  card: Card,
  actor: Player,
  target: Player | null,
  allPlayers: Player[],
  gameState: any,
): CardEffectResult {
  const { type, params } = card.effect

  switch (type) {
    case "mute_player":
      if (!target) {
        return { success: false, message: "Hedef oyuncu seçilmedi", affectedPlayers: [], gameStateChanges: {} }
      }
      return {
        success: true,
        message: `${target.name} ${params.duration} tur susturuldu`,
        affectedPlayers: [target.id],
        gameStateChanges: { [`player_${target.id}_muted`]: params.duration },
      }

    case "shield_player":
      if (!target) {
        return { success: false, message: "Hedef oyuncu seçilmedi", affectedPlayers: [], gameStateChanges: {} }
      }
      return {
        success: true,
        message: `${target.name} korunma kalkanı aldı`,
        affectedPlayers: [target.id],
        gameStateChanges: { [`player_${target.id}_shield`]: params.duration },
      }

    case "ban_vote":
      if (!target) {
        return { success: false, message: "Hedef oyuncu seçilmedi", affectedPlayers: [], gameStateChanges: {} }
      }
      return {
        success: true,
        message: `${target.name} oy kullanamayacak`,
        affectedPlayers: [target.id],
        gameStateChanges: { [`player_${target.id}_vote_banned`]: params.duration },
      }

    case "reveal_role":
      if (!target) {
        return { success: false, message: "Hedef oyuncu seçilmedi", affectedPlayers: [], gameStateChanges: {} }
      }
      return {
        success: true,
        message: `${target.name}'in rolü sadece sana gösterildi`,
        affectedPlayers: [actor.id],
        gameStateChanges: { [`reveal_${target.id}_to_${actor.id}`]: target.role },
      }

    case "double_kill_night":
      return {
        success: true,
        message: "Bu gece ek bir öldürme hakkın var",
        affectedPlayers: [actor.id],
        gameStateChanges: { [`player_${actor.id}_extra_kills`]: params.extraKills },
      }

    case "revive_player":
      const deadPlayers = allPlayers.filter((p) => !p.isAlive)
      if (deadPlayers.length === 0) {
        return { success: false, message: "Diriltilecek ölü oyuncu yok", affectedPlayers: [], gameStateChanges: {} }
      }

      const revivedPlayer =
        params.chooser === "random" ? deadPlayers[Math.floor(Math.random() * deadPlayers.length)] : target

      if (!revivedPlayer) {
        return { success: false, message: "Diriltilecek oyuncu bulunamadı", affectedPlayers: [], gameStateChanges: {} }
      }

      return {
        success: true,
        message: `${revivedPlayer.name} hayata döndürüldü!`,
        affectedPlayers: [revivedPlayer.id],
        gameStateChanges: { [`player_${revivedPlayer.id}_revived`]: true },
      }

    case "limit_speakers":
      return {
        success: true,
        message: `Sadece ${params.maxSpeakers} kişi konuşabilir`,
        affectedPlayers: [],
        gameStateChanges: { limited_speakers: params.maxSpeakers },
      }

    case "open_vote_mode":
      return {
        success: true,
        message: "Bu turda oylar açık verilecek",
        affectedPlayers: [],
        gameStateChanges: { open_voting: params.duration },
      }

    case "double_elimination_today":
      return {
        success: true,
        message: "Bu turda 2 kişi elenecek",
        affectedPlayers: [],
        gameStateChanges: { double_elimination: true },
      }

    case "no_elimination_today":
      return {
        success: true,
        message: "Bu turda kimse elenmeyecek",
        affectedPlayers: [],
        gameStateChanges: { no_elimination: true },
      }

    case "swap_roles_temp":
      const alivePlayers = allPlayers.filter((p) => p.isAlive)
      const swapTargets = alivePlayers.sort(() => Math.random() - 0.5).slice(0, params.swapCount * 2)

      return {
        success: true,
        message: `${params.swapCount} çift oyuncunun rolleri geçici olarak değişti`,
        affectedPlayers: swapTargets.map((p) => p.id),
        gameStateChanges: { role_swaps: swapTargets.map((p) => p.id) },
      }

    case "extend_time":
      return {
        success: true,
        message: `${params.extraTime} saniye ek süre eklendi`,
        affectedPlayers: [],
        gameStateChanges: { time_extension: params.extraTime },
      }

    default:
      return {
        success: false,
        message: "Bilinmeyen kart etkisi",
        affectedPlayers: [],
        gameStateChanges: {},
      }
  }
}

export function getCardEffectDescription(card: Card): string {
  const { type, params } = card.effect

  switch (type) {
    case "mute_player":
      return `Bir oyuncuyu ${params.duration} tur sustur`
    case "shield_player":
      return `Bir oyuncuya ${params.duration} tur koruma ver`
    case "ban_vote":
      return `Bir oyuncunun ${params.duration} tur oy kullanmasını engelle`
    case "reveal_role":
      return "Bir oyuncunun rolünü sadece sana göster"
    case "double_kill_night":
      return "Bu gece ek bir öldürme hakkı kazan"
    case "revive_player":
      return "Rastgele bir ölü oyuncuyu hayata döndür"
    case "limit_speakers":
      return `Sadece ${params.maxSpeakers} kişinin konuşmasına izin ver`
    case "open_vote_mode":
      return "Bu turda oylar açık verilsin"
    case "double_elimination_today":
      return "Bu turda 2 kişi elensin"
    case "no_elimination_today":
      return "Bu turda kimse elenmesin"
    case "swap_roles_temp":
      return `${params.swapCount} çift oyuncunun rollerini geçici değiştir`
    case "extend_time":
      return `${params.extraTime} saniye ek süre ekle`
    default:
      return "Bilinmeyen etki"
  }
}
