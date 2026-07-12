package handlers

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestCreateGameUnknownVariant exercises the real handler: an unknown variant
// is rejected with 422 before any store access, so no DB is needed here.
// The locked-difficulty 422 path requires an authenticated user and calls
// h.store.GetUserAchievements before rejecting, so it cannot be reached
// without a live DB-backed store and is intentionally skipped.
func TestCreateGameUnknownVariant(t *testing.T) {
	h := NewPracticeHandler(nil)

	body := []byte(`{"variant":"not_a_real_variant","completed":true,"duration_ms":1000,"skip_analytics":true,"rounds":[{"position":0,"feature":"France","attempt":1,"outcome":"correct","duration_ms":500}]}`)
	req := httptest.NewRequest(http.MethodPost, "/practice/games", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.CreateGame(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", rec.Code, rec.Body.String())
	}
}
