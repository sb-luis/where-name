package palette

import "testing"

// --- Random ---

func TestRandomReturnsAllowedColor(t *testing.T) {
	for i := 0; i < 50; i++ {
		if got := Random(); !Allowed(got) {
			t.Fatalf("Random() = %q, want a color from the palette", got)
		}
	}
}

// --- Pick ---

func TestPickWrapsAroundThePalette(t *testing.T) {
	first := Pick(0)
	if got := Pick(uint64(len(colors))); got != first {
		t.Errorf("Pick(len(colors)) = %q, want it to wrap around to %q", got, first)
	}
}

func TestPickIsDeterministic(t *testing.T) {
	if a, b := Pick(3), Pick(3); a != b {
		t.Errorf("Pick(3) returned different colors on repeat calls: %q vs %q", a, b)
	}
}

// --- Allowed ---

func TestAllowed(t *testing.T) {
	if !Allowed(colors[0]) {
		t.Errorf("expected %q to be an allowed color", colors[0])
	}
	if Allowed("#not-a-real-color") {
		t.Error("expected an unknown color to be rejected")
	}
}

// --- EnsureAllowed ---

func TestEnsureAllowedKeepsAnAllowedColor(t *testing.T) {
	got, changed := EnsureAllowed(colors[0])
	if changed {
		t.Error("expected an already-allowed color to be left unchanged")
	}
	if got != colors[0] {
		t.Errorf("expected %q to be returned as-is, got %q", colors[0], got)
	}
}

func TestEnsureAllowedReplacesADisallowedColor(t *testing.T) {
	got, changed := EnsureAllowed("#not-a-real-color")
	if !changed {
		t.Error("expected a disallowed color to be replaced")
	}
	if !Allowed(got) {
		t.Errorf("expected replacement %q to be an allowed color", got)
	}
}
