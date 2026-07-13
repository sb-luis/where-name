// Package realtime owns the live presence hub: the set of connected
// visitors, their broadcastable state, and the connection bookkeeping that
// keeps that state in sync. It knows nothing about HTTP — callers hand it an
// already-upgraded *websocket.Conn
package realtime

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
	"golang.org/x/time/rate"
)

// Visitor is the public presence state broadcast to other clients.
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
	limiter *rate.Limiter // per-connection inbound message throttle
}

// allowMsg reports whether an inbound message arriving at now is allowed
// under the per-connection rate limit, consuming a token if so. Takes an
// explicit time (rather than calling time.Now() internally) so tests can
// drive it deterministically without sleeping.
func (c *client) allowMsg(now time.Time) bool {
	return c.limiter.AllowN(now, 1)
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
