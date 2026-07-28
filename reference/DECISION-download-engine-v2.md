# ADR: Qué hacer con Download Engine v2

## Estado
Propuesto — pendiente de elección del usuario. Ninguna opción ha sido ejecutada.

## Contexto

`git status` muestra ~3,400 líneas sin commitear que implementan un segundo stack de descargas ("v2") en paralelo al stack V1 que hoy es el único camino en producción:

- **Backend**: `electron/modules/download-engine.ts` (976 ln) — motor real: cola de prioridad, `SpeedTracker`, `RetryManager` con backoff exponencial, verificación SHA1, persistencia de cola/historial a disco, emisión de eventos IPC.
- **IPC**: `electron/modules/download-ipc.ts` (305 ln) — registra 13 handlers `download:*` y está efectivamente wireado en `main.ts` (`registerDownloadHandlers()` se llama en `whenReady()`).
- **Puente API**: `electron/modules/download-api-bridge.ts` (165 ln) — traduce respuestas de `/install` de la API en tareas del engine; no invocado por ningún flujo vivo.
- **Frontend**: `useDownloadStoreV2.ts` (399 ln), `DownloadsPageV2.tsx` (569 ln), `DownloadManagerPanel.tsx` (430 ln), `DownloadNotification.tsx` (211 ln), `useEnhancedDownloader.ts` (156 ln) — ninguno importado por `App.tsx` ni por ninguna página ruteada.

El defecto crítico: `download-ipc.ts::registerWorkers()` instala **workers simulados** para las 4 fuentes (`steampipe`, `steamcmd`, `direct`, `api_proxy`) — cada uno es un loop `setTimeout` que incrementa contadores de bytes falsos y llama `engine.completeTask()`. El comentario en el código dice literalmente "Worker simulado... (descarga real se integrará después)". Ninguno llama al orquestador real que ya existe en el repo: `electron/modules/steampipe/depot-downloader.ts` (459 ln, auth → CDN → depot key → manifest → chunks → SHA1, completo y testeado) ni a `steamcmd-manager.ts` (726 ln, ciclo de vida real de SteamCMD).

Mientras tanto, el stack V1 (`useDownloadQueueStore.ts`, `DownloadsPage.tsx`, `useInstallProcessor.ts`, `useSteamCmdJobsStore.ts`) es plenamente funcional y está en producción — `DownloadsPage.tsx` se autodescribe en su comentario de cabecera como "la única superficie de progreso de descargas de la app", lo que indica que fue escrito sin que su autor supiera que V2 ya existía o se estaba escribiendo en paralelo.

El origen de V2 parece ser `PLAN-100K.md` (raíz del repo), un plan orientado explícitamente a alcanzar 100,000 líneas de código ("Meta: 100,000 líneas que se NOTEN"), cuya Fase 1 lista archivos casi idénticos a los de V2 con estimaciones de líneas que no coinciden con lo realmente escrito (p.ej. estima `download-engine.ts` en 3,500 líneas; el archivo real tiene 976). Esto sugiere que V2 es una porción parcialmente ejecutada de un plan orientado a conteo de líneas, no una feature derivada de un requerimiento o bug archivado.

## Decisión

**Pendiente — requiere elección explícita del usuario antes de continuar cualquier trabajo relacionado con descargas.** Esta decisión determina si `reference/download-engine/` (investigación OSS, Paso 4 del plan de research) se ejecuta o se omite.

## Opciones consideradas

### Opción A — Conectar V2 al motor real y retirar V1
Cablear los 4 workers de `download-ipc.ts` para invocar `depot-downloader.ts` (fuente steampipe) y `steamcmd-manager.ts` (fuente steamcmd) en lugar de los simuladores `setTimeout`. Una vez verificado end-to-end, montar `DownloadsPageV2`/`DownloadManagerPanel` en `App.tsx`, migrar los consumidores de V1 (`useInstallProcessor.ts`, `StorePage.tsx`, `GameDetailPage.tsx`, `EpicSidebar`) a V2, y finalmente eliminar `useDownloadQueueStore.ts`/`DownloadsPage.tsx`/`useSteamCmdJobsStore.ts`.

- **Pros**: El motor V2 (cola de prioridad, reintentos, SHA1, persistencia de historial) es objetivamente más capaz que V1; recupera la inversión ya hecha (~3,400 líneas); es la dirección que `PLAN-100K.md` ya apuntaba.
- **Contras**: Requiere escribir el adaptador real de workers (no trivial — cruzar el motor genérico con las particularidades de steampipe/steamcmd), resolver DT-02 (duplicación de tipos) y DT-03 (formatters), escribir tests desde cero (hoy V2 tiene cobertura cero), y migrar cada consumidor de V1 uno por uno sin romper el flujo de instalación en producción (Regla 7 del master prompt: convivir con legacy hasta que sea seguro reemplazarlo).
- **Esfuerzo estimado**: Medio-alto — el motor y la UI ya están escritos; el trabajo real es el adaptador de workers + migración de consumidores + tests.

### Opción B — Descartar V2, seguir iterando V1
Eliminar (o archivar fuera del árbol activo) los 8 archivos de V2. Continuar mejorando el stack V1 existente incrementalmente (p.ej. extraer lógica de `useInstallProcessor.ts` a un servicio cuando exista el Service Layer).

- **Pros**: Elimina DT-01 a DT-03 y DT-06 (concentración de `as any`) de un plumazo; evita mantener dos motores de descarga; V1 ya es la superficie real que usan los usuarios hoy.
- **Contras**: Se pierde el trabajo ya invertido en el motor de colas/reintentos/SHA1, que resuelve problemas reales que V1 no tiene (sin reintentos con backoff, sin verificación de integridad, sin historial persistente).
- **Esfuerzo estimado**: Bajo — es principalmente `git rm` + actualizar `main.ts` para no registrar `download-ipc.ts`.

### Opción C — Mantener ambos temporalmente detrás de un feature flag
Dejar V1 como default en producción, exponer V2 solo bajo una flag de configuración (`ALLOWED_CONFIG_KEYS`) para uso interno/QA mientras se completa el adaptador de workers de la Opción A, sin comprometerse aún a la migración completa de consumidores.

- **Pros**: Desbloquea probar el motor real sin arriesgar el flujo de instalación en producción; permite validar la Opción A incrementalmente.
- **Contras**: Mantener dos motores de descarga vivos simultáneamente es exactamente el tipo de deuda que Regla 7 del master prompt busca evitar más allá de lo estrictamente necesario; riesgo de que la flag se vuelva permanente por inercia.
- **Esfuerzo estimado**: Bajo para habilitar la flag; el costo real es el mismo trabajo de la Opción A, solo diferido.

## Recomendación

Ninguna opción se ejecuta sin aprobación explícita — esto es una ADR de encuadre, no una implementación. Dicho eso, para que el usuario decida con contexto: dado que el motor de V2 ya resuelve problemas reales que V1 no tiene (reintentos, integridad, historial) y que `depot-downloader.ts` ya existe y solo falta conectarlo, la Opción A parece la de mejor relación esfuerzo/valor — pero requiere presupuestar el adaptador de workers y la migración de consumidores como trabajo real, no como "ya está hecho". La Opción C es razonable como paso intermedio si se quiere validar el adaptador sin comprometerse aún a retirar V1.

## Consecuencias sobre el resto del proceso de research

- Si se elige **Opción A o C**: el Paso 4 del plan de research (`reference/download-engine/`, investigación OSS de patrones de descarga/colas/reintentos) procede, cruzando explícitamente contra `depot-downloader.ts` y `steamcmd-manager.ts` ya existentes.
- Si se elige **Opción B**: el Paso 4 se omite por completo; no hay sistema que investigar.
- En cualquier caso, DT-05 (READMEs desactualizados) y la reconciliación del roadmap maestro no dependen de esta decisión y proceden en paralelo.

## Referencias
- `reference/analysis/INVENTORY.md` §4 DT-01, DT-02, DT-03, DT-06, DT-07
- `PLAN-100K.md` (raíz) — origen aparente de V2
- Código: `electron/modules/download-ipc.ts::registerWorkers()`, `electron/modules/steampipe/depot-downloader.ts`
