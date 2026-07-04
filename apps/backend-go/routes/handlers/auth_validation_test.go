package handlers

import (
	"strings"
	"testing"
)

func TestValidateUsername(t *testing.T) {
	valid := []string{"ab", "Luis_123", "a_b", "exactly_twenty_chars"}
	invalid := []string{"a", "", "has space", "has-dash", "way_too_long_username_here_1234567890"}

	for _, u := range valid {
		if err := validateUsername(u); err != nil {
			t.Errorf("expected %q to be a valid username, got error: %v", u, err)
		}
	}
	for _, u := range invalid {
		if err := validateUsername(u); err == nil {
			t.Errorf("expected %q to be rejected as an invalid username", u)
		}
	}
}

func TestValidatePassword(t *testing.T) {
	cases := []struct {
		name    string
		len     int
		wantErr bool
	}{
		{"too short (7 chars)", 7, true},
		{"minimum (8 chars)", 8, false},
		{"maximum (256 chars)", maxPasswordBytes, false},
		{"too long (257 chars)", maxPasswordBytes + 1, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			password := strings.Repeat("a", c.len)
			err := validatePassword(password)
			if c.wantErr && err == nil {
				t.Errorf("expected a %d-char password to be rejected", c.len)
			}
			if !c.wantErr && err != nil {
				t.Errorf("expected a %d-char password to be valid, got error: %v", c.len, err)
			}
		})
	}
}
