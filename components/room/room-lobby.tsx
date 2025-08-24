"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Users, Crown, Copy, QrCode, Settings, Play, UserX, Lock, Unlock, Share2 } from "lucide-react"
import type { Room, Player, GameSettings } from "@/lib/types"

interface RoomLobbyProps {
  room: Room
  currentPlayer: Player
  gameSettings: GameSettings
  onStartGame: () => void
  onKickPlayer: (playerId: string) => void
  onToggleLock: () => void
  onUpdateSettings: (settings: GameSettings) => void
}

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

  const copyRoomCode = async () => {
    await navigator.clipboard.writeText(room.inviteCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const shareRoom = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "HoloDeck Oyun Odası",
        text: `HoloDeck oyununa katıl! Oda kodu: ${room.inviteCode}`,
        url: window.location.href,
      })
    }
  }

  const getPlayerInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const canStartGame = room.players.length >= 4 && currentPlayer.isOwner

  const handleSettingsChange = (key: keyof GameSettings, value: any) => {
    setTempSettings((prev) => ({ ...prev, [key]: value }))
  }

  const saveSettings = () => {
    onUpdateSettings(tempSettings)
    setShowSettings(false)
  }

  const resetSettings = () => {
    setTempSettings(gameSettings)
  }

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="max-w-md mx-auto mb-6">
        <Card className="neon-border bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2 font-work-sans">
              <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              Oyun Odası
            </CardTitle>
            <CardDescription>
              <div className="flex items-center justify-center gap-2 text-lg font-mono">
                <span className="text-foreground font-bold tracking-wider">{room.inviteCode}</span>
                <Button variant="ghost" size="sm" onClick={copyRoomCode} className="h-6 w-6 p-0 hover:bg-primary/20">
                  <Copy className={`w-3 h-3 ${copiedCode ? "text-green-400" : "text-muted-foreground"}`} />
                </Button>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Room Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQR(true)}
                className="flex-1 border-secondary text-secondary hover:bg-secondary/10"
              >
                <QrCode className="w-4 h-4 mr-2" />
                QR Göster
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={shareRoom}
                className="flex-1 border-accent text-accent hover:bg-accent/10 bg-transparent"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Paylaş
              </Button>
            </div>

            {/* Owner Controls */}
            {currentPlayer.isOwner && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onToggleLock} className="flex-1 bg-transparent">
                  {room.isLocked ? (
                    <>
                      <Unlock className="w-4 h-4 mr-2" />
                      Kilidi Aç
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Kilitle
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSettings(true)}
                  className="flex-1 bg-transparent"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Ayarlar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Players List */}
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
              {room.players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 border-2 border-primary/30">
                      <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                        {getPlayerInitials(player.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{player.name}</span>
                        {player.isOwner && <Crown className="w-4 h-4 text-accent" />}
                      </div>
                      <div className="flex gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {player.isOwner ? "Oda Sahibi" : "Oyuncu"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {currentPlayer.isOwner && !player.isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onKickPlayer(player.id)}
                      className="text-destructive hover:bg-destructive/20"
                    >
                      <UserX className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Game Settings Preview */}
      <div className="max-w-md mx-auto mb-6">
        <Card className="neon-border bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-work-sans">Oyun Ayarları</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Hain Sayısı:</span>
                <span className="ml-2 text-destructive font-semibold">{gameSettings.traitorCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Özel Roller:</span>
                <span className="ml-2 text-accent font-semibold">{gameSettings.specialRoleCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Gece:</span>
                <span className="ml-2 font-semibold">{gameSettings.nightDuration}s</span>
              </div>
              <div>
                <span className="text-muted-foreground">Gündüz:</span>
                <span className="ml-2 font-semibold">{gameSettings.dayDuration}s</span>
              </div>
              <div>
                <span className="text-muted-foreground">Oylama:</span>
                <span className="ml-2 font-semibold">{gameSettings.voteDuration}s</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Start Game Button */}
      {currentPlayer.isOwner && (
        <div className="max-w-md mx-auto">
          <Button
            onClick={onStartGame}
            disabled={!canStartGame}
            className="w-full h-14 bg-primary hover:bg-primary/90 holographic-glow text-lg font-work-sans"
          >
            <Play className="w-5 h-5 mr-2" />
            Oyunu Başlat
            {!canStartGame && <span className="ml-2 text-sm opacity-70">(Min. 4 oyuncu gerekli)</span>}
          </Button>
        </div>
      )}

      {/* QR Code Modal */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-center font-work-sans">QR Kod</DialogTitle>
            <DialogDescription className="text-center">Bu QR kodu okutarak odaya katılabilirsiniz</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-6">
            <div className="w-48 h-48 bg-white rounded-lg flex items-center justify-center mb-4 holographic-glow">
              <QrCode className="w-32 h-32 text-black" />
            </div>
            <p className="text-center text-lg font-mono font-bold tracking-wider">{room.inviteCode}</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Modal */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-work-sans">Oyun Ayarları</DialogTitle>
            <DialogDescription>Oyun kurallarını ve süreleri ayarlayın</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Traitor Count */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Hain Sayısı</Label>
              <Select
                value={tempSettings.traitorCount.toString()}
                onValueChange={(value) => handleSettingsChange("traitorCount", Number.parseInt(value))}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Hain</SelectItem>
                  <SelectItem value="2">2 Hain</SelectItem>
                  <SelectItem value="3">3 Hain</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Special Role Count */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Özel Rol Sayısı</Label>
              <Select
                value={tempSettings.specialRoleCount.toString()}
                onValueChange={(value) => handleSettingsChange("specialRoleCount", Number.parseInt(value))}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Özel Rol Yok</SelectItem>
                  <SelectItem value="1">1 Özel Rol</SelectItem>
                  <SelectItem value="2">2 Özel Rol</SelectItem>
                  <SelectItem value="3">3 Özel Rol</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Card Draw Count */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Kart Çekecek Oyuncu Sayısı</Label>
              <Select
                value={tempSettings.cardDrawCount.toString()}
                onValueChange={(value) => handleSettingsChange("cardDrawCount", Number.parseInt(value))}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Kart Yok</SelectItem>
                  <SelectItem value="1">1 Oyuncu</SelectItem>
                  <SelectItem value="2">2 Oyuncu</SelectItem>
                  <SelectItem value="3">3 Oyuncu</SelectItem>
                  <SelectItem value="4">4 Oyuncu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Night Duration */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Gece Süresi: {tempSettings.nightDuration}s</Label>
              <Slider
                value={[tempSettings.nightDuration]}
                onValueChange={([value]) => handleSettingsChange("nightDuration", value)}
                min={30}
                max={180}
                step={15}
                className="w-full"
              />
            </div>

            {/* Day Duration */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Gündüz Süresi: {tempSettings.dayDuration}s</Label>
              <Slider
                value={[tempSettings.dayDuration]}
                onValueChange={([value]) => handleSettingsChange("dayDuration", value)}
                min={60}
                max={300}
                step={30}
                className="w-full"
              />
            </div>

            {/* Vote Duration */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Oylama Süresi: {tempSettings.voteDuration}s</Label>
              <Slider
                value={[tempSettings.voteDuration]}
                onValueChange={([value]) => handleSettingsChange("voteDuration", value)}
                min={30}
                max={120}
                step={15}
                className="w-full"
              />
            </div>

          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" onClick={resetSettings} className="flex-1 bg-transparent">
              Sıfırla
            </Button>
            <Button onClick={saveSettings} className="flex-1 bg-primary hover:bg-primary/90">
              Kaydet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
