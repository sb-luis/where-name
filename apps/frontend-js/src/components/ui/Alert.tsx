interface Props {
  variant?: 'error' | 'success'
  className?: string
  children: React.ReactNode
}

const variants = {
  error:   'bg-red-50 border-red-100 text-red-500',
  success: 'bg-emerald-50 border-emerald-100 text-emerald-600',
}

export function Alert({ variant = 'error', className = '', children }: Props) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border px-4 py-3 text-sm font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </div>
  )
}
