import { createServer } from "http"
import { createHash } from "crypto"

interface RoomMap {
  [roomId: string]: Map<string, import("net").Socket>
}

const rooms: RoomMap = {}

function broadcast(roomId: string, message: any) {
  const room = rooms[roomId]
  if (!room) return
  const data = JSON.stringify(message)
  for (const socket of room.values()) {
    send(socket, data)
  }
}

function send(socket: import("net").Socket, data: string) {
  const jsonBuffer = Buffer.from(data)
  const frame = Buffer.alloc(2 + jsonBuffer.length)
  frame[0] = 0x81 // FIN + text frame
  frame[1] = jsonBuffer.length
  jsonBuffer.copy(frame, 2)
  socket.write(frame)
}

function parseMessage(buffer: Buffer): string | null {
  const firstByte = buffer[0]
  const opcode = firstByte & 0x0f
  if (opcode === 0x8) return null // connection close
  let offset = 2
  let length = buffer[1] & 0x7f
  if (length === 126) {
    length = buffer.readUInt16BE(offset)
    offset += 2
  } else if (length === 127) {
    // Note: only support 32-bit length
    length = buffer.readUInt32BE(offset + 4)
    offset += 8
  }
  const mask = buffer.slice(offset, offset + 4)
  offset += 4
  const data = buffer.slice(offset, offset + length)
  for (let i = 0; i < data.length; i++) {
    data[i] ^= mask[i % 4]
  }
  return data.toString("utf8")
}

const server = createServer()

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"] as string
  const accept = createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64")

  const headers = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n",
  ]

  socket.write(headers.join("\r\n"))

  let currentRoom: string | null = null
  let currentPlayer: string | null = null

  socket.on("data", (buffer) => {
    const msg = parseMessage(buffer)
    if (!msg) return
    try {
      const data = JSON.parse(msg)
      if (data.type === "CONNECT") {
        currentRoom = data.roomId
        currentPlayer = data.playerId
        rooms[currentRoom] = rooms[currentRoom] || new Map()
        rooms[currentRoom].set(currentPlayer, socket)
        send(
          socket,
          JSON.stringify({
            type: "ROOM_JOINED",
            payload: { roomId: currentRoom, playerId: currentPlayer },
            timestamp: new Date(),
          }),
        )
        broadcast(currentRoom, {
          type: "PLAYER_LIST_UPDATED",
          payload: {
            players: Array.from(rooms[currentRoom].keys()),
          },
          timestamp: new Date(),
        })
      } else if (currentRoom) {
        broadcast(currentRoom, data)
      }
    } catch (err) {
      send(socket, JSON.stringify({ type: "ERROR", message: "Invalid message" }))
    }
  })

  socket.on("close", () => {
    if (currentRoom && currentPlayer && rooms[currentRoom]) {
      rooms[currentRoom].delete(currentPlayer)
      broadcast(currentRoom, {
        type: "PLAYER_LIST_UPDATED",
        payload: {
          players: Array.from(rooms[currentRoom].keys()),
        },
        timestamp: new Date(),
      })
      if (rooms[currentRoom].size === 0) {
        delete rooms[currentRoom]
      }
    }
  })
})

const PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 3001
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`)
})

