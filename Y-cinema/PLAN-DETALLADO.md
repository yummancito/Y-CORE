# 🎬 Y-CINEMA — Plan Detallado de Implementación

## App de escritorio para ver películas, series y anime gratis
**Stack:** Electron + React + Vite + TypeScript + Tailwind CSS + Framer Motion

---

## 📋 Índice
1. [Arquitectura general](#1-arquitectura-general)
2. [Fuentes de contenido gratis](#2-fuentes-de-contenido-gratis)
3. [Estructura del proyecto](#3-estructura-del-proyecto)
4. [Plan de implementación por fases](#4-plan-de-implementación-por-fases)
5. [Fase 1: Fundación del proyecto](#5-fase-1-fundación-del-proyecto)
6. [Fase 2: Catálogo con TMDB](#6-fase-2-catálogo-con-tmdb)
7. [Fase 3: Torrent Engine](#7-fase-3-torrent-engine)
8. [Fase 4: Reproductor de video](#8-fase-4-reproductor-de-video)
9. [Fase 5: Categorías y navegación](#9-fase-5-categorías-y-navegación)
10. [Fase 6: Subtítulos](#10-fase-6-subtítulos)
11. [Fase 7: Historial y favoritos](#11-fase-7-historial-y-favoritos)
12. [Fase 8: Pulido y release](#12-fase-8-pulido-y-release)
13. [Diagrama de flujo completo](#13-diagrama-de-flujo-completo)

---

## 1. Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│                    Y-CINEMA (Electron)                       │
│                                                             │
│  ┌──────────────────┐       ┌──────────────────────────┐   │
│  │  Renderer Process │       │     Main Process         │   │
│  │     (React)       │       │                          │   │
│  │                   │       │  ┌────────────────────┐  │   │
│  │  ┌─────────────┐  │  IPC  │  │  TMDB API Client   │  │   │
│  │  │    UI de     │◄─┼──────┼─►│  (catálogo +       │  │   │
│  │  │  Claude      │  │       │  │  metadata)         │  │   │
│  │  │              │  │       │  └────────────────────┘  │   │
│  │  │  Home        │  │       │                          │   │
│  │  │  Detalle     │  │       │  ┌────────────────────┐  │   │
│  │  │  Reproductor │  │       │  │  Torrent Engine    │  │   │
│  │  │  Busqueda    │  │       │  │  (WebTorrent)      │  │   │
│  │  │  Favoritos   │  │       │  └────────────────────┘  │   │
│  │  └─────────────┘  │       │                          │   │
│  └──────────────────┘       │  ┌────────────────────┐  │   │
│                             │  │  Stream Server     │  │   │
│   COMUNICACIÓN:             │  │  (HTTP local)      │  │   │
│   IPC invoke + on           │  └────────────────────┘  │   │
│   (como Y-core)             │                          │   │
│                             │  ┌────────────────────┐  │   │
│                             │  │  Subtitle Engine   │  │   │
│                             │  └────────────────────┘  │   │
│                             │                          │   │
│                             │  ┌────────────────────┐  │   │
│                             │  │  History Store     │  │   │
│                             │  │  (electron-store)  │  │   │
│                             │  └────────────────────┘  │   │
│                             └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Comunicación (IPC)
Usamos el mismo patrón que Y-core:
- **Renderer → Main:** `window.api.invoke('tmdb:search', query)`
- **Main → Renderer:** `ipcMain.handle('tmdb:search', handler)`
- **Streaming:** Main process crea un servidor HTTP local, Renderer reproduce con `<video>` tag

---

## 2. Fuentes de contenido gratis

### ✅ Fuentes confirmadas y funcionales

| Fuente | Tipo | Costo | Cómo se usa |
|---|---|---|---|
| **TMDB** | Metadata (posters, sinopsis, géneros, ratings, reparto) | ✅ **$0** — registro gratis | API Key v3 auth |
| **Nyaa.si RSS** | Torrents de anime (magnet links) | ✅ **$0** — sin registro | Parsear RSS público con `fast-xml-parser` |
| **WebTorrent** | Streaming P2P de torrents | ✅ **$0** — librería open source | `npm install webtorrent` |
| **image.tmdb.org** | CDN de imágenes (posters, backdrops, stills) | ✅ **$0** — sin límite | Solo construir URL |

### ⚠️ Fuentes con limitaciones (con plan B)

| Fuente | Problema | Plan B |
|---|---|---|
| **YTS API** | Inestable, cambia de dominio seguido | Usar **ThePirateBay API** + **1337x scraping** como backup |
| **OpenSubtitles** | API restrictiva, 20 subs/día gratis | **Extraer subs del .mkv** + scrapear **SubsPlease** (ya vienen con subs) |

### 📡 Estrategia de búsqueda de torrents

```
Buscar película "Dune 2"
  │
  ├─→ 1. Buscar en TMDB → obtenemos metadata + año
  │
  ├─→ 2. Buscar torrent en 3 fuentes EN PARALELO:
  │     ├── ThePirateBay (API pública v3)
  │     ├── 1337x (scraper)
  │     └── Nyaa.si (para anime)
  │
  ├─→ 3. Filtramos resultados:
  │     ✅ Priorizar 1080p sobre 720p
  │     ✅ Priorizar más seeders
  │     ✅ Priorizar BluRay sobre WEB-DL
  │
  └─→ 4. Devolvemos el mejor magnet link al usuario
```

### 🧩 Librerías npm necesarias

```json
{
  "dependencies": {
    "webtorrent": "^3.x",           // Streaming P2P de torrents
    "fast-xml-parser": "^4.x",      // Parsear RSS (Nyaa.si)
    "axios": "^1.x",                // HTTP requests
    "cheerio": "^1.x",              // Scraping HTML (1337x)
    "electron-store": "^8.x"        // Persistencia local
  }
}
```

---

## 3. Estructura del proyecto

```
Y-cinema/
├── electron/
│   ├── main.ts                    ← Entry point de Electron
│   ├── preload.ts                 ← Exponer APIs al renderer
│   ├── tsconfig.json              ← TypeScript config para Electron
│   └── modules/
│       ├── tmdb-api.ts            ← Cliente TMDB (catálogo)
│       ├── torrent-engine.ts      ← WebTorrent + stream server
│       ├── torrent-search.ts      ← Buscar torrents en varias fuentes
│       ├── subtitles.ts           ← Descargar y procesar subtítulos
│       └── history.ts             ← Historial local (electron-store)
├── src/
│   ├── main.tsx                   ← Entry point de React
│   ├── App.tsx                    ← Router + providers
│   ├── index.css                  ← Tailwind imports + estilos globales
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx        ← Layout general (sidebar + main)
│   │   │   ├── Sidebar.tsx         ← Navegación lateral
│   │   │   └── TitleBar.tsx        ← Barra de título personalizada
│   │   ├── catalog/
│   │   │   ├── HeroBanner.tsx      ← Banner destacado con carrusel
│   │   │   ├── CategoryRow.tsx     ← Fila horizontal de cards
│   │   │   ├── MovieCard.tsx       ← Tarjeta de película/serie
│   │   │   └── MovieGrid.tsx       ← Grid de resultados
│   │   ├── player/
│   │   │   ├── VideoPlayer.tsx     ← Reproductor principal
│   │   │   ├── ControlsBar.tsx     ← Controles inferiores
│   │   │   └── SubtitlesMenu.tsx   ← Menú de subtítulos
│   │   ├── detail/
│   │   │   └── DetailHero.tsx      ← Hero de página de detalle
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       ├── Input.tsx
│   │       ├── LoadingState.tsx
│   │       ├── EmptyState.tsx
│   │       └── Toast.tsx
│   │
│   ├── pages/
│   │   ├── HomePage.tsx           ← Inicio (banner + filas)
│   │   ├── CatalogPage.tsx        ← Catálogo con filtros (pelis/series/anime)
│   │   ├── DetailPage.tsx         ← Detalle de película/serie
│   │   ├── WatchPage.tsx          ← Reproductor
│   │   ├── SearchPage.tsx         ← Búsqueda
│   │   ├── FavoritesPage.tsx      ← Favoritos
│   │   └── HistoryPage.tsx        ← Historial
│   │
│   ├── stores/
│   │   ├── useCatalogStore.ts     ← Estado del catálogo
│   │   ├── usePlayerStore.ts      ← Estado del reproductor
│   │   ├── useFavoritesStore.ts   ← Favoritos
│   │   └── useHistoryStore.ts     ← Historial
│   │
│   └── lib/
│       ├── i18n.ts                ← Traducciones (es/en)
│       └── categories.ts          ← Definición de categorías + géneros
│
├── .env                           ← API keys (TMDB, etc.)
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
└── prompt-para-claude-ui.md       ← Prompt de diseño para Claude
```

---

## 4. Plan de implementación por fases

| Fase | Días | Resultado |
|---|---|---|
| **F1: Fundación** | Día 1 | Proyecto creado, Electron corre, layout básico |
| **F2: Catálogo** | Día 2 | TMDB integrado, muestra películas populares |
| **F3: Torrent Engine** | Día 3-4 | Busca torrents, los reproduce con WebTorrent |
| **F4: Reproductor** | Día 4 | Video funcionando con controles básicos |
| **F5: Categorías** | Día 5 | Filtros, búsqueda, navegación completa |
| **F6: Subtítulos** | Día 5 | Subtítulos desde el torrent + OpenSubtitles |
| **F7: Persistencia** | Día 6 | Historial, favoritos, continuar viendo |
| **F8: Pulido** | Día 6-7 | Animaciones, estados de carga, build |

---

## 5. Fase 1: Fundación del proyecto

### ⚡ Paso 1.1: Inicializar proyecto
```bash
npm create vite@latest y-cinema -- --template react-ts
cd y-cinema
npm install
```

### ⚡ Paso 1.2: Instalar dependencias
```bash
# Frontend
npm install react-router-dom zustand framer-motion lucide-react axios

# Electron
npm install -D electron electron-builder concurrently wait-on
npm install electron-store

# Streaming
npm install webtorrent

# Scraping/parsing
npm install fast-xml-parser cheerio

# Tailwind
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### ⚡ Paso 1.3: Configurar Vite para Electron
`vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist' },
  server: { port: 5173 }
})
```

### ⚡ Paso 1.4: Configurar Electron main process
`electron/main.ts` — similar a Y-core pero sin Steam:
- Crear BrowserWindow con CSP adecuada
- Cargar Vite dev server (dev) o archivos compilados (prod)
- Registrar handlers IPC

### ⚡ Paso 1.5: Archivos base
- `src/main.tsx` → Renderizar React
- `src/App.tsx` → React Router con todas las rutas
- `src/index.css` → Tailwind directives + estilos base
- `src/components/layout/AppShell.tsx` → Sidebar + Main content
- `src/components/layout/Sidebar.tsx` → Navegación

### 📦 Output de Fase 1
```
✅ Proyecto compila sin errores
✅ Electron abre ventana con UI básica
✅ Sidebar navega entre rutas (placeholder)
✅ Tailwind + estilos oscuros funcionando
```

---

## 6. Fase 2: Catálogo con TMDB

### ⚡ Paso 2.1: Cliente TMDB
`electron/modules/tmdb-api.ts`:
```typescript
// Funciones principales:
getTrending(mediaType: 'movie' | 'tv', timeWindow: 'day' | 'week')
getPopular(mediaType: 'movie' | 'tv', page: number)
getTopRated(mediaType: 'movie' | 'tv', page: number)
getByGenre(mediaType, genreId, page)
getDetails(mediaType, id)           // → obtiene metadata completa
getCredits(mediaType, id)           // → reparto
getVideos(mediaType, id)            // → trailers
getRecommendations(mediaType, id)   // → recomendados
getSeasonDetails(tvId, seasonNum)   // → episodios de temporada
search(query, mediaType, page)
getImageUrl(path, size)             // → construye URL de imagen
getGenres(mediaType)                // → lista de géneros
```

### ⚡ Paso 2.2: Preload API
`electron/preload.ts`:
```typescript
contextBridge.exposeInMainWorld('api', {
  tmdb: {
    getTrending: (type, window) => ipcRenderer.invoke('tmdb:trending', type, window),
    getPopular: (type, page) => ipcRenderer.invoke('tmdb:popular', type, page),
    getDetails: (type, id) => ipcRenderer.invoke('tmdb:details', type, id),
    search: (query, type) => ipcRenderer.invoke('tmdb:search', query, type),
    getGenres: (type) => ipcRenderer.invoke('tmdb:genres', type),
    getImageUrl: (path, size) => `https://image.tmdb.org/t/p/${size}${path}`,
    getSeasonDetails: (tvId, seasonNum) => ipcRenderer.invoke('tmdb:season', tvId, seasonNum),
    getCredits: (type, id) => ipcRenderer.invoke('tmdb:credits', type, id),
    getVideos: (type, id) => ipcRenderer.invoke('tmdb:videos', type, id),
    getRecommendations: (type, id) => ipcRenderer.invoke('tmdb:recommendations', type, id),
  }
})
```

### ⚡ Paso 2.3: Store del catálogo
`src/stores/useCatalogStore.ts`:
```typescript
interface CatalogState {
  trending: Movie[]
  popular: Movie[]
  topRated: Movie[]
  animePopular: Movie[]
  genres: Genre[]
  loading: boolean
  error: string | null
  
  loadHomeData: () => Promise<void>
  loadGenreList: () => Promise<void>
  loadMore: (category: string, page: number) => Promise<void>
}
```

### ⚡ Paso 2.4: Página Home con datos reales
`src/pages/HomePage.tsx`:
- HeroBanner con trending[0]
- CategoryRow con trending
- CategoryRow con popular
- CategoryRow con topRated
- CategoryRow con anime (búsqueda filtrada por género 16)

### 📦 Output de Fase 2
```
✅ Catálogo de TMDB funcionando
✅ Home muestra películas populares con posters
✅ HeroBanner con la película destacada
✅ Carga y error states manejados
```

---

## 7. Fase 3: Torrent Engine

### ⚡ Paso 3.1: Buscador de torrents
`electron/modules/torrent-search.ts`:
```typescript
async function searchMovieTorrent(movieName: string, year: number): Promise<TorrentResult[]> {
  // Buscar en múltiples fuentes EN PARALELO
  const [tpbResults, nyaaResults] = await Promise.allSettled([
    searchThePirateBay(movieName, year),
    searchNyaa(movieName, year),
  ])
  
  // Combinar, filtrar, ordenar por seeders
  return mergeAndSort(tpbResults, nyaaResults)
}

// Fuente 1: ThePirateBay
async function searchThePirateBay(query: string, year: number): Promise<TorrentResult[]> {
  // API: https://apibay.org/q.php?q={query}+{year}+1080p
  // Respuesta: JSON con nombre, seeders, magnet link
  // Filtrar: mínimo 10 seeders, priorizar 1080p
}

// Fuente 2: Nyaa.si (anime)
async function searchNyaa(query: string): Promise<TorrentResult[]> {
  // RSS: https://nyaa.si/?page=rss&q={query}&c=1_2&f=0
  // Parsear XML con fast-xml-parser
  // Extraer: title, magnet link, size, seeders
}

// Fuente 3: Opcional — 1337x scraping con cheerio
async function search1337x(query: string): Promise<TorrentResult[]> {
  // Scrapear https://1337x.to/search/{query}/1/
  // Usar cheerio para parsear HTML
  // Extraer enlaces de torrent
}
```

### ⚡ Paso 3.2: WebTorrent Engine
`electron/modules/torrent-engine.ts`:
```typescript
import WebTorrent from 'webtorrent'
import { createServer } from 'http'

class TorrentEngine {
  private client: WebTorrent
  private streamServer: http.Server
  
  constructor() {
    this.client = new WebTorrent()
    this.streamServer = createServer(this.handleRequest.bind(this))
    this.streamServer.listen(3456) // Puerto local
  }
  
  // Agregar magnet link y empezar a stream
  async play(magnetLink: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client.add(magnetLink, (torrent) => {
        const file = torrent.files.find(f => 
          f.name.endsWith('.mp4') || f.name.endsWith('.mkv')
        )
        if (!file) return reject(new Error('No video file found'))
        
        // Servir el archivo vía HTTP al renderer
        const streamUrl = `http://localhost:3456/stream/${torrent.infoHash}`
        resolve(streamUrl)
      })
    })
  }
  
  // Obtener subtítulos del torrent si existen
  getSubtitles(torrent): SubtitleFile[] {
    // Buscar archivos .srt, .vtt, .ass dentro del torrent
  }
  
  // Estado del buffering
  getProgress(torrentHash: string): number {
    return this.client.get(torrentHash)?.progress ?? 0
  }
  
  // Detener y limpiar
  stop(torrentHash: string) {
    this.client.remove(torrentHash)
  }
}
```

### ⚡ Paso 3.3: Integración con preload
```typescript
// preload.ts
torrent: {
  play: (magnetLink: string) => ipcRenderer.invoke('torrent:play', magnetLink),
  search: (movieName: string, year: number) => ipcRenderer.invoke('torrent:search', movieName, year),
  stop: (hash: string) => ipcRenderer.invoke('torrent:stop', hash),
  getProgress: (hash: string) => ipcRenderer.invoke('torrent:progress', hash),
}
```

### 📦 Output de Fase 3
```
✅ Busca torrents de películas en ThePirateBay
✅ Busca torrents de anime en Nyaa.si
✅ WebTorrent stream vía HTTP local
✅ El renderer recibe URL para reproducir
```

---

## 8. Fase 4: Reproductor de video

### ⚡ Paso 4.1: Stream server
`electron/modules/stream-server.ts`:
- Servidor HTTP local en puerto 3456
- Sirve el archivo de video del torrent
- Soporta range requests (para seek)
- Headers CORS para que el renderer pueda acceder

### ⚡ Paso 4.2: Componente VideoPlayer
`src/components/player/VideoPlayer.tsx`:
```typescript
interface VideoPlayerProps {
  streamUrl: string        // URL del stream local
  title: string            // Título para mostrar
  subtitles?: SubtitleFile[]  // Subtítulos disponibles
  onClose: () => void      // Volver atrás
  onProgress?: (time: number) => void  // Guardar progreso
}
```

### ⚡ Paso 4.3: Controles del reproductor
- Play/Pause (espacio o click)
- Seek bar (barra de progreso horizontal)
- Volumen + mute
- Pantalla completa (F11)
- Velocidad 0.5x - 2x
- Subtítulos (menú desplegable)
- Tiempo transcurrido / duración total
- Auto-hide de controles (2 segundos sin mouse)
- Indicador de buffering

### ⚡ Paso 4.4: Página WatchPage
`src/pages/WatchPage.tsx`:
- Recibe el magnet link de la película
- Llama a `api.torrent.play(magnet)`
- Muestra loading mientras el torrent se conecta
- Una vez que recibe la URL del stream, carga el VideoPlayer
- Manejo de errores: "No hay seeders disponibles", "Error de conexión"

### 📦 Output de Fase 4
```
✅ Video reproduciéndose desde torrent
✅ Controles completos (play, pause, seek, volumen, fullscreen)
✅ Indicador de buffering
✅ La página de watch funciona end-to-end
```

---

## 9. Fase 5: Categorías y navegación

### ⚡ Paso 5.1: Página de catálogo completo
`src/pages/CatalogPage.tsx`:
- Barra de filtros: Géneros (badges seleccionables), Año, Ordenar por
- Grid de resultados con scroll infinito
- Carga más resultados al hacer scroll (intersection observer)

### ⚡ Paso 5.2: Página de detalle
`src/pages/DetailPage.tsx`:
- Hero con backdrop + poster + metadata
- Secciones: Sinopsis, Reparto, Trailers, Recomendados
- Botón "Reproducir" que busca torrent y navega a WatchPage
- Si es serie: selector de temporada + lista de episodios

### ⚡ Paso 5.3: Búsqueda
`src/pages/SearchPage.tsx`:
- Input de búsqueda con debounce (300ms)
- Resultados en grid
- Filtro rápido: Películas, Series, Anime
- Empty state cuando no hay resultados

### ⚡ Paso 5.4: Categorías en Sidebar
```typescript
// Navegación
🏠 Inicio           → /home
🎬 Películas        → /catalog/movie
📺 Series           → /catalog/tv
🗾 Anime            → /catalog/anime
⭐ Favoritos        → /favorites
📋 Historial        → /history
```

### 📦 Output de Fase 5
```
✅ Navegación completa entre todas las páginas
✅ Catálogo con filtros y scroll infinito
✅ Detalle de película con toda la info
✅ Búsqueda funcional
```

---

## 10. Fase 6: Subtítulos

### ⚡ Paso 6.1: Extraer subtítulos del torrent
```typescript
// Al agregar un torrent, buscar archivos de subtítulos
function getTorrentSubtitles(torrent): SubtitleFile[] {
  return torrent.files
    .filter(f => /\.(srt|vtt|ass)$/i.test(f.name))
    .map(f => ({
      language: detectLanguage(f.name),  // ej: "English", "Spanish"
      code: detectLangCode(f.name),      // ej: "en", "es"
      url: `http://localhost:3456/subs/${torrent.infoHash}/${f.name}`,
      stream: f.createReadStream()       // Para servir el archivo
    }))
}
```

### ⚡ Paso 6.2: OpenSubtitles como backup
- Si el torrent no trae subtítulos, buscar en OpenSubtitles
- API gratuita: 20 descargas/día
- Buscar por nombre de película + año + idioma

### ⚡ Paso 6.3: Integrar con VideoPlayer
- Menú de subtítulos (CC) en la barra de controles
- Lista: "Desactivados", "Español", "English", "Auto-generados"
- Servir archivos .vtt desde el stream server

### 📦 Output de Fase 6
```
✅ Subtítulos desde el torrent
✅ Backup de OpenSubtitles
✅ Menú CC en el reproductor
```

---

## 11. Fase 7: Historial y favoritos

### ⚡ Paso 7.1: History module
```typescript
// electron/modules/history.ts
interface HistoryEntry {
  id: number              // TMDB ID
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string
  backdropPath: string
  progress: number        // 0-100 (porcentaje visto)
  currentTime: number     // segundos
  duration: number        // segundos totales
  watchedAt: number       // timestamp
}

class HistoryStore {
  // Guardar progreso cada 15 segundos
  async saveProgress(entry: HistoryEntry): Promise<void>
  
  // Obtener historial (ordenado por watchedAt DESC)
  async getHistory(): Promise<HistoryEntry[]>
  
  // Obtener "Continuar viendo" (progreso < 90%)
  async getContinueWatching(): Promise<HistoryEntry[]>
  
  // Limpiar historial
  async clearHistory(): Promise<void>
}
```

### ⚡ Paso 7.2: Favorites module
```typescript
// Persistencia similar con electron-store
async function addFavorite(mediaType, id, title, posterPath)
async function removeFavorite(id)
async function getFavorites(): Promise<Favorite[]>
async function isFavorite(id): Promise<boolean>
```

### ⚡ Paso 7.3: Integración en UI
- Botón ❤️ en DetailPage → agregar/quitar favorito
- Badge "Continuar viendo" con barra de progreso en las cards
- Página de historial con items listados por fecha
- Página de favoritos con grid de cards

### 📦 Output de Fase 7
```
✅ Historial guarda progreso automáticamente
✅ "Continuar viendo" funcional
✅ Favoritos con persistencia
✅ Todo se mantiene al cerrar la app
```

---

## 12. Fase 8: Pulido y release

### ⚡ Paso 8.1: Estados de cada componente
- **Loading:** Skeleton cards animados
- **Empty:** Ilustración + mensaje amigable + botón de acción
- **Error:** Mensaje claro + botón reintentar
- **Offline:** Mensaje de que no hay conexión

### ⚡ Paso 8.2: Animaciones finales
- Staggered entrance de cards (0.03s delay entre cada una)
- Page transitions (fade + slide)
- Hover effects suaves
- Loading states con shimmer

### ⚡ Paso 8.3: Configuración de electron-builder
```json
{
  "appId": "com.y-cinema.desktop",
  "productName": "Y-CINEMA",
  "directories": { "output": "release" },
  "files": ["dist/**/*", "dist-electron/**/*", "package.json"],
  "win": { "target": "nsis" },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  }
}
```

### ⚡ Paso 8.4: Build scripts
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build && tsc -p electron/tsconfig.json",
    "dist": "electron-builder",
    "dev:electron": "concurrently \"vite\" \"wait-on tcp:5173 && electron .\""
  }
}
```

### 📦 Output de Fase 8
```
✅ Build sin errores
✅ Instalador generado (.exe)
✅ App funcional empaquetada
✅ Todos los estados de UI cubiertos
```

---

## 13. Diagrama de flujo completo

```
USUARIO ABRE Y-CINEMA
       │
       ▼
┌─────────────────────┐
│   HOME PAGE          │
│                      │
│  Hero Banner         │←── TMDB: trending[0]
│  ├─ Tendencias       │←── TMDB: trending
│  ├─ Populares        │←── TMDB: popular
│  ├─ Mejor calificadas│←── TMDB: top_rated
│  └─ Anime            │←── TMDB: search + genre=16
└─────────┬───────────┘
          │
          │ CLICK en una película
          ▼
┌─────────────────────┐
│   DETAIL PAGE        │
│                      │
│  Hero con backdrop   │←── TMDB: details + images
│  Sinopsis            │
│  Reparto             │←── TMDB: credits
│  Trailers            │←── TMDB: videos
│  Recomendados        │←── TMDB: recommendations
│                      │
│  [▶ REPRODUCIR]      │──→ Buscar torrent
└─────────┬───────────┘
          │
          │ CLICK en Reproducir
          ▼
┌─────────────────────┐
│  BUSCAR TORRENT      │
│                      │
│  PirateBay ──→ 🔍   │──→ Si encuentra: magnet link
│  Nyaa.si  ──→ 🔍   │──→ Si encuentra: magnet link  
│                      │
│  ¿Encontró?          │
│  ├── Sí ───→ Enviar a WebTorrent
│  └── No ───→ Mostrar error "No disponible"
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  WEBTORRENT ENGINE   │
│                      │
│  Conectando peers... │──→ Mientras tanto: loading spinner
│  Buffering 42%...    │──→ Mostrar progreso
│  ¡Listo!             │──→ Enviar stream URL al renderer
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   WATCH PAGE         │
│                      │
│  ┌─────────────────┐│
│  │                 ││
│  │   VIDEO PLAYER  ││←── stream localhost:3456
│  │                 ││
│  │  ⏪ ▷ ⏩  🔊 ⛶  ││←── Controles
│  └─────────────────┘│
│                      │
│  Cada 15s: guardar   │──→ HistoryStore.saveProgress()
│  progreso            │
└─────────────────────┘
          │
          │ Cierra la película
          ▼
┌─────────────────────┐
│   CONTINUAR VIENDO   │
│                      │
│  En Home aparece la  │
│  película con barra  │
│  de progreso         │
└─────────────────────┘
```

---

## 📊 Resumen de recursos

### APIs externas (TODO gratis)
| API | URL | Key necesaria | Límite |
|---|---|---|---|
| TMDB | `api.themoviedb.org/3` | ✅ API Key v3 | 50 req/s |
| ThePirateBay | `apibay.org/q.php` | ❌ No | Ilimitado |
| Nyaa.si | `nyaa.si/?page=rss` | ❌ No | 1 req/3s recomendado |
| OpenSubtitles | `api.opensubtitles.com` | ✅ Opcional | 20/día gratis |

### Librerías npm
| Librería | Versión | Propósito |
|---|---|---|
| `webtorrent` | ^3.x | Streaming P2P |
| `axios` | ^1.x | HTTP requests |
| `fast-xml-parser` | ^4.x | Parsear RSS |
| `cheerio` | ^1.x | Scrapear HTML |
| `electron-store` | ^8.x | Persistencia local |

### Costo total del proyecto: **$0**

---

## ✅ Checklist de lanzamiento

- [ ] TypeScript compila sin errores (src + electron)
- [ ] App corre en modo dev
- [ ] Catálogo TMDB carga correctamente
- [ ] Torrents se buscan y reproducen
- [ ] Controles del reproductor funcionan
- [ ] Subtítulos disponibles
- [ ] Historial persiste al reiniciar
- [ ] Favoritos persisten
- [ ] Build empaquetado genera .exe
- [ ] Icono de la app visible en Windows
- [ ] Sin console.logs de debug
- [ ] .gitignore correcto
