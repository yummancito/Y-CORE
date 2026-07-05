# Arquitectura de Y-core

## Componentes

### 1. Electron App (`electron/`)
- **main.ts** — Proceso principal. Maneja IPC handlers, instalación de hooks, lectura/escritura de ACF, Lua scripts, depot keys, Online Fix.
- **preload.ts** — Bridge seguro entre renderer (React) y main process. Expone API `window.steamtools`.
- **logger.ts** — Sistema de logging con rotación de archivos.

### 2. Frontend React (`src/`)
- **Vite + TailwindCSS + Zustand**
- Páginas: Library, Store, AddGame, ImportGame, LuaScripts, ManifestFiles, OnlineFix, Logs, Settings, Login, ResetPassword.
- Stores Zustand: auth, library, steam, settings, toast, commandPalette, recommendations.

### 3. API Backend (`apps/api/`)
- **Fastify** con JWT auth, rate limiting, CORS.
- Rutas: `/auth`, `/games`, `/jobs`, `/manifests`.
- Integra Supabase (PostgreSQL), DepotBox API, Resend (email), GitHub (manifests storage).
- Procesa imports de DepotBox inline (sin worker/Redis).

### 4. Native DLLs (`native/`)
- **YCoreTool.dll** — Hook principal que se carga en Steam. Intercepta SteamAPI_Init, redirige Lua scripts, maneja depot keys.
- **dwmapi.dll** — Proxy DLL que carga YCoreTool.dll al iniciar Steam.
- **xinput1_4.dll** — Proxy DLL adicional para compatibilidad.

### 5. Base de Datos (`supabase/`)
- PostgreSQL gestionado por Supabase.
- Migraciones versionadas en `supabase/migrations/`.

## Flujo de Instalación de un Juego

```
1. Usuario selecciona juego en Store
2. Frontend llama a window.steamtools.storeInstallGame(game)
3. Electron main.ts:
   a. Parsea Lua script (addappid, setManifestid)
   b. Valida depot keys (todas las necesarias presentes)
   c. Smart Manifest Sync (verifica/descarga manifests)
   d. GoldSrc base depots (si es mod de Half-Life)
   e. installGameCore():
      - Instala hook DLLs (YCoreTool.dll, dwmapi.dll, xinput1_4.dll)
      - Copia Lua script a Steam/config/lua/
      - Inyecta depot keys en config.vdf
      - Crea appmanifest_*.acf con StateFlags=1026
4. Usuario reinicia Steam
5. Steam carga dwmapi.dll → carga YCoreTool.dll
6. YCoreTool.dll ejecuta Lua script, intercepta SteamAPI
7. Steam descarga y desencripta depots con las keys inyectadas
```

## Flujo de Online Fix

```
1. Usuario busca juego en página Online Fix
2. Verifica compatibilidad (onlinefix-compatibility.ts)
3. Click "Enable" → escribe -onlinefix en LaunchOptions del ACF
4. Al lanzar el juego, Steam pasa -onlinefix como argumento
5. YCoreTool.dll detecta -onlinefix y cambia AppID a 480 (SpaceWar)
6. Esto permite multiplayer P2P entre copias crackeadas
```
