import { SVGProps } from 'react'

interface GhostProps extends SVGProps<SVGSVGElement> {
  size?: number
  expression?: 'neutral' | 'happy' | 'wink' | 'surprise'
}

export function Ghost({ size = 100, expression = 'neutral', className, ...props }: GhostProps) {
  const leftEye = expression === 'wink' ? (
    <line x1="36" y1="36" x2="44" y2="36" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  ) : (
    <>
      <polygon points="34,30 40,22 46,30 40,38" fill="currentColor" />
      <circle cx="40" cy="30" r="2.5" fill="var(--bg-primary, #0f0f13)" />
    </>
  )

  const rightEye = expression === 'wink' ? (
    <polygon points="54,30 60,22 66,30 60,38" fill="currentColor" />
  ) : expression === 'surprise' ? (
    <>
      <circle cx="60" cy="30" r="8" fill="currentColor" />
      <circle cx="60" cy="30" r="3" fill="var(--bg-primary, #0f0f13)" />
    </>
  ) : (
    <>
      <polygon points="54,30 60,22 66,30 60,38" fill="currentColor" />
      <circle cx="60" cy="30" r="2.5" fill="var(--bg-primary, #0f0f13)" />
    </>
  )

  const mouth = expression === 'happy' ? (
    <path d="M42,48 Q52,62 62,48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  ) : expression === 'surprise' ? (
    <ellipse cx="52" cy="50" rx="5" ry="7" fill="currentColor" />
  ) : expression === 'wink' ? (
    <path d="M44,48 Q52,56 60,48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  ) : (
    <path d="M44,48 Q52,56 60,48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  )

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ willChange: 'transform' }}
      {...props}
    >
      <defs>
        <radialGradient id="ghostGlow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="70%" stopColor="currentColor" stopOpacity="0.5" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.15" />
        </radialGradient>
      </defs>

      {/* Cuerpo */}
      <path
        d="M20,35 C20,15 35,8 50,8 C65,8 80,15 80,35 L80,68 C80,74 76,78 72,74 L68,68 C64,63 58,68 54,74 L50,80 C46,74 40,69 36,74 L32,80 C28,74 24,68 20,74 Z"
        fill="url(#ghostGlow)"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.3"
      />

      {/* Ojos */}
      {leftEye}
      {rightEye}

      {/* Mejillas */}
      {expression === 'happy' && (
        <>
          <ellipse cx="28" cy="44" rx="5" ry="3" fill="currentColor" opacity="0.3" />
          <ellipse cx="72" cy="44" rx="5" ry="3" fill="currentColor" opacity="0.3" />
        </>
      )}

      {/* Boca */}
      {mouth}
    </svg>
  )
}
