package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/sb-luis/where-name/apps/backend-go/internal/store"
)

// --- setSessionCookie / clearSessionCookie ---

func TestSetSessionCookie(t *testing.T) {
	w := httptest.NewRecorder()
	expires := time.Now().Add(sessionTTL)
	h := &AuthHandler{cookieSecure: true}

	h.setSessionCookie(w, "test-token", expires)

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected 1 cookie, got %d", len(cookies))
	}
	c := cookies[0]
	if c.Name != "session" || c.Value != "test-token" {
		t.Errorf("expected session=test-token, got %s=%s", c.Name, c.Value)
	}
	if !c.HttpOnly {
		t.Error("expected session cookie to be HttpOnly")
	}
	if c.SameSite != http.SameSiteLaxMode {
		t.Errorf("expected SameSite=Lax, got %v", c.SameSite)
	}
	if !c.Secure {
		t.Error("expected Secure to follow h.cookieSecure=true")
	}
}

func TestClearSessionCookie(t *testing.T) {
	w := httptest.NewRecorder()
	h := &AuthHandler{cookieSecure: false}

	h.clearSessionCookie(w)

	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected 1 cookie, got %d", len(cookies))
	}
	c := cookies[0]
	if c.Value != "" {
		t.Errorf("expected empty value, got %q", c.Value)
	}
	if c.MaxAge != -1 {
		t.Errorf("expected MaxAge=-1 to force deletion, got %d", c.MaxAge)
	}
	if c.Secure {
		t.Error("expected Secure to follow h.cookieSecure=false")
	}
}

// --- userJSON ---

func TestUserJSON(t *testing.T) {
	now := time.Now()
	u := store.User{ID: 42, Username: "luis", CursorColor: "#fff", CreatedAt: now}

	got := userJSON(u)

	if got["id"] != int64(42) || got["username"] != "luis" || got["color"] != "#fff" || got["created_at"] != now {
		t.Errorf("unexpected userJSON output: %+v", got)
	}
	if _, exposed := got["password_hash"]; exposed {
		t.Error("userJSON must never expose password_hash")
	}
}
