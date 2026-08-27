'use client'

const pillBase = 'rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 select-none'

export const pillActive   = `${pillBase} bg-gray-900 text-white cursor-pointer active:scale-95`
export const pillInactive = `${pillBase} bg-black/6 text-gray-600 hover:bg-black/10 cursor-pointer active:scale-95`
export const pillDisabled = `${pillBase} bg-black/4 text-gray-300 cursor-not-allowed`

export interface PillOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

interface Props<T extends string> {
  options:   PillOption<T>[]
  selected:  T
  onSelect:  (value: T) => void
  locked?:   boolean
}

export function PillGroup<T extends string>({ options, selected, onSelect, locked }: Props<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const disabled = locked || opt.disabled
        const className = selected === opt.value ? pillActive : disabled ? pillDisabled : pillInactive
        return (
          <button
            key={opt.value}
            onClick={() => !disabled && onSelect(opt.value)}
            disabled={disabled}
            className={className}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
