import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// En dev, el plugin de React inyecta un script inline (preamble de fast refresh)
// y HMR usa un websocket; la CSP estricta del index.html los bloquea.
// Este plugin la relaja SOLO en `vite serve` — el build de producción queda estricto.
function devCsp(): Plugin {
  return {
    name: 'dev-relax-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://localhost:*")
    },
  }
}

export default defineConfig({
  plugins: [react(), devCsp()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
