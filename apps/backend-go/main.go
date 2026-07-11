package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/sb-luis/where-name/apps/backend-go/internal/analytics"
	"github.com/sb-luis/where-name/apps/backend-go/internal/routes"
	"github.com/sb-luis/where-name/apps/backend-go/internal/routes/handlers"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"
)

func main() {
	godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	appEnv := os.Getenv("APP_ENV")
	if appEnv == "" {
		appEnv = "local"
	}
	analytics.Init(os.Getenv("POSTHOG_API_KEY"), os.Getenv("POSTHOG_HOST"), appEnv, os.Getenv("POSTHOG_ENABLED") == "true")
	defer analytics.Close()

	raw := os.Getenv("ALLOWED_ORIGINS")
	if raw == "" {
		raw = "http://localhost:3000"
	}
	var allowedOrigins []string
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimSpace(o); o != "" {
			allowedOrigins = append(allowedOrigins, o)
		}
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://where_name_user:where_name_password@localhost:5432/where_name_db?sslmode=disable"
	}

	cookieSecure := os.Getenv("COOKIE_SECURE") != "false"

	ctx := context.Background()

	s, err := store.Open(ctx, dsn)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer s.Close()

	go func() {
		t := time.NewTicker(1 * time.Hour)
		defer t.Stop()
		for range t.C {
			if err := s.DeleteExpiredSessions(ctx); err != nil {
				log.Printf("delete expired sessions: %v", err)
			}
		}
	}()

	hub := handlers.NewHub()
	mux := http.NewServeMux()
	routes.Register(mux, s, hub, allowedOrigins, cookieSecure)

	// slowloris protection. safe for /ws: hijack clears the conn deadline,
	// and coder/websocket manages its own via context from there.
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	log.Printf("server on :%s (allowed origins: %v)", port, allowedOrigins)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
