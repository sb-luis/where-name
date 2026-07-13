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
