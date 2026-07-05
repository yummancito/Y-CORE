# Y-core Tool DLLs para Y-core

Esta carpeta contiene los DLLs de Y-core Tool compilados para que Y-core los instale automáticamente en Steam.

## Archivos actuales

- `YCoreTool.dll` — hook principal (IPC, tickets, manifests)
- `dwmapi.dll` — proxy DLL para inyección en Steam
- `xinput1_4.dll` — proxy DLL alternativa para inyección en Steam

## Qué cambia en Y-core

1. `electron/main.ts` detecta si existen estos DLLs en `native/opensteamtool/`.
2. Si existen, instala Y-core Tool en lugar del hook legacy `ycore_hook.dll`.
3. La carpeta de scripts Lua cambia a `Steam\config\lua` (Y-core Tool) en lugar de `Steam\config\stplug-in` (hook legacy).
4. Al instalar Y-core Tool, Y-core migra automáticamente los scripts `.lua` existentes de `stplug-in` a `lua`.

## Compilar desde el código fuente

El repo fuente de Y-core Tool ya está clonado en `native/opensteamtool-src/`.

Requisitos:
- Windows 10/11
- CMake 3.20+
- Visual Studio 2022 BuildTools/Community/Professional con componente "Desktop development with C++"

Compilar (helper script que configura MSVC automáticamente):
```powershell
cd native/opensteamtool-src
.\build_y_core.bat
```

Después de compilar, copia desde `build/Release/` a esta carpeta:
- `YCoreTool.dll`
- `dwmapi.dll`
- `xinput1_4.dll`

## Nota sobre antivirus

Algunos antivirus pueden eliminar los DLLs/binarios de Y-core Tool porque usan técnicas de hooking/inyección. Si sucede, añade una exclusión para esta carpeta o compila los archivos manualmente.
