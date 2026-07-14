package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/sb-luis/where-name/apps/backend-go/internal/id"
)

var (
	// ErrNotFound is returned when a queried row doesn't exist.
	ErrNotFound = errors.New("not found")
	// ErrUniqueViolation is returned when a write violates a unique
	// constraint (e.g. a taken username). Callers match it with errors.Is
	// rather than inspecting the underlying driver error.
	ErrUniqueViolation = errors.New("unique violation")
)

type Session struct {
	ID        string
	UserID    int64
	CreatedAt time.Time
	ExpiresAt time.Time
}

func (s *Store) CreateSession(ctx context.Context, userID int64, ttl time.Duration) (Session, error) {
	// 32 bytes (256 bits) so the session token is infeasible to guess or brute-force.
	token, err := id.RandomHex(32)
	if err != nil {
		return Session{}, fmt.Errorf("generate token: %w", err)
	}
	expiresAt := time.Now().Add(ttl)
	var sess Session
	err = s.db.QueryRow(ctx, `
		INSERT INTO sessions (id, user_id, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, created_at, expires_at
	`, token, userID, expiresAt).Scan(&sess.ID, &sess.UserID, &sess.CreatedAt, &sess.ExpiresAt)
	if err != nil {
		return Session{}, fmt.Errorf("create session: %w", err)
	}
	return sess, nil
}

func (s *Store) GetSession(ctx context.Context, token string) (Session, error) {
	var sess Session
	err := s.db.QueryRow(ctx, `
		SELECT id, user_id, created_at, expires_at
		FROM sessions
		WHERE id = $1 AND expires_at > now()
	`, token).Scan(&sess.ID, &sess.UserID, &sess.CreatedAt, &sess.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("get session: %w", err)
	}
	return sess, nil
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, token)
	return err
}

func (s *Store) DeleteExpiredSessions(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= now()`)
	return err
}
