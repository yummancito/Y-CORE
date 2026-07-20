import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
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
    copyNativeResources(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/native/**', '**/node_modules/**', '**/.git/**'],
    },
  },
})
