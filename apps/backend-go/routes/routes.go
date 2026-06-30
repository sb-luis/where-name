package routes

import (
	"net/http"

	"github.com/sb-luis/where-name/apps/backend-go/routes/handlers"
	"github.com/sb-luis/where-name/apps/backend-go/routes/middleware"
	"github.com/sb-luis/where-name/apps/backend-go/store"
)

func Register(mux *http.ServeMux, s *store.Store, hub *handlers.Hub, allowedOrigins []string) {
	auth     := handlers.NewAuthHandler(s)
	practice := handlers.NewPracticeHandler(s)
	stats    := handlers.NewStatsHandler(s)
	ws       := handlers.NewWSHandler(hub, s, allowedOrigins)

	authMiddleware := middleware.Auth(s)

	mux.Handle("GET /healthcheck", authMiddleware(http.HandlerFunc(handlers.Healthcheck)))

	mux.Handle("POST /auth/register", authMiddleware(http.HandlerFunc(auth.Register)))
	mux.Handle("POST /auth/login", authMiddleware(http.HandlerFunc(auth.Login)))
	mux.Handle("POST /auth/logout", authMiddleware(http.HandlerFunc(auth.Logout)))
	mux.Handle("GET /auth/me", authMiddleware(http.HandlerFunc(auth.GetMe)))
	mux.Handle("PATCH /auth/me", authMiddleware(http.HandlerFunc(auth.UpdateMe)))

	mux.Handle("POST /practice/games", authMiddleware(http.HandlerFunc(practice.CreateGame)))
	mux.Handle("GET /practice/stats", authMiddleware(http.HandlerFunc(stats.GetPracticeStats)))
	mux.Handle("GET /stats/profile", authMiddleware(http.HandlerFunc(stats.GetProfileStats)))

	mux.Handle("GET /ws", authMiddleware(ws))
}
