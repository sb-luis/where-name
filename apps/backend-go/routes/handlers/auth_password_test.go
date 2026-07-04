package handlers

import "testing"

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := hashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}

	ok, err := verifyPassword("correct horse battery staple", hash)
	if err != nil || !ok {
		t.Fatalf("expected password to verify, got ok=%v err=%v", ok, err)
	}

	ok, err = verifyPassword("wrong password", hash)
	if err != nil {
		t.Fatalf("verifyPassword: %v", err)
	}
	if ok {
		t.Fatal("expected wrong password to fail verification")
	}
}

func TestVerifyPasswordMalformedHash(t *testing.T) {
	cases := []string{
		"",
		"not-a-valid-hash",
		"$argon2id$v=19$m=65536,t=2,p=1$onlyfourparts",
	}
	for _, encoded := range cases {
		if _, err := verifyPassword("anything", encoded); err == nil {
			t.Errorf("expected error for malformed hash %q, got nil", encoded)
		}
	}
}
