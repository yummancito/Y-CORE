import { SVGProps } from 'react'

interface LogoProps extends SVGProps<SVGSVGElement> {
  size?: number
}

export function Logo({ size = 64, className, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="12.5 14.5 96 68"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Four diamond squares arranged in a cross pattern */}
      <rect x="50" y="10" width="28" height="28" rx="2" transform="rotate(45 50 24)" fill="currentColor" />
      <rect x="50" y="38" width="28" height="28" rx="2" transform="rotate(45 50 52)" fill="currentColor" />
      <rect x="22" y="38" width="28" height="28" rx="2" transform="rotate(45 22 52)" fill="currentColor" />
      <rect x="78" y="38" width="28" height="28" rx="2" transform="rotate(45 78 52)" fill="currentColor" />
    </svg>
  )
}
