"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Users,
  Crown,
  Copy,
  QrCode,
  Settings,
  Play,
  UserX,
  Lock,
  Unlock,
  Share2,
  Heart,
} from "lucide-react"

import type { Room, Player, GameSettings } from "@/lib/types"
import { wsClient } from "@/lib/websocket-client" // projenizdeki doğru yolu kullanın

// -----------------------------------------------------
// Yardımcılar
// -----------------------------------------------------

/** Özel görünüm: “boylu1907” (trim/lower ve alternatif alanlar) */
function isSpecialName(p: any) {
  const c = [p?.name, p?.username, p?.displayName, p?.nick]
    .map((v) => (v ?? "").toString().trim().toLowerCase())
  return c.includes("boylu1907")
}

/** DOLU kalp çerçevesi – daha büyük ve belirgin */
function HeartBorder() {
  const top = Array.from({ length: 12 }, (_, i) => i)
  const bottom = top
  const left = Array.from({ length: 8 }, (_, i) => i)
  const right = left
  const cls =
    "absolute w-5 h-5 text-yellow-300 drop-shadow-[0_0_6px_rgba(255,230,0,0.85)]"

  return (
    <div className="pointer-events-none absolute inset-0">
      {top.map((i) => (
        <Heart
          key={`t-${i}`}
          className={cls}
          style={{
            top: -10,
            left: `${(i + 0.5) * (100 / 12)}%`,
            transform: "translateX(-50%)",
          }}
          fill="currentColor"
          stroke="none"
        />
      ))}
      {bottom.map((i) => (
        <Heart
          key={`b-${i}`}
          className={cls}
          style={{
            bottom: -10,
            left: `${(i + 0.5) * (100 / 12)}%`,
            transform: "translateX(-50%)",
          }}
          fill="currentColor"
          stroke="none"
        />
      ))}
      {left.map((i) => (
        <Heart
          key={`l-${i}`}
          className={cls}
          style={{
            left: -10,
            top: `${(i + 0.5) * (100 / 8)}%`,
            transform: "translateY(-50%)",
          }}
          fill="currentColor"
          stroke="none"
        />
      ))}
      {right.map((i) => (
        <Heart
          key={`r-${i}`}
          className={cls}
          style={{
            right: -10,
            top: `${(i + 0.5) * (100 / 8)}%`,
            transform: "translateY(-50%)",
          }}
          fill="currentColor"
          stroke="none"
        />
      ))}
    </div>
  )
}

function getPlayerInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

// -----------------------------------------------------
// Props
// -----------------------------------------------------
interface RoomLobbyProps {
  room: Room
  currentPlayer: Player
  gameSettings: GameSettings
  onStartGame: () => void
  onKickPlayer: (playerId: string) => void
  onToggleLock: () => void
  onUpdateSettings: (settings: GameSettings) => void
}

// -----------------------------------------------------
// Bileşen
// -----------------------------------------------------
export function RoomLobby({
  room,
  currentPlayer,
  gameSettings,
  onStartGame,
  onKickPlayer,
  onToggleLock,
  onUpdateSettings,
}: RoomLobbyProps) {
  const [showQR, setShowQR] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [tempSettings, setTempSettings] = useState<GameSettings>(gameSettings)

  const canStartGame = useMemo(
    () => currentPlayer.isOwner && room.players.length >= 4,
    [currentPlayer.isOwner, room.players.length],
  )

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(room.inviteCode)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 1800)
    } catch (_) {}
  }

  const shareRoom = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Odaya katıl",
          text: `Oda kodu: ${room.inviteCode}`,
          url: typeof window !== "undefined" ? window.location.href : "",
        })
      } else {
        await copyRoomCode()
      }
    } catch (_) {}
  }

  const handleSettingsChange = (key: keyof GameSettings, value: any) => {
    setTempSettings((prev) => ({ ...prev, [key]: value }))
  }

  const saveSettings = () => {
    onUpdateSettings(tempSettings)
    wsClient.sendEvent("UPDATE_SETTINGS" as any, { settings: tempSettings })
    setShowSettings(false)
  }

  const resetSettings = () => setTempSettings(gameSettings)

  // ---------------------------------------------------
  // Render
  // ---------------------------------------------------
  return (
    <div className="min-h-screen bg-background p-4">
      {/* Üst bilgi */}
      <div className="max-w-md mx-auto mb-6">
        <Card className="neon-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="space-y-2">
            <CardTitle className="font-work-sans flex items-center justify-between">
              <span>{room.name ?? "Oyun Odası"}</span>
              <Users className="w-5 h-5 text-accent" />
            </CardTitle>
            <CardDescription>
              Oda kodu:{" "}
              <span className="font-mono text-primary">{room.inviteCode}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Button onClick={copyRoomCode} variant="secondary" size="sm">
              <Copy className="w-4 h-4 mr-2" />
              {copiedCode ? "Kopyalandı!" : "Kodu Kopyala"}
            </Button>
            <Button onClick={() => setShowQR(true)} variant="secondary" size="sm">
              <QrCode className="w-4 h-4 mr-2" />
              QR
            </Button>
            <Button onClick={shareRoom} variant="secondary" size="sm">
              <Share2 className="w-4 h-4 mr-2" />
              Paylaş
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Button
                onClick={onToggleLock}
                variant={room.isLocked ? "destructive" : "outline"}
                size="sm"
                title={room.isLocked ? "Odayı aç" : "Odayı kilitle"}
              >
                {room.isLocked ? (
                  <>
                    <Unlock className="w-4 h-4 mr-2" /> Aç
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 mr-2" /> Kilitle
                  </>
                )}
              </Button>
              {currentPlayer.isOwner && (
                <Button
                  onClick={() => setShowSettings(true)}
                  variant="outline"
                  size="sm"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Ayarlar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Oyuncu listesi */}
      <div className="max-w-md mx-auto mb-6">
        <Card className="neon-border bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between font-work-sans">
              <span>
                Oyuncular ({room.players.length}/{room.maxPlayers})
              </span>
              {room.isLocked && <Lock className="w-4 h-4 text-accent" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {room.players.map((p) => {
                const special = isSpecialName(p)
                const initials = getPlayerInitials(p.name ?? "")

                return (
                  <div
                    key={p.id}
                    className={[
                      "relative overflow-visible flex items-center justify-between p-3 rounded-lg border",
                      special
                        ? "bg-[#001a4d] border-yellow-400/60 ring-1 ring-yellow-400/50"
                        : "bg-muted/20 border-border/50",
                    ].join(" ")}
                  >
                    {special && <HeartBorder />}

                    <div className="flex items-center gap-3">
                      <Avatar
                        className={[
                          "w-10 h-10 border-2",
                          special ? "border-yellow-300" : "border-primary/30",
                        ].join(" ")}
                      >
                        <AvatarFallback
                          className={
                            special
                              ? "bg-[#0a2a6b] text-yellow-300 font-semibold"
                              : "bg-primary/20 text-primary font-semibold"
                          }
                        >
                          {initials}
                        </AvatarFallback>
                      </Avatar>

                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={special ? "font-medium text-yellow-300" : "font-medium"}
                          >
                            {p.name}
                          </span>
                          {p.isOwner && (
                            <Crown
                              className={
                                special ? "w-4 h-4 text-yellow-300" : "w-4 h-4 text-accent"
                              }
                            />
                          )}
                        </div>

                        <div className="flex gap-1">
                          <Badge
                            variant="secondary"
                            className={
                              special
                                ? "text-xs bg-[#0a2a6b] text-yellow-200 border-0"
                                : "text-xs"
                            }
                          >
                            {p.isOwner ? "Oda Sahibi" : "Oyuncu"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {currentPlayer.isOwner && !p.isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onKickPlayer(p.id)}
                        className={
                          special
                            ? "text-yellow-300 hover:bg-yellow-300/10"
                            : "text-destructive hover:bg-destructive/20"
                        }
                        title="Oyuncuyu at"
                      >
                        <UserX className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Başlat/Ayarlar */}
      <div className="max-w-md mx-auto">
        <Card className="neon-border bg-card/50 backdrop-blur-sm">
          <CardContent className="py-6 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Oyun başlatmak için en az 4 oyuncu gerekir.
            </div>
            <Button
              size="sm"
              disabled={!canStartGame}
              onClick={onStartGame}
              className="bg-primary"
            >
              <Play className="w-4 h-4 mr-2" />
              Oyunu Başlat
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* QR diyaloğu */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR Kod</DialogTitle>
            <DialogDescription>Odaya katılmak için okut.</DialogDescription>
          </DialogHeader>
          <div className="p-4 text-center">
            {/* Buraya kendi QR bileşenini yerleştir */}
            <div className="rounded-lg bg-muted/20 border p-10">QR PLACEHOLDER</div>
            <div className="mt-3 text-xs text-muted-foreground">
              Kod: <span className="font-mono">{room.inviteCode}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ayarlar diyaloğu */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Oyun Ayarları</DialogTitle>
            <DialogDescription>Gün/gece süreleri ve roller.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Night Duration */}
            <div>
              <Label className="text-sm">Gece Süresi (sn)</Label>
              <div className="flex items-center gap-3">
                <Slider
                  defaultValue={[tempSettings.nightDuration ?? 60]}
                  min={15}
                  max={180}
                  step={5}
                  onValueChange={(v) => handleSettingsChange("nightDuration", v[0])}
                />
                <span className="w-10 text-right text-sm">
                  {tempSettings.nightDuration ?? 60}
                </span>
              </div>
            </div>

            {/* Day Duration */}
            <div>
              <Label className="text-sm">Gündüz Süresi (sn)</Label>
              <div className="flex items-center gap-3">
                <Slider
                  defaultValue={[tempSettings.dayDuration ?? 120]}
                  min={30}
                  max={300}
                  step={10}
                  onValueChange={(v) => handleSettingsChange("dayDuration", v[0])}
                />
                <span className="w-10 text-right text-sm">
                  {tempSettings.dayDuration ?? 120}
                </span>
              </div>
            </div>

            {/* Vote Duration */}
            <div>
              <Label className="text-sm">Oylama Süresi (sn)</Label>
              <div className="flex items-center gap-3">
                <Slider
                  defaultValue={[tempSettings.voteDuration ?? 45]}
                  min={15}
                  max={180}
                  step={5}
                  onValueChange={(v) => handleSettingsChange("voteDuration", v[0])}
                />
                <span className="w-10 text-right text-sm">
                  {tempSettings.voteDuration ?? 45}
                </span>
              </div>
            </div>

            {/* Card Draw count */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Kart Çekme</Label>
                <Select
                  value={String(tempSettings.cardDrawCount ?? 1)}
                  onValueChange={(v) =>
                    handleSettingsChange("cardDrawCount", Number(v))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Yok</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm">Hain Sayısı</Label>
                <Select
                  value={String(tempSettings.traitorCount ?? 0)}
                  onValueChange={(v) =>
                    handleSettingsChange("traitorCount", Number(v))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Special roles */}
            <div>
              <Label className="text-sm">Özel Rol Sayısı</Label>
              <Select
                value={String(tempSettings.specialRoleCount ?? 0)}
                onValueChange={(v) =>
                  handleSettingsChange("specialRoleCount", Number(v))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={resetSettings}>
                Varsayılan
              </Button>
              <div className="space-x-2">
                <Button variant="outline" onClick={() => setShowSettings(false)}>
                  İptal
                </Button>
                <Button onClick={saveSettings}>Kaydet</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
