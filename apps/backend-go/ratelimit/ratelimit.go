// Package ratelimit provides a simple in-memory, per-key token bucket rate
// limiter, intended for throttling requests from a single client (e.g. by IP)
// on a single backend instance.
package ratelimit

import (
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// Limiter tracks one token bucket per key. It is safe for concurrent use.
type Limiter struct {
	mu      sync.Mutex
	rate    rate.Limit
	burst   int
	idleTTL time.Duration
	buckets map[string]*entry
}

type entry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// New creates a Limiter that allows, per key, an average of r events per
// second with bursts up to b. idleTTL controls how long a key's bucket is
// kept in memory after its last use before Sweep may evict it.
func New(r rate.Limit, b int, idleTTL time.Duration) *Limiter {
	return &Limiter{
		rate:    r,
		burst:   b,
		idleTTL: idleTTL,
		buckets: make(map[string]*entry),
	}
}

// Allow reports whether an event for key is allowed to proceed right now,
// consuming a token from that key's bucket if so.
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	e, ok := l.buckets[key]
	if !ok {
		e = &entry{limiter: rate.NewLimiter(l.rate, l.burst)}
		l.buckets[key] = e
	}
	e.lastSeen = time.Now()
	return e.limiter.Allow()
}

// Sweep evicts buckets that have been idle longer than idleTTL, so memory
// usage stays bounded for long-running processes. Call periodically, e.g.
// from a background goroutine.
func (l *Limiter) Sweep() {
	l.mu.Lock()
	defer l.mu.Unlock()

	cutoff := time.Now().Add(-l.idleTTL)
	for key, e := range l.buckets {
		if e.lastSeen.Before(cutoff) {
			delete(l.buckets, key)
		}
	}
}
