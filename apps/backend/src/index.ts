import { createServer } from 'http'
import { Server } from 'socket.io'

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#a855f7', '#ec4899', '#14b8a6',
]

interface Visitor {
  id: string
  alias: string | null
  color: string
  lat: number | null
  lng: number | null
}

const httpServer = createServer()
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001')
  .split(',').map(s => s.trim())

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS },
})

const visitors = new Map<string, Visitor>()
let colorIndex = 0

io.on('connection', (socket) => {
  const visitor: Visitor = {
    id: socket.id,
    alias: null,
    color: COLORS[colorIndex % COLORS.length],
    lat: null,
    lng: null,
  }
  colorIndex++
  visitors.set(socket.id, visitor)

  socket.emit('init', { self: visitor, visitors: [...visitors.values()] })
  socket.broadcast.emit('visitor_joined', visitor)

  socket.on('set_alias', (alias: unknown) => {
    if (typeof alias !== 'string') return
    visitor.alias = alias.trim().slice(0, 20)
    io.emit('visitor_updated', { id: socket.id, alias: visitor.alias })
  })

  socket.on('cursor_move', (data: unknown) => {
    if (!data || typeof data !== 'object') return
    const { lat, lng } = data as { lat: number; lng: number }
    if (typeof lat !== 'number' || typeof lng !== 'number') return
    if (!isFinite(lat) || !isFinite(lng)) return
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return
    visitor.lat = lat
    visitor.lng = lng
    socket.broadcast.emit('cursor_moved', { id: socket.id, lat, lng })
  })

  socket.on('disconnect', () => {
    visitors.delete(socket.id)
    io.emit('visitor_left', socket.id)
  })
})

const PORT = Number(process.env.PORT ?? 3002)
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on :${PORT}`)
})
