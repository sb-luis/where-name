package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type User struct {
	ID           int64
	Username     string
	PasswordHash string
	CursorColor  string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (s *Store) CreateUser(ctx context.Context, username, passwordHash, cursorColor string) (User, error) {
	var u User
	err := s.db.QueryRow(ctx, `
		INSERT INTO users (username, password_hash, cursor_color)
		VALUES ($1, $2, $3)
		RETURNING id, username, password_hash, cursor_color, created_at, updated_at
	`, username, passwordHash, cursorColor).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CursorColor, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return User{}, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

func (s *Store) GetUserByID(ctx context.Context, id int64) (User, error) {
	var u User
	err := s.db.QueryRow(ctx, `
		SELECT id, username, password_hash, cursor_color, created_at, updated_at
		FROM users WHERE id = $1
	`, id).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CursorColor, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("get user by id: %w", err)
	}
	return u, nil
}

func (s *Store) GetUserByUsername(ctx context.Context, username string) (User, error) {
	var u User
	err := s.db.QueryRow(ctx, `
		SELECT id, username, password_hash, cursor_color, created_at, updated_at
		FROM users WHERE username = $1
	`, username).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CursorColor, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	if err != nil {
		return User{}, fmt.Errorf("get user: %w", err)
	}
	return u, nil
}

func (s *Store) UpdateUsername(ctx context.Context, userID int64, username string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE users SET username = $1, updated_at = now() WHERE id = $2
	`, username, userID)
	return err
}

func (s *Store) UpdatePasswordHash(ctx context.Context, userID int64, hash string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2
	`, hash, userID)
	return err
}

func (s *Store) UpdateCursorColor(ctx context.Context, userID int64, color string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE users SET cursor_color = $1, updated_at = now() WHERE id = $2
	`, color, userID)
	return err
}
