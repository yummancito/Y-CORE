import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import imagemin from 'vite-plugin-imagemin'
import fs from 'fs'
import path from 'path'

// Copy native DLLs and Steam system key into dist-electron/
function copyNativeResources(): import('vite').Plugin {
  return {
    name: 'copy-native-resources',
    closeBundle: () => {
      const dstDir = path.resolve('dist-electron')
      if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true })

      // Steam system public key
      const pemSrc = path.resolve('node_modules/@doctormckay/steam-crypto/system.pem')
      if (fs.existsSync(pemSrc)) fs.copyFileSync(pemSrc, path.join(dstDir, 'system.pem'))

      // Native DLLs from electron/dll/ → dist-electron/dll/
      const dllSrc = path.resolve('electron/dll')
      const dllDst = path.join(dstDir, 'dll')
      if (fs.existsSync(dllSrc)) {
        if (!fs.existsSync(dllDst)) fs.mkdirSync(dllDst, { recursive: true })
        for (const file of fs.readdirSync(dllSrc)) {
          const src = path.join(dllSrc, file)
          const dst = path.join(dllDst, file)
          try { fs.copyFileSync(src, dst) } catch (err) {
            console.warn(`[copy-native] Skipped ${file}: ${(err as NodeJS.ErrnoException).code}`)
          }
        }
      }

      // OpenSteamTool native DLLs from native/opensteamtool/ → dist-electron/native/opensteamtool/
      const nativeSrc = path.resolve('native')
      if (fs.existsSync(nativeSrc)) {
        function copyDir(srcDir: string, dstDir: string) {
          if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true })
          for (const file of fs.readdirSync(srcDir)) {
            const s = path.join(srcDir, file)
            const d = path.join(dstDir, file)
            if (fs.statSync(s).isDirectory()) {
              copyDir(s, d)
            } else {
              try { fs.copyFileSync(s, d) } catch {}
            }
          }
        }
        copyDir(nativeSrc, path.join(dstDir, 'native'))
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    // Compresión de imágenes en build — reduce PNG/JPG/WebP en dist/
    imagemin({
      gifsicle: { optimizationLevel: 2 },
      mozjpeg: { quality: 75 },
      optipng: { optimizationLevel: 4 },
      pngquant: { quality: [0.65, 0.8], speed: 4 },
      svgo: { plugins: [{ name: 'removeViewBox' }] },
      webp: { quality: 75 },
    }),
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
                '7zip-min',
                'ws',
                'bufferutil',
                'utf-8-validate',
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
    copyNativeResources(),
  ],
  server: {
    // Bind to 0.0.0.0 so phones / tablets on the same Wi-Fi can reach the
    // dev server. Requires the mobile route (#/remote-mobile) + a working
    // firewall for the 42863 / 42864 WebSocket ports on the host machine.
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/native/**', '**/node_modules/**', '**/.git/**'],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['lucide-react', 'framer-motion', 'zustand'],
          'vendor-utils': ['fuse.js', 'qrcode'],
        },
      },
    },
  },
  // Root .html files other than index.html (error-catalog.html, splash.html,
  // etc.) are NOT Vite entries — they're either static documentation or files
  // served directly by Electron. By default Vite's dependency pre-bundling
  // discovers them and tries to follow their `<script>` tags, which fails on
  // files that reference missing/discarded modules (causing the dev server
  // to crash on the first request with ERR_CONNECTION_RESET → REFUSED).
  optimizeDeps: {
    entries: ['index.html'],
  },
})
