# Y-core

Cliente de escritorio para gestionar juegos de Steam con soporte para instalación mediante manifests, depot keys, Lua scripts y Online Fix.

## Estado: Pre-alpha

## Arquitectura

```
┌─────────────────────────────────────────────────┐
│                  Electron App                    │
│  ┌───────────┐  ┌───────────┐  ┌─────────────┐ │
│  │  React UI  │  │  Main.ts  │  │  Native DLLs│ │
│  │  (Vite)    │←→│  (IPC)    │←→│  (YCoreTool) │ │
│  └───────────┘  └─────┬─────┘  └─────────────┘ │
│                       │                         │
│              ┌────────┴────────┐               │
│              │  Y-core API      │               │
│              │  (Fastify)       │               │
│              └────────┬────────┘               │
│                       │                         │
│              ┌────────┴────────┐               │
│              │  Supabase (PG)   │              │
│              └─────────────────┘               │
└─────────────────────────────────────────────────┘
```

## Estructura del Proyecto

| Directorio | Descripción |
|---|---|
| `electron/` | App de escritorio Electron (proceso main + preload) |
| `src/` | Frontend React (Vite + Tailwind + Zustand) |
| `apps/api/` | API backend Fastify (auth, games, manifests, imports DepotBox) |
| `packages/shared/` | Tipos compartidos entre apps y frontend |
| `native/` | DLLs nativas C++ para hook de Steam |
| `tools/` | Herramientas externas (steamless) |
| `tests/` | Tests automatizados (Vitest + smoke tests) |
| `scripts/` | Scripts de desarrollo |
| `docs/` | Documentación del proyecto |
| `supabase/` | Migraciones de base de datos |

## Requisitos

- Node.js 20+
- pnpm 11+
- Visual Studio 2022 (para compilar DLLs nativas)
- CMake 3.20+ (para build nativo)

## Instalación

```bash
pnpm install
```

## Desarrollo

```bash
# Frontend + Electron
pnpm dev

# API
pnpm --filter @y-core/api dev

# Electron + API + Vite
pnpm electron:dev
```

## Build

```bash
# Compilar todo
pnpm build

# Compilar DLLs nativas
cd native/opensteamtool-src && build_y_core.bat
```

## Tests

```bash
# Tests unitarios (122 tests)
pnpm test

# Smoke test de DLLs (11 checks)
pnpm test:dll

# Checklist E2E manual
# Ver tests/MANUAL_TEST_CHECKLIST.md
```

## Variables de Entorno

Copiar `.env.example` a `.env` y configurar:

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL de Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave anónima de Supabase (pública) |
| `VITE_DEPOTBOX_API_KEY` | API key de DepotBox |
| `VITE_STEAMGRIDDB_API_KEY` | API key de SteamGridDB (opcional) |

Para la API (`apps/api/.env`), ver `apps/api/.env.example`.

## Licencia

MIT
