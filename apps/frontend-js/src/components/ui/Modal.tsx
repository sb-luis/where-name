'use client'

import type { ReactNode, MouseEvent } from 'react'

interface Props {
  /** Omit to make the modal non-dismissible — no backdrop click, no × button. */
  onClose?:            () => void
  /** Set false to require the × button (or another explicit action) instead of a backdrop click. Default true. */
  closeOnBackdropClick?: boolean
  /** Sizing/padding/spacing for the card — fully replaces the default, not merged. */
  className?:          string
  children:            ReactNode
}

const DEFAULT_CARD_CLASS = 'p-8 w-full max-w-xs space-y-5'

export function Modal({ onClose, closeOnBackdropClick = true, className = DEFAULT_CARD_CLASS, children }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        className={`relative bg-white rounded-2xl shadow-lg ${className}`}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors text-xl leading-none cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
