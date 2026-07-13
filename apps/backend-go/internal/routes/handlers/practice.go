package handlers

import (
	"fmt"
	"log"
	"net/http"

	"github.com/sb-luis/where-name/apps/backend-go/internal/achievements"
	"github.com/sb-luis/where-name/apps/backend-go/internal/analytics"
	"github.com/sb-luis/where-name/apps/backend-go/internal/geo"
	"github.com/sb-luis/where-name/apps/backend-go/internal/httpx"
	"github.com/sb-luis/where-name/apps/backend-go/internal/practice"
	"github.com/sb-luis/where-name/apps/backend-go/internal/routes/middleware"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"

	"github.com/posthog/posthog-go"
)

type PracticeHandler struct {
	store *store.Store
}

func NewPracticeHandler(s *store.Store) *PracticeHandler {
	return &PracticeHandler{store: s}
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
		Variant       string                `json:"variant"`
		Completed     bool                  `json:"completed"`
		DurationMs    int64                 `json:"duration_ms"`
		DistinctId    string                `json:"distinct_id"`
		SkipAnalytics bool                  `json:"skip_analytics"`
		Rounds        []practice.RoundInput `json:"rounds"`
	}
	if err := httpx.ReadBodyLarge(w, r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validateVariant(body.Variant); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	rounds, correct, wrong, skipped, err := practice.ValidateRounds(body.Rounds)
	if err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	if !body.SkipAnalytics {
		distinctID := body.DistinctId
		if authenticated {
			distinctID = analytics.DistinctID(user.ID)
		}
		analytics.Capture(distinctID, "practice_completed", posthog.NewProperties().
			Set("completed", body.Completed).
			Set("correct", correct).
			Set("wrong", wrong).
			Set("skipped", skipped).
			Set("duration_ms", body.DurationMs).
			Set("authenticated", authenticated))
	}

	if !authenticated {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"saved": false})
		return
	}

	difficulty, _ := geo.DifficultyForVariant(body.Variant)

	if difficulty != "easy" {
		if err := practice.CheckDifficultyUnlocked(r.Context(), h.store, user.ID, difficulty, body.Rounds); err != nil {
			httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
	}

	alreadyPlayedToday, err := h.store.HasPlayedToday(r.Context(), user.ID)
	if err != nil {
		httpx.WriteInternalError(w, err, "check play history")
		return
	}

	game, err := h.store.CreatePracticeGame(r.Context(), user.ID, body.Variant, body.Completed, body.DurationMs, rounds)
	if err != nil {
		httpx.WriteInternalError(w, err, "create practice game")
		return
	}

	resp := map[string]any{"id": game.ID, "saved": true}

	// Streak fields are best-effort: the game is already saved above, so a
	// failure here shouldn't fail the whole request, just skip the celebration.
	if profileStats, err := h.store.GetProfileStats(r.Context(), user.ID); err == nil {
		resp["current_streak"] = profileStats.CurrentStreak
		resp["longest_streak"] = profileStats.LongestStreak
		resp["is_first_game_today"] = !alreadyPlayedToday
	}

	// Achievement awarding is best-effort: the game is already saved above,
	// so a failure here shouldn't fail the whole request.
	newAchievements := []map[string]string{}
	correctFeatures := make(map[string]struct{})
	for _, round := range body.Rounds {
		if round.Outcome == "correct" {
			correctFeatures[round.Feature] = struct{}{}
		}
	}
	earnedSlugs := achievements.Evaluate(difficulty, correctFeatures)
	newSlugs, err := h.store.AwardAchievements(r.Context(), user.ID, game.ID, earnedSlugs, geo.Version())
	if err != nil {
		log.Printf("award achievements: %v", err)
	} else {
		for _, slug := range newSlugs {
			if def, ok := achievements.BySlug(slug); ok {
				newAchievements = append(newAchievements, map[string]string{
					"slug":        def.Slug,
					"name":        def.Name,
					"description": def.Description,
				})
			}
		}
	}
	resp["new_achievements"] = newAchievements

	httpx.WriteJSON(w, http.StatusCreated, resp)
}
