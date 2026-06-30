package store

import (
	"context"
	"fmt"
	"time"
)

type CountryStat struct {
	Feature    string
	Correct    int
	Wrong      int
	Skipped    int
	AvgCorrectMs *int64
}

type PracticeStats struct {
	GamesPlayed    int
	GamesCompleted int
	Countries      []CountryStat
}

type ProfileStats struct {
	GamesPlayed    int
	GamesCompleted int
	CurrentStreak  int
	LongestStreak  int
}

func (s *Store) GetPracticeStats(ctx context.Context, userID int64, variant string) (PracticeStats, error) {
	var stats PracticeStats

	if err := s.db.QueryRow(ctx, `
		SELECT
			COUNT(*)                                   AS games_played,
			COUNT(*) FILTER (WHERE completed = true)   AS games_completed
		FROM practice_games
		WHERE user_id = $1 AND variant = $2
	`, userID, variant).Scan(&stats.GamesPlayed, &stats.GamesCompleted); err != nil {
		return PracticeStats{}, fmt.Errorf("query game counts: %w", err)
	}

	rows, err := s.db.Query(ctx, `
		SELECT
			r.feature,
			COUNT(*) FILTER (WHERE r.outcome = 'correct')                        AS correct,
			COUNT(*) FILTER (WHERE r.outcome = 'wrong')                          AS wrong,
			COUNT(*) FILTER (WHERE r.outcome = 'skipped')                        AS skipped,
			AVG(r.duration_ms) FILTER (WHERE r.outcome = 'correct')::BIGINT      AS avg_correct_ms
		FROM practice_rounds r
		JOIN practice_games g ON g.id = r.game_id
		WHERE g.user_id = $1 AND g.variant = $2
		GROUP BY r.feature
		ORDER BY r.feature
	`, userID, variant)
	if err != nil {
		return PracticeStats{}, fmt.Errorf("query country stats: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cs CountryStat
		if err := rows.Scan(&cs.Feature, &cs.Correct, &cs.Wrong, &cs.Skipped, &cs.AvgCorrectMs); err != nil {
			return PracticeStats{}, fmt.Errorf("scan country stat: %w", err)
		}
		stats.Countries = append(stats.Countries, cs)
	}
	return stats, rows.Err()
}

// GetProfileStats summarizes a user's play activity across all variants,
// including their current and longest daily-play streaks.
func (s *Store) GetProfileStats(ctx context.Context, userID int64) (ProfileStats, error) {
	var stats ProfileStats

	if err := s.db.QueryRow(ctx, `
		SELECT
			COUNT(*)                                 AS games_played,
			COUNT(*) FILTER (WHERE completed = true) AS games_completed
		FROM practice_games
		WHERE user_id = $1
	`, userID).Scan(&stats.GamesPlayed, &stats.GamesCompleted); err != nil {
		return ProfileStats{}, fmt.Errorf("query game counts: %w", err)
	}

	rows, err := s.db.Query(ctx, `
		SELECT DISTINCT (played_at AT TIME ZONE 'UTC')::date AS day
		FROM practice_games
		WHERE user_id = $1
		ORDER BY day DESC
	`, userID)
	if err != nil {
		return ProfileStats{}, fmt.Errorf("query play days: %w", err)
	}
	defer rows.Close()

	var days []time.Time
	for rows.Next() {
		var day time.Time
		if err := rows.Scan(&day); err != nil {
			return ProfileStats{}, fmt.Errorf("scan play day: %w", err)
		}
		days = append(days, day)
	}
	if err := rows.Err(); err != nil {
		return ProfileStats{}, err
	}

	stats.CurrentStreak, stats.LongestStreak = computeStreaks(days)
	return stats, nil
}

// computeStreaks expects days sorted descending and deduplicated by date.
func computeStreaks(days []time.Time) (current, longest int) {
	if len(days) == 0 {
		return 0, 0
	}

	run := 1
	longest = 1
	for i := 1; i < len(days); i++ {
		if days[i-1].Sub(days[i]) == 24*time.Hour {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)
	if today.Sub(days[0]) <= 24*time.Hour {
		current = 1
		for i := 1; i < len(days) && days[i-1].Sub(days[i]) == 24*time.Hour; i++ {
			current++
		}
	}

	return current, longest
}
