import Link from 'next/link'
import type { ComponentProps } from 'react'

interface Props extends ComponentProps<typeof Link> {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const base = 'rounded-full font-semibold transition-all duration-150 active:scale-95 inline-flex items-center justify-center gap-2'
const variants = {
  primary:   'bg-gray-900 text-white hover:bg-gray-700',
  secondary: 'border border-gray-200 text-gray-500 font-medium hover:bg-gray-50',
}
const sizes = {
  sm: 'py-1.5 px-4 text-sm',
  md: 'py-2.5 px-5',
  lg: 'py-3 px-6 text-base',
}

export function LinkButton({ variant = 'primary', size = 'md', className = '', children, ...props }: Props) {
  return (
    <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </Link>
  )
}
