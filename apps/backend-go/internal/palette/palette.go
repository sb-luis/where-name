// Package palette owns the curated set of cursor colors shared by
// authenticated users and anonymous multiplayer visitors.
package palette

import "crypto/rand"

// Tailwind 500-weight colors — fixed saturation and lightness stepped across
// the full hue wheel, so every color looks equally vivid.
var colors = []string{
	"#ef4444", "#f97316", "#f59e0b",
	"#eab308", "#84cc16", "#22c55e",
	"#10b981", "#14b8a6", "#06b6d4",
	"#0ea5e9", "#3b82f6", "#6366f1",
	"#8b5cf6", "#a855f7", "#d946ef",
	"#ec4899", "#f43f5e", "#64748b",
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
