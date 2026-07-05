package handlers

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/sb-luis/where-name/apps/backend-go/analytics"
	"github.com/sb-luis/where-name/apps/backend-go/internal/palette"
	"github.com/sb-luis/where-name/apps/backend-go/ratelimit"
	"github.com/sb-luis/where-name/apps/backend-go/routes/middleware"
	"github.com/sb-luis/where-name/apps/backend-go/store"
	"github.com/sb-luis/where-name/apps/backend-go/utils"

	"github.com/posthog/posthog-go"
	"golang.org/x/crypto/argon2"
	"golang.org/x/time/rate"
)

const sessionTTL = 30 * 24 * time.Hour

var (
	usernameRe    = regexp.MustCompile(`^[a-zA-Z0-9_]{2,20}$`)
	secureCookies = os.Getenv("COOKIE_SECURE") == "true"
)

// loginRate/registerRate cap credential and account-creation attempts per IP:
// a small burst for legitimate retries (e.g. a mistyped password), throttled
// to a sustained ~5/min after that. Argon2 hashing is deliberately expensive
// (see argon2Params), so register is limited the same as login rather than
// more loosely — an unauthenticated flood of registrations is at least as
// costly as one of login attempts.
const (
	authRateLimit      = rate.Limit(1.0 / 12) // (1/12 sec) ~5 requests/min steady state
	authRateBurst      = 5
	authRateIdleTTL    = 10 * time.Minute
	authRateSweepEvery = 10 * time.Minute
)

type AuthHandler struct {
	store           *store.Store
	loginLimiter    *ratelimit.Limiter
	registerLimiter *ratelimit.Limiter
}

func NewAuthHandler(s *store.Store) *AuthHandler {
	h := &AuthHandler{
		store:           s,
		loginLimiter:    ratelimit.New(authRateLimit, authRateBurst, authRateIdleTTL),
		registerLimiter: ratelimit.New(authRateLimit, authRateBurst, authRateIdleTTL),
	}

	go func() {
		t := time.NewTicker(authRateSweepEvery)
		defer t.Stop()
		for range t.C {
			h.loginLimiter.Sweep()
			h.registerLimiter.Sweep()
		}
	}()

	return h
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

// --- helpers ---

const (
	maxPasswordBytes = 256 // caps Argon2 hashing cost regardless of body size
)

func validateUsername(username string) error {
	if !usernameRe.MatchString(username) {
		return fmt.Errorf("username must be 2–20 characters: letters, numbers, underscores only")
	}
	return nil
}

func validatePassword(password string) error {
	if len(password) < 8 || len(password) > maxPasswordBytes {
		return fmt.Errorf("password must be 8-256 characters")
	}
	return nil
}

func setSessionCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   secureCookies,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secureCookies,
		SameSite: http.SameSiteLaxMode,
	})
}

func userJSON(u store.User) map[string]any {
	return map[string]any{"id": u.ID, "username": u.Username, "color": u.CursorColor, "created_at": u.CreatedAt}
}

// ensureAllowedCursorColor persists user's replacement color if
// palette.EnsureAllowed decided its stored one fell out of the palette.
func ensureAllowedCursorColor(ctx context.Context, s *store.Store, user *store.User) error {
	color, changed := palette.EnsureAllowed(user.CursorColor)
	if !changed {
		return nil
	}
	user.CursorColor = color
	return s.UpdateCursorColor(ctx, user.ID, color)
}

// --- handlers ---

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if !h.registerLimiter.Allow(utils.ClientIP(r)) {
		utils.WriteError(w, http.StatusTooManyRequests, "too many requests, please try again later")
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
		// Which signup gate triggered this registration
		// (e.g. "explore", "customize_practice", "practice_results").
		AnalyticsContext string `json:"context"`
	}
	if err := utils.ReadBody(w, r, &body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validateUsername(body.Username); err != nil {
		utils.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	if err := validatePassword(body.Password); err != nil {
		utils.WriteError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	hash, err := hashPassword(body.Password)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	user, err := h.store.CreateUser(r.Context(), body.Username, hash, palette.Random())
	if err != nil {
		if utils.IsUniqueViolation(err) {
			utils.WriteError(w, http.StatusConflict, "username already taken")
			return
		}
		utils.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	sess, err := h.store.CreateSession(r.Context(), user.ID, sessionTTL)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	setSessionCookie(w, sess.ID, sess.ExpiresAt)

	analytics.Capture(analytics.DistinctID(user.ID), "signup_completed", posthog.NewProperties().
		Set("context", body.AnalyticsContext))

	utils.WriteJSON(w, http.StatusCreated, userJSON(user))
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.loginLimiter.Allow(utils.ClientIP(r)) {
		utils.WriteError(w, http.StatusTooManyRequests, "too many requests, please try again later")
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := utils.ReadBody(w, r, &body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(body.Password) > maxPasswordBytes {
		// No real password can exceed this — reject before Argon2 ever runs,
		// same generic error as a wrong password so it leaks nothing.
		utils.WriteError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	user, err := h.store.GetUserByUsername(r.Context(), body.Username)
	if errors.Is(err, store.ErrNotFound) {
		utils.WriteError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	ok, err := verifyPassword(body.Password, user.PasswordHash)
	if err != nil || !ok {
		utils.WriteError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	if err := ensureAllowedCursorColor(r.Context(), h.store, &user); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	sess, err := h.store.CreateSession(r.Context(), user.ID, sessionTTL)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	setSessionCookie(w, sess.ID, sess.ExpiresAt)
	utils.WriteJSON(w, http.StatusOK, userJSON(user))
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("session"); err == nil {
		h.store.DeleteSession(r.Context(), cookie.Value)
	}
	clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromCtx(r.Context())
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := ensureAllowedCursorColor(r.Context(), h.store, user); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}
	utils.WriteJSON(w, http.StatusOK, userJSON(*user))
}

func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromCtx(r.Context())
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var body struct {
		Username        *string `json:"username"`
		CurrentPassword *string `json:"current_password"`
		NewPassword     *string `json:"new_password"`
		CursorColor     *string `json:"cursor_color"`
	}
	if err := utils.ReadBody(w, r, &body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.Username != nil {
		if err := validateUsername(*body.Username); err != nil {
			utils.WriteError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if err := h.store.UpdateUsername(r.Context(), user.ID, *body.Username); err != nil {
			if utils.IsUniqueViolation(err) {
				utils.WriteError(w, http.StatusConflict, "username already taken")
				return
			}
			utils.WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
		user.Username = *body.Username
	}

	if body.NewPassword != nil {
		if body.CurrentPassword == nil {
			utils.WriteError(w, http.StatusUnprocessableEntity, "current_password is required to set a new password")
			return
		}
		if err := validatePassword(*body.NewPassword); err != nil {
			utils.WriteError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		fresh, err := h.store.GetUserByID(r.Context(), user.ID)
		if err != nil {
			utils.WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
		ok, err := verifyPassword(*body.CurrentPassword, fresh.PasswordHash)
		if err != nil || !ok {
			utils.WriteError(w, http.StatusUnauthorized, "current password is incorrect")
			return
		}
		hash, err := hashPassword(*body.NewPassword)
		if err != nil {
			utils.WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if err := h.store.UpdatePasswordHash(r.Context(), user.ID, hash); err != nil {
			utils.WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
	}

	if body.CursorColor != nil {
		if !palette.Allowed(*body.CursorColor) {
			utils.WriteError(w, http.StatusUnprocessableEntity, "invalid cursor color")
			return
		}
		if err := h.store.UpdateCursorColor(r.Context(), user.ID, *body.CursorColor); err != nil {
			utils.WriteError(w, http.StatusInternalServerError, "internal error")
			return
		}
		user.CursorColor = *body.CursorColor
	}

	utils.WriteJSON(w, http.StatusOK, userJSON(*user))
}
