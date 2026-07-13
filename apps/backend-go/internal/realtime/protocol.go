package realtime

import (
	"encoding/json"
	"regexp"
	"strings"
	"time"

	"golang.org/x/time/rate"
)

const (
	minDelta        = 0.01
	idleTimeout     = 5 * time.Minute
	pingTimeout     = 10 * time.Second
	takeoverTimeout = 30 * time.Second

	// Per-connection inbound message throttle: ~15 msg/s, burst 30.
	wsMsgRate  = rate.Limit(15)
	wsMsgBurst = 30
)

var (
	aliasDisallowedChars = regexp.MustCompile(`[^a-z-]`)
	aliasRepeatedDashes  = regexp.MustCompile(`-{2,}`)
)

// sanitizeAlias lowercases raw, strips characters outside [a-z-], collapses
// repeated dashes, trims leading/trailing dashes, and truncates to 20 runes.
// Returns "" if nothing usable remains.
func sanitizeAlias(raw string) string {
	alias := aliasDisallowedChars.ReplaceAllString(strings.ToLower(strings.TrimSpace(raw)), "")
	alias = aliasRepeatedDashes.ReplaceAllString(strings.Trim(alias, "-"), "-")
	if alias == "" {
		return ""
	}
	if rs := []rune(alias); len(rs) > 20 {
		alias = string(rs[:20])
	}
	return alias
}

// Mirrors the frontend UserStatus union (src/lib/multiplayer/types.ts).
var allowedStatuses = map[string]bool{
	"home":     true,
	"explore":  true,
	"practice": true,
	"playing":  true,
	"results":  true,
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

// msgType builds a bare {"type": t} message.
func msgType(t string) []byte {
	return enc(struct {
		Type string `json:"type"`
	}{t})
}

func msgDuplicateSession() []byte { return msgType("duplicate_session") }

func msgKicked() []byte { return msgType("kicked") }

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

type incomingMsg struct {
	Type   string   `json:"type"`
	Alias  string   `json:"alias"`
	Color  string   `json:"color"`
	Status string   `json:"status"`
	Lat    *float64 `json:"lat"`
	Lng    *float64 `json:"lng"`
}
