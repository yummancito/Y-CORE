# Electron App

Aplicación de escritorio que sirve como frontend nativo de Y-core.

## Archivos

| Archivo | Descripción |
|---|---|
| `main.ts` | Proceso principal (3896 líneas). Maneja todos los IPC handlers: Steam path, library, game install, Lua scripts, manifests, Online Fix, logs, config, hook DLL installation. |
| `preload.ts` | Bridge seguro entre renderer y main. Expone `window.steamtools` con context isolation. |
| `logger.ts` | Sistema de logging con rotación de archivos y niveles (info, warn, error). |
| `splash.html` | Pantalla de carga inicial mientras se inicializa la app. |
| `splash-preload.ts` | Preload del splash screen. |
| `types/steam-user.d.ts` | Definiciones de tipos de Steam user. |

## IPC Handlers principales

| Canal | Descripción |
|---|---|
| `steam:getPath` | Obtiene ruta de instalación de Steam |
| `steam:listInstalledGames` | Lista juegos instalados |
| `steam:launchGame` | Lanza un juego |
| `store:installGame` | Instala un juego desde la store (Lua + depot keys + ACF) |
| `steam:importGameFolder` | Importa una carpeta de juego |
| `steam:listLuaScripts` | Lista Lua scripts en Steam/config/lua/ |
| `steam:importManifest` | Importa un archivo manifest |
| `onlinefix:enable/disable/status` | Gestiona Online Fix en ACF |
| `config:read/write` | Persistencia de configuración |

## Hook DLL Installation

El proceso `installHookDll(steamPath)` copia 3 DLLs al directorio de Steam:
1. `YCoreTool.dll` — Hook principal
2. `dwmapi.dll` — Proxy DLL (Steam la carga automáticamente)
3. `xinput1_4.dll` — Proxy DLL adicional

Cuando Steam se reinicia, carga `dwmapi.dll` que a su vez carga `YCoreTool.dll`.
