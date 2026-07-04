package ratelimit

import (
	"testing"
	"time"

	"golang.org/x/time/rate"
)

func TestAllowBurstThenBlocks(t *testing.T) {
	l := New(rate.Every(time.Minute), 3, time.Hour)

	for i := 0; i < 3; i++ {
		if !l.Allow("1.2.3.4") {
			t.Fatalf("expected request %d within burst to be allowed", i+1)
		}
	}
	if l.Allow("1.2.3.4") {
		t.Fatal("expected request beyond burst to be denied")
	}
}

func TestAllowRefillsOverTime(t *testing.T) {
	l := New(rate.Every(10*time.Millisecond), 1, time.Hour)

	if !l.Allow("1.2.3.4") {
		t.Fatal("expected first request to be allowed")
	}
	if l.Allow("1.2.3.4") {
		t.Fatal("expected immediate second request to be denied")
	}

	time.Sleep(20 * time.Millisecond)

	if !l.Allow("1.2.3.4") {
		t.Fatal("expected request after refill interval to be allowed")
	}
}

func TestAllowIsolatesByKey(t *testing.T) {
	l := New(rate.Every(time.Minute), 1, time.Hour)

	if !l.Allow("1.2.3.4") {
		t.Fatal("expected first key's first request to be allowed")
	}
	if !l.Allow("5.6.7.8") {
		t.Fatal("expected a different key to have its own, unaffected bucket")
	}
	if l.Allow("1.2.3.4") {
		t.Fatal("expected first key's second request to still be denied")
	}
}

func TestSweepEvictsIdleBucketsOnly(t *testing.T) {
	l := New(rate.Every(time.Minute), 1, 10*time.Millisecond)

	l.Allow("idle")
	time.Sleep(20 * time.Millisecond)
	l.Allow("fresh")

	l.Sweep()

	l.mu.Lock()
	_, idleStillPresent := l.buckets["idle"]
	_, freshStillPresent := l.buckets["fresh"]
	l.mu.Unlock()

	if idleStillPresent {
		t.Error("expected idle bucket to be evicted by Sweep")
	}
	if !freshStillPresent {
		t.Error("expected recently used bucket to survive Sweep")
	}
}
