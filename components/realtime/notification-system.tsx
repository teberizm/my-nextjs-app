"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { X, Bell, CheckCircle, AlertTriangle, Info, AlertCircle } from "lucide-react"

interface GameNotification {
  id: string
  type: "info" | "success" | "warning" | "error"
  title: string
  message: string
  timestamp: Date
  autoHide?: boolean
}

interface NotificationSystemProps {
  notifications: GameNotification[]
  onRemoveNotification: (id: string) => void
}

export function NotificationSystem({ notifications, onRemoveNotification }: NotificationSystemProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-400" />
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-400" />
      default:
        return <Info className="w-4 h-4 text-blue-400" />
    }
  }

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "success":
        return "border-green-400/30 bg-green-400/10"
      case "warning":
        return "border-yellow-400/30 bg-yellow-400/10"
      case "error":
        return "border-red-400/30 bg-red-400/10"
      default:
        return "border-blue-400/30 bg-blue-400/10"
    }
  }

  const latestNotification = notifications[notifications.length - 1]
  const hasNotifications = notifications.length > 0

  if (!hasNotifications) return null

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      {/* Notification Bell */}
      <div className="flex justify-end mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="bg-card/80 backdrop-blur-sm border-border hover:bg-card"
        >
          <Bell className="w-4 h-4 mr-2" />
          {notifications.length}
        </Button>
      </div>

      {/* Latest Notification (Always Visible) */}
      {latestNotification && !isExpanded && (
        <Card className={`${getNotificationColor(latestNotification.type)} border backdrop-blur-sm mb-2`}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1">
                {getNotificationIcon(latestNotification.type)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{latestNotification.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{latestNotification.message}</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemoveNotification(latestNotification.id)}
                className="h-6 w-6 p-0 hover:bg-destructive/20"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Notifications (When Expanded) */}
      {isExpanded && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {notifications
            .slice()
            .reverse()
            .map((notification) => (
              <Card
                key={notification.id}
                className={`${getNotificationColor(notification.type)} border backdrop-blur-sm`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1">
                      {getNotificationIcon(notification.type)}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{notification.title}</div>
                        <div className="text-xs text-muted-foreground mb-1">{notification.message}</div>
                        <div className="text-xs text-muted-foreground">
                          {notification.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveNotification(notification.id)}
                      className="h-6 w-6 p-0 hover:bg-destructive/20"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  )
}
