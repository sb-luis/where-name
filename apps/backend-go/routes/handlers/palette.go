package handlers

// Curated palette of 18 Tailwind 500-weight colors — fixed saturation and
// lightness stepped across the full hue wheel, so every color looks equally
// vivid. Used for both anonymous cursor rotation and authenticated user picks.
var palette = []string{
	"#ef4444", "#f97316", "#f59e0b",
	"#eab308", "#84cc16", "#22c55e",
	"#10b981", "#14b8a6", "#06b6d4",
	"#0ea5e9", "#3b82f6", "#6366f1",
	"#8b5cf6", "#a855f7", "#d946ef",
	"#ec4899", "#f43f5e", "#64748b",
}

var allowedColors = func() map[string]bool {
	m := make(map[string]bool, len(palette))
	for _, c := range palette {
		m[c] = true
	}
	return m
}()
