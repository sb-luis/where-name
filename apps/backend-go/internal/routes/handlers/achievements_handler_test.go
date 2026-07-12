package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestGetAchievementsIncludesNewCountries exercises the unauthenticated path
// (no store access needed) and confirms Definition.NewCountries flows into
// the JSON response as new_countries.
func TestGetAchievementsIncludesNewCountries(t *testing.T) {
	h := NewAchievementsHandler(nil)

	req := httptest.NewRequest(http.MethodGet, "/achievements", nil)
	rec := httptest.NewRecorder()

	h.GetAchievements(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var body struct {
		Achievements []struct {
			Slug         string `json:"slug"`
			NewCountries int    `json:"new_countries"`
		} `json:"achievements"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	found := false
	for _, a := range body.Achievements {
		if a.Slug == "world-easy" {
			found = true
			if a.NewCountries != 177 {
				t.Errorf("world-easy new_countries = %d, want 177", a.NewCountries)
			}
		}
		if a.Slug == "continent-south-america-medium" || a.Slug == "continent-antarctica-hard" {
			t.Errorf("unexpected zero-delta achievement in response: %s", a.Slug)
		}
	}
	if !found {
		t.Fatal("expected world-easy in achievements list")
	}
}
