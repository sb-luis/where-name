package profile

import (
	"context"
	"errors"
	"testing"

	"github.com/sb-luis/where-name/apps/backend-go/internal/errorsx"
	"github.com/sb-luis/where-name/apps/backend-go/internal/presence"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"
)

// allowedColor and disallowedColor are drawn from the actual palette in
// internal/presence/presence.go so these tests break if that palette ever
// stops agreeing with presence.Allowed.
const (
	allowedColor    = "#ef4444"
	disallowedColor = "#000000"
)

// fakeStore is a hand-written test double for Store. UpdateCursorColor is
// backed by a func field so tests can inject errors or assert the arguments
// it was called with; leaving it nil panics if it's invoked, which lets
// tests prove the store was never touched.
type fakeStore struct {
	updateCursorColorFn func(ctx context.Context, userID int64, color string) error
}

func (f *fakeStore) UpdateCursorColor(ctx context.Context, userID int64, color string) error {
	if f.updateCursorColorFn == nil {
		panic("UpdateCursorColor should not have been called")
	}
	return f.updateCursorColorFn(ctx, userID, color)
}

func init() {
	// Sanity-check our fixtures against the real palette so a future palette
	// change surfaces as an obvious failure here rather than a silently
	// meaningless test elsewhere in this file.
	if !presence.Allowed(allowedColor) {
		panic("test fixture allowedColor is not actually allowed by the presence palette")
	}
	if presence.Allowed(disallowedColor) {
		panic("test fixture disallowedColor is unexpectedly allowed by the presence palette")
	}
}

// --- DefaultColor ---

func TestDefaultColorReturnsAnAllowedColor(t *testing.T) {
	svc := New(&fakeStore{})
	for i := 0; i < 50; i++ {
		got := svc.DefaultColor()
		if !presence.Allowed(got) {
			t.Fatalf("DefaultColor() = %q, want an allowed palette color", got)
		}
	}
}

// --- EnsureColor ---

func TestEnsureColorLeavesAnAllowedColorUnchanged(t *testing.T) {
	svc := New(&fakeStore{}) // UpdateCursorColor left nil: panics if called
	u := &store.User{ID: 1, CursorColor: allowedColor}

	err := svc.EnsureColor(context.Background(), u)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if u.CursorColor != allowedColor {
		t.Errorf("expected CursorColor to remain %q, got %q", allowedColor, u.CursorColor)
	}
}

func TestEnsureColorReplacesADisallowedColor(t *testing.T) {
	var gotUserID int64
	var gotColor string
	fake := &fakeStore{
		updateCursorColorFn: func(ctx context.Context, userID int64, color string) error {
			gotUserID = userID
			gotColor = color
			return nil
		},
	}
	svc := New(fake)
	u := &store.User{ID: 7, CursorColor: disallowedColor}

	err := svc.EnsureColor(context.Background(), u)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if !presence.Allowed(u.CursorColor) {
		t.Errorf("expected u.CursorColor to be replaced with an allowed color, got %q", u.CursorColor)
	}
	if u.CursorColor == disallowedColor {
		t.Error("expected u.CursorColor to actually change from the disallowed color")
	}
	if gotUserID != 7 {
		t.Errorf("expected UpdateCursorColor to receive userID 7, got %d", gotUserID)
	}
	if gotColor != u.CursorColor {
		t.Errorf("expected UpdateCursorColor to receive the new color %q, got %q", u.CursorColor, gotColor)
	}
}

func TestEnsureColorStoreErrorWrapsInternalError(t *testing.T) {
	underlying := errors.New("db exploded")
	fake := &fakeStore{
		updateCursorColorFn: func(ctx context.Context, userID int64, color string) error {
			return underlying
		},
	}
	svc := New(fake)
	u := &store.User{ID: 1, CursorColor: disallowedColor}

	err := svc.EnsureColor(context.Background(), u)

	var ie *errorsx.InternalError
	if !errors.As(err, &ie) {
		t.Fatalf("expected *InternalError, got %v (%T)", err, err)
	}
	if ie.Context != "ensure allowed cursor color" {
		t.Errorf("expected Context %q, got %q", "ensure allowed cursor color", ie.Context)
	}
	if !errors.Is(err, underlying) {
		t.Errorf("expected the InternalError to unwrap to the underlying store error")
	}
}

// --- UpdateColor ---

func TestUpdateColorRejectsDisallowedColor(t *testing.T) {
	svc := New(&fakeStore{}) // UpdateCursorColor left nil: panics if called

	err := svc.UpdateColor(context.Background(), 1, disallowedColor)

	var ve *errorsx.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected *ValidationError, got %v (%T)", err, err)
	}
}

func TestUpdateColorRejectsGarbageColor(t *testing.T) {
	svc := New(&fakeStore{}) // UpdateCursorColor left nil: panics if called

	err := svc.UpdateColor(context.Background(), 1, "not-a-color")

	var ve *errorsx.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected *ValidationError, got %v (%T)", err, err)
	}
}

func TestUpdateColorPersistsAnAllowedColor(t *testing.T) {
	var gotUserID int64
	var gotColor string
	fake := &fakeStore{
		updateCursorColorFn: func(ctx context.Context, userID int64, color string) error {
			gotUserID = userID
			gotColor = color
			return nil
		},
	}
	svc := New(fake)

	err := svc.UpdateColor(context.Background(), 3, allowedColor)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if gotUserID != 3 {
		t.Errorf("expected UpdateCursorColor to receive userID 3, got %d", gotUserID)
	}
	if gotColor != allowedColor {
		t.Errorf("expected UpdateCursorColor to receive %q, got %q", allowedColor, gotColor)
	}
}

func TestUpdateColorStoreErrorWrapsInternalError(t *testing.T) {
	underlying := errors.New("db exploded")
	fake := &fakeStore{
		updateCursorColorFn: func(ctx context.Context, userID int64, color string) error {
			return underlying
		},
	}
	svc := New(fake)

	err := svc.UpdateColor(context.Background(), 1, allowedColor)

	var ie *errorsx.InternalError
	if !errors.As(err, &ie) {
		t.Fatalf("expected *InternalError, got %v (%T)", err, err)
	}
	if ie.Context != "update cursor color" {
		t.Errorf("expected Context %q, got %q", "update cursor color", ie.Context)
	}
	if !errors.Is(err, underlying) {
		t.Errorf("expected the InternalError to unwrap to the underlying store error")
	}
}
