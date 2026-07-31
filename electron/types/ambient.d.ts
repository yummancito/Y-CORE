/**
 * Ambient type declarations for Electron preload/renderer context
 * These types extend the global Window object with Electron-specific APIs
 */

declare global {
  interface Window {
    electron?: {
      ipcRenderer?: {
        invoke(channel: string, ...args: any[]): Promise<any>
        send(channel: string, ...args: any[]): void
        on(channel: string, listener: (...args: any[]) => void): void
        removeListener(channel: string, listener: (...args: any[]) => void): void
      }
    }
  }
}

export {}
