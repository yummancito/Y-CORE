import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('splash', {
  onReady: (callback: () => void) => {
    ipcRenderer.on('splash:ready', () => callback())
  },
  onStatus: (callback: (status: string, percent: number) => void) => {
    ipcRenderer.on('splash:status', (_event, data: { status: string; percent: number }) =>
      callback(data.status, data.percent)
    )
  },
})
