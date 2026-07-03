package analytics

import (
	"fmt"
	"log"

	"github.com/posthog/posthog-go"
)

var (
	client      posthog.Client
	environment string
)

func Init(apiKey, host, appEnv string, enabled bool) {
	environment = appEnv
	if !enabled || apiKey == "" {
		return
	}
	c, err := posthog.NewWithConfig(apiKey, posthog.Config{Endpoint: host})
	if err != nil {
		log.Printf("analytics: failed to init posthog client: %v", err)
		return
	}
	client = c
}

// Flushes any queued events. Call once during graceful shutdown.
func Close() {
	if client == nil {
		return
	}
	if err := client.Close(); err != nil {
		log.Printf("analytics: failed to close posthog client: %v", err)
	}
}

// DistinctID scopes a user ID to the current environment (e.g. "production:7")
// so the same auto-incrementing Postgres ID from different environments'
// databases can never collide into the same PostHog person.
func DistinctID(userID int64) string {
	return fmt.Sprintf("%s:%d", environment, userID)
}

// Fires a server-side event for the given distinct ID (an authenticated
// user's ID, or an anonymous posthog-js distinct_id forwarded by the
// client) — failures are logged and swallowed so analytics can't take down
// a request.
func Capture(distinctID, event string, properties posthog.Properties) {
	if client == nil || distinctID == "" {
		return
	}
	if properties == nil {
		properties = posthog.NewProperties()
	}
	properties.Set("environment", environment)
	err := client.Enqueue(posthog.Capture{
		DistinctId: distinctID,
		Event:      event,
		Properties: properties,
	})
	if err != nil {
		log.Printf("analytics: failed to capture %q: %v", event, err)
	}
}
