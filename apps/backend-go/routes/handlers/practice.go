package handlers

import (
	"fmt"
	"net/http"

	"github.com/sb-luis/where-name/apps/backend-go/analytics"
	"github.com/sb-luis/where-name/apps/backend-go/routes/middleware"
	"github.com/sb-luis/where-name/apps/backend-go/store"

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
	if variant == "" {
		return fmt.Errorf("variant is required")
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
	if err := readBodyLarge(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validateVariant(body.Variant); err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	rounds, correct, wrong, skipped, err := validateRounds(body.Rounds)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
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
		writeJSON(w, http.StatusOK, map[string]any{"saved": false})
		return
	}

	game, err := h.store.CreatePracticeGame(r.Context(), user.ID, body.Variant, body.Completed, body.DurationMs, rounds)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"id": game.ID, "saved": true})
}
