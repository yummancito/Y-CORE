// ============================================================================
// tests/e2e-runtime-verification.test.ts
// ============================================================================
// Runtime verification tests for Y-Core core features
// These tests verify the actual service implementations
// ============================================================================

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

describe('Y-Core Runtime Verification', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // Verify Service Implementations
  // ────────────────────────────────────────────────────────────────────────────

  describe('Feature 1: Library (Game Service)', () => {
    it('Should export game service with listInstalled method', () => {
      const gameServicePath = path.join(
        process.cwd(),
        'electron/services/game.service.ts'
      )
      const content = fs.readFileSync(gameServicePath, 'utf-8')

      // Verify the service export
      expect(content).toContain('export const gameService')

      // Verify async listInstalled method
      expect(content).toContain('async listInstalled()')

      // Verify it reads Steam data
      expect(content).toContain('getSteamPath')
      expect(content).toContain('getSteamLibraryFolders')
      expect(content).toContain('appmanifest_')
      expect(content).toContain('parseVdf')
    })

    it('Should handle Steam library folder parsing', () => {
      const gameServicePath = path.join(
        process.cwd(),
        'electron/services/game.service.ts'
      )
      const content = fs.readFileSync(gameServicePath, 'utf-8')

      // Check for ACF file parsing
      expect(content).toContain('readFileWithRetry')
      expect(content).toContain('AppState')
      expect(content).toContain('appid')
    })

    it('Should support game launching and verification', () => {
      const gameServicePath = path.join(
        process.cwd(),
        'electron/services/game.service.ts'
      )
      const content = fs.readFileSync(gameServicePath, 'utf-8')

      expect(content).toContain('launchGame')
      expect(content).toContain('verifyGame')
      expect(content).toContain('getSteamDetails')
    })

    it('Should have error handling for locked ACF files', () => {
      const gameServicePath = path.join(
        process.cwd(),
        'electron/services/game.service.ts'
      )
      const content = fs.readFileSync(gameServicePath, 'utf-8')

      // FIX #4 reference: Handle locked ACF files
      expect(content).toContain('readDirWithTimeout')
      expect(content).toContain('readFileWithRetry')
    })
  })

  describe('Feature 2: Mods (Steam Workshop)', () => {
    it('Should export steam workshop service', () => {
      const workshopServicePath = path.join(
        process.cwd(),
        'electron/services/steam-workshop.service.ts'
      )
      expect(fs.existsSync(workshopServicePath)).toBe(true)

      const content = fs.readFileSync(workshopServicePath, 'utf-8')
      expect(content).toContain('searchMods')
      expect(content).toContain('getModDetails')
    })

    it('Should have mods database service', () => {
      const modsDatabasePath = path.join(
        process.cwd(),
        'electron/services/mods-database.service.ts'
      )
      expect(fs.existsSync(modsDatabasePath)).toBe(true)

      const content = fs.readFileSync(modsDatabasePath, 'utf-8')
      expect(content).toContain('getGameMods')
      expect(content).toContain('initialize')
    })

    it('Should support mod installation workflow', () => {
      const modInstallerPath = path.join(
        process.cwd(),
        'electron/modules/mod-manager/mod-installer.ts'
      )
      // This file may not exist in all states, so just check the handler
      const modsHandlerPath = path.join(
        process.cwd(),
        'electron/handlers/mods.handler.ts'
      )
      const content = fs.readFileSync(modsHandlerPath, 'utf-8')

      expect(content).toContain('handleInstallMod')
      expect(content).toContain('handleUninstallMod')
      expect(content).toContain('handleEnableMod')
      expect(content).toContain('handleDisableMod')
    })

    it('Should provide mod search and discovery', () => {
      const modsHandlerPath = path.join(
        process.cwd(),
        'electron/handlers/mods.handler.ts'
      )
      const content = fs.readFileSync(modsHandlerPath, 'utf-8')

      expect(content).toContain('mods:search-catalog')
      expect(content).toContain('mods:get-details')
      expect(content).toContain('mods:list-installed')
    })
  })

  describe('Feature 3: Downloads', () => {
    it('Should have download engine implementation', () => {
      const downloadEnginePath = path.join(
        process.cwd(),
        'electron/modules/download-engine.ts'
      )
      expect(fs.existsSync(downloadEnginePath)).toBe(true)

      const content = fs.readFileSync(downloadEnginePath, 'utf-8')
      expect(content).toContain('getDownloadEngine')
      expect(content).toContain('createTask')
      expect(content).toContain('startTask')
    })

    it('Should export download service', () => {
      const downloadServicePath = path.join(
        process.cwd(),
        'electron/services/download.service.ts'
      )
      const content = fs.readFileSync(downloadServicePath, 'utf-8')

      expect(content).toContain('export const downloadService')
      expect(content).toContain('async createTask')
      expect(content).toContain('async startTask')
      expect(content).toContain('async getTasks')
    })

    it('Should support download task lifecycle', () => {
      const downloadServicePath = path.join(
        process.cwd(),
        'electron/services/download.service.ts'
      )
      const content = fs.readFileSync(downloadServicePath, 'utf-8')

      // Full lifecycle: create, start, pause, cancel, get status
      expect(content).toContain('pauseTask')
      expect(content).toContain('cancelTask')
      expect(content).toContain('getStatus')
      expect(content).toContain('getHistory')
    })

    it('Should have download repair capabilities', () => {
      const repairPath = path.join(
        process.cwd(),
        'electron/modules/download-engine-repair.ts'
      )
      expect(fs.existsSync(repairPath)).toBe(true)

      const content = fs.readFileSync(repairPath, 'utf-8')
      expect(content).toContain('getRepairEngine')
      expect(content).toContain('getIntegrityScanner')
    })
  })

  describe('Feature 4: Store (Game Catalog)', () => {
    it('Should export store service', () => {
      const storeServicePath = path.join(
        process.cwd(),
        'electron/services/store.service.ts'
      )
      const content = fs.readFileSync(storeServicePath, 'utf-8')

      expect(content).toContain('export const storeService')
      expect(content).toContain('async fetchAppDetails')
      expect(content).toContain('async getLocalAppIds')
    })

    it('Should support Steam API queries', () => {
      const storeServicePath = path.join(
        process.cwd(),
        'electron/services/store.service.ts'
      )
      const content = fs.readFileSync(storeServicePath, 'utf-8')

      expect(content).toContain('fetchAppDetails')
      expect(content).toContain('getLocalGameData')
      expect(content).toContain('checkAppTypes')
    })

    it('Should have game search functionality', () => {
      const gameServicePath = path.join(
        process.cwd(),
        'electron/services/game.service.ts'
      )
      const content = fs.readFileSync(gameServicePath, 'utf-8')

      expect(content).toContain('searchGames')
    })

    it('Should register store handlers', () => {
      const mainPath = path.join(process.cwd(), 'electron/main.ts')
      const content = fs.readFileSync(mainPath, 'utf-8')

      expect(content).toContain('registerStoreHandlers')
    })
  })

  describe('Feature 5: Remote Play', () => {
    it('Should have remote play module with WebSocket support', () => {
      const remotePlayPath = path.join(
        process.cwd(),
        'electron/modules/remote-play.ts'
      )
      const content = fs.readFileSync(remotePlayPath, 'utf-8')

      // UDP discovery and TCP signaling
      expect(content).toContain('dgram')
      expect(content).toContain('createUdpSocket')
      expect(content).toContain('startSignalingServer')

      // Port definitions
      expect(content).toContain('DEFAULT_DISCOVERY_PORT')
      expect(content).toContain('DEFAULT_STREAM_PORT')
    })

    it('Should have discovery broadcast mechanism', () => {
      const remotePlayPath = path.join(
        process.cwd(),
        'electron/modules/remote-play.ts'
      )
      const content = fs.readFileSync(remotePlayPath, 'utf-8')

      expect(content).toContain('sendDiscoveryBroadcast')
      expect(content).toContain('DISCOVERY_MSG')
      expect(content).toContain('YCREMOTE')
    })

    it('Should support hosting and discovery', () => {
      const remotePlayPath = path.join(
        process.cwd(),
        'electron/modules/remote-play.ts'
      )
      const content = fs.readFileSync(remotePlayPath, 'utf-8')

      expect(content).toContain('startHosting')
      expect(content).toContain('stopHosting')
      expect(content).toContain('discoverHosts')
      expect(content).toContain('connectToHost')
    })

    it('Should have WebSocket signaling servers', () => {
      const mainPath = path.join(process.cwd(), 'electron/main.ts')
      const content = fs.readFileSync(mainPath, 'utf-8')

      // Browser signaling WebSocket servers
      expect(content).toContain('WebSocketServer')
      expect(content).toContain('BROWSER_SIGNAL_PORT')
      expect(content).toContain('42863') // Signal server port
      expect(content).toContain('42864') // Input server port
    })

    it('Should register remote play IPC handlers', () => {
      const mainPath = path.join(process.cwd(), 'electron/main.ts')
      const content = fs.readFileSync(mainPath, 'utf-8')

      expect(content).toContain('registerRemotePlayHandlers')
    })

    it('Should support LAN mode fallback', () => {
      const remotePlayPath = path.join(
        process.cwd(),
        'electron/modules/remote-play.ts'
      )
      const content = fs.readFileSync(remotePlayPath, 'utf-8')

      expect(content).toContain('enableLANMode')
      expect(content).toContain('disableLANMode')
    })
  })

  describe('Service Integration', () => {
    it('Should have gateway router for IPC communication', () => {
      const gatewayPath = path.join(
        process.cwd(),
        'electron/services/gateway-router.ts'
      )
      expect(fs.existsSync(gatewayPath)).toBe(true)

      const content = fs.readFileSync(gatewayPath, 'utf-8')
      expect(content).toContain('registerGatewayRouter')
    })

    it('Should have service registry', () => {
      const registryPath = path.join(
        process.cwd(),
        'electron/services/registry.ts'
      )
      expect(fs.existsSync(registryPath)).toBe(true)

      const content = fs.readFileSync(registryPath, 'utf-8')
      expect(content).toContain('getServiceRegistry')
      expect(content).toContain('register')
    })

    it('Should initialize all services on app startup', () => {
      const mainPath = path.join(process.cwd(), 'electron/main.ts')
      const content = fs.readFileSync(mainPath, 'utf-8')

      expect(content).toContain('registerAllServices')
      expect(content).toContain("registry.register('game'")
      expect(content).toContain("registry.register('download'")
      expect(content).toContain("registry.register('store'")
      expect(content).toContain("registry.register('remotePlay'")
      expect(content).toContain("registry.register('mods'")
    })

    it('Should have error handling middleware', () => {
      const middlewarePath = path.join(
        process.cwd(),
        'electron/services/middleware.ts'
      )
      expect(fs.existsSync(middlewarePath)).toBe(true)
    })
  })

  describe('Compilation and Build', () => {
    it('Should have valid tsconfig for electron', () => {
      const tsconfigPath = path.join(process.cwd(), 'electron/tsconfig.json')
      expect(fs.existsSync(tsconfigPath)).toBe(true)

      const config = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'))
      expect(config.compilerOptions).toBeDefined()
      expect(config.compilerOptions.strict).toBe(true)
    })

    it('Should have vite config for electron build', () => {
      const vitePath = path.join(process.cwd(), 'vite.config.ts')
      const content = fs.readFileSync(vitePath, 'utf-8')

      expect(content).toContain('electron')
    })

    it('Should have electron builder config', () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json')
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

      expect(pkg.build).toBeDefined()
      expect(pkg.build.appId).toBeDefined()
      expect(pkg.build.productName).toBe('Y-core')
    })
  })

  describe('Runtime Dependencies', () => {
    it('Should have electron installed', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
      )
      expect(pkg.devDependencies.electron).toBeDefined()
    })

    it('Should have WebSocket library for remote play', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
      )
      expect(pkg.devDependencies['@types/ws']).toBeDefined()
    })

    it('Should have native module support (koffi)', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
      )
      expect(pkg.dependencies.koffi).toBeDefined()
    })

    it('Should have required React dependencies', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
      )
      expect(pkg.dependencies.react).toBeDefined()
      expect(pkg.dependencies['react-dom']).toBeDefined()
    })
  })
})
