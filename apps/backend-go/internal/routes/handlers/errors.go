package handlers

import (
	"errors"
	"net/http"

	"github.com/sb-luis/where-name/apps/backend-go/internal/errorsx"
	"github.com/sb-luis/where-name/apps/backend-go/internal/httpx"
)

// writeServiceError maps a typed service-layer error to the HTTP status the
// handlers wrote inline before the service extraction. fallbackContext is used
// only for an untyped error's 500 log line.
func writeServiceError(w http.ResponseWriter, err error, fallbackContext string) {
	var ve *errorsx.ValidationError
	var ue *errorsx.UnauthorizedError
	var ce *errorsx.ConflictError
	var ie *errorsx.InternalError
	switch {
	case errors.As(err, &ve):
		httpx.WriteError(w, http.StatusUnprocessableEntity, ve.Msg)
	case errors.As(err, &ue):
		httpx.WriteError(w, http.StatusUnauthorized, ue.Msg)
	case errors.As(err, &ce):
		httpx.WriteError(w, http.StatusConflict, ce.Msg)
	case errors.As(err, &ie):
		httpx.WriteInternalError(w, ie.Err, ie.Context)
	default:
		httpx.WriteInternalError(w, err, fallbackContext)
	}
}
