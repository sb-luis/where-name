package handlers

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"wiw-backend/routes/middleware"
	"wiw-backend/store"

	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/argon2"
)

const sessionTTL = 30 * 24 * time.Hour

var (
	usernameRe    = regexp.MustCompile(`^[a-zA-Z0-9_]{2,20}$`)
	secureCookies = os.Getenv("COOKIE_SECURE") == "true"
)

func randomPaletteColor() string {
	b := make([]byte, 1)
	if _, err := rand.Read(b); err != nil {
		return palette[0]
	}
	return palette[int(b[0])%len(palette)]
}

type AuthHandler struct {
	store *store.Store
}

func NewAuthHandler(s *store.Store) *AuthHandler {
	return &AuthHandler{store: s}
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

const maxBodyBytes = 4 * 1024 // 4 KB — generous for any valid JSON auth payload

func readBody(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	return json.NewDecoder(r.Body).Decode(dst)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
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
	return map[string]any{"id": u.ID, "username": u.Username, "color": u.CursorColor}
}

// --- handlers ---

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := readBody(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !usernameRe.MatchString(body.Username) {
		writeError(w, http.StatusUnprocessableEntity, "username must be 2–20 characters: letters, numbers, underscores only")
		return
	}
	if len(body.Password) < 8 {
		writeError(w, http.StatusUnprocessableEntity, "password must be at least 8 characters")
		return
	}

	hash, err := hashPassword(body.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	user, err := h.store.CreateUser(r.Context(), body.Username, hash, randomPaletteColor())
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "username already taken")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	sess, err := h.store.CreateSession(r.Context(), user.ID, sessionTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	setSessionCookie(w, sess.ID, sess.ExpiresAt)
	writeJSON(w, http.StatusCreated, userJSON(user))
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := readBody(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := h.store.GetUserByUsername(r.Context(), body.Username)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	ok, err := verifyPassword(body.Password, user.PasswordHash)
	if err != nil || !ok {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}

	sess, err := h.store.CreateSession(r.Context(), user.ID, sessionTTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	setSessionCookie(w, sess.ID, sess.ExpiresAt)
	writeJSON(w, http.StatusOK, userJSON(user))
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
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	writeJSON(w, http.StatusOK, userJSON(*user))
}

func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	user, ok := middleware.UserFromCtx(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var body struct {
		Username        *string `json:"username"`
		CurrentPassword *string `json:"current_password"`
		NewPassword     *string `json:"new_password"`
		CursorColor     *string `json:"cursor_color"`
	}
	if err := readBody(w, r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if body.Username != nil {
		if !usernameRe.MatchString(*body.Username) {
			writeError(w, http.StatusUnprocessableEntity, "username must be 2–20 characters: letters, numbers, underscores only")
			return
		}
		if err := h.store.UpdateUsername(r.Context(), user.ID, *body.Username); err != nil {
			if isUniqueViolation(err) {
				writeError(w, http.StatusConflict, "username already taken")
				return
			}
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		user.Username = *body.Username
	}

	if body.NewPassword != nil {
		if body.CurrentPassword == nil {
			writeError(w, http.StatusUnprocessableEntity, "current_password is required to set a new password")
			return
		}
		if len(*body.NewPassword) < 8 {
			writeError(w, http.StatusUnprocessableEntity, "password must be at least 8 characters")
			return
		}
		fresh, err := h.store.GetUserByID(r.Context(), user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		ok, err := verifyPassword(*body.CurrentPassword, fresh.PasswordHash)
		if err != nil || !ok {
			writeError(w, http.StatusUnauthorized, "current password is incorrect")
			return
		}
		hash, err := hashPassword(*body.NewPassword)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if err := h.store.UpdatePasswordHash(r.Context(), user.ID, hash); err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
	}

	if body.CursorColor != nil {
		if !allowedColors[*body.CursorColor] {
			writeError(w, http.StatusUnprocessableEntity, "invalid cursor color")
			return
		}
		if err := h.store.UpdateCursorColor(r.Context(), user.ID, *body.CursorColor); err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		user.CursorColor = *body.CursorColor
	}

	writeJSON(w, http.StatusOK, userJSON(*user))
}
