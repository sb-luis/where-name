package utils

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientIPPrefersXRealIP(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	r.RemoteAddr = "10.0.0.1:12345"
	r.Header.Set("X-Real-IP", "203.0.113.5")
	// A spoofed X-Forwarded-For must not override the trusted X-Real-IP that Caddy sets
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 10.0.0.1")

	if got := ClientIP(r); got != "203.0.113.5" {
		t.Errorf("expected X-Real-IP to be used, got %q", got)
	}
}

func TestClientIPFallsBackToRemoteAddr(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
	r.RemoteAddr = "10.0.0.1:12345"

	if got := ClientIP(r); got != "10.0.0.1:12345" {
		t.Errorf("expected RemoteAddr fallback, got %q", got)
	}
}
