// User profile - currently just handling cursor colors
package profile

import (
	"context"

	"github.com/sb-luis/where-name/apps/backend-go/internal/errorsx"
	"github.com/sb-luis/where-name/apps/backend-go/internal/presence"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"
)

// Store is the subset of store.Store that the profile service depends on.
type Store interface {
	UpdateCursorColor(ctx context.Context, userID int64, color string) error
}

// Service implements the profile-settings use cases.
type Service struct {
	store Store
}

// New builds a Service backed by the given store.
func New(s Store) *Service {
	return &Service{store: s}
}

// DefaultColor returns a random palette color for a newly registered user.
func (s *Service) DefaultColor() string {
	return presence.Random()
}

// EnsureColor persists u's replacement color if its stored one fell out of the
// palette (e.g. the palette shrank after the color was assigned). u is mutated
// in place to reflect any replacement.
func (s *Service) EnsureColor(ctx context.Context, u *store.User) error {
	color, changed := presence.EnsureAllowed(u.CursorColor)
	if !changed {
		return nil
	}
	u.CursorColor = color
	if err := s.store.UpdateCursorColor(ctx, u.ID, color); err != nil {
		return &errorsx.InternalError{Context: "ensure allowed cursor color", Err: err}
	}
	return nil
}

// UpdateColor validates color against the palette and persists it. Unlike
// EnsureColor, an invalid color here is rejected rather than silently replaced.
func (s *Service) UpdateColor(ctx context.Context, userID int64, color string) error {
	if !presence.Allowed(color) {
		return &errorsx.ValidationError{Msg: "invalid cursor color"}
	}
	if err := s.store.UpdateCursorColor(ctx, userID, color); err != nil {
		return &errorsx.InternalError{Context: "update cursor color", Err: err}
	}
	return nil
}
