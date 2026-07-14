package handlers

import (
	"fmt"
	"net/http"

	"github.com/sb-luis/where-name/apps/backend-go/internal/geo"
	"github.com/sb-luis/where-name/apps/backend-go/internal/httpx"
	"github.com/sb-luis/where-name/apps/backend-go/internal/routes/middleware"
	"github.com/sb-luis/where-name/apps/backend-go/internal/service/game"
)

type PracticeHandler struct {
	svc *game.Service
}

func NewPracticeHandler(svc *game.Service) *PracticeHandler {
	return &PracticeHandler{svc: svc}
}

func validateVariant(variant string) error {
	if _, ok := geo.DifficultyForVariant(variant); !ok {
		return fmt.Errorf("variant must be one of the known map variants")
	}
	return nil
}

func (h *PracticeHandler) CreateGame(w http.ResponseWriter, r *http.Request) {
	user, authenticated := middleware.UserFromCtx(r.Context())

	var body struct {
		Variant       string            `json:"variant"`
		Completed     bool              `json:"completed"`
		DurationMs    int64             `json:"duration_ms"`
		DistinctId    string            `json:"distinct_id"`
		SkipAnalytics bool              `json:"skip_analytics"`
		Rounds        []game.RoundInput `json:"rounds"`
	}
	if err := httpx.ReadBodyLarge(w, r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validateVariant(body.Variant); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	var userID int64
	if authenticated {
		userID = user.ID
	}

	res, err := h.svc.CreateGame(r.Context(), game.Input{
		Authenticated: authenticated,
		UserID:        userID,
		Variant:       body.Variant,
		Completed:     body.Completed,
		DurationMs:    body.DurationMs,
		DistinctID:    body.DistinctId,
		SkipAnalytics: body.SkipAnalytics,
		Rounds:        body.Rounds,
	})
	if err != nil {
		writeServiceError(w, err, "create game")
		return
	}

	if !res.Authenticated {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"saved": res.Saved})
		return
	}

	resp := map[string]any{"id": res.ID, "saved": res.Saved}

	if res.HasStats {
		resp["current_streak"] = res.CurrentStreak
		resp["longest_streak"] = res.LongestStreak
		resp["is_first_game_today"] = res.IsFirstGameToday
	}

	newAchievements := []map[string]string{}
	for _, a := range res.NewAchievements {
		newAchievements = append(newAchievements, map[string]string{
			"slug":        a.Slug,
			"name":        a.Name,
			"description": a.Description,
		})
	}
	resp["new_achievements"] = newAchievements

	httpx.WriteJSON(w, http.StatusCreated, resp)
}
