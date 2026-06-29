import { type InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className = '', ...props }: Props) {
  return (
    <input
      className={`w-full px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm text-gray-900 font-medium
        shadow-[0_1px_3px_rgba(0,0,0,0.05),inset_0_1px_2px_rgba(0,0,0,0.04)]
        focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-black/[0.05]
        placeholder:text-gray-400 placeholder:font-normal
        transition-all duration-150 ${className}`}
      {...props}
    />
  )
}
