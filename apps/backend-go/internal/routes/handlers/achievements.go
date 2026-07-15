package handlers

import (
	"net/http"
	"time"

	"github.com/sb-luis/where-name/apps/backend-go/internal/achievements"
	"github.com/sb-luis/where-name/apps/backend-go/internal/geo"
	"github.com/sb-luis/where-name/apps/backend-go/internal/httpx"
	"github.com/sb-luis/where-name/apps/backend-go/internal/routes/middleware"
	"github.com/sb-luis/where-name/apps/backend-go/internal/store"
)

type AchievementsHandler struct {
	store *store.Store
}

func NewAchievementsHandler(s *store.Store) *AchievementsHandler {
	return &AchievementsHandler{store: s}
}

func (h *AchievementsHandler) GetAchievements(w http.ResponseWriter, r *http.Request) {
	user, authenticated := middleware.UserFromCtx(r.Context())

	earned := map[string]time.Time{}
	if authenticated {
		var err error
		earned, err = h.store.GetUserAchievements(r.Context(), user.ID)
		if err != nil {
			httpx.WriteInternalError(w, err, "get user achievements")
			return
		}
	}

	earnedSet := make(map[string]bool, len(earned))
	for slug := range earned {
		earnedSet[slug] = true
	}

	type achievementOut struct {
		Slug         string `json:"slug"`
		Name         string `json:"name"`
		Description  string `json:"description"`
		Continent    string `json:"continent,omitempty"`
		Difficulty   string `json:"difficulty"`
		UnlockedAt   string `json:"unlocked_at,omitempty"`
		NewCountries int    `json:"new_countries"`
	}

	defs := achievements.All()
	out := make([]achievementOut, len(defs))
	for i, d := range defs {
		a := achievementOut{
			Slug:         d.Slug,
			Name:         d.Name,
			Description:  d.Description,
			Continent:    d.Continent,
			Difficulty:   d.Difficulty,
			NewCountries: d.NewCountries,
		}
		if unlockedAt, ok := earned[d.Slug]; ok {
			a.UnlockedAt = unlockedAt.Format(time.RFC3339)
		}
		out[i] = a
	}

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"manifest_version": geo.Version(),
		"achievements":     out,
		"unlocks":          achievements.UnlockLevels(earnedSet),
	})
}
