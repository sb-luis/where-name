package store

import (
	"context"
	"fmt"
	"time"
)

type PracticeGame struct {
	ID         int64
	UserID     int64
	Variant    string
	Completed  bool
	DurationMs int64
	PlayedAt   time.Time
}

type PracticeRound struct {
	ID         int64
	GameID     int64
	Position   int16
	Feature    string
	Attempt    int16
	Outcome    string
	DurationMs int64
}

type CreatePracticeRoundParams struct {
	Position   int16
	Feature    string
	Attempt    int16
	Outcome    string
	DurationMs int64
}

func (s *Store) CreatePracticeGame(ctx context.Context, userID int64, variant string, completed bool, durationMs int64, rounds []CreatePracticeRoundParams) (PracticeGame, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return PracticeGame{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var g PracticeGame
	err = tx.QueryRow(ctx, `
		INSERT INTO practice_games (user_id, variant, completed, duration_ms)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, variant, completed, duration_ms, played_at
	`, userID, variant, completed, durationMs).Scan(
		&g.ID, &g.UserID, &g.Variant, &g.Completed, &g.DurationMs, &g.PlayedAt,
	)
	if err != nil {
		return PracticeGame{}, fmt.Errorf("insert practice_game: %w", err)
	}

	for _, r := range rounds {
		_, err = tx.Exec(ctx, `
			INSERT INTO practice_rounds (game_id, position, feature, attempt, outcome, duration_ms)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, g.ID, r.Position, r.Feature, r.Attempt, r.Outcome, r.DurationMs)
		if err != nil {
			return PracticeGame{}, fmt.Errorf("insert practice_round: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return PracticeGame{}, fmt.Errorf("commit tx: %w", err)
	}
	return g, nil
}
