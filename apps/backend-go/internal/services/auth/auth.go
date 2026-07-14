// Package auth contains the use-case orchestration for authentication and
// account management: registering, logging in/out, and updating username or
// password.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/sb-luis/where-name/apps/backend-go/internal/errorsx"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"

	"golang.org/x/crypto/argon2"
)

// SessionTTL is how long a freshly created session stays valid.
const SessionTTL = 30 * 24 * time.Hour

// MaxPasswordBytes caps Argon2 hashing cost regardless of body size.
const MaxPasswordBytes = 256

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_]{2,20}$`)

// Store is the subset of store.Store that the auth service depends on.
type Store interface {
	CreateUser(ctx context.Context, username, passwordHash, cursorColor string) (store.User, error)
	GetUserByID(ctx context.Context, id int64) (store.User, error)
	GetUserByUsername(ctx context.Context, username string) (store.User, error)
	UpdateUsername(ctx context.Context, userID int64, username string) error
	UpdatePasswordHash(ctx context.Context, userID int64, hash string) error
	CreateSession(ctx context.Context, userID int64, ttl time.Duration) (store.Session, error)
	DeleteSession(ctx context.Context, token string) error
}

// Service implements the auth/account use cases.
type Service struct {
	store Store
}

// New builds a Service backed by the given store.
func New(s Store) *Service {
	return &Service{store: s}
}

// --- Argon2id ---

var argon2Params = struct {
	time    uint32
	memory  uint32
	threads uint8
	keyLen  uint32
}{time: 2, memory: 64 * 1024, threads: 1, keyLen: 32}

func hashPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	p := argon2Params
	hash := argon2.IDKey([]byte(password), salt, p.time, p.memory, p.threads, p.keyLen)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		p.memory, p.time, p.threads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

func verifyPassword(password, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	// "$argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>" splits into 6 parts, first empty
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, fmt.Errorf("invalid hash format")
	}
	var p struct {
		memory, time uint32
		threads      uint8
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &p.memory, &p.time, &p.threads); err != nil {
		return false, fmt.Errorf("parse params: %w", err)
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("decode salt: %w", err)
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("decode hash: %w", err)
	}
	actual := argon2.IDKey([]byte(password), salt, p.time, p.memory, p.threads, argon2Params.keyLen)
	return subtle.ConstantTimeCompare(actual, expected) == 1, nil
}

// --- validation ---

func validateUsername(username string) error {
	if !usernameRe.MatchString(username) {
		return fmt.Errorf("username must be 2–20 characters: letters, numbers, underscores only")
	}
	return nil
}

func validatePassword(password string) error {
	if len(password) < 8 || len(password) > MaxPasswordBytes {
		return fmt.Errorf("password must be 8-256 characters")
	}
	return nil
}

// Register validates the username/password, creates the user with the given
// initial cursor color (chosen by the caller, e.g. the presence service),
// and opens a session for it.
func (s *Service) Register(ctx context.Context, username, password, cursorColor string) (store.User, store.Session, error) {
	if err := validateUsername(username); err != nil {
		return store.User{}, store.Session{}, &errorsx.ValidationError{Msg: err.Error()}
	}
	if err := validatePassword(password); err != nil {
		return store.User{}, store.Session{}, &errorsx.ValidationError{Msg: err.Error()}
	}

	hash, err := hashPassword(password)
	if err != nil {
		return store.User{}, store.Session{}, &errorsx.InternalError{Context: "hash password", Err: err}
	}

	u, err := s.store.CreateUser(ctx, username, hash, cursorColor)
	if err != nil {
		if errors.Is(err, store.ErrUniqueViolation) {
			return store.User{}, store.Session{}, &errorsx.ConflictError{Msg: "username already taken"}
		}
		return store.User{}, store.Session{}, &errorsx.InternalError{Context: "create user", Err: err}
	}

	sess, err := s.store.CreateSession(ctx, u.ID, SessionTTL)
	if err != nil {
		return store.User{}, store.Session{}, &errorsx.InternalError{Context: "create session", Err: err}
	}

	return u, sess, nil
}

// Login verifies credentials and opens a session.
func (s *Service) Login(ctx context.Context, username, password string) (store.User, store.Session, error) {
	if len(password) > MaxPasswordBytes {
		// No real password can exceed this — reject before Argon2 ever runs,
		// same generic error as a wrong password so it leaks nothing.
		return store.User{}, store.Session{}, &errorsx.UnauthorizedError{Msg: "invalid username or password"}
	}

	u, err := s.store.GetUserByUsername(ctx, username)
	if errors.Is(err, store.ErrNotFound) {
		return store.User{}, store.Session{}, &errorsx.UnauthorizedError{Msg: "invalid username or password"}
	}
	if err != nil {
		return store.User{}, store.Session{}, &errorsx.InternalError{Context: "get user by username", Err: err}
	}

	ok, err := verifyPassword(password, u.PasswordHash)
	if err != nil || !ok {
		return store.User{}, store.Session{}, &errorsx.UnauthorizedError{Msg: "invalid username or password"}
	}

	sess, err := s.store.CreateSession(ctx, u.ID, SessionTTL)
	if err != nil {
		return store.User{}, store.Session{}, &errorsx.InternalError{Context: "create session", Err: err}
	}

	return u, sess, nil
}

// Logout deletes the session for token. Best-effort: mirrors the previous
// handler behavior of not surfacing a deletion failure to the client.
func (s *Service) Logout(ctx context.Context, token string) {
	s.store.DeleteSession(ctx, token)
}

// UpdateMeInput carries the optional fields UpdateMe may change, already
// decoded from the request body.
type UpdateMeInput struct {
	Username        *string
	CurrentPassword *string
	NewPassword     *string
}

// UpdateMe applies each present field of in to u, validating and persisting
// as it goes. On success u is mutated in place to reflect the new values.
func (s *Service) UpdateMe(ctx context.Context, u *store.User, in UpdateMeInput) error {
	if in.Username != nil {
		if err := validateUsername(*in.Username); err != nil {
			return &errorsx.ValidationError{Msg: err.Error()}
		}
		if err := s.store.UpdateUsername(ctx, u.ID, *in.Username); err != nil {
			if errors.Is(err, store.ErrUniqueViolation) {
				return &errorsx.ConflictError{Msg: "username already taken"}
			}
			return &errorsx.InternalError{Context: "update username", Err: err}
		}
		u.Username = *in.Username
	}

	if in.NewPassword != nil {
		if in.CurrentPassword == nil {
			return &errorsx.ValidationError{Msg: "current_password is required to set a new password"}
		}
		if err := validatePassword(*in.NewPassword); err != nil {
			return &errorsx.ValidationError{Msg: err.Error()}
		}
		fresh, err := s.store.GetUserByID(ctx, u.ID)
		if err != nil {
			return &errorsx.InternalError{Context: "get user by id", Err: err}
		}
		ok, err := verifyPassword(*in.CurrentPassword, fresh.PasswordHash)
		if err != nil || !ok {
			return &errorsx.UnauthorizedError{Msg: "current password is incorrect"}
		}
		hash, err := hashPassword(*in.NewPassword)
		if err != nil {
			return &errorsx.InternalError{Context: "hash password", Err: err}
		}
		if err := s.store.UpdatePasswordHash(ctx, u.ID, hash); err != nil {
			return &errorsx.InternalError{Context: "update password hash", Err: err}
		}
	}

	return nil
}
