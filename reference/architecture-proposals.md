# Y-Core — Propuestas Arquitectónicas

> Documento de arquitectura para las 3 grandes transformaciones de Y-Core.
> Cada propuesta es un sistema completo, no una feature aislada.

---

## 📋 Diagnóstico de la arquitectura actual

### Lo que funciona bien
- Separación clara proceso principal (Electron) / renderer (React) vía IPC
- 16 stores Zustand bien encapsulados
- Preload.ts expone API limpia via contextBridge
- Lazy loading de páginas con React.lazy
- ErrorBoundary wrapping en rutas

### Lo que NO escala (problemas arquitectónicos)

| Problema | Impacto |
|----------|---------|
| Stores llaman `window.steamtools.xxx()` directamente | Sin capa de abstracción → tests frágiles, acoplamiento total frontend/backend |
| Preload.ts tiene 80+ métodos planos | Sin schema, sin validación, sin descubrimiento → cada feature agrega boilerplate manual |
| useInstallProcessor.ts (650 líneas) mezcla API calls + IPC + estado + polling + toasts | Monolito imposible de testear, mantener o extender |
| Sin service layer | La lógica de negocio está en los stores (Zustand) o en los hooks (React) → imposible reusar |
| Sin sistema de eventos unificado | Eventos IPC ad-hoc (onSteamError, onDownloadProgress, etc.) sin trazabilidad ni audit trail |
| Sin caché ni offline support | Cada página hace fetch a la API → UX lenta, sin modo offline |
| Sin plugin/extension system | Todo el código es estático → la comunidad no puede contribuir features |

---

## Propuesta 1: Service Layer + IPC Gateway

> **Infraestructura fundamental.** No es una feature que el usuario vea, pero es la base sobre la que TODO lo demás se construye.

### Problema que resuelve

Hoy los stores llaman `window.steamtools.xxx()` directamente. Esto significa:
- Para testear un store, hay que mockear `window.steamtools` entero (el STEAMTOOLS_MOCK tiene 30+ métodos)
- La lógica de negocio se replica entre stores y hooks
- No hay validación de datos en la frontera IPC
- No hay caché, retry, ni timeout en las llamadas al backend
- Agregar una feature requiere tocar preload.ts + main.ts + store + hook → 4 archivos mínimo

### Beneficio

- **Todos los stores existentes se simplifican**: en lugar de `window.steamtools.getUsername()`, llaman `authService.getUsername()`
- **Los tests se simplifican**: mockeás un service, no el bridge entero
- **Caché y offline mode**: el service layer puede cachear respuestas y servir en modo offline
- **Dev tools**: podés inspeccionar cada llamada, ver tiempos, errores, argumentos
- **Escala**: agregar una feature nueva = crear un service + registrar handlers → sin tocar stores existentes

### Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                        Renderer                          │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐ │
│  │  Store    │ → │  Service     │ → │   IPC Gateway    │ │
│  │ (Zustand) │   │  Layer       │   │   (proxy)        │ │
│  └──────────┘   └──────────────┘   └────────┬─────────┘ │
│                                              │           │
├──────────────────────────────────────────────┤ IPC       │
│                    Preload.ts (contextBridge) │           │
├──────────────────────────────────────────────┴──────────┤
│                       Main Process                        │
│  ┌──────────────────────────────────────────────┐        │
│  │           IPC Router                          │        │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐     │        │
│  │  │ GameSvc  │ │ AuthSvc  │ │ ConfigSvc│ ... │        │
│  │  └──────────┘ └──────────┘ └──────────┘     │        │
│  └──────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────┘
```

### Componentes nuevos

```
src/services/
├── ServiceGateway.ts          ← Proxy que serializa llamadas a IPC
├── GameService.ts             ← listInstalledGames, launch, uninstall, verify
├── AuthService.ts             ← login, logout, isAuthenticated, getUsername
├── ConfigService.ts           ← readConfig, writeConfig, watch
├── DownloadService.ts         ← createTask, startTask, pauseTask, cancelTask
├── StoreService.ts            ← listGames, searchGames, getGameDetail
├── LogService.ts              ← getLogs, addLog, clearLogs, export
├── SteamService.ts            ← isRunning, restart, getPath, getLibraryFolders
├── UpdateService.ts           ← checkForUpdates, downloadUpdate, installUpdate
├── index.ts                   ← barrel export + initialization
```

### Stores nuevos

Ninguno. Los 16 stores existentes se refactorizan para usar services en lugar de `window.steamtools` directamente. El store deja de llamar IPC.

Ejemplo de refactor de `useAuthStore.ts`:

```typescript
// ANTES:
init: () => {
  window.steamtools.isAuthenticated().then(async () => {
    const username = await window.steamtools.getUsername()
    set({ username, initialized: true })
  })
}

// DESPUÉS:
import { authService } from '../services'

init: () => {
  authService.isAuthenticated().then(async () => {
    const username = await authService.getUsername()
    set({ username, initialized: true })
  })
}
```

### IPC nuevos

`ServiceGateway` reemplaza los 80+ métodos planos del preload con un gateway genérico:

```typescript
// preload.ts — en lugar de 80 métodos:
const gateway = {
  call: (service: string, method: string, ...args: unknown[]) =>
    ipcRenderer.invoke('gateway:call', { service, method, args }),
  on: (event: string, callback: Function) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on(`gateway:${event}`, handler)
    return () => ipcRenderer.removeListener(`gateway:${event}`, handler)
  }
}
contextBridge.exposeInMainWorld('gateway', gateway)
```

El IPC Router en main.ts recibe `gateway:call` y lo rutea al service correcto:

```typescript
ipcMain.handle('gateway:call', async (_event, { service, method, args }) => {
  const svc = registry.get(service)
  if (!svc) throw new Error(`Service ${service} not registered`)
  if (typeof svc[method] !== 'function') throw new Error(`${service}.${method} not found`)
  return svc[method](...args)
})
```

### Backend

Los services backend se refactorizan de los módulos planos actuales (`auth-ipc.ts`, `steam-ipc.ts`, etc.) a clases con interfaz común:

```typescript
// electron/services/GameService.ts
export class GameService {
  async listInstalledGames(): Promise<ListGamesResult> { /* ... */ }
  async launchGame(appId: string): Promise<SteamResult> { /* ... */ }
  async uninstallGame(appId: string): Promise<SteamResult> { /* ... */ }
  async verifyGame(appId: string): Promise<SteamResult> { /* ... */ }
}

// electron/services/registry.ts
export const registry = new Map<string, any>()
registry.set('game', new GameService())
registry.set('auth', new AuthService())
// etc.
```

### Frontend

Cada service frontend es una clase que llama al gateway:

```typescript
// src/services/GameService.ts
export class GameService {
  async listInstalledGames(): Promise<ListGamesResult> {
    return gateway.call('game', 'listInstalledGames')
  }
  async launchGame(appId: string): Promise<SteamResult> {
    return gateway.call('game', 'launchGame', appId)
  }
}
```

### Flujo completo

```
Store llama → gameService.listInstalledGames()
  → Gateway.call('game', 'listInstalledGames')
    → ipcRenderer.invoke('gateway:call', { service:'game', method:'listInstalledGames', args:[] })
      → main.ts recibe gateway:call
        → registry.get('game').listInstalledGames()
          → electron/modules/steam-ipc.ts (lógica existente)
            → resultado vuelve por IPC → Gateway → Service → Store → UI
```

### Tests

```typescript
// tests/services/game-service.test.ts
import { GameService } from '../../src/services/GameService'

// Mock del gateway
const mockGateway = { call: vi.fn() }
const service = new GameService(mockGateway as any)

it('listInstalledGames llama al gateway', async () => {
  mockGateway.call.mockResolvedValue({ success: true, games: [] })
  const result = await service.listInstalledGames()
  expect(mockGateway.call).toHaveBeenCalledWith('game', 'listInstalledGames')
  expect(result.success).toBe(true)
})
```

### Referencias

- **Heroic Games Launcher**: usa un patrón similar con servicios backend inyectados
- **Clean Architecture** (Robert Martin): la capa de servicios es el "use case layer"
- **VS Code Extension Host**: el patrón proxy para comunicación entre procesos es el mismo que usa VS Code para su host de extensiones
- **tRPC**: inspiración para el gateway tipado (sin necesidad de schema runtime)

### Complejidad

**Alta.** No es difícil técnicamente, pero requiere refactorizar ~16 stores y ~20 módulos IPC existentes sin romper nada. Hay que hacerlo incremental: service por service, store por store, validando cada paso.

### Estimación de líneas

```
src/services/                      4,200 líneas
├── ServiceGateway.ts                300
├── GameService.ts                   500
├── AuthService.ts                   300
├── ConfigService.ts                 400
├── DownloadService.ts              800
├── StoreService.ts                  600
├── LogService.ts                    300
├── SteamService.ts                  500
├── UpdateService.ts                 300
├── index.ts                         200

electron/services/                 3,200 líneas
├── registry.ts                     200
├── GameService.ts                  500
├── AuthService.ts                  300
├── ConfigService.ts                300
├── DownloadService.ts              700
├── StoreService.ts                 400
├── LogService.ts                   300
├── SteamService.ts                 300
├── UpdateService.ts                200

Refactor stores existentes (16)   2,500 líneas modificadas
Gateway IPC wiring                1,000 líneas
Tests + mocks                     3,500 líneas
Documentación + ejemplos          1,000 líneas

Total: ~15,000 líneas
```

### Prioridad

**⭐ PRIORIDAD MÁXIMA.** Sin esta base, los otros dos sistemas propuestos serían igual de frágiles que el código actual. Este es el cimiento.

### Por qué hace que Y-Core parezca un producto profesional

Porque ningún producto profesional tiene stores que llaman APIs directamente. El patrón Service Layer + Gateway es lo que usan Linear, Notion, Figma, VS Code. Es la diferencia entre "código que funciona" y "código que escala por años". Cualquier desarrollador que abra el código y vea `store → service → gateway → IPC router → backend service` va a pensar "esto fue diseñado por alguien que sabe lo que hace."

---

## Propuesta 2: Game Runtime Environment (GRE)

> **Feature más grande del producto.** Transforma Y-Core de "download manager" a "launcher profesional."

### Problema que resuelve

Hoy Y-Core descarga juegos pero:
- No verifica dependencias (VC++ Redist, DirectX, .NET, OpenAL, XNA)
- No maneja compatibilidad con Proton/Wine/DXVK/VKD3D
- No tiene perfiles de lanzamiento (args, resolución, variables de entorno)
- No trackea tiempo jugado
- No gestiona saves (backup/restore de partidas)
- No detecta si un juego va a funcionar ANTES de lanzarlo
- No ofrece launch hooks (pre/post scripts)

Un usuario descarga un juego, hace clic en "Jugar", y si no funciona no sabe por qué.

### Beneficio

- **Los juegos realmente funcionan** porque las dependencias están verificadas
- **El usuario tiene control total** sobre cómo se lanza cada juego
- **La app se convierte en un launcher**, no solo un downloader
- **Diagnóstico proactivo**: antes de lanzar, la app verifica que todo esté OK
- **Saves manager**: backup automático de partidas (el usuario no pierde progreso)

### Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    Game Runtime Environment               │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐  │
│  │              Runtime Detector                      │  │
│  │  ┌────────┐ ┌──────────┐ ┌──────┐ ┌──────────┐   │  │
│  │  │ VCRedist│ │ DirectX  │ │ .NET │ │  Proton  │   │  │
│  │  └────────┘ └──────────┘ └──────┘ └──────────┘   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Launch Profile                        │  │
│  │  ┌────────────┐ ┌──────────┐ ┌───────────────┐   │  │
│  │  │ Args Editor│ │  Env Vars│ │ Compat Layer  │   │  │
│  │  └────────────┘ └──────────┘ └───────────────┘   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Save Manager                          │  │
│  │  ┌────────────┐ ┌──────────┐ ┌───────────────┐   │  │
│  │  │ Auto Detect│ │ Backup   │ │  Restore      │   │  │
│  │  └────────────┘ └──────────┘ └───────────────┘   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Game Process Manager                  │  │
│  │  ┌────────────┐ ┌──────────┐ ┌───────────────┐   │  │
│  │  │  Spawn     │ │  Monitor │ │  Time Tracker │   │  │
│  │  └────────────┘ └──────────┘ └───────────────┘   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Componentes nuevos

```
src/components/gre/
├── LaunchProfileEditor.tsx       ← Editor de perfil de lanzamiento
├── RuntimeStatusBadge.tsx        ← Badge que muestra estado de dependencias
├── RuntimeChecker.tsx            ← Panel de verificación de dependencias
├── SaveManagerUI.tsx             ← UI de backup/restore de saves
├── GameTimeDisplay.tsx           ← Widget de tiempo jugado
├── CompatLayerSelector.tsx       ← Selector de Proton/Wine/DXVK/VKD3D
├── PreLaunchChecklist.tsx        ← Checklist pre-lanzamiento
├── LaunchButton.tsx              ← Botón de lanzamiento inteligente
├── GameProcessPanel.tsx          ← Panel de proceso en ejecución
├── LaunchConfigDialog.tsx        ← Diálogo completo de configuración
```

### Stores nuevos

```
src/stores/
├── useGameRuntimeStore.ts        ← Estado del runtime detector
├── useLaunchProfileStore.ts      ← Perfiles de lanzamiento guardados
├── useSaveManagerStore.ts        ← Estado de backups de saves
├── useGameProcessStore.ts        ← Procesos de juegos en ejecución
├── usePlayTimeStore.ts           ← Tiempo jugado por juego
```

### Servicios nuevos (Service Layer)

```
src/services/
├── RuntimeDetectionService.ts    ← Detectar dependencias instaladas
├── LaunchProfileService.ts       ← CRUD de perfiles de lanzamiento
├── SaveManagerService.ts         ← Backup/restore de partidas
├── GameProcessService.ts         ← Spawn + monitor + kill
├── PlayTimeService.ts            ← Tracking de tiempo

electron/services/
├── RuntimeDetectionService.ts    ← Escanear sistema en busca de VC++/DX/.NET
├── LaunchProfileService.ts       ← Persistir perfiles en disco
├── SaveManagerService.ts         ← Encontrar + comprimir + restaurar saves
├── GameProcessService.ts         ← child_process.spawn + monitoring
├── PlayTimeService.ts            ← Registrar sesiones de juego
```

### IPC nuevos

```
runtime:detect                  → Escanear dependencias de un juego
runtime:install                 → Instalar runtime faltante
runtime:status                  → Estado actual de todos los runtimes

profile:list                    → Listar perfiles de un juego
profile:get                     → Obtener perfil específico
profile:save                    → Guardar/actualizar perfil
profile:delete                  → Eliminar perfil
profile:setDefault              → Marcar perfil como default

save:detect                     → Encontrar archivos de save
save:backup                     → Backup de saves
save:restore                    → Restaurar backup
save:listBackups                → Listar backups disponibles
save:deleteBackup               → Eliminar backup

process:launch                  → Lanzar juego con perfil
process:status                  → Estado del proceso
process:kill                    → Matar proceso
process:running                 → Listar procesos activos

playtime:get                    → Obtener tiempo jugado
playtime:session                → Registrar sesión
playtime:leaderboard            → Ranking de juegos por tiempo
```

### Backend

```typescript
// electron/modules/runtime-detector.ts
export class RuntimeDetector {
  async detectVcRedist(): Promise<{ installed: boolean; version: string | null }>
  async detectDirectX(): Promise<{ installed: boolean; version: string }>
  async detectDotNet(): Promise<{ installed: boolean; version: string }>
  async detectOpenAL(): Promise<{ installed: boolean }>
  async detectAll(): Promise<RuntimeManifest>
  async installRuntime(type: RuntimeType): Promise<boolean>
}

// electron/modules/game-process.ts
export class GameProcessManager {
  async launch(gameId: string, profile: LaunchProfile): Promise<ProcessHandle>
  async monitor(handle: ProcessHandle): AsyncIterable<ProcessEvent>
  async kill(handle: ProcessHandle): Promise<void>
  getPlayTime(gameId: string): Promise<PlayTimeData>
}
```

### Frontend

Cada juego tiene un `LaunchProfile` por defecto. El usuario puede editarlo desde la página de detalle del juego o desde una nueva página `/game/:appId/launch`.

La `LaunchButton` reemplaza al botón de "Jugar" actual:
1. Verifica runtime → si falta, ofrece instalarlo
2. Ejecuta pre-launch hooks
3. Spawnea el proceso con el perfil seleccionado
4. Abre el `GameProcessPanel` para monitorear
5. Cuando el proceso termina, registra el tiempo jugado

### Flujo completo

```
Usuario hace clic en "Jugar" 
  → LaunchButton.onClick()
    → RuntimeDetectionService.detectAll(gameId)
      → ¿Faltan dependencias? → RuntimeChecker muestra advertencia + botón "Instalar"
      → ¿Todo OK? → GameProcessService.launch(gameId, selectedProfile)
        → child_process.spawn con args + env + compat layer
        → GameProcessStore registra proceso activo
        → PlayTimeService.startSession()
        → Monitor: cada 5s checkea que el proceso siga vivo
        → Cuando termina: PlayTimeService.endSession() + guarda stats
```

### Tests

```
tests/gre/
├── runtime-detector.test.ts       ← Mockear registro de Windows
├── game-process.test.ts           ← Mockear child_process.spawn
├── launch-profile.test.ts         ← CRUD de perfiles en disco
├── save-manager.test.ts           ← Backup/restore con archivos reales
├── playtime.test.ts               ← Sesiones de tiempo
├── launch-button.test.tsx         ← Click → verifica estado → spawn
```

### Referencias

- **Steam**: el runtime detector de Steam es el referente. Scanea el sistema en busca de VC++ 2015-2022, DirectX, .NET, etc.
- **Heroic Games Launcher**: maneja Wine/Proton/DXVK/VKD3D como runtime layers
- **Lutris**: el mejor ejemplo de launch profiles con pre/post scripts, runners, y variables de entorno
- **Playnite**: la referencia en save management automático (detecta saves por juego)
- **ProtonDB API**: datos de compatibilidad para juegos en Linux

### Complejidad

**Muy Alta.** Es el sistema más complejo de los tres. Requiere conocimiento profundo de:
- Registro de Windows para detectar runtimes
- child_process.spawn con args complejos
- File system watching para saves
- Integración con Proton/Wine (Linux) y su API
- Manejo de procesos hijos y limpieza

### Estimación de líneas

```
Detectores de runtime (VC++, DX, .NET, etc.)     3,000
Launch profiles (CRUD + editor)                  3,500
Save manager (detección + backup + restore)      3,000
Game process (spawn + monitor + time tracking)   3,500
Compat layers (Proton/Wine/DXVK/VKD3D)           2,500
UI components (editor, badges, panels)           4,500
Stores (5 nuevos)                                1,500
IPC wiring + services                            2,000
Tests                                            3,000

Total: ~26,000 líneas
```

### Prioridad

**⭐⭐⭐⭐⭐ Alto impacto en usuario final.** Es la feature más visible. Cuando un usuario hace clic en "Jugar" y el juego arranca sin problemas, la app se siente profesional. Cuando ve que puede configurar args, saves, y compat layers, se siente POWER-USER.

### Por qué hace que Y-Core parezca un producto profesional

Porque **ningún launcher amateur** maneja runtimes, saves, perfiles, y tracking de tiempo. Steam lo hace. Heroic lo hace. Lutris lo hace. Y-Core sin esto es un downloader glorificado. Con esto, compite directamente con ellos. Cualquier usuario que abra el LaunchProfileEditor y vea que puede configurar args, variables de entorno, compat layers, y pre/post scripts va a pensar "esto es de verdad."

---

## Propuesta 3: Plugin / Extension System

> **La diferencia entre una app y una plataforma.** Lo que separa a Y-Core de "un proyecto de GitHub" de "un ecosistema."

### Problema que resuelve

Hoy todo en Y-Core es estático:
- No se pueden agregar nuevas páginas sin modificar App.tsx
- No se pueden agregar nuevas fuentes de juegos (solo la API de Y-Core)
- No se pueden agregar nuevos botones en la sidebar sin modificar EpicSidebar
- No se pueden personalizar el download pipeline (plugins de CDN)
- La comunidad no puede contribuir features sin hacer un fork

### Beneficio

- **Cualquiera puede crear un plugin** en TypeScript y cargarlo desde una carpeta
- **Las features comunitarias no requieren modificar el core** → el core se mantiene limpio y estable
- **API pública documentada** → desarrolladores externos pueden integrar Y-Core con otras plataformas
- **Marketplace potencial** → los plugins se pueden compartir y descubrir
- **Y-Core se vuelve extensible** → puede crecer indefinidamente sin inflar el código base

### Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    Plugin System                          │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐  │
│  │              Plugin Host (Electron)                │  │
│  │  ├── Plugin Loader (load from disk)               │  │
│  │  ├── Sandbox (VM2 / isolated context)             │  │
│  │  ├── Plugin Registry (manifest index)             │  │
│  │  └── Lifecycle Manager (install/update/remove)    │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │          Extension API (exposed to plugins)         │  │
│  │  ├── PluginAPI (contributePoints, commands, views) │  │
│  │  ├── IPC Bridge (plugins pueden llamar servicios)  │  │
│  │  ├── Store Access (plugins leen/escuchan stores)   │  │
│  │  └── Event Bus (plugins emiten/escuchan eventos)   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │          Contribute Points                          │  │
│  │  ├── sidebar.items  → botones en la sidebar        │  │
│  │  ├── page.routes   → nuevas páginas                │  │
│  │  ├── game.actions  → botones en GameDetail         │  │
│  │  ├── settings.tabs → nuevas pestañas en Settings   │  │
│  │  ├── store.source  → nuevas fuentes de juegos      │  │
│  │  ├── download.protocol → nuevos protocolos CDN     │  │
│  │  ├── menu.context  → menú contextual               │  │
│  │  └── app.commands  → comandos globales             │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Componentes nuevos

```
src/components/plugins/
├── PluginManagerPage.tsx         ← Página de gestión de plugins
├── PluginCard.tsx                ← Card de plugin (icono, nombre, versión, autor)
├── PluginSettingsPanel.tsx       ← Panel de configuración por plugin
├── PluginMarketplace.tsx         ← Explorador de plugins disponibles
├── PluginDiagnostics.tsx         ← Diagnóstico de plugins (errores, logs)
├── PluginContributions.tsx       ← Vista de lo que cada plugin aporta

src/components/plugin-api/
├── ContributePointRenderer.tsx   ← Renderiza puntos de contribución
├── SidebarContribution.tsx       ← Renderiza botones de sidebar
├── RouteContribution.tsx         ← Renderiza rutas de plugins
├── ActionContribution.tsx        ← Renderiza acciones en GameDetail
```

### Stores nuevos

```
src/stores/
├── usePluginStore.ts             ← Estado de plugins instalados
├── usePluginConfigStore.ts       ← Configuración persistente por plugin
```

### Servicios nuevos (Service Layer)

```
src/services/
├── PluginLoaderService.ts        ← Cargar plugins desde disco
├── PluginLifecycleService.ts     ← Install, update, remove, enable, disable
├── PluginAPIService.ts           ← Exponer API a plugins

electron/services/
├── PluginLoaderService.ts        ← Leer carpeta plugins/, validar manifest
├── PluginSandboxService.ts       ← Ejecutar plugins en VM aislada
├── PluginLifecycleService.ts     ← Gestión de ciclo de vida
├── PluginRegistryService.ts      ← Index de plugins disponibles
```

### IPC nuevos

```
plugin:list                      ← Listar plugins instalados
plugin:install                   ← Instalar plugin desde archivo/URL
plugin:uninstall                 ← Eliminar plugin
plugin:enable                    ← Activar plugin
plugin:disable                   ← Desactivar plugin
plugin:getConfig                 ← Obtener config de un plugin
plugin:setConfig                 ← Guardar config de un plugin
plugin:diagnostics               ← Obtener logs/errores de plugins
plugin:callAPI                   ← Llamar a la API de un plugin
```

### Backend

```typescript
// electron/modules/plugin-system.ts

interface PluginManifest {
  id: string
  name: string
  version: string
  author: string
  description: string
  main: string            // Entry point (relative to plugin dir)
  contributes: {
    sidebarItems?: SidebarContribution[]
    routes?: RouteContribution[]
    gameActions?: ActionContribution[]
    storeSources?: StoreSourceContribution[]
    downloadProtocols?: DownloadProtocolContribution[]
    settingsTabs?: SettingsTabContribution[]
    commands?: CommandContribution[]
  }
}

export class PluginSystem {
  private host: ExtensionHost
  private registry: Map<string, PluginManifest>
  private sandbox: SandboxManager

  async loadAll(): Promise<void>
  async install(pluginPath: string): Promise<PluginManifest>
  async uninstall(pluginId: string): Promise<void>
  async enable(pluginId: string): Promise<void>
  async disable(pluginId: string): Promise<void>
  
  getContributions<T>(point: string): T[]
  callCommand(commandId: string, ...args: unknown[]): Promise<unknown>
}
```

```typescript
// Plugin API que se expone a los plugins (sandbox)
export interface PluginAPI {
  // IPC (llamar servicios de Y-Core)
  call: (service: string, method: string, ...args: unknown[]) => Promise<unknown>
  
  // Eventos
  on: (event: string, callback: (data: unknown) => void) => () => void
  emit: (event: string, data: unknown) => void
  
  // UI
  contribute: (point: string, contribution: unknown) => void
  
  // Storage (persistencia del plugin)
  getConfig: () => Record<string, unknown>
  setConfig: (config: Record<string, unknown>) => Promise<void>
  getStorage: (key: string) => unknown
  setStorage: (key: string, value: unknown) => void
}
```

### Frontend

El PluginManagerPage permite:
- Ver plugins instalados (nombre, versión, autor, estado)
- Habilitar/deshabilitar plugins con toggle
- Ver qué contributions aporta cada plugin
- Acceder a la configuración de cada plugin
- Instalar plugins desde archivo .yplugin o desde marketplace URL

La sidebar se renderiza dinámicamente:
```tsx
// EpicSidebar.tsx modificado
const pluginItems = usePluginStore(s => s.getSidebarContributions())
const allItems = [...defaultItems, ...pluginItems]
// render
```

### Flujo completo

```
Plugin System Startup
1. Electron arranca → PluginSystem.loadAll()
2. Lee carpeta ~/Y-core/plugins/
3. Por cada carpeta, lee plugin.json (manifest)
4. Valida manifest contra schema
5. Carga el entry point en un sandbox VM
6. Ejecuta plugin.activate(pluginAPI)
7. Plugin llama api.contribute('sidebar.items', { id, label, icon, route })
8. PluginSystem registra la contribución en el registry
9. Store `usePluginStore` actualiza estado
10. Sidebar re-renderiza con los nuevos items
```

### Tests

```
tests/plugins/
├── plugin-manifest.test.ts        ← Validación de schema
├── plugin-loader.test.ts          ← Carga desde disco
├── plugin-sandbox.test.ts         ← Aislamiento de contexto
├── plugin-lifecycle.test.ts       ← Install, enable, disable, remove
├── contribution-points.test.ts    ← Sidebar, routes, actions
├── plugin-api.test.ts             ← API expuesta a plugins
├── plugin-manager-page.test.tsx   ← UI de gestión
```

### Referencias

- **VS Code Extension API**: el estándar de facto para sistemas de plugins. Contribution points, activation events, extension host, command system.
- **Obsidian Plugin API**: más simple que VS Code pero muy efectivo. Referencia para contribution points mínimos.
- **Figma Plugin API**: sandbox con API limitada pero potente.
- **Playnite Extension System**: extensiones en C# que pueden agregar fuentes de juegos, emuladores, metadata.
- **Heroic Games Launcher**: no tiene plugins pero es el tipo de app que se beneficiaría enormemente de tenerlos.

### Complejidad

**Extremadamente Alta.** No es solo código — es diseño de API pública, un contrato que no se puede cambiar después. El sandboxing es complejo. La estabilidad de la API es crítica. Pero una vez que está, TODO es posible.

### Estimación de líneas

```
Plugin manifest + loader                    2,500
Plugin sandbox (VM2 isolation)              2,000
Plugin lifecycle (install/update/remove)    2,500
Plugin API (IPC bridge + events + storage)  3,000
Contribution points system                  2,500
UI (PluginManagerPage, cards, marketplace)  3,500
Stores + services + IPC                     2,500
Tests                                       3,500

Total: ~22,000 líneas
```

### Prioridad

**⭐⭐⭐⭐⭐** (estratégico). No es urgente como el Service Layer (que arregla problemas actuales), pero es el que más valor AGREGADO da a largo plazo. Sin plugins, cada feature nueva lo hace al core. Con plugins, el core se mantiene estable y la innovación viene de afuera.

### Por qué hace que Y-Core parezca un producto profesional

Porque **solo los productos profesionales tienen APIs públicas.** VS Code, Obsidian, Figma, Chrome, Discord (bots). Y-Core con un sistema de plugins deja de ser "una app" y se convierte en "una plataforma." Cualquier desarrollador que vea `contribute('sidebar.items', ...)` va a pensar inmediatamente en VS Code. Y eso es exactamente lo que querés.

---

## 📊 Resumen de las 3 propuestas

| Sistema | Líneas | Prioridad | Complejidad | Impacto usuario | Impacto arquitectura |
|---------|:------:|:---------:|:-----------:|:---------------:|:-------------------:|
| **1. Service Layer + IPC Gateway** | 15,000 | 🔥🔥🔥🔥🔥 | Alta | Medio (invisible) | **Fundacional** |
| **2. Game Runtime Environment** | 26,000 | 🔥🔥🔥🔥🔥 | Muy alta | **Máximo** | Alto |
| **3. Plugin / Extension System** | 22,000 | 🔥🔥🔥🔥🔥 | Extrema | Alto | **Transformacional** |
| **Total** | **63,000** | | | | |

### Orden recomendado

1. **Service Layer** primero → toda la base arquitectónica
2. **Game Runtime** segundo → el feature que más ve el usuario
3. **Plugin System** tercero → cuando el core está sólido, abrir la plataforma

### Estado final

```
Hoy:              41,000 líneas (sin arquitectura escalable)
+ Service Layer:  56,000 (base sólida)
+ Game Runtime:   82,000 (launcher completo)
+ Plugin System: 103,000 (plataforma extensible)

Total:            ~103,000 líneas
```

Y-core pasaría de ser "un proyecto que hace cosas" a "un producto que cualquier desarrollador respeta."
