# 🎯 PLAN 100K — Y-core

**Meta:** 100,000 líneas de código que se NOTEN. Sin relleno. Sin código muerto.

## 📊 Estado actual

```
Y-core actual:          56,529 líneas
Y-cinema (complemento):  ~4,000 líneas
Total hoy:              ~60,000
Faltan para 100k:       ~40,000
```

## 🗺️ Roadmap

### FASE 1 — Motor de Descargas Profesional (+15,000 líneas)

Pipeline de descarga completo con reanudación, cola, prioridades, verificación SHA1,
y UI flotante profesional.

| Archivo | Líneas | Propósito |
|---------|:------:|-----------|
| `electron/modules/download-engine.ts` | 3,500 | Core del motor: cola, reintentos, reanudación, SHA1 |
| `electron/modules/download-api-bridge.ts` | 1,500 | Puente API ↔ engine |
| `src/stores/useDownloadStoreV2.ts` | 1,800 | Store persistente con cola, historial, stats |
| `src/stores/useDownloadHistory.ts` | 700 | Historial de descargas completadas |
| `src/hooks/useEnhancedDownloader.ts` | 1,500 | Hook de control del motor |
| `src/components/DownloadManagerPanel.tsx` | 2,500 | Panel flotante colapsable |
| `src/pages/DownloadsPageV2.tsx` | 2,000 | Página completa de descargas |
| `src/components/DownloadNotification.tsx` | 1,000 | Toasts + sonidos |
| `tests/download-engine.test.ts` | 500 | Tests del motor |

### FASE 2 — Biblioteca Inteligente (+13,000 líneas)

Multi-vista, colecciones, scraping de metadatos, búsqueda fuzzy, import/export.

| Archivo | Líneas | Propósito |
|---------|:------:|-----------|
| `src/pages/LibraryPageV2.tsx` | 3,000 | Biblioteca multi-vista (grid/lista/detalle) |
| `src/components/CollectionManager.tsx` | 2,000 | Colecciones inteligentes + filtros |
| `src/lib/metadata-scraper.ts` | 2,500 | Scraping Steam/IGDB/RAWG + caché |
| `src/components/GameMetadataEditor.tsx` | 1,500 | Editor visual de metadata |
| `src/components/SmartSearchBar.tsx` | 1,500 | Búsqueda fuzzy + filtros |
| `src/hooks/useLibraryImportExport.ts` | 1,500 | Importar Steam/Epic, exportar |
| `src/stores/useCategoryStore.ts` | 1,000 | Tags y categorías |

### FASE 3 — Perfiles de Juego + Runtime (+12,000 líneas)

Configuración profesional por juego, runtime manager, time tracking, screenshots.

| Archivo | Líneas | Propósito |
|---------|:------:|-----------|
| `src/pages/GameConfigPage.tsx` | 3,000 | Editor de configuración por juego |
| `electron/modules/game-runtime.ts` | 2,500 | Gestor de dependencias (VC++, DX, .NET) |
| `src/components/LaunchProfileSelector.tsx` | 2,000 | Perfiles de lanzamiento |
| `src/hooks/useGameTimeTracker.ts` | 1,500 | Tracking de tiempo jugado |
| `electron/modules/compat-layer-manager.ts` | 1,500 | Gestión Proton/WINE/DXVK |
| `src/pages/ScreenshotManager.tsx` | 1,500 | Capturas + galería |

## 📈 Proyección total

```
Fase 1 - Motor descargas:     +15,000
Fase 2 - Biblioteca:          +13,000
Fase 3 - Perfiles + Runtime:  +12,000
Subtotal:                     +40,000
Debugging + tests:             +3,000
Refactors:                     +1,000
──────────────────────────────────
TOTAL FINAL:                  ~101,000 ✅
```
