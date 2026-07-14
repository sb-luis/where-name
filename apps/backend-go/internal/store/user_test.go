package store

import (
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestIsUniqueViolation(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"nil error", nil, false},
		{"plain error", errors.New("boom"), false},
		{"unique violation", &pgconn.PgError{Code: "23505"}, true},
		{"wrapped unique violation", fmt.Errorf("insert: %w", &pgconn.PgError{Code: "23505"}), true},
		{"other pg error code", &pgconn.PgError{Code: "23503"}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := isUniqueViolation(c.err)
			if got != c.want {
				t.Errorf("isUniqueViolation(%v) = %v, want %v", c.err, got, c.want)
			}
		})
	}
}
