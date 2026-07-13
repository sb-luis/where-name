package handlers

import (
	"log"
	"net/http"

	"github.com/sb-luis/where-name/apps/backend-go/internal/realtime"
	"github.com/sb-luis/where-name/apps/backend-go/internal/routes/middleware"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"

	"github.com/coder/websocket"
)

// NewWSHandler upgrades the connection, resolves the caller's identity, then
// hands off to wsHub for the lifetime of the connection.
func NewWSHandler(wsHub *realtime.Hub, s *store.Store, allowedOrigins []string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			OriginPatterns: allowedOrigins,
		})
		if err != nil {
			log.Printf("websocket accept: %v", err)
			return
		}

		params := realtime.ConnectParams{}
		if user, ok := middleware.UserFromCtx(r.Context()); ok {
			params.Authenticated = true
			uid := user.ID
			params.UserID = &uid
			params.Alias = &user.Username
			if err := ensureAllowedCursorColor(r.Context(), s, user); err != nil {
				log.Printf("ensure allowed cursor color: %v", err)
			}
			params.Color = user.CursorColor
		}

		wsHub.HandleConnection(r.Context(), conn, params)
	}
}
