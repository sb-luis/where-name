import { type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react'

type SharedProps = {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  children?: React.ReactNode
}

type AsButton = SharedProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined }
type AsAnchor = SharedProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }

type Props = AsButton | AsAnchor

const base = 'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[0.01em] transition-all duration-150 active:scale-[0.96] disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed select-none'

const variants = {
  primary:   'bg-gray-950 text-white hover:bg-gray-800',
  secondary: 'bg-white border border-gray-300 text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.07)] hover:bg-gray-50 hover:border-gray-400',
}

const sizes = {
  sm: 'py-1.5 px-4 text-sm',
  md: 'py-2.5 px-5 text-[13px]',
  lg: 'py-3 px-6 text-sm',
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: Props) {
  const classes = `${base} ${variants[variant]} ${sizes[size]} ${className}`

  if (rest.href !== undefined) {
    return (
      <a className={classes} {...rest as AnchorHTMLAttributes<HTMLAnchorElement>}>
        {children}
      </a>
    )
  }

  return (
    <button className={classes} {...rest as ButtonHTMLAttributes<HTMLButtonElement>}>
      {children}
    </button>
  )
}
