package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/sb-luis/where-name/apps/backend-go/routes/middleware"
	"github.com/sb-luis/where-name/apps/backend-go/store"

	"github.com/coder/websocket"
)

const (
	minDelta        = 0.01
	idleTimeout     = 5 * time.Minute
	pingTimeout     = 10 * time.Second
	takeoverTimeout = 30 * time.Second
)


type Visitor struct {
	ID            string   `json:"id"`
	Alias         *string  `json:"alias"`
	Color         string   `json:"color"`
	Lat           *float64 `json:"lat"`
	Lng           *float64 `json:"lng"`
	Status        string   `json:"status"`
	Authenticated bool     `json:"authenticated"`
}

type client struct {
	id      string
	userID  *int64 // non-nil for authenticated users
	conn    *websocket.Conn
	send    chan []byte
	visitor *Visitor
	hub     *Hub
}

// Hub owns all active connections and the shared visitor state.
type Hub struct {
	mu        sync.RWMutex
	clients   map[string]*client
	userConns map[int64]*client // one active conn per authenticated user
	colorIdx  atomic.Uint64
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[string]*client),
		userConns: make(map[int64]*client),
	}
}

func (h *Hub) register(c *client) {
	h.mu.Lock()
	h.clients[c.id] = c
	if c.userID != nil {
		h.userConns[*c.userID] = c
	}
	h.mu.Unlock()
}

func (h *Hub) unregister(c *client) {
	h.mu.Lock()
	delete(h.clients, c.id)
	// Only clear the user slot if it still points to this client.
	// A takeover may have already replaced it with the new connection.
	if c.userID != nil && h.userConns[*c.userID] == c {
		delete(h.userConns, *c.userID)
	}
	h.mu.Unlock()
	close(c.send)
}

func (h *Hub) existingUserConn(userID int64) (*client, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	c, ok := h.userConns[userID]
	return c, ok
}

func (h *Hub) snapshot(exclude string) []Visitor {
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

func (h *Hub) updateVisitor(c *client, fn func(*Visitor)) {
	h.mu.Lock()
	fn(c.visitor)
	h.mu.Unlock()
}

func (h *Hub) broadcast(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients {
		select {
		case c.send <- msg:
		default:
		}
	}
}

func (h *Hub) broadcastExcept(msg []byte, id string) {
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

// --- message builders ---

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

func msgDuplicateSession() []byte {
	return enc(struct {
		Type string `json:"type"`
	}{"duplicate_session"})
}

func msgKicked() []byte {
	return enc(struct {
		Type string `json:"type"`
	}{"kicked"})
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

func msgVisitorUpdatedColor(id, color string) []byte {
	return enc(struct {
		Type  string `json:"type"`
		ID    string `json:"id"`
		Color string `json:"color"`
	}{"visitor_updated", id, color})
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
	Color  string   `json:"color"`
	Status string   `json:"status"`
	Lat    *float64 `json:"lat"`
	Lng    *float64 `json:"lng"`
}

func (c *client) readPump(ctx context.Context) {
	defer func() {
		c.hub.unregister(c)
		c.conn.Close(websocket.StatusNormalClosure, "")
		c.hub.broadcast(msgVisitorLeft(c.id))
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
			c.hub.updateVisitor(c, func(v *Visitor) { v.Alias = &alias })
			c.hub.broadcast(msgVisitorUpdatedAlias(c.id, &alias))

		case "set_color":
			if !allowedColors[msg.Color] {
				continue
			}
			c.hub.updateVisitor(c, func(v *Visitor) { v.Color = msg.Color })
			c.hub.broadcast(msgVisitorUpdatedColor(c.id, msg.Color))

		case "set_status":
			if msg.Status != "home" && msg.Status != "playing" {
				continue
			}
			c.hub.updateVisitor(c, func(v *Visitor) { v.Status = msg.Status })
			c.hub.broadcast(msgVisitorUpdatedStatus(c.id, msg.Status))

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
			c.hub.updateVisitor(c, func(v *Visitor) {
				if v.Lat == nil || v.Lng == nil ||
					math.Abs(lat-*v.Lat) >= minDelta || math.Abs(lng-*v.Lng) >= minDelta {
					v.Lat = &lat
					v.Lng = &lng
					moved = true
				}
			})
			if moved {
				c.hub.broadcastExcept(msgCursorMoved(c.id, lat, lng), c.id)
			}
		}
	}
}

// --- WSHandler ---

type WSHandler struct {
	hub            *Hub
	store          *store.Store
	allowedOrigins []string
}

func NewWSHandler(hub *Hub, s *store.Store, allowedOrigins []string) *WSHandler {
	return &WSHandler{hub: hub, store: s, allowedOrigins: allowedOrigins}
}

func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func (h *WSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: h.allowedOrigins,
	})
	if err != nil {
		log.Printf("websocket accept: %v", err)
		return
	}

	id := newID()

	var alias *string
	var userID *int64
	var color string
	authenticated := false
	if user, ok := middleware.UserFromCtx(r.Context()); ok {
		alias = &user.Username
		authenticated = true
		uid := user.ID
		userID = &uid
		color = user.CursorColor
	} else {
		idx := h.hub.colorIdx.Add(1) - 1
		color = palette[idx%uint64(len(palette))]
	}

	// Authenticated user already has an active connection: ask the new tab
	// whether it wants to take over. The old tab is notified via an app-level
	// "kicked" message so it can show a UI notice instead of reconnecting.
	if userID != nil {
		if old, ok := h.hub.existingUserConn(*userID); ok {
			// Tell the new tab there's a duplicate.
			if err := conn.Write(r.Context(), websocket.MessageText, msgDuplicateSession()); err != nil {
				conn.Close(websocket.StatusNormalClosure, "")
				return
			}

			// Wait up to 30 s for the user to decide.
			ctx, cancel := context.WithTimeout(r.Context(), takeoverTimeout)
			_, data, err := conn.Read(ctx)
			cancel()
			if err != nil {
				// Timeout, client closed, or network error — treat as decline.
				conn.Close(websocket.StatusNormalClosure, "")
				return
			}

			var resp struct {
				Type string `json:"type"`
			}
			if json.Unmarshal(data, &resp) != nil || resp.Type != "takeover" {
				// Explicit decline or unrecognised message.
				conn.Close(websocket.StatusNormalClosure, "")
				return
			}

			// Takeover confirmed: notify old tab with an app-level message
			// (coder/websocket serialises concurrent writes, so this is safe),
			// then close it with a normal code so the old tab's onclose doesn't
			// look like a network error.
			writeCtx, wCancel := context.WithTimeout(context.Background(), 5*time.Second)
			old.conn.Write(writeCtx, websocket.MessageText, msgKicked()) //nolint:errcheck
			wCancel()
			old.conn.Close(websocket.StatusNormalClosure, "session taken over")
		}
	}

	visitor := &Visitor{
		ID:            id,
		Alias:         alias,
		Color:         color,
		Status:        "home",
		Authenticated: authenticated,
	}
	c := &client{
		id:      id,
		userID:  userID,
		conn:    conn,
		send:    make(chan []byte, 64),
		visitor: visitor,
		hub:     h.hub,
	}
	h.hub.register(c)

	others := h.hub.snapshot(id)
	c.send <- msgInit(visitor, others)
	h.hub.broadcastExcept(msgVisitorJoined(*visitor), id)

	go c.writePump()
	go c.keepAlive(r.Context())
	c.readPump(r.Context())
}
