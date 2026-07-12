// Package achievements defines the static continent/world achievement
// registry and the pure logic to evaluate and unlock them. No DB access.
package achievements

import (
	"fmt"
	"strings"

	"github.com/sb-luis/where-name/apps/backend-go/internal/geo"
)

type Definition struct {
	Slug         string
	Name         string
	Description  string
	Continent    string // empty for world achievements
	Difficulty   string
	NewCountries int // countries first introduced at this tier
}

var difficultyTitle = map[string]string{
	"easy":   "Easy",
	"medium": "Medium",
	"hard":   "Hard",
}

var difficultyRank = map[string]int{
	"easy":   0,
	"medium": 1,
	"hard":   2,
}

var difficultyOrder = []string{"easy", "medium", "hard"}

var (
	all      []Definition
	bySlug   map[string]Definition
	worldSet = map[string]struct{}{}
)

func slugify(continent string) string {
	return strings.ToLower(strings.ReplaceAll(continent, " ", "-"))
}

func init() {
	continents := geo.Continents()
	bySlug = make(map[string]Definition, len(continents)*len(difficultyOrder)+len(difficultyOrder))

	for _, difficulty := range difficultyOrder {
		for _, continent := range continents {
			count := geo.NewCountryCount(difficulty, continent)
			if count == 0 {
				// No new content over the previous tier: nothing to unlock.
				continue
			}
			d := Definition{
				Slug:         fmt.Sprintf("continent-%s-%s", slugify(continent), difficulty),
				Name:         fmt.Sprintf("%s · %s", continent, difficultyTitle[difficulty]),
				Description:  fmt.Sprintf("Guess every country in %s correctly in a single %s game", continent, difficulty),
				Continent:    continent,
				Difficulty:   difficulty,
				NewCountries: count,
			}
			all = append(all, d)
			bySlug[d.Slug] = d
		}
	}
	for _, difficulty := range difficultyOrder {
		total := 0
		for _, continent := range continents {
			total += geo.NewCountryCount(difficulty, continent)
		}
		d := Definition{
			Slug:         fmt.Sprintf("world-%s", difficulty),
			Name:         fmt.Sprintf("World · %s", difficultyTitle[difficulty]),
			Description:  fmt.Sprintf("Guess every country in the world correctly in a single %s game", difficulty),
			Difficulty:   difficulty,
			NewCountries: total,
		}
		all = append(all, d)
		bySlug[d.Slug] = d
	}
}

// All returns all 24 achievement definitions.
func All() []Definition {
	return all
}

// BySlug looks up a definition by its slug.
func BySlug(slug string) (Definition, bool) {
	d, ok := bySlug[slug]
	return d, ok
}

// Evaluate returns the slugs earned by a single game given the set of
// features guessed correctly at the given difficulty.
func Evaluate(difficulty string, correctFeatures map[string]struct{}) []string {
	var earned []string

	worldCovered := true
	for _, continent := range geo.Continents() {
		set, ok := geo.ContinentSet(difficulty, continent)
		if !ok {
			worldCovered = false
			continue
		}
		if isSuperset(correctFeatures, set) {
			if slug := fmt.Sprintf("continent-%s-%s", slugify(continent), difficulty); bySlug[slug].Slug != "" {
				earned = append(earned, slug)
			}
		} else {
			worldCovered = false
		}
	}
	if worldCovered {
		earned = append(earned, fmt.Sprintf("world-%s", difficulty))
	}
	return earned
}

func isSuperset(have, want map[string]struct{}) bool {
	for f := range want {
		if _, ok := have[f]; !ok {
			return false
		}
	}
	return true
}

// UnlockLevels returns, per continent, the highest difficulty playable given
// the set of earned achievement slugs. Every continent is playable at easy.
// A tier with zero new countries over the previous one has no achievement
// and unlocks automatically; otherwise advancing past a tier requires the
// achievement for the current gate tier to be earned.
func UnlockLevels(earned map[string]bool) map[string]string {
	levels := make(map[string]string, len(geo.Continents()))
	for _, continent := range geo.Continents() {
		unlockedMax := "easy"
		gateTier := "easy"
		for i := 1; i < len(difficultyOrder); i++ {
			tier := difficultyOrder[i]
			if geo.NewCountryCount(tier, continent) == 0 {
				unlockedMax = tier
				continue
			}
			if earned[fmt.Sprintf("continent-%s-%s", slugify(continent), gateTier)] {
				unlockedMax = tier
				gateTier = tier
				continue
			}
			break
		}
		levels[continent] = unlockedMax
	}
	return levels
}

// DifficultyRank returns the ordinal rank of a difficulty (easy < medium < hard).
func DifficultyRank(difficulty string) int {
	return difficultyRank[difficulty]
}
