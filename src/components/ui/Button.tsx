import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: React.ComponentType<{ className?: string }>
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary: 'text-white border border-transparent bg-gradient-to-r from-accent to-accent-dark hover:brightness-110 active:brightness-95 shadow-lg shadow-accent/20',
  secondary: 'text-text-primary border border-white/[0.08] hover:border-accent/50 hover:text-white bg-white/[0.05] backdrop-blur-sm',
  ghost: 'text-text-dim hover:text-text-primary hover:bg-white/5',
  danger: 'text-status-error border border-transparent bg-status-error/10 hover:bg-status-error hover:text-white active:brightness-95',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2 text-sm gap-2 rounded-lg',
  lg: 'px-5 py-2.5 text-base gap-2 rounded-xl',
}

const iconSizes: Record<Size, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon: Icon, loading, children, className = '', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-px active:translate-y-0 ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {loading ? <Loader2 className={`${iconSizes[size]} animate-spin`} /> : Icon && <Icon className={iconSizes[size]} />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
