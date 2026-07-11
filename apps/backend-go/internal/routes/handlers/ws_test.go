package handlers

import (
	"testing"
	"time"

	"golang.org/x/time/rate"
)

// newTestClient builds a client with no real websocket.Conn, suitable for
// exercising Hub bookkeeping and the send channel without a network
// connection. Only fields touched by register/unregister/broadcast/
// snapshot/updateVisitor are populated.
func newTestClient(id string, bufSize int) *client {
	return &client{
		id:      id,
		visitor: &Visitor{ID: id, Status: "home"},
		send:    make(chan []byte, bufSize),
		limiter: rate.NewLimiter(wsMsgRate, wsMsgBurst),
	}
}

func TestHubRegisterUnregister(t *testing.T) {
	h := NewHub()
	c := newTestClient("a", 1)

	h.register(c)

	h.mu.RLock()
	_, present := h.clients["a"]
	h.mu.RUnlock()
	if !present {
		t.Fatal("expected client to be present after register")
	}

	h.unregister(c)

	h.mu.RLock()
	_, present = h.clients["a"]
	h.mu.RUnlock()
	if present {
		t.Fatal("expected client to be removed after unregister")
	}

	// unregister closes c.send; a second read should return the zero value
	// with ok == false rather than blocking or panicking.
	if _, ok := <-c.send; ok {
		t.Error("expected send channel to be closed after unregister")
	}
}

func TestHubRegisterUnregisterUserConn(t *testing.T) {
	h := NewHub()
	uid := int64(42)
	c := &client{id: "a", userID: &uid, visitor: &Visitor{ID: "a"}, send: make(chan []byte, 1)}

	h.register(c)
	if _, ok := h.existingUserConn(uid); !ok {
		t.Fatal("expected user conn to be registered")
	}

	h.unregister(c)
	if _, ok := h.existingUserConn(uid); ok {
		t.Fatal("expected user conn to be cleared after unregister")
	}
}

func TestHubUnregisterDoesNotClearNewerUserConn(t *testing.T) {
	// A takeover replaces the old client in userConns before the old
	// client's readPump exits and calls unregister. That stale unregister
	// must not evict the new connection.
	h := NewHub()
	uid := int64(7)
	oldC := &client{id: "old", userID: &uid, visitor: &Visitor{ID: "old"}, send: make(chan []byte, 1)}
	newC := &client{id: "new", userID: &uid, visitor: &Visitor{ID: "new"}, send: make(chan []byte, 1)}

	h.register(oldC)
	h.register(newC) // overwrites userConns[uid] with newC

	h.unregister(oldC)

	got, ok := h.existingUserConn(uid)
	if !ok {
		t.Fatal("expected the newer connection to still be registered")
	}
	if got != newC {
		t.Error("expected unregister of the stale client to leave the newer client in place")
	}
}

func TestHubBroadcastFanOut(t *testing.T) {
	h := NewHub()
	a := newTestClient("a", 1)
	b := newTestClient("b", 1)
	h.register(a)
	h.register(b)

	msg := []byte(`{"type":"test"}`)
	h.broadcast(msg)

	for id, c := range map[string]*client{"a": a, "b": b} {
		select {
		case got := <-c.send:
			if string(got) != string(msg) {
				t.Errorf("client %s: got %q, want %q", id, got, msg)
			}
		default:
			t.Errorf("client %s: expected a message on send channel", id)
		}
	}
}

func TestHubBroadcastExceptSkipsGivenID(t *testing.T) {
	h := NewHub()
	a := newTestClient("a", 1)
	b := newTestClient("b", 1)
	h.register(a)
	h.register(b)

	msg := []byte(`{"type":"test"}`)
	h.broadcastExcept(msg, "a")

	select {
	case <-a.send:
		t.Error("expected excluded client a to receive nothing")
	default:
	}

	select {
	case got := <-b.send:
		if string(got) != string(msg) {
			t.Errorf("client b: got %q, want %q", got, msg)
		}
	default:
		t.Error("expected client b to receive the broadcast")
	}
}

func TestHubBroadcastDropsWhenSendBufferFull(t *testing.T) {
	// broadcast must not block on a slow/dead client; it uses a non-blocking
	// send and drops the message for a full channel instead.
	h := NewHub()
	c := newTestClient("a", 1)
	h.register(c)
	c.send <- []byte("already queued")

	h.broadcast([]byte("dropped"))

	got := <-c.send
	if string(got) != "already queued" {
		t.Errorf("expected the original queued message to survive, got %q", got)
	}
	select {
	case extra := <-c.send:
		t.Errorf("expected no second message, got %q", extra)
	default:
	}
}

func TestHubSnapshotExcludesGivenID(t *testing.T) {
	h := NewHub()
	h.register(newTestClient("a", 1))
	h.register(newTestClient("b", 1))

	vs := h.snapshot("a")
	if len(vs) != 1 {
		t.Fatalf("expected 1 visitor in snapshot, got %d", len(vs))
	}
	if vs[0].ID != "b" {
		t.Errorf("expected remaining visitor to be b, got %s", vs[0].ID)
	}
}

func TestSanitizeAlias(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"valid lowercase", "alice", "alice"},
		{"uppercase is lowercased", "Alice", "alice"},
		{"surrounding whitespace trimmed", "  bob  ", "bob"},
		{"digits and symbols stripped", "a1i c3!!", "aic"},
		{"repeated dashes collapsed", "a--b---c", "a-b-c"},
		{"leading/trailing dashes trimmed", "--alice--", "alice"},
		{"only invalid chars yields empty", "123!!!", ""},
		{"empty input yields empty", "", ""},
		{"whitespace only yields empty", "   ", ""},
		{"truncated to 20 runes", "abcdefghijklmnopqrstuvwxyz", "abcdefghijklmnopqrst"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sanitizeAlias(tt.in); got != tt.want {
				t.Errorf("sanitizeAlias(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestWsMsgLimiterConstants(t *testing.T) {
	if wsMsgRate != rate.Limit(15) {
		t.Errorf("wsMsgRate = %v, want 15", wsMsgRate)
	}
	if wsMsgBurst != 30 {
		t.Errorf("wsMsgBurst = %v, want 30", wsMsgBurst)
	}
}

func TestClientAllowMsgBurstThenBlocks(t *testing.T) {
	c := &client{limiter: rate.NewLimiter(wsMsgRate, wsMsgBurst)}
	t0 := time.Now()

	for i := 0; i < wsMsgBurst; i++ {
		if !c.allowMsg(t0) {
			t.Fatalf("expected message %d within burst to be allowed", i+1)
		}
	}
	if c.allowMsg(t0) {
		t.Fatal("expected message beyond burst to be denied")
	}
}

func TestClientAllowMsgRefillsOverTime(t *testing.T) {
	// A tiny burst/rate combo keeps this test deterministic without sleeping:
	// we drive the limiter with synthetic timestamps instead of wall time.
	c := &client{limiter: rate.NewLimiter(rate.Every(10*time.Millisecond), 1)}
	t0 := time.Now()

	if !c.allowMsg(t0) {
		t.Fatal("expected first message to be allowed")
	}
	if c.allowMsg(t0) {
		t.Fatal("expected immediate second message to be denied")
	}
	if !c.allowMsg(t0.Add(20 * time.Millisecond)) {
		t.Fatal("expected message after refill interval to be allowed")
	}
}

func TestClientAllowMsgIsolatedPerConnection(t *testing.T) {
	a := &client{limiter: rate.NewLimiter(rate.Every(time.Minute), 1)}
	b := &client{limiter: rate.NewLimiter(rate.Every(time.Minute), 1)}
	t0 := time.Now()

	if !a.allowMsg(t0) {
		t.Fatal("expected connection a's first message to be allowed")
	}
	if a.allowMsg(t0) {
		t.Fatal("expected connection a's second message to be denied")
	}
	if !b.allowMsg(t0) {
		t.Fatal("expected connection b to have its own, unaffected bucket")
	}
}
