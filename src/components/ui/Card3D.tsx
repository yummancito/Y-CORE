import { type HTMLAttributes, useRef, useState } from 'react'

interface Card3DProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function Card3D({ children, className = '', onMouseMove, onMouseEnter, onMouseLeave, ...props }: Card3DProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [glowPosition, setGlowPosition] = useState({ x: 50, y: 50 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setGlowPosition({ x: (x / rect.width) * 100, y: (y / rect.height) * 100 })
    onMouseMove?.(e)
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovered(true)
    onMouseEnter?.(e)
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsHovered(false)
    onMouseLeave?.(e)
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative ${className}`}
      {...props}
    >
      {children}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300"
        style={{
          opacity: isHovered ? 0.12 : 0,
          background: `radial-gradient(circle at ${glowPosition.x}% ${glowPosition.y}%, rgba(255,255,255,0.35), transparent 60%)`,
        }}
      />
    </div>
  )
}
