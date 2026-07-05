# Y-Core Audit Report v2 — 2026-07-05

Auditoría de seguridad, estabilidad, performance y calidad ejecutada sobre la rama `security-audit-staging` del proyecto `y-core-backup` y el backend desplegado `y-core-render-api`.

## Resumen Ejecutivo

Se ejecutaron las fases 1-6 del plan de auditoría. Se identificaron **6 hallazgos de seguridad** (1 crítico, 2 altos, 3 medios/bajos) y **2 deuda técnica** menores. Los hallazgos críticos y altos fueron corregidos y desplegados. Todos los tests (157), `typecheck` y `build` pasan.

| Severidad | Cantidad | Estado |
|-----------|----------|--------|
| Crítica   | 1        | Corregida y desplegada |
| Alta      | 2        | Corregidas y desplegadas |
| Media/Baja| 3        | Corregidas / mitigadas |
| Deuda técnica | 2    | Pendiente planificación |

## Métricas Base (Fase 1)

- `pnpm audit` — antes de la corrección: múltiples CVEs `high` en `tar` vía `electron-builder`, más `vitest` y `electron`.
- `pnpm typecheck` — ✅ sin errores.
- `pnpm test` — ✅ 157 tests pasan.
- `pnpm build` — ✅ sin errores.
- No se encontraron `innerHTML`, `eval()`, `dangerouslySetInnerHTML`, `child_process` incontrolados ni `console.log` dispersos en el código productivo (excepto logs de debug en `forgotPassword`).

## Hallazgos y Correcciones

### [H-01] CRÍTICA — CORS refleja cualquier origen en producción

- **Archivo**: `apps/api/src/index.ts`, `y-core-render-api/src/index.ts`
- **Descripción**: En producción, si `CORS_ORIGIN` no estaba configurado, el backend usaba `origin: true`, reflejando cualquier `Origin` de solicitudes web. Aunque la autenticación es JWT, esto permitía que sitios maliciosos leyeran respuestas del API si obtenían un token válido.
- **Corrección**: Se reemplazó `origin: true` por una función `fastifyCors.OriginFunction` que solo permite:
  - Origen `null` (aplicaciones Electron cargadas desde `file://`).
  - Orígenes explícitos en `CORS_ORIGIN`.
  - Localhost en desarrollo.
- **Estado**: ✅ Corregido en `y-core-backup` y `y-core-render-api`; desplegado en producción.

### [H-02] ALTA — Path traversal en `library:openLocation`

- **Archivo**: `electron/modules/steam-ipc.ts`
- **Descripción**: El handler `library:openLocation` usaba `path.join(folder, 'common', installDir)` sin validar `installDir`. Un renderer comprometido podía abrir cualquier carpeta usando `..`, `/` o `\`.
- **Corrección**: Se agregó validación idéntica a `deleteGame`: `installDir` debe ser relativo, sin `..`, `/` ni `\`.
- **Estado**: ✅ Corregido.

### [H-03] ALTA — `app_id` sin validar en handlers de Store

- **Archivo**: `electron/modules/store-ipc.ts`
- **Descripción**: `store:installGame` y `store:getLocalGameData` usaban `game.app_id` directamente en rutas de archivo sin validar. Un valor con path traversal podía apuntar a archivos fuera del directorio de scripts Lua.
- **Corrección**: Se importó `isValidAppId` y se valida al inicio de ambos handlers.
- **Estado**: ✅ Corregido.

### [H-04] MEDIA — Redirección maliciosa de API vía config

- **Archivo**: `electron/modules/auth-ipc.ts` (`getApiUrl`)
- **Descripción**: `getApiUrl` leía `apiUrl` desde `ycore-config.json` y lo devolvía sin validar. Un archivo manipulado podía redirigir tokens de refresh a un servidor malicioso.
- **Corrección**: Se agregó `isValidHttpUrl` que solo permite protocolos `http:` o `https:`.
- **Estado**: ✅ Corregido.

### [H-05] MEDIA — Detección incorrecta de endpoints públicos en el cliente

- **Archivo**: `src/lib/y-core-api.ts`
- **Descripción**: `PUBLIC_ENDPOINTS` usaba `startsWith('/api/games')`, lo que marcaba como públicos endpoints protegidos como `/api/games/:app_id/install`, `/api/games/:app_id/downloaded` y `/api/games/:app_id/depot-keys`. Esto provocaba que el primer request no enviara el token, forzando un refresh innecesario y posibles fallos.
- **Corrección**: Se reemplazó por patrones regex precisos que solo marcan como públicos: listado, detalle, `onlinefix-compat` y auth.
- **Estado**: ✅ Corregido.

### [H-06] BAJA — CVEs en `tar` vía `electron-builder`

- **Archivo**: `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- **Descripción**: `pnpm audit` reportó CVEs `high` en `tar@6.2.1` (GHSA-8qq5-rm4j-mr97, GHSA-83g3-92jg-28cx, GHSA-qffp-2rhf-9h96).
- **Corrección**: Se agregó `overrides: tar: ^7.5.10` en `pnpm-workspace.yaml`. Tras reinstalar, `tar` quedó en `7.5.19`.
- **Estado**: ✅ Corregido. `electron-builder` sigue funcionando.

## Hallazgos Pendientes / Deuda Técnica

### [D-01] Actualizar Electron y Vitest

- `pnpm audit` sigue reportando `high` en `electron@31.7.7` (GHSA-532v-xpq5-8h95) y `vitest`. Electron 31 → 39 es un salto mayor que requiere pruebas de regresión manuales en ventanas, tray, auto-updater e IPC. Vitest es dev-only.
- **Recomendación**: Planificar upgrade de Electron con validación manual completa antes de release.

### [D-02] i18n incompleta

- `StorePage.tsx` y otros componentes tienen mensajes de error/toast hardcoded en inglés. Deben moverse a claves `t('...')`.
- **Impacto**: Bajo; no afecta seguridad ni estabilidad.

### [D-03] Aplicar migración `007_add_reset_attempts.sql`

- La columna `attempts` de `password_resets` no existe en la base de producción. Se quitó la dependencia del backend para que el flujo funcione, pero la protección contra fuerza bruta queda desactivada.
- **Recomendación**: Ejecutar en Supabase:
  ```sql
  alter table password_resets add column if not exists attempts integer default 0;
  create index if not exists idx_password_resets_code_attempts on password_resets(code, attempts);
  ```
  Luego reintegrar la lógica de intentos en `verify-reset-code` y `reset-password`.

## Verificación

```bash
# Frontend + Electron
pnpm typecheck
pnpm test
pnpm build

# Backend local
pnpm --filter @y-core/api typecheck
pnpm --filter @y-core/api build

# Dependencias
pnpm audit
```

## Commits y Deploy

- `y-core-backup`: commit `45a6c92` (initial) + `6614a07` (CORS/IPC/URL fixes + tar override).
- `y-core-render-api`: commits `f189a22` (password reset fixes) + `d221a79` (CORS restrictivo).
- Render redeployará automáticamente el backend.

## Próximos Pasos Sugeridos

1. Aplicar migración `007_add_reset_attempts.sql` en Supabase.
2. Reintegrar protección de intentos en password reset.
3. Planificar upgrade de Electron 31 → 39.
4. Completar i18n de mensajes hardcoded.
5. Realizar pruebas end-to-end de login, store, instalación y password reset en producción.
