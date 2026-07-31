# Mod Manager Quick Start Guide

## For Frontend Developers

### Basic Installation Flow

​​	ypescript
import { ipcRenderer } from 'electron'

async function installMod(fileId: string, gameAppId: string, installDir: string) {
  try {
    // 1. Get mod details
    const details = await ipcRenderer.invoke('mods:get-details', fileId)
    if (!details.success) {
      throw new Error(details.error)
    }

    // 2. Subscribe to progress
    const unsubscribe = ipcRenderer.on('mods:install-progress', (progress) => {
      console.log(\: \%)
    })

    // 3. Install
    const result = await ipcRenderer.invoke('mods:install', details.data, {
      modId: fileId,
      gameAppId,
      installDir,
      createBackup: true,
      scanForMalware: true,
      enableAfterInstall: false,
    })

    unsubscribe()
    if (result.success) {
      console.log('✓ Installed')
      return result.data
    }
  } catch (err) {
    console.error('Installation failed:', err.message)
  }
}
​​

## Common Operations

### Search Mods
​​	ypescript
const result = await ipcRenderer.invoke('mods:search-catalog', {
  gameAppId: '570',
  search: 'custom map',
  limit: 20,
})
​​

### List Installed
​​	ypescript
const mods = await ipcRenderer.invoke('mods:list-installed', '570')
​​

### Get Statistics
​​	ypescript
const stats = await ipcRenderer.invoke('mods:get-statistics', '570')
​​

### Enable/Disable Mod
​​	ypescript
await ipcRenderer.invoke('mods:enable', modId)
await ipcRenderer.invoke('mods:disable', modId)
​​

## Read Documentation

- **MOD_MANAGER_INTEGRATION.md** - Architecture and design
- **MOD_API_REFERENCE.md** - Complete API reference
- **STEAM_WORKSHOP_API.md** - Steam API details
- **MOD_MANAGER_IMPLEMENTATION_SUMMARY.md** - What was implemented
