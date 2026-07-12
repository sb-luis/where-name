package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// AwardAchievements inserts the given slugs for the user, skipping ones
// already awarded, and returns only the newly-inserted slugs.
func (s *Store) AwardAchievements(ctx context.Context, userID int64, gameID int64, slugs []string, manifestVersion string) ([]string, error) {
	if len(slugs) == 0 {
		return nil, nil
	}

	var newSlugs []string
	for _, slug := range slugs {
		var inserted string
		err := s.db.QueryRow(ctx, `
			INSERT INTO user_achievements (user_id, slug, game_id, manifest_version)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (user_id, slug) DO NOTHING
			RETURNING slug
		`, userID, slug, gameID, manifestVersion).Scan(&inserted)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			return nil, fmt.Errorf("insert user_achievement: %w", err)
		}
		newSlugs = append(newSlugs, inserted)
	}
	return newSlugs, nil
}

// GetUserAchievements returns the user's earned achievement slugs mapped to
// when they were unlocked.
func (s *Store) GetUserAchievements(ctx context.Context, userID int64) (map[string]time.Time, error) {
	rows, err := s.db.Query(ctx, `
		SELECT slug, unlocked_at FROM user_achievements WHERE user_id = $1
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query user_achievements: %w", err)
	}
	defer rows.Close()

	result := make(map[string]time.Time)
	for rows.Next() {
		var slug string
		var unlockedAt time.Time
		if err := rows.Scan(&slug, &unlockedAt); err != nil {
			return nil, fmt.Errorf("scan user_achievement: %w", err)
		}
		result[slug] = unlockedAt
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate user_achievements: %w", err)
	}
	return result, nil
}
