package game

import (
	"context"
	"fmt"

	"github.com/sb-luis/where-name/apps/backend-go/internal/achievements"
	"github.com/sb-luis/where-name/apps/backend-go/internal/geo"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"
)

// RoundInput is a single submitted round of a practice game.
type RoundInput struct {
	Position   int16  `json:"position"`
	Feature    string `json:"feature"`
	Attempt    int16  `json:"attempt"`
	Outcome    string `json:"outcome"`
	DurationMs int64  `json:"duration_ms"`
}

// ValidateRounds checks each round's outcome and tallies correct/wrong/skipped
// counts, converting to store params in the same pass.
func ValidateRounds(rounds []RoundInput) (params []store.CreatePracticeRoundParams, correct, wrong, skipped int, err error) {
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

// CheckDifficultyUnlocked reports an error if any continent present in the
// submitted rounds is not yet unlocked at the requested difficulty for this
// user.
func CheckDifficultyUnlocked(ctx context.Context, s Store, userID int64, difficulty string, rounds []RoundInput) error {
	earned, err := s.GetUserAchievements(ctx, userID)
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
