package handlers

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"github.com/sb-luis/where-name/apps/backend-go/internal/achievements"
	"github.com/sb-luis/where-name/apps/backend-go/internal/analytics"
	"github.com/sb-luis/where-name/apps/backend-go/internal/geo"
	"github.com/sb-luis/where-name/apps/backend-go/internal/routes/middleware"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"
	"github.com/sb-luis/where-name/apps/backend-go/internal/httpx"

	"github.com/posthog/posthog-go"
)

type PracticeHandler struct {
	store *store.Store
}

func NewPracticeHandler(s *store.Store) *PracticeHandler {
	return &PracticeHandler{store: s}
}

type roundInput struct {
	Position   int16  `json:"position"`
	Feature    string `json:"feature"`
	Attempt    int16  `json:"attempt"`
	Outcome    string `json:"outcome"`
	DurationMs int64  `json:"duration_ms"`
}

func validateVariant(variant string) error {
	if _, ok := geo.DifficultyForVariant(variant); !ok {
		return fmt.Errorf("variant must be one of the known map variants")
	}
	return nil
}

// validateRounds checks each round's outcome and tallies correct/wrong/skipped
// counts, converting to store params in the same pass.
func validateRounds(rounds []roundInput) (params []store.CreatePracticeRoundParams, correct, wrong, skipped int, err error) {
	if len(rounds) == 0 {
		return nil, 0, 0, 0, fmt.Errorf("rounds must not be empty")
	}

	params = make([]store.CreatePracticeRoundParams, len(rounds))
	for i, r := range rounds {
		switch r.Outcome {
		case "correct":
			correct++
		case "wrong":
			wrong++
		case "skipped":
			skipped++
		default:
			return nil, 0, 0, 0, fmt.Errorf("outcome must be 'correct', 'wrong', or 'skipped'")
		}
		params[i] = store.CreatePracticeRoundParams{
			Position:   r.Position,
			Feature:    r.Feature,
			Attempt:    r.Attempt,
			Outcome:    r.Outcome,
			DurationMs: r.DurationMs,
		}
	}
	return params, correct, wrong, skipped, nil
}

func (h *PracticeHandler) CreateGame(w http.ResponseWriter, r *http.Request) {
	user, authenticated := middleware.UserFromCtx(r.Context())

	var body struct {
		Variant       string       `json:"variant"`
		Completed     bool         `json:"completed"`
		DurationMs    int64        `json:"duration_ms"`
		DistinctId    string       `json:"distinct_id"`
		SkipAnalytics bool         `json:"skip_analytics"`
		Rounds        []roundInput `json:"rounds"`
	}
	if err := httpx.ReadBodyLarge(w, r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validateVariant(body.Variant); err != nil {
		httpx.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	rounds, correct, wrong, skipped, err := validateRounds(body.Rounds)
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
		if err := h.checkDifficultyUnlocked(r.Context(), user.ID, difficulty, body.Rounds); err != nil {
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

// checkDifficultyUnlocked reports an error if any continent present in the
// submitted rounds is not yet unlocked at the requested difficulty for this
// user.
func (h *PracticeHandler) checkDifficultyUnlocked(ctx context.Context, userID int64, difficulty string, rounds []roundInput) error {
	earned, err := h.store.GetUserAchievements(ctx, userID)
	if err != nil {
		return fmt.Errorf("check achievements: %w", err)
	}
	earnedSet := make(map[string]bool, len(earned))
	for slug := range earned {
		earnedSet[slug] = true
	}
	unlocks := achievements.UnlockLevels(earnedSet)

	for _, round := range rounds {
		continent, ok := geo.ContinentOf(difficulty, round.Feature)
		if !ok {
			continue
		}
		if achievements.DifficultyRank(unlocks[continent]) < achievements.DifficultyRank(difficulty) {
			return fmt.Errorf("difficulty locked for selected continents")
		}
	}
	return nil
}
