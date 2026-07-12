package achievements

import (
	"testing"

	"github.com/sb-luis/where-name/apps/backend-go/internal/geo"
)

func TestAllHas24Definitions(t *testing.T) {
	defs := All()
	if len(defs) != 24 {
		t.Fatalf("expected 24 definitions, got %d", len(defs))
	}
	for _, d := range defs {
		if d.Continent == "" {
			if d.Slug != "world-"+d.Difficulty {
				t.Errorf("unexpected world slug format: %q", d.Slug)
			}
			continue
		}
		want := "continent-" + slugify(d.Continent) + "-" + d.Difficulty
		if d.Slug != want {
			t.Errorf("slug %q, want %q", d.Slug, want)
		}
	}
}

func TestSlugifyMultiWordContinent(t *testing.T) {
	if got := slugify("North America"); got != "north-america" {
		t.Errorf("slugify(North America) = %q, want north-america", got)
	}
	if _, ok := BySlug("continent-north-america-easy"); !ok {
		t.Error("expected continent-north-america-easy to exist")
	}
}

func TestEvaluateContinentEarned(t *testing.T) {
	set, ok := geo.ContinentSet("easy", "Oceania")
	if !ok {
		t.Fatal("expected Oceania easy set")
	}
	correct := make(map[string]struct{}, len(set))
	for f := range set {
		correct[f] = struct{}{}
	}
	earned := Evaluate("easy", correct)
	if !contains(earned, "continent-oceania-easy") {
		t.Errorf("expected continent-oceania-easy in %v", earned)
	}
	if contains(earned, "world-easy") {
		t.Errorf("did not expect world-easy with only Oceania covered, got %v", earned)
	}
}

func TestEvaluateWorldEarned(t *testing.T) {
	correct := make(map[string]struct{})
	for _, continent := range geo.Continents() {
		set, ok := geo.ContinentSet("easy", continent)
		if !ok {
			t.Fatalf("missing easy set for %s", continent)
		}
		for f := range set {
			correct[f] = struct{}{}
		}
	}
	earned := Evaluate("easy", correct)
	if !contains(earned, "world-easy") {
		t.Errorf("expected world-easy in %v", earned)
	}
	for _, continent := range geo.Continents() {
		slug := "continent-" + slugify(continent) + "-easy"
		if !contains(earned, slug) {
			t.Errorf("expected %s in %v", slug, earned)
		}
	}
}

func TestEvaluateMissingCountry(t *testing.T) {
	set, ok := geo.ContinentSet("easy", "South America")
	if !ok {
		t.Fatal("expected South America easy set")
	}
	correct := make(map[string]struct{}, len(set))
	first := true
	for f := range set {
		if first {
			first = false
			continue // omit one country
		}
		correct[f] = struct{}{}
	}
	earned := Evaluate("easy", correct)
	if contains(earned, "continent-south-america-easy") {
		t.Errorf("did not expect continent-south-america-easy with a missing country, got %v", earned)
	}
}

func TestUnlockLevels(t *testing.T) {
	t.Run("no achievements: all continents easy", func(t *testing.T) {
		levels := UnlockLevels(map[string]bool{})
		for _, continent := range geo.Continents() {
			if levels[continent] != "easy" {
				t.Errorf("%s = %q, want easy", continent, levels[continent])
			}
		}
	})

	t.Run("continent-africa-easy earned: Africa medium, others easy", func(t *testing.T) {
		levels := UnlockLevels(map[string]bool{"continent-africa-easy": true})
		if levels["Africa"] != "medium" {
			t.Errorf("Africa = %q, want medium", levels["Africa"])
		}
		if levels["Asia"] != "easy" {
			t.Errorf("Asia = %q, want easy", levels["Asia"])
		}
	})

	t.Run("continent-africa-easy and medium earned: Africa hard", func(t *testing.T) {
		levels := UnlockLevels(map[string]bool{
			"continent-africa-easy":   true,
			"continent-africa-medium": true,
		})
		if levels["Africa"] != "hard" {
			t.Errorf("Africa = %q, want hard", levels["Africa"])
		}
	})

	t.Run("medium earned without easy has no effect", func(t *testing.T) {
		levels := UnlockLevels(map[string]bool{"continent-africa-medium": true})
		if levels["Africa"] != "easy" {
			t.Errorf("Africa = %q, want easy (medium without easy should not unlock)", levels["Africa"])
		}
	})
}

func contains(slugs []string, target string) bool {
	for _, s := range slugs {
		if s == target {
			return true
		}
	}
	return false
}
