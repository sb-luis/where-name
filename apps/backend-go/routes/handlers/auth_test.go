package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sb-luis/where-name/apps/backend-go/internal/palette"
	"github.com/sb-luis/where-name/apps/backend-go/store"
)

// --- hashPassword / verifyPassword ---

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := hashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}

	ok, err := verifyPassword("correct horse battery staple", hash)
	if err != nil || !ok {
		t.Fatalf("expected password to verify, got ok=%v err=%v", ok, err)
	}

	ok, err = verifyPassword("wrong password", hash)
	if err != nil {
		t.Fatalf("verifyPassword: %v", err)
	}
	if ok {
		t.Fatal("expected wrong password to fail verification")
	}
}

func TestVerifyPasswordMalformedHash(t *testing.T) {
	cases := []string{
		"",
		"not-a-valid-hash",
		"$argon2id$v=19$m=65536,t=2,p=1$onlyfourparts",
	}
	for _, encoded := range cases {
		t.Run(encoded, func(t *testing.T) {
			if _, err := verifyPassword("anything", encoded); err == nil {
				t.Errorf("expected error for malformed hash %q, got nil", encoded)
			}
		})
	}
}

// --- validateUsername ---

func TestValidateUsername(t *testing.T) {
	cases := []struct {
		name     string
		username string
		wantErr  bool
	}{
		{"minimum length (2 chars)", "ab", false},
		{"letters, numbers, underscore", "Luis_123", false},
		{"single underscore", "a_b", false},
		{"maximum length (20 chars)", "exactly_twenty_chars", false},
		{"too short (1 char)", "a", true},
		{"empty", "", true},
		{"rejects spaces", "has space", true},
		{"rejects dashes", "has-dash", true},
		{"too long (21+ chars)", "way_too_long_username_here_1234567890", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := validateUsername(c.username)
			if c.wantErr && err == nil {
				t.Errorf("expected %q to be rejected as an invalid username", c.username)
			}
			if !c.wantErr && err != nil {
				t.Errorf("expected %q to be a valid username, got error: %v", c.username, err)
			}
		})
	}
}

// --- validatePassword ---

func TestValidatePassword(t *testing.T) {
	cases := []struct {
		name    string
		len     int
		wantErr bool
	}{
		{"too short (7 chars)", 7, true},
		{"minimum (8 chars)", 8, false},
		{"maximum (256 chars)", maxPasswordBytes, false},
		{"too long (257 chars)", maxPasswordBytes + 1, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			password := strings.Repeat("a", c.len)
			err := validatePassword(password)
			if c.wantErr && err == nil {
				t.Errorf("expected a %d-char password to be rejected", c.len)
			}
			if !c.wantErr && err != nil {
				t.Errorf("expected a %d-char password to be valid, got error: %v", c.len, err)
			}
		})
	}
}

// --- setSessionCookie / clearSessionCookie ---

func TestSetSessionCookie(t *testing.T) {
	w := httptest.NewRecorder()
	expires := time.Now().Add(sessionTTL)

	setSessionCookie(w, "test-token", expires)

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
}

func TestClearSessionCookie(t *testing.T) {
	w := httptest.NewRecorder()

	clearSessionCookie(w)

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

// --- ensureAllowedCursorColor ---

func TestEnsureAllowedCursorColorNoopWhenAlreadyAllowed(t *testing.T) {
	user := &store.User{ID: 1, CursorColor: palette.Random()}
	original := user.CursorColor

	// A nil store is safe here: an already-allowed color returns before s is touched.
	if err := ensureAllowedCursorColor(context.Background(), nil, user); err != nil {
		t.Fatalf("ensureAllowedCursorColor: %v", err)
	}
	if user.CursorColor != original {
		t.Errorf("expected color to stay %q, got %q", original, user.CursorColor)
	}
}
