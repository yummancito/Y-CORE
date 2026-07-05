import { useRef, useState, useEffect } from 'react'

interface VerificationCodeInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function VerificationCodeInput({ length = 6, value, onChange, disabled }: VerificationCodeInputProps) {
  const [code, setCode] = useState<string[]>(Array(length).fill(''))
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const chars = value.split('').slice(0, length)
    const padded = [...chars, ...Array(length - chars.length).fill('')]
    setCode(padded)
  }, [value, length])

  const handleChange = (index: number, inputValue: string) => {
    if (disabled) return
    const digit = inputValue.replace(/\D/g, '').slice(-1)
    const newCode = [...code]
    newCode[index] = digit
    setCode(newCode)
    onChange(newCode.join(''))

    if (digit && index < length - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!code[index] && index > 0) {
        inputsRef.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    const newCode = [...code]
    pasted.split('').forEach((char, i) => {
      if (i < length) newCode[i] = char
    })
    setCode(newCode)
    onChange(newCode.join(''))
    const focusIndex = Math.min(pasted.length, length - 1)
    inputsRef.current[focusIndex]?.focus()
  }

  return (
    <div className="verification-code-input">
      {code.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { inputsRef.current[index] = el }}
          type="tel"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="verification-code-box"
        />
      ))}
    </div>
  )
}
