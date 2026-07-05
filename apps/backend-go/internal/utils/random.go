package utils

import (
	"crypto/rand"
	"encoding/hex"
)

// RandomHex returns a cryptographically random hex string encoding n bytes
// (so the returned string is 2*n characters long).
func RandomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
