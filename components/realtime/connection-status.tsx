"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Wifi, WifiOff, Loader2 } from "lucide-react"

interface ConnectionStatusProps {
  connected: boolean
  connectionStatus: string
  playerCount?: number
}

export function ConnectionStatus({ connected, connectionStatus, playerCount }: ConnectionStatusProps) {
  const getStatusIcon = () => {
    if (connectionStatus === "Connecting...") {
      return <Loader2 className="w-4 h-4 animate-spin" />
    }
    return connected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />
  }

  const getStatusColor = () => {
    if (connectionStatus === "Connecting...") return "bg-yellow-400/20 text-yellow-400 border-yellow-400/30"
    return connected
      ? "bg-green-400/20 text-green-400 border-green-400/30"
      : "bg-red-400/20 text-red-400 border-red-400/30"
  }

  return (
    <div className="fixed top-4 left-4 z-40">
      <Card className="bg-card/80 backdrop-blur-sm border-border">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <Badge className={`${getStatusColor()} border`}>
              {getStatusIcon()}
              <span className="ml-2 text-xs">{connectionStatus}</span>
            </Badge>

            {connected && playerCount && (
              <Badge variant="secondary" className="text-xs">
                {playerCount} players
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
