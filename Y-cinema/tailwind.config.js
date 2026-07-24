/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#6C63FF',
          dark: '#5A52D5',
          light: '#8B85FF',
        },
        surface: {
          DEFAULT: '#09090B',
          1: '#141417',
          2: '#1C1C1F',
          3: '#252528',
        },
        text: {
          bright: '#FFFFFF',
          secondary: '#A1A1AA',
          dim: '#71717A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 8px 32px rgba(0,0,0,0.35)',
        'card-hover': '0 14px 40px rgba(0,0,0,0.5)',
        'glow': '0 0 30px rgba(108,99,255,0.35)',
        'glow-sm': '0 0 15px rgba(108,99,255,0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'shimmer': 'shimmer 2s infinite linear',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
