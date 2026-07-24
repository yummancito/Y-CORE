# 🎬 Y-CINEMA — Prompt para Claude Code (Frontend UI)

## Contexto
Y-CINEMA es una app de escritorio para ver películas, series y anime gratis. El backend ya está construido (Electron main process con TMDB, WebTorrent, búsqueda de torrents, historial y favoritos). **Vos tenés que construir toda la interfaz de React.**

## Diseños de referencia (hechos por Claude Design)

Hay 4 archivos HTML con el diseño visual completo. **Abrilos en el navegador para ver el diseño exacto que tenés que implementar.**

| Archivo | Contenido |
|---|---|
| **`CineCard.dc.html`** | Tarjeta horizontal 16:9 con hover (rating, título, play button, descripción expandible) |
| **`PosterCard.dc.html`** | Tarjeta vertical 2:3 con rating, título y tipo |
| **`Y-CINEMA v2.dc.html`** | **App completa** — 5 pantallas: Home (hero carrusel, continue watching, trending, new releases), Browse (grid con filtros), Detail (hero, cast, trailers, episodios, más como esto), Watch (reproductor con controles, theater mode, episode rail), Library (continue watching) |
| **`Y-CINEMA.dc.html`** | Versión alternativa del diseño completo |

### Estilo visual del diseño (IMPORTANTE):
- **Nav flotante:** Logo Y·CINEMA con icono violeta/cian, tabs de navegación con glassmorphism, search bar con shortcut ⌘K, avatar
- **Tipografía:** Usar `'Bricolage Grotesque'` para títulos (importar de Google Fonts), `Inter` para el resto
- **Hero:** Gradiente 90deg desde negro (12%) → semi-transparente (38%) → casi transparente (65%), background animación kb (scale de 1.02 a 1.1), badge FEATURED con gradiente violeta
- **Card hover:** scale 1.055, border a blanco 0.24, shadow profunda
- **Control bar del reproductor:** glassmorphism con blur, barra de progreso gradiente violeta-cian, seek dot blanco, botones con hover background, menú de settings con backdrop-filter

## Stack
- React 18 + TypeScript + Vite
- Tailwind CSS (configurado con colores personalizados: accent, surface, text)
- Framer Motion para animaciones
- Lucide React para íconos
- React Router v6 (HashRouter)
- Zustand para estado global

## Tema visual
Tailwind ya está configurado con estos colores:
- `bg-surface` → #09090B (fondo principal)
- `bg-surface-1` → #141417 (fondo secundario)
- `bg-surface-2` → #1C1C1F (fondos de tarjetas)
- `text-accent` → #6C63FF (acento violeta)
- `accent-dark` → #5A52D5
- `text-bright` → #FFFFFF
- `text-secondary` → #A1A1AA
- `text-dim` → #71717A

También hay clases utilitarias:
- `glass` y `glass-strong` para glassmorphism
- `skeleton` para loading shimmer
- `btn-primary` y `btn-outline` para botones
- `text-gradient` para texto gradiente
- `scrollbar-modern` para scroll horizontal fino

## API disponible (window.api)

El preload expone estas funciones. **Todas las llamadas a la API son asíncronas y usan IPC.**

### Catálogo (TMDB)
```typescript
window.api.tmdb.getTrending(mediaType: 'movie' | 'tv', timeWindow: 'day' | 'week')
// → { results: Movie[] }

window.api.tmdb.getPopular(mediaType: 'movie' | 'tv', page?: number)
// → { results: Movie[] }

window.api.tmdb.getTopRated(mediaType: 'movie' | 'tv', page?: number)
// → { results: Movie[] }

window.api.tmdb.getDetails(mediaType: string, id: number)
// → { title, overview, poster_path, backdrop_path, genres, vote_average, credits, videos, recommendations, ... }

window.api.tmdb.search(query: string, mediaType?: 'movie' | 'tv' | 'multi', page?: number)
// → { results: Movie[] }

window.api.tmdb.getGenres(mediaType: 'movie' | 'tv')
// → { genres: [{ id, name }] }

window.api.tmdb.getCredits(mediaType: string, id: number)
// → { cast: CastMember[], crew: CrewMember[] }

window.api.tmdb.getVideos(mediaType: string, id: number)
// → { results: [{ key, name, site, type }] }

window.api.tmdb.getRecommendations(mediaType: string, id: number)
// → { results: Movie[] }

window.api.tmdb.getSeasonDetails(tvId: number, seasonNum: number)
// → { episodes: [{ name, still_path, overview, episode_number }] }
```

### Torrents
```typescript
window.api.torrent.search(query: string, year?: number)
// → TorrentResult[] (title, magnet, seeders, quality, source)

window.api.torrent.play(magnetLink: string)
// → { streamUrl: string, infoHash: string, fileName: string, fileSize: number }

window.api.torrent.stop(infoHash: string)
// → void

window.api.torrent.getProgress(infoHash: string)
// → number (0-1)
```

### URLs de imágenes TMDB
```
Poster:    https://image.tmdb.org/t/p/w500{poster_path}
Backdrop:  https://image.tmdb.org/t/p/original{backdrop_path}
Profile:   https://image.tmdb.org/t/p/w185{profile_path}
Still:     https://image.tmdb.org/t/p/w300{still_path}
Logo:      https://image.tmdb.org/t/p/w500{logo_path}
```

### Historial y Favoritos
```typescript
window.api.history.save({ id, mediaType, title, posterPath, backdropPath, progress, currentTime, duration })
window.api.history.get() // → HistoryEntry[]
window.api.history.continueWatching() // → HistoryEntry[] (progreso entre 5% y 90%)

window.api.favorites.add({ id, mediaType, title, posterPath, backdropPath, voteAverage })
window.api.favorites.remove(id)
window.api.favorites.get() // → FavoriteItem[]
window.api.favorites.isFavorite(id) // → boolean
```

## Páginas a construir

### 1. HomePage (`/home`)
**Hero Banner:**
- Ocupa todo el ancho, ~420px de alto
- Imagen de fondo: backdrop_path de la película trending[0]
- Overlay gradiente (negro → transparente)
- Contenido alineado a la izquierda:
  - Título grande (text-3xl/4xl, font-extrabold)
  - Metadatos: año • duración • rating con estrella
  - Géneros como badges
  - Sinopsis (truncada a 3 líneas)
  - Botón "Reproducir" (btn-primary) que navega a `/detail/{mediaType}/{id}`
  - Botón "Favoritos" (btn-outline)
- Auto-play del carrusel cada 6 segundos (transición fade)
- Flechas de navegación izquierda/derecha (aparecen al hover)
- Indicadores de slide (puntos) abajo a la derecha

**Filas de categorías (CategoryRow):**
- Título de sección + "Ver todo" link a la derecha
- Scroll horizontal nativo con scrollbar-modern
- Snap scroll, cada card ~160px ancho
- Datos:
  - `getTrending('movie', 'week')` → "Tendencias"
  - `getPopular('movie')` → "Películas populares"
  - `getTopRated('movie')` → "Mejor calificadas"
  - `getPopular('tv')` → "Series populares"
  - Buscar genre=16+popular → "Anime popular"

**MovieCard:**
- Poster vertical (2:3 ratio)
- Hover: escala 1.05, sombra profunda, overlay con info (rating, año)
- Click → navega a `/detail/movie/${id}`
- Si falla la imagen: placeholder con icono Film
- Loading: skeleton con shimmer
- Variante pequeña ~160px (filas) y grande ~200px (grids)

### 2. CatalogPage (`/catalog/:mediaType`)
- `mediaType` puede ser `movie`, `tv`, o `anime`
- Si es `anime`: buscar con genre=16 (Animation/Anime)
- Barra de filtros:
  - Géneros como badges seleccionables (llamar `getGenres()`)
  - Dropdown de ordenar (popularidad, calificación, fecha)
  - Badge activo con X para quitar filtro
- Grid responsive de MovieCards (4-5 columnas en desktop)
- Scroll infinito (Intersection Observer)
- Staggered animation al aparecer nuevas cards (0.03s delay)

### 3. DetailPage (`/detail/:mediaType/:id`)
**Hero:**
- Imagen backdrop de fondo (original) con overlay
- Poster a la izquierda (w500)
- A la derecha:
  - Título grande
  - Tagline en cursiva
  - Rating con estrella
  - Año • Duración • Clasificación
  - Géneros como badges
  - Sinopsis completa
  - Botones: "Reproducir" → ejecuta torrent.search + torrent.play, navega a watch
  - Botón "Favoritos" (toggle con window.api.favorites)

**Secciones:**
- **Reparto:** scroll horizontal, fotos circulares + nombre
- **Trailers:** grid 2 col, thumbnails de YouTube, click abre modal
- **Recomendados:** fila horizontal de MovieCards
- Si es serie: selector de temporada dropdown + lista de episodios

### 4. WatchPage (`/watch/:mediaType/:id`)
**IMPORTANTE:** No usar el AppShell wrapper (la ruta está fuera del layout en App.tsx)
- Fondo negro absoluto, video ocupa todo el viewport
- Llamar `api.torrent.search(title, year)` para obtener magnet
- Llamar `api.torrent.play(magnet)` para obtener streamUrl
- Usar streamUrl en un `<video>` tag con `src={streamUrl}`
- **Controles** (overlay que aparece al mover mouse, se oculta tras 2s):
  - Barra de progreso horizontal (3px, color accent)
  - Play/Pause (espacio o click en video)
  - Tiempo transcurrido / duración total
  - Volumen + slider
  - Pantalla completa
  - Velocidad (0.5x, 1x, 1.5x, 2x)
  - Subtítulos (menú CC)
- **Guardar progreso:** cada 15 segundos llamar `api.history.save({...})`
- **Loading:** mientras se conecta el torrent, mostrar spinner + "Buscando fuentes..."
- **Error:** mostrar mensaje + botón "Volver atrás"
- **Flecha "Atrás"** en esquina superior izquierda
- El stream server ya está configurado en localhost:3456

### 5. SearchPage (`/search`)
- Input de búsqueda grande, estilo Apple
- Placeholder: "Buscar películas, series, anime..."
- Borde que se ilumina con accent al focus
- Resultados se actualizan mientras escribe (debounce 300ms)
- Filtro rápido: "Todo", "Películas", "Series", "Anime"
- Grid de resultados
- Empty state: "No encontramos resultados para tu búsqueda"
- Loading state mientras busca

### 6. FavoritesPage (`/favorites`)
- Grid de MovieCards con datos de `api.favorites.get()`
- Botón para quitar favorito
- Empty state: corazón + "Todavía no agregaste favoritos" + botón "Explorar"
- Click navega a `/detail/${mediaType}/${id}`

### 7. HistoryPage (`/history`)
- Lista vertical con items de `api.history.get()`
- Cada item: poster pequeño + título + barra de progreso + "Continuar"
- Separado por fechas: "Hoy", "Ayer", "Esta semana", "Anterior"
- Botón "Limpiar historial"
- Empty state si no hay historial

## Componentes Reutilizables

### MovieCard
Props: `movie: Movie, size?: 'small' | 'large', showInfo?: boolean`
- Poster image con fallback
- Hover effect (scale + shadow + overlay)
- Rating badge
- Click handler

### HeroBanner
Props: `movies: Movie[], onPlay: (movie) => void, onInfo: (movie) => void`
- Carrusel automático cada 6s
- Flechas de navegación
- Indicadores de slide
- Gradientes

### CategoryRow
Props: `title: string, movies: Movie[], onViewAll?: () => void`
- Scroll horizontal
- MovieCards dentro
- Link "Ver todo"

### VideoControls
- Barra de progreso
- Play/Pause/Volumen/FS
- Auto-hide
- Velocidad
- Subtítulos

### LoadingState
- Skeleton cards
- Shimmer animation

### EmptyState
- Icono + texto + botón de acción

## Animaciones (Framer Motion)
- **Page transitions:** fade + slide up (0.3s)
- **Cards entrance:** staggered, 0.03s delay entre cada una
- **Card hover:** scale 1.02-1.05 (0.2s)
- **Button hover:** brightness + translateY(-1px)
- **Button click:** scale 0.97
- **Modal:** backdrop fade + scale 0.95→1
- **Sidebar item:** color transition 0.2s

## Estados
Cada componente debe manejar:
- **Loading:** Skeleton o spinner
- **Error:** Mensaje claro + botón reintentar
- **Empty:** Ilustración + mensaje + acción
- **Success:** Datos normales

## Estructura de archivos a crear/modificar

### Componentes nuevos que tenés que crear:
```
src/components/layout/Sidebar.tsx        ← Reemplazar el inline en AppShell
src/components/layout/TitleBar.tsx       ← Barra de título personalizada
src/components/catalog/HeroBanner.tsx    ← Hero con carrusel
src/components/catalog/CategoryRow.tsx   ← Fila horizontal
src/components/catalog/MovieCard.tsx     ← Tarjeta de película
src/components/catalog/MovieGrid.tsx     ← Grid
src/components/player/VideoPlayer.tsx    ← Reproductor completo
src/components/player/ControlsBar.tsx    ← Controles
src/components/player/SubtitlesMenu.tsx  ← Menú de subs
src/components/detail/DetailHero.tsx     ← Hero de detalle
```

### Pages que tenés que modificar (ya existen como placeholder):
```
src/pages/HomePage.tsx         ← Reemplazar contenido con UI real
src/pages/CatalogPage.tsx      ← Reemplazar con filtros + grid
src/pages/DetailPage.tsx       ← Reemplazar con hero + secciones
src/pages/WatchPage.tsx        ← Reemplazar con VideoPlayer
src/pages/SearchPage.tsx       ← Reemplazar con input + resultados
src/pages/FavoritesPage.tsx    ← Reemplazar con grid
src/pages/HistoryPage.tsx      ← Reemplazar con lista
```

### Stores que tenés que crear:
```
src/stores/useCatalogStore.ts  ← Estado global del catálogo (Zustand)
src/stores/usePlayerStore.ts   ← Estado del reproductor
```

## Extras opcionales
- Modal de YouTube para trailers
- Toast notifications (Zustand store)
- Confirm dialog para limpiar historial
- Infinite scroll (Intersection Observer hook)
- Debounce hook para búsqueda
- Imagen por defecto si falla el poster
- Loading skeletons en todas las páginas

## Notas importantes
1. No modificar archivos en `electron/` (ese es el backend, ya está listo)
2. No modificar archivos de configuración (vite, tailwind, etc.)
3. Usar siempre rutas relativas para imports
4. Las imágenes de TMDB pueden ser null → mostrar placeholder
5. El Layout (AppShell) ya está creado y maneja el sidebar + main content + watch mode
6. Los datos vienen de window.api → no mockear data
7. TypeScript estricto — definir interfaces para props
