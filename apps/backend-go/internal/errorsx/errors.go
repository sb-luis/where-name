// Package errorsx defines the typed errors the service layer returns so that
// the transport layer can map each category to an HTTP status without knowing
// each service's internals. It extends the standard errors package the way
// httpx extends net/http.
package errorsx

// ValidationError signals that a request failed a domain validation or business
// rule (e.g. malformed input, a locked resource). Handlers map it to a 422.
type ValidationError struct {
	Msg string
}

func (e *ValidationError) Error() string { return e.Msg }

// UnauthorizedError signals that credentials didn't check out. Handlers map it
// to a 401.
type UnauthorizedError struct {
	Msg string
}

func (e *UnauthorizedError) Error() string { return e.Msg }

// ConflictError signals that a request conflicts with existing state (e.g. a
// username already taken). Handlers map it to a 409.
type ConflictError struct {
	Msg string
}

func (e *ConflictError) Error() string { return e.Msg }

// InternalError wraps an unexpected failure (e.g. a store error) with the
// context under which it occurred, so the handler can log it while still
// returning a generic 500 to the client.
type InternalError struct {
	Context string
	Err     error
}

func (e *InternalError) Error() string { return e.Err.Error() }

func (e *InternalError) Unwrap() error { return e.Err }
