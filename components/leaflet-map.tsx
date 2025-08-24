"use client"

import { useEffect, useRef } from "react"

export default function LeafletMap() {
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let map: any
    ;(async () => {
      const leaflet = await import("leaflet")
      if (!mapRef.current) return
      map = leaflet.map(mapRef.current).setView([0, 0], 2)
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
        })
        .addTo(map)
    })()
    return () => map?.remove()
  }, [])

  return <div ref={mapRef} className="h-64 w-full" />
}
