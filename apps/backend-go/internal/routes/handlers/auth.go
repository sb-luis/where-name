package handlers

import (
	"net/http"
	"time"

	"github.com/sb-luis/where-name/apps/backend-go/internal/analytics"
	"github.com/sb-luis/where-name/apps/backend-go/internal/httpx"
	"github.com/sb-luis/where-name/apps/backend-go/internal/ratelimit"
	"github.com/sb-luis/where-name/apps/backend-go/internal/routes/middleware"
	"github.com/sb-luis/where-name/apps/backend-go/internal/services/auth"
	"github.com/sb-luis/where-name/apps/backend-go/internal/services/profile"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"

	"github.com/posthog/posthog-go"
	"golang.org/x/time/rate"
)

// sessionTTL mirrors auth.SessionTTL; kept as a package-level const so
// existing references (e.g. tests) that predate the service extraction keep
// compiling without reaching into the auth package.
const sessionTTL = auth.SessionTTL

// loginRate/registerRate cap credential and account-creation attempts per IP:
// a small burst for legitimate retries (e.g. a mistyped password), throttled
// to a sustained ~5/min after that. Argon2 hashing is deliberately expensive
// (see auth.argon2Params), so register is limited the same as login rather
// than more loosely — an unauthenticated flood of registrations is at least
// as costly as one of login attempts.
const (
	authRateLimit      = rate.Limit(1.0 / 12) // (1/12 sec) ~5 requests/min steady state
	authRateBurst      = 5
	authRateIdleTTL    = 10 * time.Minute
	authRateSweepEvery = 10 * time.Minute
)

type AuthHandler struct {
	authSvc         *auth.Service
	profileSvc      *profile.Service
	loginLimiter    *ratelimit.Limiter
	registerLimiter *ratelimit.Limiter
	cookieSecure    bool
}

func NewAuthHandler(authSvc *auth.Service, profileSvc *profile.Service, cookieSecure bool) *AuthHandler {
	h := &AuthHandler{
		authSvc:         authSvc,
		profileSvc:      profileSvc,
		loginLimiter:    ratelimit.New(authRateLimit, authRateBurst, authRateIdleTTL),
		registerLimiter: ratelimit.New(authRateLimit, authRateBurst, authRateIdleTTL),
		cookieSecure:    cookieSecure,
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

// --- helpers ---

func (h *AuthHandler) setSessionCookie(w http.ResponseWriter, token string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (h *AuthHandler) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func userJSON(u store.User) map[string]any {
	return map[string]any{"id": u.ID, "username": u.Username, "color": u.CursorColor, "created_at": u.CreatedAt}
}

// --- handlers ---

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if !h.registerLimiter.Allow(httpx.ClientIP(r)) {
		httpx.WriteError(w, http.StatusTooManyRequests, "too many requests, please try again later")
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
		// Which signup gate triggered this registration
		// (e.g. "explore", "customize_practice", "practice_results").
		AnalyticsContext string `json:"context"`
	}
	if err := httpx.ReadBody(w, r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	color := h.profileSvc.DefaultColor()
	u, sess, err := h.authSvc.Register(r.Context(), body.Username, body.Password, color)
	if err != nil {
		writeServiceError(w, err, "auth service")
		return
	}

	h.setSessionCookie(w, sess.ID, sess.ExpiresAt)

	analytics.Capture(analytics.DistinctID(u.ID), "signup_completed", posthog.NewProperties().
		Set("context", body.AnalyticsContext))

	httpx.WriteJSON(w, http.StatusCreated, userJSON(u))
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.loginLimiter.Allow(httpx.ClientIP(r)) {
		httpx.WriteError(w, http.StatusTooManyRequests, "too many requests, please try again later")
		return
	}

	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := httpx.ReadBody(w, r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	u, sess, err := h.authSvc.Login(r.Context(), body.Username, body.Password)
	if err != nil {
		writeServiceError(w, err, "auth service")
		return
	}

	if err := h.profileSvc.EnsureColor(r.Context(), &u); err != nil {
		writeServiceError(w, err, "profile service")
		return
	}

	h.setSessionCookie(w, sess.ID, sess.ExpiresAt)
	httpx.WriteJSON(w, http.StatusOK, userJSON(u))
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("session"); err == nil {
		h.authSvc.Logout(r.Context(), cookie.Value)
	}
	h.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	u, ok := middleware.UserFromCtx(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := h.profileSvc.EnsureColor(r.Context(), u); err != nil {
		writeServiceError(w, err, "profile service")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, userJSON(*u))
}

func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	u, ok := middleware.UserFromCtx(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var body struct {
		Username        *string `json:"username"`
		CurrentPassword *string `json:"current_password"`
		NewPassword     *string `json:"new_password"`
		CursorColor     *string `json:"cursor_color"`
	}
	if err := httpx.ReadBody(w, r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.authSvc.UpdateMe(r.Context(), u, auth.UpdateMeInput{
		Username:        body.Username,
		CurrentPassword: body.CurrentPassword,
		NewPassword:     body.NewPassword,
	}); err != nil {
		writeServiceError(w, err, "auth service")
		return
	}

	if body.CursorColor != nil {
		if err := h.profileSvc.UpdateColor(r.Context(), u.ID, *body.CursorColor); err != nil {
			writeServiceError(w, err, "profile service")
			return
		}
		u.CursorColor = *body.CursorColor
	}

	httpx.WriteJSON(w, http.StatusOK, userJSON(*u))
}
