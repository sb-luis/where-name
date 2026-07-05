package utils

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// --- ClientIP ---

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

// --- ReadBody / ReadBodyLarge ---

func TestReadBodyDecodesValidJSON(t *testing.T) {
	var dst struct {
		Name string `json:"name"`
	}
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"luis"}`))
	w := httptest.NewRecorder()

	if err := ReadBody(w, r, &dst); err != nil {
		t.Fatalf("ReadBody: %v", err)
	}
	if dst.Name != "luis" {
		t.Errorf("expected name=luis, got %q", dst.Name)
	}
}

func TestReadBodyRejectsPayloadOverSmallLimit(t *testing.T) {
	body, _ := json.Marshal(map[string]string{"padding": strings.Repeat("a", MaxBodyBytesSmall+1000)})
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	w := httptest.NewRecorder()

	var dst map[string]string
	if err := ReadBody(w, r, &dst); err == nil {
		t.Error("expected a payload over the small body limit to be rejected")
	}
}

func TestReadBodyLargeAcceptsPayloadOverSmallLimit(t *testing.T) {
	body, _ := json.Marshal(map[string]string{"padding": strings.Repeat("a", MaxBodyBytesSmall+1000)})
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	w := httptest.NewRecorder()

	var dst map[string]string
	if err := ReadBodyLarge(w, r, &dst); err != nil {
		t.Fatalf("expected a payload between the small and large limits to be accepted, got: %v", err)
	}
}

func TestReadBodyLargeRejectsPayloadOverLargeLimit(t *testing.T) {
	body, _ := json.Marshal(map[string]string{"padding": strings.Repeat("a", MaxBodyBytesLarge+1000)})
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(body))
	w := httptest.NewRecorder()

	var dst map[string]string
	if err := ReadBodyLarge(w, r, &dst); err == nil {
		t.Error("expected a payload over the large body limit to be rejected")
	}
}

// --- WriteJSON / WriteError ---

func TestWriteJSON(t *testing.T) {
	w := httptest.NewRecorder()

	WriteJSON(w, http.StatusCreated, map[string]any{"id": 1})

	res := w.Result()
	if res.StatusCode != http.StatusCreated {
		t.Errorf("expected status %d, got %d", http.StatusCreated, res.StatusCode)
	}
	if ct := res.Header.Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}

	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
	if body["id"] != float64(1) {
		t.Errorf("expected id=1, got %v", body["id"])
	}
}

func TestWriteError(t *testing.T) {
	w := httptest.NewRecorder()

	WriteError(w, http.StatusBadRequest, "invalid request")

	res := w.Result()
	if res.StatusCode != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}

	var body map[string]string
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
	if body["error"] != "invalid request" {
		t.Errorf("expected error=%q, got %q", "invalid request", body["error"])
	}
}
