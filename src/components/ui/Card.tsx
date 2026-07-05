import { type HTMLAttributes, forwardRef } from 'react'

type CardVariant = 'base' | 'elevated' | 'interactive'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  interactive?: boolean
}

const variants: Record<CardVariant, string> = {
  base: 'bg-white/[0.04] border border-white/[0.06] backdrop-blur-md shadow-card',
  elevated: 'bg-white/[0.05] border border-white/[0.08] backdrop-blur-lg shadow-card-hover',
  interactive: 'bg-white/[0.04] border border-white/[0.06] backdrop-blur-md shadow-card hover:shadow-card-hover hover:-translate-y-1 cursor-pointer transition-all duration-200',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'base', interactive, className = '', children, ...props }, ref) => {
    const v = interactive ? 'interactive' : variant
    return (
      <div ref={ref} className={`rounded-xl p-4 ${variants[v]} ${className}`} {...props}>
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'
