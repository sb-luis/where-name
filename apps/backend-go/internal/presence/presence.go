// Package presence owns the curated set of cursor colors shared by
// authenticated users and anonymous multiplayer visitors.
package presence

import "crypto/rand"

// Tailwind 500-weight colors, hand-picked for hue separation
var colors = []string{
	"#ef4444", "#f97316", "#eab308",
	"#22c55e", "#14b8a6", "#3b82f6",
	"#8b5cf6", "#ec4899", "#64748b",
}

var allowed = func() map[string]bool {
	m := make(map[string]bool, len(colors))
	for _, c := range colors {
		m[c] = true
	}
	return m
}()

// Random returns a cryptographically random color from the palette.
func Random() string {
	b := make([]byte, 1)
	if _, err := rand.Read(b); err != nil {
		return colors[0]
	}
	return colors[int(b[0])%len(colors)]
}

// Pick deterministically returns the color at idx, wrapping around the palette.
func Pick(idx uint64) string {
	return colors[idx%uint64(len(colors))]
}

// Allowed reports whether color is one of the curated palette colors.
func Allowed(color string) bool {
	return allowed[color]
}

// EnsureAllowed returns color unchanged if it's still in the palette, or a
// fresh Random replacement if it's not (e.g. the palette shrank after color
// was assigned) — changed tells the caller whether the replacement needs to
// be persisted.
func EnsureAllowed(color string) (result string, changed bool) {
	if Allowed(color) {
		return color, false
	}
	return Random(), true
}
