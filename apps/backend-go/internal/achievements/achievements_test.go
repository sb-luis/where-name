package achievements

import (
	"testing"

	"github.com/sb-luis/where-name/apps/backend-go/internal/geo"
)

func TestAllHas22Definitions(t *testing.T) {
	defs := All()
	if len(defs) != 22 {
		t.Fatalf("expected 22 definitions, got %d", len(defs))
	}
	if _, ok := BySlug("continent-south-america-medium"); ok {
		t.Error("continent-south-america-medium should not exist (0 new countries)")
	}
	if _, ok := BySlug("continent-antarctica-hard"); ok {
		t.Error("continent-antarctica-hard should not exist (0 new countries)")
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
	t.Run("no achievements: all continents easy except South America (medium, 0 new countries)", func(t *testing.T) {
		levels := UnlockLevels(map[string]bool{})
		for _, continent := range geo.Continents() {
			want := "easy"
			if continent == "South America" {
				want = "medium"
			}
			if levels[continent] != want {
				t.Errorf("%s = %q, want %s", continent, levels[continent], want)
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

func TestUnlockLevelsAntarcticaSkipsMediumGate(t *testing.T) {
	// zero achievements: locked at easy
	levels := UnlockLevels(map[string]bool{})
	if levels["Antarctica"] != "easy" {
		t.Errorf("Antarctica = %q, want easy", levels["Antarctica"])
	}

	// earning easy jumps straight to hard: medium has 0 new countries and
	// hard also has 0 new countries over medium, so both auto-extend.
	levels = UnlockLevels(map[string]bool{"continent-antarctica-easy": true})
	if levels["Antarctica"] != "hard" {
		t.Errorf("Antarctica = %q, want hard", levels["Antarctica"])
	}

	// continent-antarctica-medium is still a real, earnable achievement
	// even though it gates nothing further.
	if _, ok := BySlug("continent-antarctica-medium"); !ok {
		t.Error("expected continent-antarctica-medium to still exist")
	}
}

func TestEvaluateNeverEmitsZeroDeltaSlugs(t *testing.T) {
	for _, difficulty := range []string{"easy", "medium", "hard"} {
		correct := make(map[string]struct{})
		for _, continent := range geo.Continents() {
			set, ok := geo.ContinentSet(difficulty, continent)
			if !ok {
				continue
			}
			for f := range set {
				correct[f] = struct{}{}
			}
		}
		earned := Evaluate(difficulty, correct)
		if contains(earned, "continent-south-america-medium") {
			t.Errorf("did not expect continent-south-america-medium, got %v", earned)
		}
		if contains(earned, "continent-antarctica-hard") {
			t.Errorf("did not expect continent-antarctica-hard, got %v", earned)
		}
	}
}

func TestNewCountryCount(t *testing.T) {
	cases := []struct {
		difficulty string
		continent  string
		want       int
	}{
		{"easy", "Africa", 51},
		{"medium", "South America", 0},
		{"hard", "Antarctica", 0},
	}
	for _, c := range cases {
		if got := geo.NewCountryCount(c.difficulty, c.continent); got != c.want {
			t.Errorf("NewCountryCount(%s, %s) = %d, want %d", c.difficulty, c.continent, got, c.want)
		}
	}
}

func TestDefinitionNewCountriesWorldSums(t *testing.T) {
	cases := map[string]int{
		"world-easy":   177,
		"world-medium": 65,
		"world-hard":   16,
	}
	for slug, want := range cases {
		d, ok := BySlug(slug)
		if !ok {
			t.Fatalf("missing %s", slug)
		}
		if d.NewCountries != want {
			t.Errorf("%s.NewCountries = %d, want %d", slug, d.NewCountries, want)
		}
	}
}

func contains(slugs []string, target string) bool {
	for _, s := range slugs {
		if s == target {
			return true
		}
	}
	return false
}
