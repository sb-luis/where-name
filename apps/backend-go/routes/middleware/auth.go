package middleware

import (
	"context"
	"errors"
	"net/http"

	"github.com/sb-luis/where-name/apps/backend-go/store"
)

type contextKey struct{}

func Auth(s *store.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("session")
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			sess, err := s.GetSession(r.Context(), cookie.Value)
			if errors.Is(err, store.ErrNotFound) {
				next.ServeHTTP(w, r)
				return
			}
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			user, err := s.GetUserByID(r.Context(), sess.UserID)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			ctx := context.WithValue(r.Context(), contextKey{}, &user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func UserFromCtx(ctx context.Context) (*store.User, bool) {
	u, ok := ctx.Value(contextKey{}).(*store.User)
	return u, ok && u != nil
}
