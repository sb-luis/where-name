'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { LinkButton } from '@/components/ui/LinkButton'
import { AuthModal } from './AuthModal'

export function AuthButton() {
  const { user, loading } = useAuth()
  const [showModal, setShowModal] = useState(false)

  if (loading) return null

  return (
    <>
      {user ? (
        <LinkButton href="/profile" variant="secondary" size="sm">
          {user.username}
        </LinkButton>
      ) : (
        <Button size="sm" onClick={() => setShowModal(true)}>
          log in
        </Button>
      )}
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  )
}
