# Backend Services

## apps/api

API REST con Fastify que sirve como backend de Y-core.

### Rutas

| Ruta | Descripción |
|---|---|
| `/auth` | Registro, login, refresh de tokens, reset de password |
| `/games` | Búsqueda de juegos, depot keys, manifest sync |
| `/jobs` | Estado de jobs de procesamiento |
| `/manifests` | Descarga de manifests de Steam |

### Stack

- **Fastify** 4.x con plugins de CORS, JWT, rate limiting
- **Supabase** (PostgreSQL) para persistencia
- **Resend** para envío de emails
- **DepotBox** API para búsqueda de juegos
- **GitHub** para almacenamiento de manifests y Lua scripts

### Desarrollo

```bash
pnpm --filter @y-core/api dev
```

### Variables de entorno

Ver `apps/api/.env.example`.
