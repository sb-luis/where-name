package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/sb-luis/where-name/apps/backend-go/internal/errorsx"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"
)

// fakeStore is a hand-written test double for Store. Every method is backed
// by a func field so tests can inject errors, canned results, or assertions
// on the arguments received; a field left nil panics if called, which lets
// tests prove a method was never reached.
type fakeStore struct {
	createUserFn         func(ctx context.Context, username, passwordHash, cursorColor string) (store.User, error)
	getUserByIDFn        func(ctx context.Context, id int64) (store.User, error)
	getUserByUsernameFn  func(ctx context.Context, username string) (store.User, error)
	updateUsernameFn     func(ctx context.Context, userID int64, username string) error
	updatePasswordHashFn func(ctx context.Context, userID int64, hash string) error
	createSessionFn      func(ctx context.Context, userID int64, ttl time.Duration) (store.Session, error)
	deleteSessionFn      func(ctx context.Context, token string) error
}

func (f *fakeStore) CreateUser(ctx context.Context, username, passwordHash, cursorColor string) (store.User, error) {
	if f.createUserFn == nil {
		panic("CreateUser should not have been called")
	}
	return f.createUserFn(ctx, username, passwordHash, cursorColor)
}

func (f *fakeStore) GetUserByID(ctx context.Context, id int64) (store.User, error) {
	if f.getUserByIDFn == nil {
		panic("GetUserByID should not have been called")
	}
	return f.getUserByIDFn(ctx, id)
}

func (f *fakeStore) GetUserByUsername(ctx context.Context, username string) (store.User, error) {
	if f.getUserByUsernameFn == nil {
		panic("GetUserByUsername should not have been called")
	}
	return f.getUserByUsernameFn(ctx, username)
}

func (f *fakeStore) UpdateUsername(ctx context.Context, userID int64, username string) error {
	if f.updateUsernameFn == nil {
		panic("UpdateUsername should not have been called")
	}
	return f.updateUsernameFn(ctx, userID, username)
}

func (f *fakeStore) UpdatePasswordHash(ctx context.Context, userID int64, hash string) error {
	if f.updatePasswordHashFn == nil {
		panic("UpdatePasswordHash should not have been called")
	}
	return f.updatePasswordHashFn(ctx, userID, hash)
}

func (f *fakeStore) CreateSession(ctx context.Context, userID int64, ttl time.Duration) (store.Session, error) {
	if f.createSessionFn == nil {
		panic("CreateSession should not have been called")
	}
	return f.createSessionFn(ctx, userID, ttl)
}

func (f *fakeStore) DeleteSession(ctx context.Context, token string) error {
	if f.deleteSessionFn == nil {
		panic("DeleteSession should not have been called")
	}
	return f.deleteSessionFn(ctx, token)
}

// --- hashPassword / verifyPassword ---

func TestHashPasswordRoundTrip(t *testing.T) {
	hash, err := hashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	ok, err := verifyPassword("correct horse battery staple", hash)
	if err != nil {
		t.Fatalf("verifyPassword: %v", err)
	}
	if !ok {
		t.Error("expected the correct password to verify")
	}
}

func TestVerifyPasswordRejectsWrongPassword(t *testing.T) {
	hash, err := hashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	ok, err := verifyPassword("wrong password", hash)
	if err != nil {
		t.Fatalf("verifyPassword: %v", err)
	}
	if ok {
		t.Error("expected the wrong password to fail verification")
	}
}

func TestVerifyPasswordMalformedHash(t *testing.T) {
	cases := []struct {
		name string
		hash string
	}{
		{"too few parts", "$argon2id$v=19$m=65536,t=2,p=1$saltonly"},
		{"wrong algo tag", "$argon2d$v=19$m=65536,t=2,p=1$c2FsdA$aGFzaA"},
		{"bad base64 salt", "$argon2id$v=19$m=65536,t=2,p=1$not-valid-b64!!$aGFzaA"},
		{"bad base64 hash", "$argon2id$v=19$m=65536,t=2,p=1$c2FsdA$not-valid-b64!!"},
		{"unparseable params", "$argon2id$v=19$garbage$c2FsdA$aGFzaA"},
		{"empty string", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := verifyPassword("whatever", c.hash)
			if err == nil {
				t.Errorf("verifyPassword(%q) expected an error, got nil", c.hash)
			}
		})
	}
}

// --- validateUsername ---

func TestValidateUsername(t *testing.T) {
	cases := []struct {
		name     string
		username string
		wantErr  bool
	}{
		{"minimum length", "ab", false},
		{"maximum length", strings.Repeat("a", 20), false},
		{"typical", "user_123", false},
		{"too short", "a", true},
		{"too long", strings.Repeat("a", 21), true},
		{"empty", "", true},
		{"illegal char space", "user name", true},
		{"illegal char dash", "user-name", true},
		{"illegal char unicode", "usér", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := validateUsername(c.username)
			if c.wantErr && err == nil {
				t.Errorf("validateUsername(%q) expected an error, got nil", c.username)
			}
			if !c.wantErr && err != nil {
				t.Errorf("validateUsername(%q) unexpected error: %v", c.username, err)
			}
		})
	}
}

// --- validatePassword ---

func TestValidatePassword(t *testing.T) {
	cases := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{"minimum length", strings.Repeat("a", 8), false},
		{"maximum length", strings.Repeat("a", MaxPasswordBytes), false},
		{"mid range", "reasonable password", false},
		{"too short", strings.Repeat("a", 7), true},
		{"too long", strings.Repeat("a", MaxPasswordBytes+1), true},
		{"empty", "", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := validatePassword(c.password)
			if c.wantErr && err == nil {
				t.Errorf("validatePassword(len=%d) expected an error, got nil", len(c.password))
			}
			if !c.wantErr && err != nil {
				t.Errorf("validatePassword(len=%d) unexpected error: %v", len(c.password), err)
			}
		})
	}
}

// --- Register ---

func TestRegisterInvalidUsername(t *testing.T) {
	svc := New(&fakeStore{})
	_, _, err := svc.Register(context.Background(), "a", "validpassword", "#ef4444")

	var ve *errorsx.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected *ValidationError, got %v (%T)", err, err)
	}
}

func TestRegisterInvalidPassword(t *testing.T) {
	svc := New(&fakeStore{})
	_, _, err := svc.Register(context.Background(), "validuser", "short", "#ef4444")

	var ve *errorsx.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected *ValidationError, got %v (%T)", err, err)
	}
}

func TestRegisterUsernameConflict(t *testing.T) {
	fake := &fakeStore{
		createUserFn: func(ctx context.Context, username, passwordHash, cursorColor string) (store.User, error) {
			return store.User{}, fmt.Errorf("insert: %w", &pgconn.PgError{Code: "23505"})
		},
	}
	svc := New(fake)
	_, _, err := svc.Register(context.Background(), "validuser", "validpassword", "#ef4444")

	var ce *errorsx.ConflictError
	if !errors.As(err, &ce) {
		t.Fatalf("expected *ConflictError, got %v (%T)", err, err)
	}
}

func TestRegisterCreateUserOtherError(t *testing.T) {
	fake := &fakeStore{
		createUserFn: func(ctx context.Context, username, passwordHash, cursorColor string) (store.User, error) {
			return store.User{}, errors.New("db exploded")
		},
	}
	svc := New(fake)
	_, _, err := svc.Register(context.Background(), "validuser", "validpassword", "#ef4444")

	var ie *errorsx.InternalError
	if !errors.As(err, &ie) {
		t.Fatalf("expected *InternalError, got %v (%T)", err, err)
	}
}

func TestRegisterCreateSessionError(t *testing.T) {
	fake := &fakeStore{
		createUserFn: func(ctx context.Context, username, passwordHash, cursorColor string) (store.User, error) {
			return store.User{ID: 1, Username: username, CursorColor: cursorColor}, nil
		},
		createSessionFn: func(ctx context.Context, userID int64, ttl time.Duration) (store.Session, error) {
			return store.Session{}, errors.New("session store down")
		},
	}
	svc := New(fake)
	_, _, err := svc.Register(context.Background(), "validuser", "validpassword", "#ef4444")

	var ie *errorsx.InternalError
	if !errors.As(err, &ie) {
		t.Fatalf("expected *InternalError, got %v (%T)", err, err)
	}
}

func TestRegisterHappyPathForwardsCursorColorOpaquely(t *testing.T) {
	const wantColor = "not-a-real-palette-color-just-whatever-the-caller-passed"
	var gotColor string

	fake := &fakeStore{
		createUserFn: func(ctx context.Context, username, passwordHash, cursorColor string) (store.User, error) {
			gotColor = cursorColor
			return store.User{ID: 42, Username: username, CursorColor: cursorColor}, nil
		},
		createSessionFn: func(ctx context.Context, userID int64, ttl time.Duration) (store.Session, error) {
			if ttl != SessionTTL {
				t.Errorf("expected ttl %v, got %v", SessionTTL, ttl)
			}
			return store.Session{ID: "sess-token", UserID: userID}, nil
		},
	}
	svc := New(fake)

	u, sess, err := svc.Register(context.Background(), "validuser", "validpassword", wantColor)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if gotColor != wantColor {
		t.Errorf("expected CreateUser to receive cursorColor %q, got %q", wantColor, gotColor)
	}
	if u.CursorColor != wantColor {
		t.Errorf("expected returned user CursorColor %q, got %q", wantColor, u.CursorColor)
	}
	if u.ID != 42 {
		t.Errorf("expected returned user ID 42, got %d", u.ID)
	}
	if sess.ID != "sess-token" || sess.UserID != 42 {
		t.Errorf("unexpected session: %+v", sess)
	}
}

// --- Login ---

func TestLoginPasswordTooLongShortCircuits(t *testing.T) {
	fake := &fakeStore{} // GetUserByUsername left nil: panics if called
	svc := New(fake)

	_, _, err := svc.Login(context.Background(), "someuser", strings.Repeat("a", MaxPasswordBytes+1))

	var ue *errorsx.UnauthorizedError
	if !errors.As(err, &ue) {
		t.Fatalf("expected *UnauthorizedError, got %v (%T)", err, err)
	}
}

func TestLoginUserNotFound(t *testing.T) {
	fake := &fakeStore{
		getUserByUsernameFn: func(ctx context.Context, username string) (store.User, error) {
			return store.User{}, store.ErrNotFound
		},
	}
	svc := New(fake)

	_, _, err := svc.Login(context.Background(), "ghost", "validpassword")

	var ue *errorsx.UnauthorizedError
	if !errors.As(err, &ue) {
		t.Fatalf("expected *UnauthorizedError, got %v (%T)", err, err)
	}
}

func TestLoginGetUserOtherError(t *testing.T) {
	fake := &fakeStore{
		getUserByUsernameFn: func(ctx context.Context, username string) (store.User, error) {
			return store.User{}, errors.New("db exploded")
		},
	}
	svc := New(fake)

	_, _, err := svc.Login(context.Background(), "someuser", "validpassword")

	var ie *errorsx.InternalError
	if !errors.As(err, &ie) {
		t.Fatalf("expected *InternalError, got %v (%T)", err, err)
	}
}

func TestLoginWrongPassword(t *testing.T) {
	hash, err := hashPassword("correct password")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	fake := &fakeStore{
		getUserByUsernameFn: func(ctx context.Context, username string) (store.User, error) {
			return store.User{ID: 1, Username: username, PasswordHash: hash}, nil
		},
	}
	svc := New(fake)

	_, _, err = svc.Login(context.Background(), "someuser", "wrong password")

	var ue *errorsx.UnauthorizedError
	if !errors.As(err, &ue) {
		t.Fatalf("expected *UnauthorizedError, got %v (%T)", err, err)
	}
}

func TestLoginHappyPath(t *testing.T) {
	const password = "correct password"
	hash, err := hashPassword(password)
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	fake := &fakeStore{
		getUserByUsernameFn: func(ctx context.Context, username string) (store.User, error) {
			return store.User{ID: 7, Username: username, PasswordHash: hash}, nil
		},
		createSessionFn: func(ctx context.Context, userID int64, ttl time.Duration) (store.Session, error) {
			return store.Session{ID: "tok", UserID: userID}, nil
		},
	}
	svc := New(fake)

	u, sess, err := svc.Login(context.Background(), "someuser", password)
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if u.ID != 7 {
		t.Errorf("expected user ID 7, got %d", u.ID)
	}
	if sess.ID != "tok" || sess.UserID != 7 {
		t.Errorf("unexpected session: %+v", sess)
	}
}

// --- Logout ---

func TestLogoutCallsDeleteSessionAndIgnoresError(t *testing.T) {
	var gotToken string
	fake := &fakeStore{
		deleteSessionFn: func(ctx context.Context, token string) error {
			gotToken = token
			return errors.New("delete failed, should be swallowed")
		},
	}
	svc := New(fake)

	// Should not panic despite DeleteSession returning an error.
	svc.Logout(context.Background(), "the-token")

	if gotToken != "the-token" {
		t.Errorf("expected DeleteSession to receive %q, got %q", "the-token", gotToken)
	}
}

// --- UpdateMe ---

func TestUpdateMeUsernameConflict(t *testing.T) {
	fake := &fakeStore{
		updateUsernameFn: func(ctx context.Context, userID int64, username string) error {
			return fmt.Errorf("update: %w", &pgconn.PgError{Code: "23505"})
		},
	}
	svc := New(fake)
	u := &store.User{ID: 1, Username: "old"}
	newUsername := "newname"

	err := svc.UpdateMe(context.Background(), u, UpdateMeInput{Username: &newUsername})

	var ce *errorsx.ConflictError
	if !errors.As(err, &ce) {
		t.Fatalf("expected *ConflictError, got %v (%T)", err, err)
	}
	if u.Username != "old" {
		t.Errorf("expected username to be left unchanged on failure, got %q", u.Username)
	}
}

func TestUpdateMeUsernameOtherStoreError(t *testing.T) {
	fake := &fakeStore{
		updateUsernameFn: func(ctx context.Context, userID int64, username string) error {
			return errors.New("db exploded")
		},
	}
	svc := New(fake)
	u := &store.User{ID: 1, Username: "old"}
	newUsername := "newname"

	err := svc.UpdateMe(context.Background(), u, UpdateMeInput{Username: &newUsername})

	var ie *errorsx.InternalError
	if !errors.As(err, &ie) {
		t.Fatalf("expected *InternalError, got %v (%T)", err, err)
	}
}

func TestUpdateMeUsernameSuccessMutatesInPlace(t *testing.T) {
	var gotUserID int64
	var gotUsername string
	fake := &fakeStore{
		updateUsernameFn: func(ctx context.Context, userID int64, username string) error {
			gotUserID = userID
			gotUsername = username
			return nil
		},
	}
	svc := New(fake)
	u := &store.User{ID: 9, Username: "old"}
	newUsername := "newname"

	err := svc.UpdateMe(context.Background(), u, UpdateMeInput{Username: &newUsername})
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if u.Username != "newname" {
		t.Errorf("expected u.Username mutated to %q, got %q", "newname", u.Username)
	}
	if gotUserID != 9 || gotUsername != "newname" {
		t.Errorf("expected UpdateUsername(9, %q), got UpdateUsername(%d, %q)", "newname", gotUserID, gotUsername)
	}
}

func TestUpdateMeInvalidUsername(t *testing.T) {
	svc := New(&fakeStore{})
	u := &store.User{ID: 1, Username: "old"}
	bad := "a" // too short

	err := svc.UpdateMe(context.Background(), u, UpdateMeInput{Username: &bad})

	var ve *errorsx.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected *ValidationError, got %v (%T)", err, err)
	}
	if u.Username != "old" {
		t.Errorf("expected username to be left unchanged on failure, got %q", u.Username)
	}
}

func TestUpdateMeNewPasswordWithoutCurrentPassword(t *testing.T) {
	svc := New(&fakeStore{})
	u := &store.User{ID: 1, Username: "old"}
	newPassword := "newvalidpassword"

	err := svc.UpdateMe(context.Background(), u, UpdateMeInput{NewPassword: &newPassword})

	var ve *errorsx.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected *ValidationError, got %v (%T)", err, err)
	}
}

func TestUpdateMeNewPasswordWrongCurrentPassword(t *testing.T) {
	hash, err := hashPassword("actual current password")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	fake := &fakeStore{
		getUserByIDFn: func(ctx context.Context, id int64) (store.User, error) {
			return store.User{ID: id, PasswordHash: hash}, nil
		},
	}
	svc := New(fake)
	u := &store.User{ID: 1, Username: "old"}
	current := "wrong current password"
	newPassword := "newvalidpassword"

	err = svc.UpdateMe(context.Background(), u, UpdateMeInput{CurrentPassword: &current, NewPassword: &newPassword})

	var ue *errorsx.UnauthorizedError
	if !errors.As(err, &ue) {
		t.Fatalf("expected *UnauthorizedError, got %v (%T)", err, err)
	}
}

func TestUpdateMeNewPasswordSuccess(t *testing.T) {
	hash, err := hashPassword("actual current password")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	var gotUserID int64
	var gotHash string
	fake := &fakeStore{
		getUserByIDFn: func(ctx context.Context, id int64) (store.User, error) {
			return store.User{ID: id, PasswordHash: hash}, nil
		},
		updatePasswordHashFn: func(ctx context.Context, userID int64, h string) error {
			gotUserID = userID
			gotHash = h
			return nil
		},
	}
	svc := New(fake)
	u := &store.User{ID: 5, Username: "old"}
	current := "actual current password"
	newPassword := "newvalidpassword"

	err = svc.UpdateMe(context.Background(), u, UpdateMeInput{CurrentPassword: &current, NewPassword: &newPassword})
	if err != nil {
		t.Fatalf("expected success, got error: %v", err)
	}
	if gotUserID != 5 {
		t.Errorf("expected UpdatePasswordHash to receive userID 5, got %d", gotUserID)
	}
	ok, err := verifyPassword(newPassword, gotHash)
	if err != nil || !ok {
		t.Errorf("expected the persisted hash to verify the new password, err=%v ok=%v", err, ok)
	}
}

func TestUpdateMeInvalidNewPassword(t *testing.T) {
	hash, err := hashPassword("actual current password")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	fake := &fakeStore{
		getUserByIDFn: func(ctx context.Context, id int64) (store.User, error) {
			return store.User{ID: id, PasswordHash: hash}, nil
		},
	}
	svc := New(fake)
	u := &store.User{ID: 1, Username: "old"}
	current := "actual current password"
	tooShort := "short"

	err = svc.UpdateMe(context.Background(), u, UpdateMeInput{CurrentPassword: &current, NewPassword: &tooShort})

	var ve *errorsx.ValidationError
	if !errors.As(err, &ve) {
		t.Fatalf("expected *ValidationError, got %v (%T)", err, err)
	}
}
