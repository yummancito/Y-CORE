import { type InputHTMLAttributes, forwardRef } from 'react'
import { Search, X } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: 'text' | 'search'
  onClear?: () => void
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ variant = 'text', onClear, className = '', value, ...props }, ref) => {
    if (variant === 'search') {
      return (
        <div className={`relative ${className}`}>
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" />
          <input
            ref={ref}
            type="text"
            value={value}
            className="w-full pl-11 pr-8 py-2 text-sm rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none transition-colors"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
            {...props}
          />
          {value && onClear && (
            <button
              onClick={onClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-bright"
              aria-label="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }

    return (
      <input
        ref={ref}
        value={value}
        className={`px-3 py-2 text-sm rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none transition-colors ${className}`}
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'
