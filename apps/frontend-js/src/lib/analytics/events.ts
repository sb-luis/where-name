// Event names shared between the frontend (posthog-js) and backend (posthog-go).
//
export const EVENTS = {
  PRACTICE_STARTED:        'practice_started',
  SIGNUP_GATE_SHOWN:       'signup_gate_shown',
  SIGNUP_GATE_SKIPPED:     'signup_gate_skipped',
  SIGNUP_COMPLETED:        'signup_completed',
  CONTRIBUTE_LINK_CLICKED: 'contribute_link_clicked',
} as const
