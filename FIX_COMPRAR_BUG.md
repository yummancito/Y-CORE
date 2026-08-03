# 🎮 FIX: Steam "Comprar" → "Descargar" Bug

**Status:** ✅ **RESUELTO Y VERIFICADO**

## El Problema

En **v4.x**, los juegos descargados con Y-core mostraban **"Comprar"** en Steam en lugar de **"Descargar"**, incluso cuando el juego ya estaba instalado. Esto ocurría **solo en otras PCs** (no en la del creador).

```
Steam (otra PC):
├─ Mi Librería
│  └─ Amogus 3D
│     └─ [COMPRAR] ❌  (debería ser [JUGAR])
```

## Root Cause: InstalledDepots Vacío

El archivo `appmanifest_<appId>.acf` que Y-core creaba tenía esta estructura:

```vdf
"AppState"
{
  "appid" "1942280"
  "name" "Amogus 3D"
  "installdir" "Amogus 3D"
  ...
  "InstalledDepots"
  {
    # ❌ VACÍO - Sin depot IDs
  }
}
```

**Cuando `InstalledDepots` está vacío**, Steam interpreta que el juego no tiene depots descargables → muestra "Comprar".

## La Causa: lua_content No Se Pasaba

El flujo de datos interrumpido:

```
Y-core API (tiene lua_content)
    ↓
useInstallProcessor.ts (NO pasaba lua_content)
    ↓
startV2Download() (NO recibía lua_content)
    ↓
startFromApi() (opts.luaContent vacío)
    ↓
installGameCore(appId, name, '', depotKeys) ❌ Lua VACÍA
    ↓
createAppManifestFromLua('', ...) ❌ Sin manifests
    ↓
buildAppManifestAcf() ❌ InstalledDepots vacío
```

### ¿Qué es lua_content?

Es un script Lua que contiene líneas como:

```lua
setManifestid(1942280, "123abc456def")  -- depot 1942280 → manifest 123abc456def
setManifestid(1942281, "789ghi012jkl")  -- depot 1942281 → manifest 789ghi012jkl
```

Estos `setManifestid()` definen **qué depots pertenecen al juego**. Sin ellos, Y-core no sabe qué depots llenar en `InstalledDepots`.

## La Solución: 3 Líneas de Código

### 1. `src/services/install.service.ts` (línea 69-76)

**ANTES:**
```typescript
async function startV2Download(opts: {
  appId: string
  name: string
  manifestFiles: { depotId: string; manifestId: string }[]
  depotKeys: { depotId: string; key: string }[]
  priority?: number
  source?: 'steam-native' | 'direct' | 'api_proxy' | 'torrent'
}): Promise<...> {
```

**DESPUÉS:**
```typescript
async function startV2Download(opts: {
  appId: string
  name: string
  manifestFiles: { depotId: string; manifestId: string }[]
  depotKeys: { depotId: string; key: string }[]
  luaContent?: string  // ← AGREGADO
  priority?: number
  source?: 'steam-native' | 'direct' | 'api_proxy' | 'torrent'
}): Promise<...> {
  try {
    const result = await downloadService.startFromApi({
      appId: opts.appId,
      name: opts.name,
      manifestFiles: opts.manifestFiles,
      depotKeys: opts.depotKeys,
      luaContent: opts.luaContent,  // ← AGREGADO
      priority: opts.priority,
      source: opts.source ?? 'steam-native',
    })
```

### 2. `src/hooks/useInstallProcessor.ts` (línea 114-121)

**ANTES:**
```typescript
const started = await installService.startV2Download({
  appId: String(game.app_id),
  name: game.name,
  manifestFiles,
  depotKeys,
  priority: 1,
})
```

**DESPUÉS:**
```typescript
const started = await installService.startV2Download({
  appId: String(game.app_id),
  name: game.name,
  manifestFiles,
  depotKeys,
  luaContent: game.lua_content,  // ← AGREGADO
  priority: 1,
})
```

### 3. `electron/services/download.service.ts` (línea 161)

✅ **YA ESTABA CORRECTO:**
```typescript
const gameResult = await installGameCore(appId, opts.name, opts.luaContent || '', depotKeys, steamPath)
```

Solo necesitaba que `opts.luaContent` le llegara con valor (no vacío).

## El Flujo Arreglado

```
Y-core API (lua_content: "setManifestid(1942280, '123abc...')")
    ↓
useInstallProcessor.ts (game.lua_content)
    ↓
startV2Download({ luaContent: game.lua_content })
    ↓
startFromApi({ luaContent: 'setManifestid(...)' })
    ↓
installGameCore(appId, name, luaContent, depotKeys) ✅ Lua PRESENTE
    ↓
createAppManifestFromLua(lua, ...)
    └─ Extrae: setManifestid(1942280, "123abc456def")
    └─ Crea: manifestEntries = [{ depotId: "1942280", manifestId: "123abc456def" }]
    ↓
buildAppManifestAcf(appId, name, installDir, manifestEntries)
    ↓
ACF resultante:
```

```vdf
"AppState"
{
  "appid" "1942280"
  "name" "Amogus 3D"
  "installdir" "Amogus 3D"
  ...
  "InstalledDepots"
  {
    "1942280"
    {
      "manifest" "123abc456def"
      "size" "1234567890"
    }
  }
}
```

✅ **Ahora Steam ve depots → muestra "DESCARGAR"**

## Versión del Fix

- **Commit:** `7c83499`
- **Release:** v4.3.27-fix
- **Tamaño:** 1.3 MB (EXE)
- **SHA512:** `bb1a83e646f68208469c3020dfee6b08d48186af4e5d2b6909ccd4368ba105becc46ac58cef814a4278d3d0dff739335269e492d0af5a1dce33b8f8524994098`

## Verificación

```bash
# En otra PC con Y-core v4.3.27-fix:
1. Descargar Amogus 3D
2. Verificar Steam
   └─ Amogus 3D → [JUGAR] ✅ (no [COMPRAR])
3. Lanzar desde Steam
   └─ ✅ Funciona sin "No hay licencias"
```

## Por Qué No Se Veía Antes

En **v3.0.1**, la Lua **sí se pasaba** porque usaba un flujo diferente (`onlinefix:generate` en IPC). v4.x cambió a un sistema de descargas completamente nuevo (V2 download engine) pero olvidó pasar `lua_content` por la nueva ruta.

## Archivos Afectados

- `src/services/install.service.ts` (+1 línea de parámetro, +1 línea de paso)
- `src/hooks/useInstallProcessor.ts` (+1 línea)
- `electron/services/download.service.ts` (no cambios, ya lo recibía)

**Total:** 3 líneas agregadas, 0 líneas eliminadas.

## Testing Checklist

- [x] TypeScript compila sin errores
- [x] Windows Defender no marca como virus (no cambió versión, compilación limpia)
- [x] Descarga Amogus 3D en otra PC
- [x] Steam muestra "Descargar" ✅
- [x] Se descarga correctamente
- [x] Se lanza sin "No hay licencias" ✅
- [x] Auto-actualización funciona desde v4.3.27

---

**Fecha de Fix:** 03/08/2026  
**Probado por:** Usuario final ✅  
**Status:** LISTO PARA PRODUCCIÓN
