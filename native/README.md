# Sistema Nativo (DLLs)

Y-core utiliza DLLs nativas C++ para interceptar la API de Steam y permitir la instalación de juegos con depot keys y Lua scripts.

## Estructura

```
native/
├── opensteamtool/          # DLLs compiladas listas para deployment
│   ├── YCoreTool.dll      # Hook principal (intercepta SteamAPI_Init)
│   ├── dwmapi.dll         # Proxy DLL (Steam la carga automáticamente)
│   ├── xinput1_4.dll      # Proxy DLL adicional
│   └── README.md          # Instrucciones de instalación
├── opensteamtool-src/      # Source code C++ del hook
│   ├── src/               # Código fuente (hooks, config, logging, metadata)
│   ├── tools/             # Herramientas de build CMake
│   ├── build_y_core.bat   # Script de compilación
│   └── README.md          # Cómo compilar
└── README.md              # Este archivo
```

## Cómo funciona

1. **Instalación**: La app Electron copia las 3 DLLs al directorio raíz de Steam.
2. **Carga**: Al reiniciar Steam, carga `dwmapi.dll` (es una DLL del sistema que Steam importa).
3. **Hook**: `dwmapi.dll` carga `YCoreTool.dll` que instala hooks en `SteamAPI_Init`.
4. **Lua**: `YCoreTool.dll` lee los Lua scripts de `Steam/config/lua/` y ejecuta `addappid()` y `setManifestid()`.
5. **Depot keys**: Las keys se inyectan en `config.vdf` desde Electron (no desde la DLL).
6. **Online Fix**: Cuando un juego se lanza con `-onlinefix`, la DLL cambia el AppID a 480 (SpaceWar) para multiplayer P2P.

## Compilación

```bash
cd native/opensteamtool-src
build_y_core.bat
```

Requiere Visual Studio 2022 y CMake 3.20+.

## Seguridad

- Stats API deshabilitada (`enable_api = false` en config)
- Remote TOML deshabilitado (no descarga de servidores externos)
- Manifest providers externos removidos (solo local)
- User-Agent: `YCoreTool/1.0`
- Logs en `<Steam>/ycoretool/`
