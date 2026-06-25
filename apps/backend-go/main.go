package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

const (
	minDelta    = 0.01         // degrees; skip broadcast if movement is smaller
	idleTimeout = 5 * time.Minute
	pingTimeout = 10 * time.Second
)

var palette = [8]string{
	"#ef4444", "#f97316", "#eab308", "#22c55e",
	"#3b82f6", "#a855f7", "#ec4899", "#14b8a6",
}

type Visitor struct {
	ID     string   `json:"id"`
	Alias  *string  `json:"alias"`
	Color  string   `json:"color"`
	Lat    *float64 `json:"lat"`
	Lng    *float64 `json:"lng"`
	Status string   `json:"status"`
}

type client struct {
	id      string
	conn    *websocket.Conn
	send    chan []byte
	visitor *Visitor
}

// hub owns all active connections and the shared visitor state.
// All visitor mutations go through updateVisitor so they're covered by the same lock
// that snapshot() uses — no separate per-visitor mutex needed.
type hub struct {
	mu       sync.RWMutex
	clients  map[string]*client
	colorIdx atomic.Uint64
}

var g = &hub{clients: make(map[string]*client)}

func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func (h *hub) register(c *client) {
	h.mu.Lock()
	h.clients[c.id] = c
	h.mu.Unlock()
}

func (h *hub) unregister(c *client) {
	h.mu.Lock()
	delete(h.clients, c.id)
	h.mu.Unlock()
	close(c.send)
}

// snapshot returns a copy of all visitors except the one with the given id.
func (h *hub) snapshot(exclude string) []Visitor {
	h.mu.RLock()
	defer h.mu.RUnlock()
	vs := make([]Visitor, 0, len(h.clients))
	for _, c := range h.clients {
		if c.id != exclude {
			vs = append(vs, *c.visitor)
		}
	}
	return vs
}

func (h *hub) updateVisitor(c *client, fn func(*Visitor)) {
	h.mu.Lock()
	fn(c.visitor)
	h.mu.Unlock()
}

func (h *hub) broadcast(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		select {
		case c.send <- msg:
		default: // drop if send buffer is full; slow clients don't block the broadcast
		}
	}
}

func (h *hub) broadcastExcept(msg []byte, id string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for cid, c := range h.clients {
		if cid == id {
			continue
		}
		select {
		case c.send <- msg:
		default:
		}
	}
}

// --- server → client message builders ---

func enc(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func msgInit(self *Visitor, visitors []Visitor) []byte {
	return enc(struct {
		Type     string    `json:"type"`
		Self     Visitor   `json:"self"`
		Visitors []Visitor `json:"visitors"`
	}{"init", *self, visitors})
}

func msgVisitorJoined(v Visitor) []byte {
	return enc(struct {
		Type    string  `json:"type"`
		Visitor Visitor `json:"visitor"`
	}{"visitor_joined", v})
}

func msgVisitorUpdatedAlias(id string, alias *string) []byte {
	return enc(struct {
		Type  string  `json:"type"`
		ID    string  `json:"id"`
		Alias *string `json:"alias"`
	}{"visitor_updated", id, alias})
}

func msgVisitorUpdatedStatus(id, status string) []byte {
	return enc(struct {
		Type   string `json:"type"`
		ID     string `json:"id"`
		Status string `json:"status"`
	}{"visitor_updated", id, status})
}

func msgCursorMoved(id string, lat, lng float64) []byte {
	return enc(struct {
		Type string  `json:"type"`
		ID   string  `json:"id"`
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
	}{"cursor_moved", id, lat, lng})
}

func msgVisitorLeft(id string) []byte {
	return enc(struct {
		Type string `json:"type"`
		ID   string `json:"id"`
	}{"visitor_left", id})
}

// --- per-client goroutines ---

// keepAlive pings the client every idleTimeout. If the client doesn't respond
// within pingTimeout, the connection is closed and readPump exits naturally.
func (c *client) keepAlive(ctx context.Context) {
	t := time.NewTicker(idleTimeout)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			pCtx, cancel := context.WithTimeout(ctx, pingTimeout)
			err := c.conn.Ping(pCtx)
			cancel()
			if err != nil {
				c.conn.Close(websocket.StatusPolicyViolation, "idle timeout")
				return
			}
		}
	}
}

func (c *client) writePump() {
	for msg := range c.send {
		if err := c.conn.Write(context.Background(), websocket.MessageText, msg); err != nil {
			return
		}
	}
}

type incomingMsg struct {
	Type   string   `json:"type"`
	Alias  string   `json:"alias"`
	Status string   `json:"status"`
	Lat    *float64 `json:"lat"`
	Lng    *float64 `json:"lng"`
}

func (c *client) readPump(ctx context.Context) {
	defer func() {
		g.unregister(c)
		c.conn.Close(websocket.StatusNormalClosure, "")
		g.broadcast(msgVisitorLeft(c.id))
	}()

	for {
		_, data, err := c.conn.Read(ctx)
		if err != nil {
			return
		}

		var msg incomingMsg
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "set_alias":
			alias := strings.TrimSpace(msg.Alias)
			if rs := []rune(alias); len(rs) > 20 {
				alias = string(rs[:20])
			}
			g.updateVisitor(c, func(v *Visitor) { v.Alias = &alias })
			g.broadcast(msgVisitorUpdatedAlias(c.id, &alias))

		case "set_status":
			if msg.Status != "home" && msg.Status != "playing" {
				continue
			}
			g.updateVisitor(c, func(v *Visitor) { v.Status = msg.Status })
			g.broadcast(msgVisitorUpdatedStatus(c.id, msg.Status))

		case "cursor_move":
			if msg.Lat == nil || msg.Lng == nil {
				continue
			}
			lat, lng := *msg.Lat, *msg.Lng
			if math.IsNaN(lat) || math.IsInf(lat, 0) || math.IsNaN(lng) || math.IsInf(lng, 0) {
				continue
			}
			if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
				continue
			}
			var moved bool
			g.updateVisitor(c, func(v *Visitor) {
				if v.Lat == nil || v.Lng == nil ||
					math.Abs(lat-*v.Lat) >= minDelta || math.Abs(lng-*v.Lng) >= minDelta {
					v.Lat = &lat
					v.Lng = &lng
					moved = true
				}
			})
			if moved {
				g.broadcastExcept(msgCursorMoved(c.id, lat, lng), c.id)
			}
		}
	}
}

// --- HTTP handler ---

var allowedOrigins []string

func serveWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: allowedOrigins,
	})
	if err != nil {
		log.Printf("websocket accept: %v", err)
		return
	}

	idx := g.colorIdx.Add(1) - 1
	id := newID()
	visitor := &Visitor{
		ID:     id,
		Color:  palette[idx%8],
		Status: "home",
	}
	c := &client{
		id:      id,
		conn:    conn,
		send:    make(chan []byte, 64),
		visitor: visitor,
	}
	g.register(c)

	others := g.snapshot(id)
	c.send <- msgInit(visitor, others)
	g.broadcastExcept(msgVisitorJoined(*visitor), id)

	go c.writePump()
	go c.keepAlive(r.Context())
	c.readPump(r.Context())
}

func main() {
	raw := os.Getenv("ALLOWED_ORIGINS")
	if raw == "" {
		raw = "http://localhost:3001"
	}
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimSpace(o); o != "" {
			allowedOrigins = append(allowedOrigins, o)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3002"
	}

	http.HandleFunc("/ws", serveWS)
	log.Printf("WebSocket server on :%s (allowed origins: %v)", port, allowedOrigins)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}
