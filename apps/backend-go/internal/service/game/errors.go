package game

// ValidationError signals that a CreateGame request failed a domain
// validation or business rule (e.g. malformed rounds, locked difficulty).
// Handlers map it to a 422; anything else maps to a 500.
type ValidationError struct {
	Msg string
}

func (e *ValidationError) Error() string { return e.Msg }

// InternalError wraps an unexpected failure (e.g. a store error) with the
// context under which it occurred, so the handler can log it the same way
// the moved-from code did while still returning a generic 500 to the client.
type InternalError struct {
	Context string
	Err     error
}

func (e *InternalError) Error() string { return e.Err.Error() }

func (e *InternalError) Unwrap() error { return e.Err }
