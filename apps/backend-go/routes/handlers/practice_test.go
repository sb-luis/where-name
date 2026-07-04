package handlers

import "testing"

func TestValidateVariant(t *testing.T) {
	if err := validateVariant("ne_110m_admin_0_countries"); err != nil {
		t.Errorf("expected a non-empty variant to be valid, got error: %v", err)
	}
	if err := validateVariant(""); err == nil {
		t.Error("expected an empty variant to be rejected")
	}
}

func TestValidateRounds(t *testing.T) {
	t.Run("empty rounds is rejected", func(t *testing.T) {
		if _, _, _, _, err := validateRounds(nil); err == nil {
			t.Error("expected empty rounds to be rejected")
		}
	})

	t.Run("invalid outcome is rejected", func(t *testing.T) {
		rounds := []roundInput{
			{Position: 0, Feature: "France", Attempt: 1, Outcome: "maybe", DurationMs: 1200},
		}
		if _, _, _, _, err := validateRounds(rounds); err == nil {
			t.Error("expected an invalid outcome to be rejected")
		}
	})

	t.Run("valid rounds are tallied correctly", func(t *testing.T) {
		rounds := []roundInput{
			{Position: 0, Feature: "France", Attempt: 1, Outcome: "correct", DurationMs: 1200},
			{Position: 1, Feature: "Spain", Attempt: 1, Outcome: "wrong", DurationMs: 800},
			{Position: 2, Feature: "Italy", Attempt: 1, Outcome: "skipped", DurationMs: 500},
			{Position: 3, Feature: "Germany", Attempt: 2, Outcome: "correct", DurationMs: 900},
		}
		params, correct, wrong, skipped, err := validateRounds(rounds)
		if err != nil {
			t.Fatalf("expected valid rounds to pass, got error: %v", err)
		}
		if correct != 2 || wrong != 1 || skipped != 1 {
			t.Errorf("expected correct=2 wrong=1 skipped=1, got correct=%d wrong=%d skipped=%d", correct, wrong, skipped)
		}
		if len(params) != len(rounds) {
			t.Fatalf("expected %d params, got %d", len(rounds), len(params))
		}
		if params[0].Feature != "France" || params[0].Outcome != "correct" {
			t.Errorf("expected first param to carry through France/correct, got %+v", params[0])
		}
	})
}
