package realtime

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"time"

	"github.com/sb-luis/where-name/apps/backend-go/internal/palette"
	"github.com/sb-luis/where-name/apps/backend-go/internal/utils"

	"github.com/coder/websocket"
	"golang.org/x/time/rate"
)

// ConnectParams describes the caller-resolved identity for an already
// upgraded websocket connection. Color may be left "" to have the hub
// assign one from the palette (the anonymous-visitor path).
type ConnectParams struct {
	UserID        *int64 // non-nil for authenticated users
	Alias         *string
	Color         string
	Authenticated bool
}

// HandleConnection takes ownership of an upgraded websocket connection: it
// resolves the visitor's color and id, runs the takeover flow for
// authenticated users that already have an active connection, registers the
// client, starts its write/keepalive goroutines, and then blocks in the
// read pump until the connection closes.
func (h *Hub) HandleConnection(ctx context.Context, conn *websocket.Conn, p ConnectParams) {
	id, err := utils.RandomHex(8)
	if err != nil {
		log.Printf("generate visitor id: %v", err)
		conn.Close(websocket.StatusInternalError, "")
		return
	}

	color := p.Color
	if !p.Authenticated {
		idx := h.colorIdx.Add(1) - 1
		color = palette.Pick(idx)
	}

	// Authenticated user already has an active connection: ask the new tab
	// whether it wants to take over. The old tab is notified via an app-level
	// "kicked" message so it can show a UI notice instead of reconnecting.
	if p.UserID != nil {
		if old, ok := h.existingUserConn(*p.UserID); ok {
			// Tell the new tab there's a duplicate.
			if err := conn.Write(ctx, websocket.MessageText, msgDuplicateSession()); err != nil {
				conn.Close(websocket.StatusNormalClosure, "")
				return
			}

			// Wait up to 30 s for the user to decide.
			wCtx, cancel := context.WithTimeout(ctx, takeoverTimeout)
			_, data, err := conn.Read(wCtx)
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
		Alias:         p.Alias,
		Color:         color,
		Status:        "home",
		Authenticated: p.Authenticated,
	}
	c := &client{
		id:      id,
		userID:  p.UserID,
		conn:    conn,
		send:    make(chan []byte, 64),
		visitor: visitor,
		hub:     h,
		limiter: rate.NewLimiter(wsMsgRate, wsMsgBurst),
	}
	h.register(c)

	others := h.snapshot(id)
	c.send <- msgInit(visitor, others)
	h.broadcastExcept(msgVisitorJoined(*visitor), id)

	go c.writePump()
	go c.keepAlive(ctx)
	c.readPump(ctx)
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

		if !c.allowMsg(time.Now()) {
			continue // drop: this connection is over its inbound rate limit
		}

		var msg incomingMsg
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case "set_alias":
			alias := sanitizeAlias(msg.Alias)
			if alias == "" {
				continue
			}
			c.hub.updateVisitor(c, func(v *Visitor) { v.Alias = &alias })
			c.hub.broadcast(msgVisitorUpdatedAlias(c.id, &alias))

		case "set_color":
			if !palette.Allowed(msg.Color) {
				continue
			}
			c.hub.updateVisitor(c, func(v *Visitor) { v.Color = msg.Color })
			c.hub.broadcast(msgVisitorUpdatedColor(c.id, msg.Color))

		case "set_status":
			if !allowedStatuses[msg.Status] {
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
