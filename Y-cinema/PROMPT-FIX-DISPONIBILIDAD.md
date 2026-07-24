# Y-CINEMA — Arreglar Películas "No Disponible" + Logging

## Problema

Muchas películas muestran "no disponible" porque `@movie-web/providers` no encuentra streams. No sabemos por qué fallan porque no hay logs de error visibles.

## Causas posibles

1. El provider busca por `tmdbId` pero el ID no coincide exactamente con el de sus fuentes
2. El provider encuentra el contenido pero tarda más del tiempo permitido y timeout
3. La película no existe en las fuentes que scrapea `@movie-web/providers`
4. El provider devuelve error pero lo silenciamos con el `catch` genérico

## Soluciones necesarias

### 1. Agregar logs detallados en `electron/modules/stream-provider.ts`

Cada intento de búsqueda debe loguear:
- Qué título y tmdbId se buscaron
- Qué proveedores se intentaron
- Qué error devolvió cada proveedor (timeout, no encontrado, etc.)
- Cuánto tardó cada intento (timing)

**Además:** El searchFallback() debe intentar **múltiples enfoques**:
- Primero con `runAll` (corre todos los providers en paralelo)
- Después probar con **cada provider individualmente** para ver cuáles responden
- Finalmente, si todo falla, intentar con **título sin año** y con **año variado (±1)**

### 2. Reimplementar `searchFallback()` con enfoques alternativos

```typescript
// searchFallback ahora debe:
async searchFallback(title: string, year?: number): Promise<StreamResult | null> {
  const attempts = []
  
  // Attempt 1: sin año
  attempts.push(this.searchWithTitleOnly(title))
  
  // Attempt 2: con año -1, +1 
  if (year) {
    attempts.push(this.searchWithTitleAndYear(title, year - 1))
    attempts.push(this.searchWithTitleAndYear(title, year + 1))
  }
  
  // Attempt 3: usar torrent como respaldo REAL
  // Llamar a TorrentSearch y devolver el resultado como StreamResult
  // (Esto requiere acceso al torrentSearch)
  
  return firstNonNullResult(attempts)
}
```

### 3. Crear un IPC handler de logs

Agregar en `electron/main.ts`:

```typescript
ipcMain.handle('stream:logs', async () => {
  return streamProvider.getLogs() // Devuelve los últimos N logs
})

ipcMain.handle('stream:testProvider', async (_event, tmdbId: number, title: string) => {
  return streamProvider.testSingleProvider(tmdbId, title) // Prueba provider por provider
})
```

### 4. Agregar un método `testSingleProvider()` en stream-provider.ts

Que recorra **cada provider individualmente** y devuelva cuáles funcionaron y cuáles no, para debuggear:

```typescript
async testSingleProvider(tmdbId: number, title: string): Promise<{
  providerId: string
  success: boolean
  error?: string
  timing: number // ms
  streamUrl?: string
}[]>
```

### 5. Agregar contador de intentos + rate limiting

- Si un provider falla 3 veces seguidas, no intentarlo más por 5 minutos
- Esto evita que la app se ponga lenta con providers caídos

### 6. Mostrar logs en la UI (devtools)

Crear un panel de logs en la app (solo visible en modo dev):
- Botón flotante o shortcut (Ctrl+Shift+L) que abre un overlay con logs
- Muestra: qué película se buscó, qué providers respondieron, errores, tiempos
- Se puede limpiar

### 7. Agregar consultas a `@movie-web/providers` directamente desde la UI

- Botón "Probar providers" en la pantalla de detalle de película
- Muestra una lista con cada provider y si encontró/falló
- Útil para debuggear por qué una película específica no funciona

## Archivos a modificar

| Archivo | Cambio |
|---|---|
| `electron/modules/stream-provider.ts` | Agregar logs internos, testSingleProvider(), getLogs(), searchFallback() con enfoques múltiples |
| `electron/modules/history.ts` | Agregar almacenamiento de logs de búsqueda (opcional) |
| `electron/main.ts` | Agregar IPC handlers: `stream:logs`, `stream:testProvider` |
| `electron/preload.ts` | Exponer `window.api.stream.getLogs()` y `window.api.stream.testProvider()` |
| `src/vite-env.d.ts` | Agregar tipos para los nuevos métodos |

## No tocar

- ❌ `tmdb-api.ts`
- ❌ `torrent-engine.ts` (solo si lo necesitás como fallback real)
- ❌ Archivos de configuración (vite, tailwind, tsconfig)

## Validación

```bash
npm run typecheck
```

Después, abrí la app con `npm run dev:electron`, abrí DevTools (Ctrl+Shift+I) y probá buscar una película problemática. Los logs deben aparecer en la consola de Electron.
