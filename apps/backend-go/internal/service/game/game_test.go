package game

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/sb-luis/where-name/apps/backend-go/internal/achievements"
	"github.com/sb-luis/where-name/apps/backend-go/internal/errorsx"
	"github.com/sb-luis/where-name/apps/backend-go/internal/geo"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"
)

// fakeStore is a hand-written test double for Store. Every field a test
// doesn't set keeps its zero value, so unused paths simply return nothing.
type fakeStore struct {
	hasPlayedToday   bool
	createdGame      store.PracticeGame
	profileStats     store.ProfileStats
	awardedNewSlugs  []string
	userAchievements map[string]time.Time
	failIfCalled     bool // panics if any store method is invoked; used to prove validation short-circuits
}

func (f *fakeStore) HasPlayedToday(ctx context.Context, userID int64) (bool, error) {
	if f.failIfCalled {
		panic("HasPlayedToday should not have been called")
	}
	return f.hasPlayedToday, nil
}

func (f *fakeStore) CreatePracticeGame(ctx context.Context, userID int64, variant string, completed bool, durationMs int64, rounds []store.CreatePracticeRoundParams) (store.PracticeGame, error) {
	if f.failIfCalled {
		panic("CreatePracticeGame should not have been called")
	}
	return f.createdGame, nil
}

func (f *fakeStore) GetProfileStats(ctx context.Context, userID int64) (store.ProfileStats, error) {
	if f.failIfCalled {
		panic("GetProfileStats should not have been called")
	}
	return f.profileStats, nil
}

func (f *fakeStore) AwardAchievements(ctx context.Context, userID int64, gameID int64, slugs []string, manifestVersion string) ([]string, error) {
	if f.failIfCalled {
		panic("AwardAchievements should not have been called")
	}
	return f.awardedNewSlugs, nil
}

func (f *fakeStore) GetUserAchievements(ctx context.Context, userID int64) (map[string]time.Time, error) {
	if f.failIfCalled {
		panic("GetUserAchievements should not have been called")
	}
	return f.userAchievements, nil
}

func TestCreateGameRejectsInvalidRounds(t *testing.T) {
	svc := New(&fakeStore{failIfCalled: true})

	_, err := svc.CreateGame(context.Background(), Input{
		Authenticated: true,
		UserID:        1,
		Variant:       "whatever",
		SkipAnalytics: true,
		Rounds:        nil, // empty rounds is rejected by ValidateRounds
	})

	var ve *errorsx.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected a *ValidationError, got %v (%T)", err, err)
	}
	if ve.Msg != "rounds must not be empty" {
		t.Errorf("unexpected message: %q", ve.Msg)
	}
}

func TestCreateGameSavesForAuthenticatedUser(t *testing.T) {
	variant, ok := geo.VariantForDifficulty("easy")
	if !ok {
		t.Fatal("no variant registered for the easy difficulty")
	}
	newAchievement := achievements.All()[0]

	fake := &fakeStore{
		hasPlayedToday:  false,
		createdGame:     store.PracticeGame{ID: 42},
		profileStats:    store.ProfileStats{CurrentStreak: 3, LongestStreak: 5},
		awardedNewSlugs: []string{newAchievement.Slug},
	}
	svc := New(fake)

	res, err := svc.CreateGame(context.Background(), Input{
		Authenticated: true,
		UserID:        7,
		Variant:       variant,
		Completed:     true,
		DurationMs:    1500,
		SkipAnalytics: true,
		Rounds: []RoundInput{
			{Position: 0, Feature: "Test", Attempt: 1, Outcome: "correct", DurationMs: 500},
		},
	})
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}

	if !res.Authenticated || !res.Saved {
		t.Errorf("expected an authenticated, saved result, got %+v", res)
	}
	if res.ID != 42 {
		t.Errorf("expected id=42, got %d", res.ID)
	}
	if !res.HasStats || res.CurrentStreak != 3 || res.LongestStreak != 5 || !res.IsFirstGameToday {
		t.Errorf("unexpected stats: %+v", res)
	}
	if len(res.NewAchievements) != 1 || res.NewAchievements[0].Slug != newAchievement.Slug {
		t.Errorf("expected newly awarded achievement %q, got %+v", newAchievement.Slug, res.NewAchievements)
	}
}
