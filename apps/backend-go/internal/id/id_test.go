package id

import "testing"

// --- RandomHex ---

func TestRandomHexLength(t *testing.T) {
	cases := []int{1, 8, 16, 32}
	for _, n := range cases {
		got, err := RandomHex(n)
		if err != nil {
			t.Fatalf("RandomHex(%d): %v", n, err)
		}
		if len(got) != 2*n {
			t.Errorf("RandomHex(%d) returned %d chars, want %d", n, len(got), 2*n)
		}
	}
}

func TestRandomHexIsRandom(t *testing.T) {
	a, err := RandomHex(16)
	if err != nil {
		t.Fatalf("RandomHex: %v", err)
	}
	b, err := RandomHex(16)
	if err != nil {
		t.Fatalf("RandomHex: %v", err)
	}
	if a == b {
		t.Error("expected two consecutive calls to produce different values")
	}
}
