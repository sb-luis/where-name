'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/AuthContext'
import { AuthModal } from './AuthModal'

const pill = 'rounded-full px-4 py-1.5 text-sm font-semibold text-gray-600 bg-black/6 hover:bg-black/10 active:scale-95 transition-all duration-300 select-none'

export function AuthButton() {
  const { user, loading } = useAuth()
  const [showModal, setShowModal] = useState(false)

  if (loading) return null

  return (
    <>
      {user ? (
        <Link href="/profile" className={pill}>
          {user.username}
        </Link>
      ) : (
        <button className={pill} onClick={() => setShowModal(true)}>
          log in
        </button>
      )}
      {showModal && <AuthModal onClose={() => setShowModal(false)} />}
    </>
  )
}
