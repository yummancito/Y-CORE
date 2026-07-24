import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
})
