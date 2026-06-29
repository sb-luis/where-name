import Link from 'next/link'
import type { ReactNode } from 'react'

interface Props {
  children?: ReactNode
}

export function Header({ children }: Props) {
  return (
    <header className="shrink-0 flex items-center justify-between px-6 h-14">
      <Link href="/" 
        className="font-black transition-colors"
      >
        where.name
      </Link>
      {children}
    </header>
  )
}
