'use client'

import { useEffect, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { AuthForm, type AuthTab } from './AuthForm'
import { track } from '@/lib/analytics/track'
import { EVENTS } from '@/lib/analytics/events'

interface Props {
  /** Headline shown above the auth form, e.g. "sign up to explore!" */
  message:          string
  /** Short slug identifying where this gate is shown, e.g. "explore", "practice_results". Used for analytics. */
  analyticsContext: string
  onClose:          () => void
  /** Called once, right before the modal closes, after a successful login/register. */
  onSuccess?:       () => void
  defaultTab?:      AuthTab
  /** Sizing/padding/spacing for the modal card — fully replaces the default, not merged. */
  className?:       string
  /** Extra content rendered above the headline, e.g. a StatCards summary. */
  children?:        ReactNode
}

const DEFAULT_MODAL_CLASS = 'p-8 w-full mx-5 max-w-lg space-y-5'

export function SignUpCtaModal({ message, analyticsContext, onClose, onSuccess, defaultTab = 'register', className = DEFAULT_MODAL_CLASS, children }: Props) {
  useEffect(() => { track(EVENTS.SIGNUP_GATE_SHOWN, { context: analyticsContext }) }, [analyticsContext])

  const handleSkip = () => {
    track(EVENTS.SIGNUP_GATE_SKIPPED, { context: analyticsContext })
    onClose()
  }

  return (
    <Modal className={className} onClose={handleSkip} closeOnBackdropClick={false}>
      {children}

      <h2 className="text-5xl italic font-bold text-center text-gray-900">
        {message}
      </h2>

      <hr className="text-gray-200 pb-5" />

      <AuthForm
        defaultTab={defaultTab}
        analyticsContext={analyticsContext}
        className="px-10 md:px-20 space-y-3"
        onSuccess={() => {
          onSuccess?.()
          onClose()
        }}
      />
    </Modal>
  )
}
