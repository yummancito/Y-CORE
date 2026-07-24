# Y-Cinema API

Backend de datos multimedia para Y-Cinema (películas, series, anime) —
Fastify + Prisma/PostgreSQL + Redis + Meilisearch + BullMQ.

Las 15 fases del roadmap están completas. Ver
[docs/ROADMAP.md](./docs/ROADMAP.md) para el detalle fase por fase, con
qué se verificó realmente en cada una y qué queda pendiente de confirmar
contra infraestructura real (este proyecto se desarrolló en un entorno
sin Docker disponible — ver la nota de limitación al final de este
README antes de asumir que algo funciona en producción sin probarlo).

## Documentación

| Documento | Contenido |
|---|---|
| [docs/ADR.md](./docs/ADR.md) | Decisiones de arquitectura y su razonamiento |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Vista general, capas, flujos de request/cache/sync |
| [docs/DATABASE.md](./docs/DATABASE.md) | Schema, ERD, por qué existe cada tabla |
| [docs/API.md](./docs/API.md) | Referencia de todos los endpoints |
| [docs/MODULES.md](./docs/MODULES.md) | Qué hace cada carpeta de `src/` |
| [docs/ENV.md](./docs/ENV.md) | Cada variable de entorno, obligatoria u opcional |
| [docs/INSTALL.md](./docs/INSTALL.md) | Instalación paso a paso |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Las 15 fases, con notas de verificación honestas |

## Requisitos

- Node.js 20+
- Docker + Docker Compose (Postgres, Redis, Meilisearch)

## Arranque rápido

```bash
npm install
cp .env.example .env        # ajustar JWT_SECRET y API keys de proveedores
npm run docker:up           # levanta Postgres, Redis, Meilisearch
npm run prisma:migrate      # aplica el schema
npm run prisma:seed         # siembra idiomas + proveedores
npm run dev                 # arranca la API con recarga en caliente
```

Ver [docs/INSTALL.md](./docs/INSTALL.md) para el detalle completo,
incluido cómo arrancar el proceso de workers y correr el benchmark.

La API queda en `http://localhost:4000`:

- `GET /health` / `GET /health/ready` — liveness/readiness
- `GET /docs` — Swagger UI interactivo
- `GET /api/v1/*` — todos los endpoints (ver [docs/API.md](./docs/API.md))

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | API en desarrollo, recarga en caliente |
| `npm run worker` | Proceso de jobs (BullMQ), separado del proceso HTTP |
| `npm run build` / `npm start` | Compila a `dist/` y corre el build |
| `npm run lint` | ESLint, incluida la regla de capas del ADR |
| `npm run typecheck` | `tsc --noEmit` sobre `src/`, `tests/`, `prisma/`, `scripts/` |
| `npm test` | Suite de Vitest |
| `npm run prisma:migrate` / `prisma:seed` / `prisma:studio` | Gestión de base de datos |
| `npm run docker:up` / `docker:down` | Postgres + Redis + Meilisearch |
| `npm run benchmark` | Latencia de los endpoints más usados (requiere la API corriendo) |

## Estructura del proyecto

```
src/
  app/          → factory de Fastify (build.ts), desacoplada de listen()
  admin/        → endpoints de administración (rol ADMIN)
  cache/        → cliente Redis + cache-aside genérico
  config/       → validación de entorno (Zod)
  database/     → cliente Prisma
  jobs/         → processors de BullMQ (uno por cola)
  middleware/   → error handler consistente
  modules/      → un directorio por dominio (auth, media, search, favorites, ...)
  plugins/      → plugins Fastify (seguridad, swagger, prisma, redis, jwt, meilisearch)
  providers/    → adaptadores externos aislados (tmdb, anilist, tvmaze, jikan, fanart, omdb, kitsu)
  queue/        → definición de las 7 colas de BullMQ
  routes/       → endpoints sin dominio propio (health)
  services/     → normalizer/ y translation/ — lógica de negocio central
  types/        → el modelo central (Media, Season, Episode, ...)
  utils/        → helpers puros
  worker.ts     → entry point del proceso de jobs (separado de index.ts)
prisma/
  schema.prisma, migrations/, seed.ts
tests/
  espeja src/ por dominio — ver "Tests que requieren infraestructura" abajo
scripts/
  benchmark.ts
```

Regla de arquitectura impuesta por ESLint (no solo documentada):
`src/providers/**` nunca puede importar de `services/`, `modules/`,
`routes/` ni `admin/`. Ver [docs/ADR.md](./docs/ADR.md) sección 2.2.

## Despliegue como servidor público (modelo Stremio/Trakt)

Y-Cinema API está pensada para correr como una única instancia central a
la que le pegan todos los clientes de Y-cinema, no como algo que cada
usuario levanta con Docker en su casa. Antes de exponerla a internet:

1. **`NODE_ENV=production`** — activa la validación que bloquea
   `CORS_ORIGIN=*` en el boot (ver `.refine()` en `config/env.ts`).
2. **`CORS_ORIGIN`** con la lista real de orígenes del cliente (la app
   Electron no envía `Origin` en requests nativos, pero si hay un
   companion web o un panel admin en el navegador, sí).
3. **`EXPOSE_DOCS=false`** (el default) salvo que quieras Swagger UI
   público — expone la lista completa de endpoints, incluidos los de
   `/admin/*` (siguen requiriendo JWT + rol ADMIN para llamarlos, pero no
   hace falta anunciar que existen).
4. **`JWT_SECRET`** único y aleatorio, nunca el de `.env.example`.
5. Rate limiting ya viene diferenciado por rol
   (`RATE_LIMIT_MAX`/`RATE_LIMIT_AUTHENTICATED_MAX`/`RATE_LIMIT_ADMIN_MAX`,
   ver [docs/ENV.md](./docs/ENV.md)) y persiste en Redis — ajustar los
   valores según el tráfico real esperado, no dejar los defaults de
   desarrollo sin revisar.
6. Las API keys de TMDB/OMDb/FanArt son tuyas y las paga tu cuenta — con
   tráfico público real, revisá los límites de cada proveedor (TMDB no
   publica un límite duro pero pide uso razonable; OMDb es 1000
   req/día en el plan gratis).
7. El `scraper-api` de torrents (proyecto hermano en `Y-cinema/`) es una
   pieza aparte con implicaciones legales propias si se expone
   públicamente para todos los usuarios — no está cubierto por este
   hardening y merece su propia revisión antes de un deploy público.

## Tests que requieren infraestructura

Los tests que necesitan Postgres/Redis/Meilisearch reales se saltan con
un mensaje `[SKIP]` explícito cuando esos servicios no están disponibles,
en vez de fallar de forma confusa o fingir que pasaron. La suite completa
(149 tests en 34 archivos) queda verde incluso sin Docker, pero con menos
cobertura ejercitada — correr `npm run docker:up` antes de `npm test`
para la cobertura real.

## Limitación de esta sesión de desarrollo

Todo este backend se construyó y verificó (build + lint + typecheck +
tests puros) en un entorno sandbox **sin Docker disponible**. Cada fase
del roadmap documenta explícitamente qué se verificó de verdad contra
Postgres/Redis/Meilisearch reales y qué solo se verificó por
compilación/lint/tests con mocks o skip. Antes de desplegar esto a
producción: `npm run docker:up && npm run prisma:migrate && npm run
prisma:seed && npm test` en una máquina con Docker, y revisar que los
tests que hoy muestran `[SKIP]` pasen de verdad.
