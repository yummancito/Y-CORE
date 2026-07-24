# Y-CINEMA — Fase 1: Streaming Directo HTTP

## Objetivo

Reemplazar el motor de torrents (WebTorrent) por streaming directo HTTP usando `@movie-web/providers`. Las películas deben empezar en **2-4 segundos** en vez de 20-40s.

---

## Estado actual del proyecto

Ya existe un backend funcional con:

| Archivo | Propósito |
|---|---|
| `electron/main.ts` | Entry point + 25 IPC handlers + dotenv |
| `electron/preload.ts` | contextBridge con API tipada |
| `electron/modules/tmdb-api.ts` | Cliente TMDB completo |
| `electron/modules/torrent-search.ts` | Buscador de torrents (TPB, YTS, Nyaa) |
| `electron/modules/torrent-engine.ts` | WebTorrent + stream server HTTP |
| `electron/modules/subtitles.ts` | Motor de subtítulos |
| `electron/modules/history.ts` | Persistencia local |
| `src/vite-env.d.ts` | Type declarations para `window.api` |

**NO modifiques ninguno de estos archivos existentes.** Solo vas a:

1. **Crear** `electron/modules/stream-provider.ts` — el nuevo módulo
2. **Actualizar** `electron/main.ts` — agregar IPC handlers nuevos
3. **Actualizar** `electron/preload.ts` — exponer los nuevos métodos
4. **Actualizar** `src/vite-env.d.ts` — tipos para los nuevos métodos

---

## Lo que tenés que hacer

### 1. Instalar dependencias

```bash
npm install @movie-web/providers
```

### 2. Crear `electron/modules/stream-provider.ts`

Este módulo reemplaza a `TorrentEngine`. Envuelve `@movie-web/providers` para buscar y reproducir películas al instante.

```typescript
// stream-provider.ts — Motor de streaming directo HTTP con @movie-web/providers
// Reemplaza a TorrentEngine para arranque instantáneo (2-4 segundos)

import { makeProviders, makeStandardFetcher, targets } from '@movie-web/providers'

export interface StreamResult {
  streamUrl: string      // URL del .m3u8 o .mp4
  subtitles: Array<{     // Subtítulos disponibles
    url: string
    lang: string
  }>
  source: string         // Nombre del proveedor (ej: "flixhq", "vidsrc")
  quality: string        // 720p, 1080p, etc
}

export class StreamProvider {
  private providers: ReturnType<typeof makeProviders>

  constructor() {
    this.providers = makeProviders({
      fetcher: makeStandardFetcher(fetch),
      target: targets.BROWSER,
    })
  }

  /**
   * Busca un stream directo para una película/serie.
   * Usa el título y año de TMDB para encontrar el contenido.
   */
  async search(title: string, year?: number, type: 'movie' | 'show' = 'movie'): Promise<StreamResult | null> {
    try {
      const output = await this.providers.runAll({
        media: {
          // Para películas: tmdbId es opcional, usamos title+year
          tmdbId: undefined,
          type: type,
          title: title,
          releaseYear: year,
        },
      })

      if (!output?.stream) return null

      return {
        streamUrl: output.stream.url,
        subtitles: (output.stream.subtitles || []).map(sub => ({
          url: sub.url,
          lang: sub.language || 'Unknown',
        })),
        source: output.source || 'unknown',
        quality: this.detectQuality(output.stream),
      }
    } catch (err) {
      console.warn('[StreamProvider] search failed:', err)
      return null
    }
  }

  /**
   * Fallback: si @movie-web/providers no encuentra nada,
   * intentar con una fuente alternativa.
   * Por ahora solo devuelve null.
   */
  async searchFallback(title: string, year?: number): Promise<StreamResult | null> {
    return null
  }

  private detectQuality(stream: any): string {
    const url = stream?.url || ''
    if (url.includes('1080') || url.includes('1080p')) return '1080p'
    if (url.includes('720') || url.includes('720p')) return '720p'
    if (url.includes('480') || url.includes('480p')) return '480p'
    return 'HD'
  }
}
```

### 3. Actualizar `electron/main.ts`

Agregar estos IPC handlers **nuevos** (sin borrar los existentes de torrent):

```typescript
import { StreamProvider } from './modules/stream-provider'

// En la función registerIpcHandlers(), agregar:
const streamProvider = new StreamProvider()

// Stream directo (reemplazo de torrent:search + torrent:play)
ipcMain.handle('stream:search', async (_event, title: string, year?: number, type?: string) => {
  return streamProvider.search(title, year, type as 'movie' | 'show')
})

ipcMain.handle('stream:fallback', async (_event, title: string, year?: number) => {
  return streamProvider.searchFallback(title, year)
})
```

### 4. Actualizar `electron/preload.ts`

Agregar al objeto `api`:

```typescript
stream: {
  search: (title: string, year?: number, type?: string) =>
    ipcRenderer.invoke('stream:search', title, year, type),
  fallbackSearch: (title: string, year?: number) =>
    ipcRenderer.invoke('stream:fallback', title, year),
},
```

### 5. Actualizar `src/vite-env.d.ts`

Agregar al interface `Window.api`:

```typescript
stream: {
  search: (title: string, year?: number, type?: string) => Promise<{
    streamUrl: string
    subtitles: Array<{ url: string; lang: string }>
    source: string
    quality: string
  } | null>
  fallbackSearch: (title: string, year?: number) => Promise<any>
}
```

---

## Cómo usarlo desde React (para referencia del que haga la UI)

La página WatchPage debería hacer:

```typescript
// En WatchPage.tsx
const handlePlay = async (title: string, year?: number, type = 'movie') => {
  // 1. Buscar stream directo (tarda 2-4 segundos)
  const result = await window.api.stream.search(title, year, type)

  if (result?.streamUrl) {
    // 2. Pasar la URL al player de video
    setVideoSource(result.streamUrl)
    setSubtitles(result.subtitles)
  } else {
    // 3. Si no encuentra, mostrar error o intentar fallback
    console.warn('No stream found for:', title)
  }
}
```

---

## Lo que NO tenés que hacer

- ❌ No borrar los módulos de torrent existentes (quedan como respaldo)
- ❌ No modificar tmdb-api.ts, history.ts, subtitles.ts, torrent-search.ts, torrent-engine.ts
- ❌ No tocar la UI (componentes React, páginas) — eso lo hace otro
- ❌ No cambiar configuraciones (vite, tailwind, tsconfig, package.json build)

## Validación

```bash
npm run typecheck   # debe dar 0 errores
```
