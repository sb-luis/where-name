package store

import (
	"context"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

type Store struct {
	db *pgxpool.Pool
}

func Open(ctx context.Context, dsn string) (*Store, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping db: %w", err)
	}
	s := &Store{db: pool}
	if err := s.runMigrations(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("run migrations: %w", err)
	}
	return s, nil
}

func (s *Store) Close() {
	s.db.Close()
}

func (s *Store) runMigrations(ctx context.Context) error {
	// Track applied migrations so we only run each one once.
	if _, err := s.db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	// Read embedded SQL files, sorted so they run in order (001_*, 002_*, ...).
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})

	for _, entry := range entries {
		version := strings.TrimSuffix(entry.Name(), ".sql")

		// Skip if already applied.
		var applied bool
		if err := s.db.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)`,
			version,
		).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", version, err)
		}
		if applied {
			continue
		}

		sql, err := migrationFiles.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return fmt.Errorf("read migration %s: %w", version, err)
		}

		// Run in a transaction so both the schema change and the tracking record are atomic.
		tx, err := s.db.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", version, err)
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("exec migration %s: %w", version, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO schema_migrations (version) VALUES ($1)`, version,
		); err != nil {
			tx.Rollback(ctx)
			return fmt.Errorf("record migration %s: %w", version, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration %s: %w", version, err)
		}
	}
	return nil
}
