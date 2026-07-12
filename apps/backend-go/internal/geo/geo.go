// Package geo provides read-only access to the embedded continent/country
// manifest used to derive difficulty variants and achievement coverage.
package geo

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed manifest.json
var manifestBytes []byte

type manifest struct {
	Version      string                         `json:"version"`
	Order        []string                       `json:"order"`
	Continents   []string                       `json:"continents"`
	Difficulties map[string]map[string][]string `json:"difficulties"` // delta: names first appearing at this difficulty
}

var (
	m          manifest
	continents []string
	sets       map[string]map[string]map[string]struct{} // difficulty -> continent -> feature set

	variantByDifficulty = map[string]string{
		"easy":   "ne_110m_admin_0_countries",
		"medium": "ne_50m_admin_0_countries",
		"hard":   "ne_10m_admin_0_countries",
	}
	difficultyByVariant = map[string]string{
		"ne_110m_admin_0_countries": "easy",
		"ne_50m_admin_0_countries":  "medium",
		"ne_10m_admin_0_countries":  "hard",
	}

	// continentOrder pins the manifest iteration order since Go map order is random.
	continentOrder = []string{"Africa", "Asia", "Oceania", "Europe", "North America", "South America", "Antarctica"}
)

func init() {
	if err := json.Unmarshal(manifestBytes, &m); err != nil {
		panic(fmt.Sprintf("geo: malformed manifest.json: %v", err))
	}

	order := m.Order
	if len(order) == 0 {
		order = []string{"easy", "medium", "hard"}
	}
	continents = m.Continents
	if len(continents) == 0 {
		continents = continentOrder
	}

	// Resolve deltas into cumulative sets: each difficulty's effective set is
	// the union of its own delta and every earlier difficulty's delta.
	sets = make(map[string]map[string]map[string]struct{}, len(order))
	running := make(map[string]map[string]struct{}, len(continents))
	for _, continent := range continents {
		running[continent] = make(map[string]struct{})
	}
	for _, difficulty := range order {
		byContinent := m.Difficulties[difficulty]
		for continent, features := range byContinent {
			set, ok := running[continent]
			if !ok {
				set = make(map[string]struct{})
				running[continent] = set
			}
			for _, f := range features {
				set[f] = struct{}{}
			}
		}
		continentSets := make(map[string]map[string]struct{}, len(running))
		for continent, set := range running {
			copySet := make(map[string]struct{}, len(set))
			for f := range set {
				copySet[f] = struct{}{}
			}
			continentSets[continent] = copySet
		}
		sets[difficulty] = continentSets
	}
}

// DifficultyForVariant maps a frontend variant string to its difficulty name.
func DifficultyForVariant(variant string) (string, bool) {
	d, ok := difficultyByVariant[variant]
	return d, ok
}

// VariantForDifficulty maps a difficulty name to its frontend variant string.
func VariantForDifficulty(difficulty string) (string, bool) {
	v, ok := variantByDifficulty[difficulty]
	return v, ok
}

// Continents returns the 7 continent names in manifest order.
func Continents() []string {
	return continents
}

// ContinentSet returns the set of feature names for a continent at a difficulty.
func ContinentSet(difficulty, continent string) (map[string]struct{}, bool) {
	byContinent, ok := sets[difficulty]
	if !ok {
		return nil, false
	}
	set, ok := byContinent[continent]
	return set, ok
}

// ContinentOf returns the continent a feature belongs to at a difficulty.
func ContinentOf(difficulty, feature string) (string, bool) {
	byContinent, ok := sets[difficulty]
	if !ok {
		return "", false
	}
	for continent, set := range byContinent {
		if _, ok := set[feature]; ok {
			return continent, true
		}
	}
	return "", false
}

// NewCountryCount returns how many countries first appear at this
// difficulty for the given continent (raw manifest delta, not cumulative).
func NewCountryCount(difficulty, continent string) int {
	byContinent, ok := m.Difficulties[difficulty]
	if !ok {
		return 0
	}
	return len(byContinent[continent])
}

// Version returns the manifest version string.
func Version() string {
	return m.Version
}
