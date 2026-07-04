package utils

import (
	"encoding/json"
	"net/http"
	"strings"
)

const (
	MaxBodyBytesSmall = 4 * 1024    // 4 KB  — auth/small payloads
	MaxBodyBytesLarge = 1024 * 1024 // 1 MB — very geneour long practice games
)

// ClientIP returns the address to key rate limiting on.
// Caddy resolves the real client IP itself
// X-Forwarded-For is deliberately not used here: it's a hop-by-hop list that proxies append to
// r.RemoteAddr is used as a fallback e.g. in local dev without Caddy in front.
func ClientIP(r *http.Request) string {
	if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
		return ip
	}
	return r.RemoteAddr
}

func ReadBody(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytesSmall)
	return json.NewDecoder(r.Body).Decode(dst)
}

func ReadBodyLarge(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytesLarge)
	return json.NewDecoder(r.Body).Decode(dst)
}

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func WriteError(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, map[string]string{"error": msg})
}
