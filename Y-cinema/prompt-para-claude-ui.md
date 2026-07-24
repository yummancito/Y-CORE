# 🎬 Y-CINEMA — Prompt de Diseño de Interfaz para Claude

## Nombre de la app
**Y-CINEMA** — Reproductor de películas, series y anime.

## Stack técnico
- Electron + React + Vite + TypeScript
- Tailwind CSS para estilos
- Framer Motion para animaciones
- Lucide React para íconos
- React Router para navegación
- Zustand para estado global

## Tema visual

### Paleta de colores
- **Fondo principal:** Negro profundo (#09090B)
- **Fondo secundario:** Gris muy oscuro (#141417)
- **Fondo de tarjetas:** (#1C1C1F) con bordes sutiles rgba(255,255,255,0.06)
- **Color primario (acento):** Violeta (#6C63FF) — usar en botones, hover states, enlaces
- **Color secundario:** Cian (#3BB2F7) — usar en badges, highlights
- **Texto principal:** Blanco (#FFFFFF)
- **Texto secundario:** Gris claro (#A1A1AA)
- **Texto tenue:** Gris medio (#71717A)
- **Éxito:** Verde esmeralda (#22C55E)
- **Rating (estrellas):** Amarillo (#F59E0B)

### Tipografía
- **Fuente principal:** Inter (system-ui)
- **Títulos:** Inter, bold/extrabold, tracking-tight
- **Cuerpo:** Inter, regular, leading-relaxed

### Efectos y estilos generales
- Glassmorphism en modales, badges, y paneles flotantes (bg rgba(255,255,255,0.05), backdrop-blur-xl)
- Bordes sutiles (border-white/[0.06])
- Sombras tipo Apple: capas de shadow con opacidad gradual
- Transiciones de 200-300ms ease-out en todos los interactive elements
- Hover states con bright/scale sutiles
- Scrollbar delgada y oscura como Discord
- Skeleton loading en todas las cards mientras cargan imágenes

## Estructura de la app

### Layout general (AppShell)
```
┌──────────────────────────────────────────────────────┐
│ [TitleBar]  —───  Barra superior personalizada       │
│  ● ● ●   Y-CINEMA                        [🔍] [⚙️]  │
├──────┬───────────────────────────────────────────────┤
│      │                                               │
│ Nav  │            PÁGINA PRINCIPAL                   │
│ Left │                                               │
│      │                                               │
│ 🏠   │   ┌─────────────────────────────────────┐     │
│ Inicio│   │                                     │     │
│ 🎬   │   │       Hero Banner (destacado)       │     │
│ Pelis │   │                                     │     │
│ 📺   │   └─────────────────────────────────────┘     │
│ Series│                                             │
│ 🗾   │   ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ │
│ Anime │   │Card │ │Card │ │Card │ │Card │ │Card │ │
│ ⭐    │   └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ │
│ Favoritos│                                         │
│ 📋   │   ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ │
│ Hist │   │Card │ │Card │ │Card │ │Card │ │Card │ │
│      │   └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ │
│      │                                             │
└──────┴─────────────────────────────────────────────┘
```

### Barra lateral (Sidebar)
- Ancho: ~220px
- Fondo: igual que el fondo principal
- Logo de Y-CINEMA arriba (texto estilizado o SVG)
- Items de navegación con íconos:
  - 🏠 **Inicio**
  - 🎬 **Películas**
  - 📺 **Series**
  - 🗾 **Anime**
  - ⭐ **Favoritos**
  - 📋 **Historial**
- Separador delgado
- Al final: ícono de configuración
- Item activo: resaltado con acento violeta + indicador izquierdo
- Hover: cambio sutil de opacidad

### Barra de título personalizada (TitleBar)
- Altura: 38px
- Fondo: #0A0A0C
- Botones de ventana (minimizar, maximizar, cerrar) estilizados
- Sin drag regions que interfieran con el contenido

---

## PÁGINAS DETALLADAS

### 1. HOME PAGE (Inicio)

#### Hero Banner
- Ocupa todo el ancho, altura ~420px
- Imagen de fondo: `https://image.tmdb.org/t/p/original/{backdrop_path}`
- Overlay gradiente: desde negro a la izquierda hasta transparente a la derecha, más gradiente de abajo hacia arriba
- Contenido alineado a la izquierda, padding ~60px:
  - **Título** de la película en blanco, texto grande (3xl-4xl), font-extrabold
  - **Metadatos** en línea: año • duración • rating con estrella (⭐ 8.4)
  - **Géneros** como badges pequeños (Acción, Ciencia Ficción)
  - **Sinopsis** en texto secundario, max 3 líneas, truncado
  - Botones de acción:
    - **Reproducir** — Botón grande violeta (#6C63FF) con hover brightness
    - **➕ Favoritos** — Botón outline con borde blanco/10
    - **ℹ️ Más info** — Botón outline con hover violeta
- Animación: fade-in + slide-up del contenido al cargar
- Al hacer hover en el banner: zoom suave (1.02) en la imagen de fondo
- Auto-play del carrusel cada 6 segundos con transición fade
- Indicadores de slide (puntos) abajo a la derecha
- Flechas de navegación (izquierda/derecha) que aparecen al hover

#### Filas de categorías (CategoryRow)
- Título de sección con flecha "Ver todo →" a la derecha
- Scroll horizontal nativo con scrollbar moderna (thin, transparent track)
- Las cards se desplazan con snap scroll
- Cada card ocupa ~160px de ancho, ~240px de alto (poster vertical)
- Al final de la fila, si hay más contenido, botón "Ver todo" que navega a la página completa

#### Tipos de filas en Home
1. **Tendencias** — `/trending/movie/week`
2. **Películas populares** — `/movie/popular`
3. **Mejor calificadas** — `/movie/top_rated`
4. **Anime popular** — búsqueda TMDB por género Anime
5. **Series del momento** — `/tv/popular`
6. **Próximos estrenos** — `/movie/upcoming`

### 2. PÁGINA DE DETALLE (película/serie/anime)

#### Hero Section
- Imagen backdrop de fondo (tmdb backdrop original)
- Overlay gradiente similar al Home pero más fuerte
- Poster de la película a la izquierda (w342 o w500)
- A la derecha del poster:
  - **Título** grande (3xl-4xl)
  - **Tagline** en cursiva, texto secundario
  - **Rating** con estrella + número (8.4/10)
  - **Metadatos**: Año • Duración • Clasificación
  - **Géneros**: badges con acento violeta
  - **Sinopsis**: texto completo
  - Botones: **Reproducir** (violeta) | **➕ Favoritos** (outline)
  - Si es serie: selector de temporada (dropdown estilizado)

#### Sección de episodios (si aplica)
- Grid de tarjetas de episodios
- Cada tarjeta: Número • Título • Duración • Sinopsis corta • Imagen still
- Al hacer hover: botón de reproducir
- Episodio visto: indicador verde sutil

#### Sección de videos / trailers
- Grid de 2 columnas con thumbnails de YouTube
- Click abre modal con iframe de YouTube
- Si no hay trailer: se oculta la sección

#### Sección de reparto
- Scroll horizontal de actores
- Cada card: foto circular (w185) + nombre + personaje

#### Sección "Recomendados"
- Misma fila horizontal con cards de películas similares
- Click navega al detalle de esa película

### 3. PÁGINA DE REPRODUCCIÓN (WatchPage)

#### Layout
- Fondo negro absoluto
- Video ocupa todo el viewport (igual que Netflix/YouTube)
- Al hacer click: pausa/reproduce
- Al mover el mouse: aparece overlay de controles

#### Controles (Overlay inferior)
- Barra de progreso horizontal (delgada, 3px, color violeta)
- Tiempo transcurrido / duración total
- Botón Play/Pause (grande, con transición)
- Volumen: slider horizontal + ícono de altavoz
- Pantalla completa: toggle
- Subtítulos: botón CC, al hacer click muestra menú de idiomas
- Velocidad: 0.5x, 1x, 1.5x, 2x
- Título de la película/espectáculo arriba a la izquierda
- Flecha "Atrás" para volver al detalle

#### Overlay de pausa
- Al pausar: centro de la pantalla muestra el título grande + poster + botón reanudar
- Fondo semi-transparente

#### Estados
- **Cargando:** Spinner grande centrado con información de buffering
- **Error de stream:** Mensaje con botón "Reintentar" y "Volver atrás"
- **Sin seeders:** Mensaje explicativo con alternativas

### 4. PÁGINA DE CATEGORÍA (Películas / Series / Anime)

#### Filtros superiores
- Barra de filtros horizontal con scroll
- **Géneros:** badges seleccionables (Acción, Comedia, Drama, Terror, etc.)
- **Año:** dropdown
- **Ordenar por:** Popularidad, Calificación, Fecha de estreno, Título
- **Calidad:** 1080p, 4K, Todas
- Badge "Activo" con X para quitar filtro

#### Grid de resultados
- Grid responsive: 4-5 columnas en desktop, 2 en tablet
- Scroll infinito (no paginación)
- Cada card entra con animación staggered (0.03s de delay entre cada una)
- Misma card que en Home

### 5. PÁGINA DE BÚSQUEDA

#### Input de búsqueda
- Input grande centrado, estilo Apple
- Placeholder: "Buscar películas, series, anime..."
- Borde delgado que se ilumina con el acento violeta al focus
- Resultados en tiempo real (debounce 300ms)

#### Resultados
- Grid de cards
- Si no hay resultados: ilustración minimalista + "No encontramos resultados para tu búsqueda"
- Filtro rápido arriba: "Películas", "Series", "Anime", "Todo"

### 6. PÁGINA DE FAVORITOS

- Grid de cards
- Indicador "⭐ Favorito" en cada card
- Si está vacío: ilustración + "Todavía no agregaste favoritos"
- Botón "Explorar películas" que navega al Home

### 7. PÁGINA DE HISTORIAL

- Lista vertical (no grid)
- Cada item: Poster pequeño + Título + Progreso (barra) + "Continuar reproduciendo" botón
- Separado por fecha: "Hoy", "Ayer", "Esta semana", "Anterior"

---

## COMPONENTES REUTILIZABLES

### MovieCard
- Poster vertical (2:3 ratio)
- Al hacer hover:
  - Escala 1.05
  - Sombra profunda
  - Overlay con información: rating, año, botón de reproducir
- Loader: skeleton con animación de pulso mientras carga la imagen
- Si la imagen falla: placeholder con el ícono de Film
- Variante pequeña (para filas horizontales): ~160px ancho
- Variante grande (para grids): ~200px ancho

### CategoryRow (Fila horizontal)
- Título + "Ver todo" link
- Scroll horizontal con snap
- 6-8 cards visibles, scroll nativo
- Flechas de navegación aparecen al hover en los bordes

### HeroBanner
- Imagen de fondo con overlay
- Texto superpuesto alineado a la izquierda
- Botones de acción
- Timer de auto-play
- Indicadores de slide (puntos)

### LoadingState
- Skeleton cards (misma forma que las cards reales)
- Animación de shimmer (gradiente animado)
- 6-8 skeletons por fila

### EmptyState
- Ilustración minimalista (usar Lucide icons grandes)
- Mensaje de texto
- Botón de acción (opcional)

### Toast
- Aparece desde arriba-derecha
- Colores: success (verde), error (rojo), info (violeta)
- Auto-dismiss a los 3 segundos
- Animación: slide-in + fade-out

---

## ANIMACIONES (Framer Motion)

### Páginas
- **pageTransition:** fade + slide up (0.3s)
- Al navegar entre páginas: fade out → fade in

### Cards
- **Appearance:** staggered, cada card aparece con 0.03s de delay
- **Hover:** scale(1.02-1.05) + shadow increase (0.2s ease-out)
- **CategoryRow:** scroll horizontal suave

### Botones
- **Hover:** brightness(1.1) + translateY(-1px)
- **Active/Click:** scale(0.97)
- **Transition:** 0.15s ease-out

### Modal
- **Open:** backdrop fade + modal scale(0.95→1) + blur backdrop
- **Close:** fade out + scale(0.95)

### Sidebar
- Item activo: transición de color 0.2s
- Hover: opacidad
- No animación de expandir/contraer (siempre visible)

---

## EJEMPLOS VISUALES DE REFERENCIA

Diseñar con la estética de:
- **Netflix** — Hero banners, filas horizontales, hover states
- **Apple TV+** — Tipografía limpia, espaciado generoso, transparencias
- **Disney+** — Cards con hover que se expanden hacia arriba mostrando más info
- **Stremio** — Layout de catálogo con sidebar

La app debe sentirse **rápida, fluida y cinematográfica**. Cada transición, hover y animación debe tener un propósito y sentirse natural.

---

## NOTAS TÉCNICAS PARA CLAUDE

- Los datos vienen de la API de TMDB (imágenes, metadata, géneros)
- El streaming es mediante WebTorrent (P2P), los controles se conectan a un stream local
- **NO** incluir lógica de backend — solo componentes visuales
- Usar datos mock de TMDB para el desarrollo visual (tipos ya definidos en la app)
- Las imágenes de TMDB siguen este patrón:
  - Poster: `https://image.tmdb.org/t/p/w500/{poster_path}`
  - Backdrop: `https://image.tmdb.org/t/p/original/{backdrop_path}`
  - Logo: `https://image.tmdb.org/t/p/w500/{logo_path}`
  - Actor: `https://image.tmdb.org/t/p/w185/{profile_path}`
