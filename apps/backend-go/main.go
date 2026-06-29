package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/sb-luis/where-name/apps/backend-go/routes"
	"github.com/sb-luis/where-name/apps/backend-go/routes/handlers"
	"github.com/sb-luis/where-name/apps/backend-go/store"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

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
		dsn = "postgres://wiw_user:wiw_password@localhost:5432/wiw_db?sslmode=disable"
	}

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
	routes.Register(mux, s, hub, allowedOrigins)

	log.Printf("server on :%s (allowed origins: %v)", port, allowedOrigins)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
