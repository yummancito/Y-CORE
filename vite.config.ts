import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import fs from 'fs'
import path from 'path'

// Copy Steam's system public key into the Electron output directory so
// @doctormckay/steam-crypto can find it at runtime after bundling.
function copySteamSystemPem(): import('vite').Plugin {
  return {
    name: 'copy-steam-system-pem',
    closeBundle: () => {
      const src = path.resolve('node_modules/@doctormckay/steam-crypto/system.pem')
      const dstDir = path.resolve('dist-electron')
      const dst = path.join(dstDir, 'system.pem')
      if (fs.existsSync(src)) {
        if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true })
        fs.copyFileSync(src, dst)
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart: () => {},
        vite: {
          resolve: {
            alias: {
              '@y-core/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
            },
          },
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: [
                'electron',
                'electron-updater',
                'steam-user',
                'depot-downloader-js',
                'lzma',
                'lzma-native',
              ],
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart: () => {},
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
      {
        entry: 'electron/splash-preload.ts',
        onstart: () => {},
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
    ]),
    electronRenderer(),
    copySteamSystemPem(),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  logLevel: 'warn',
  clearScreen: false,
})
