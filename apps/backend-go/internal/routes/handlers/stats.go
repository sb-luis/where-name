package handlers

import (
	"net/http"

	"github.com/sb-luis/where-name/apps/backend-go/internal/httpx"
	"github.com/sb-luis/where-name/apps/backend-go/internal/routes/middleware"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"
)

type StatsHandler struct {
	store *store.Store
}

func NewStatsHandler(s *store.Store) *StatsHandler {
	return &StatsHandler{store: s}
}

func (h *StatsHandler) GetPracticeStats(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromCtx(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	variant := r.URL.Query().Get("variant")
	if variant == "" {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "variant is required")
		return
	}

	stats, err := h.store.GetPracticeStats(r.Context(), user.ID, variant)
	if err != nil {
		httpx.WriteInternalError(w, err, "get practice stats")
		return
	}

	type countryStat struct {
		Feature      string `json:"feature"`
		Correct      int    `json:"correct"`
		Wrong        int    `json:"wrong"`
		Skipped      int    `json:"skipped"`
		AvgCorrectMs *int64 `json:"avg_correct_ms"`
	}

	countries := make([]countryStat, len(stats.Countries))
	for i, c := range stats.Countries {
		countries[i] = countryStat{
			Feature:      c.Feature,
			Correct:      c.Correct,
			Wrong:        c.Wrong,
			Skipped:      c.Skipped,
			AvgCorrectMs: c.AvgCorrectMs,
		}
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"games_played":    stats.GamesPlayed,
		"games_completed": stats.GamesCompleted,
		"countries":       countries,
	})
}

func (h *StatsHandler) GetProfileStats(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromCtx(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	stats, err := h.store.GetProfileStats(r.Context(), user.ID)
	if err != nil {
		httpx.WriteInternalError(w, err, "get profile stats")
		return
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"games_played":    stats.GamesPlayed,
		"games_completed": stats.GamesCompleted,
		"current_streak":  stats.CurrentStreak,
		"longest_streak":  stats.LongestStreak,
	})
}
