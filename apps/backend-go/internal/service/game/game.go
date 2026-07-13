// Package game contains the use-case orchestration for practice games:
// validating a submitted game, enforcing difficulty-unlock rules, persisting
// it, and computing the best-effort streak/achievement side effects that
// accompany a successful save.
package game

import (
	"context"
	"log"
	"time"

	"github.com/sb-luis/where-name/apps/backend-go/internal/achievements"
	"github.com/sb-luis/where-name/apps/backend-go/internal/analytics"
	"github.com/sb-luis/where-name/apps/backend-go/internal/geo"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"

	"github.com/posthog/posthog-go"
)

// Store is the subset of store.Store that the game service depends on.
type Store interface {
	HasPlayedToday(ctx context.Context, userID int64) (bool, error)
	CreatePracticeGame(ctx context.Context, userID int64, variant string, completed bool, durationMs int64, rounds []store.CreatePracticeRoundParams) (store.PracticeGame, error)
	GetProfileStats(ctx context.Context, userID int64) (store.ProfileStats, error)
	AwardAchievements(ctx context.Context, userID int64, gameID int64, slugs []string, manifestVersion string) ([]string, error)
	GetUserAchievements(ctx context.Context, userID int64) (map[string]time.Time, error)
}

// Service implements the practice-game use cases.
type Service struct {
	store Store
}

// New builds a Service backed by the given store.
func New(s Store) *Service {
	return &Service{store: s}
}

// Input carries everything CreateGame needs, already decoded from the
// request body plus the caller's identity as resolved by auth middleware.
type Input struct {
	Authenticated bool
	UserID        int64
	Variant       string
	Completed     bool
	DurationMs    int64
	DistinctID    string
	SkipAnalytics bool
	Rounds        []RoundInput
}

// Achievement is a newly-earned achievement to surface to the client.
type Achievement struct {
	Slug        string
	Name        string
	Description string
}

// Result is everything the handler needs to build the HTTP response.
type Result struct {
	Authenticated bool
	Saved         bool
	ID            int64

	// HasStats reports whether streak fields were successfully computed;
	// they're best-effort, so absent on failure.
	HasStats         bool
	CurrentStreak    int
	LongestStreak    int
	IsFirstGameToday bool

	NewAchievements []Achievement
}

// CreateGame validates and (for authenticated users) persists a practice
// game, returning everything the transport layer needs to respond.
func (s *Service) CreateGame(ctx context.Context, in Input) (Result, error) {
	rounds, correct, wrong, skipped, err := ValidateRounds(in.Rounds)
	if err != nil {
		return Result{}, &ValidationError{Msg: err.Error()}
	}

	if !in.SkipAnalytics {
		distinctID := in.DistinctID
		if in.Authenticated {
			distinctID = analytics.DistinctID(in.UserID)
		}
		analytics.Capture(distinctID, "practice_completed", posthog.NewProperties().
			Set("completed", in.Completed).
			Set("correct", correct).
			Set("wrong", wrong).
			Set("skipped", skipped).
			Set("duration_ms", in.DurationMs).
			Set("authenticated", in.Authenticated))
	}

	if !in.Authenticated {
		return Result{Authenticated: false, Saved: false}, nil
	}

	difficulty, _ := geo.DifficultyForVariant(in.Variant)

	if difficulty != "easy" {
		if err := CheckDifficultyUnlocked(ctx, s.store, in.UserID, difficulty, in.Rounds); err != nil {
			return Result{}, &ValidationError{Msg: err.Error()}
		}
	}

	alreadyPlayedToday, err := s.store.HasPlayedToday(ctx, in.UserID)
	if err != nil {
		return Result{}, &InternalError{Context: "check play history", Err: err}
	}

	createdGame, err := s.store.CreatePracticeGame(ctx, in.UserID, in.Variant, in.Completed, in.DurationMs, rounds)
	if err != nil {
		return Result{}, &InternalError{Context: "create practice game", Err: err}
	}

	res := Result{
		Authenticated: true,
		Saved:         true,
		ID:            createdGame.ID,
	}

	// Streak fields are best-effort: the game is already saved above, so a
	// failure here shouldn't fail the whole request, just skip the celebration.
	if profileStats, err := s.store.GetProfileStats(ctx, in.UserID); err == nil {
		res.HasStats = true
		res.CurrentStreak = profileStats.CurrentStreak
		res.LongestStreak = profileStats.LongestStreak
		res.IsFirstGameToday = !alreadyPlayedToday
	}

	// Achievement awarding is best-effort: the game is already saved above,
	// so a failure here shouldn't fail the whole request.
	correctFeatures := make(map[string]struct{})
	for _, round := range in.Rounds {
		if round.Outcome == "correct" {
			correctFeatures[round.Feature] = struct{}{}
		}
	}
	earnedSlugs := achievements.Evaluate(difficulty, correctFeatures)
	newSlugs, err := s.store.AwardAchievements(ctx, in.UserID, createdGame.ID, earnedSlugs, geo.Version())
	if err != nil {
		log.Printf("award achievements: %v", err)
	} else {
		for _, slug := range newSlugs {
			if def, ok := achievements.BySlug(slug); ok {
				res.NewAchievements = append(res.NewAchievements, Achievement{
					Slug:        def.Slug,
					Name:        def.Name,
					Description: def.Description,
				})
			}
		}
	}

	return res, nil
}
