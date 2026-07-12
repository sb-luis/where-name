package geo

import "testing"

func TestVariantDifficultyRoundTrip(t *testing.T) {
	for variant, wantDifficulty := range difficultyByVariant {
		difficulty, ok := DifficultyForVariant(variant)
		if !ok || difficulty != wantDifficulty {
			t.Errorf("DifficultyForVariant(%q) = %q, %v; want %q, true", variant, difficulty, ok, wantDifficulty)
		}
		gotVariant, ok := VariantForDifficulty(difficulty)
		if !ok || gotVariant != variant {
			t.Errorf("VariantForDifficulty(%q) = %q, %v; want %q, true", difficulty, gotVariant, ok, variant)
		}
	}
}

func TestDifficultyForVariantUnknown(t *testing.T) {
	if _, ok := DifficultyForVariant("bogus_variant"); ok {
		t.Error("expected unknown variant to return false")
	}
	if _, ok := DifficultyForVariant(""); ok {
		t.Error("expected empty variant to return false")
	}
}

func TestContinentOf(t *testing.T) {
	continent, ok := ContinentOf("easy", "France")
	if !ok || continent != "Europe" {
		t.Errorf("ContinentOf(easy, France) = %q, %v; want Europe, true", continent, ok)
	}

	continent, ok = ContinentOf("hard", "Canada")
	if !ok || continent != "North America" {
		t.Errorf("ContinentOf(hard, Canada) = %q, %v; want North America, true", continent, ok)
	}

	if _, ok := ContinentOf("easy", "Not A Real Country"); ok {
		t.Error("expected garbage feature to return not-found")
	}
	if _, ok := ContinentOf("bogus_difficulty", "France"); ok {
		t.Error("expected garbage difficulty to return not-found")
	}
}

func TestContinentsOrderAndCount(t *testing.T) {
	want := []string{"Africa", "Asia", "Oceania", "Europe", "North America", "South America", "Antarctica"}
	got := Continents()
	if len(got) != 7 {
		t.Fatalf("expected 7 continents, got %d", len(got))
	}
	for i, c := range want {
		if got[i] != c {
			t.Errorf("Continents()[%d] = %q, want %q", i, got[i], c)
		}
	}
}

func TestContinentSet(t *testing.T) {
	set, ok := ContinentSet("easy", "Africa")
	if !ok {
		t.Fatal("expected Africa easy set to exist")
	}
	if _, ok := set["Algeria"]; !ok {
		t.Error("expected Algeria to be in Africa easy set")
	}
	if _, ok := ContinentSet("easy", "Not A Continent"); ok {
		t.Error("expected garbage continent to return not-found")
	}
}
