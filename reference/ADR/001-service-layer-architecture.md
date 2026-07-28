# ADR-001: Service Layer + IPC Gateway

**Estado**: Implementado (Fase 1 completa)
**Fecha**: Julio 2026
**Referencias**: MASTER_ARCHITECTURE.md, service-layer/research/SYNTHESIS.md

## Contexto

Y-Core tenía 88+ métodos IPC planos en `preload.ts`, stores que llamaban `window.steamtools.xxx()` directamente, y lógica de negocio mezclada en hooks de React (e.g., `useInstallProcessor.ts` con 650 líneas). Esto hacía que:

- Testear un store requiriera mockear 88+ métodos
- Agregar una feature requiriera tocar 4+ archivos (preload, handler, store, componente)
- No hubiera caché, retry, ni timeout en llamadas IPC
- El sistema no escalara

## Decisión

Crear una **Service Layer** con 3 capas:

1. **Frontend Services** (`src/services/*.ts`): Clases que envuelven llamadas IPC con tipos fuertes
2. **Gateway** (`src/services/gateway.ts`): Proxy que serializa llamadas a IPC vía `ipcRenderer.invoke('gateway:call', ...)`
3. **Backend Services** (`electron/services/*.ts`): Handlers registrados en un `ServiceRegistry` y enrutados por un `GatewayRouter` único

### Patrón elegido: Proxy-based Gateway (tRPC-inspired)

Se evaluaron 4 alternativas:

| Patrón | Ventajas | Desventajas | Decisión |
|--------|----------|-------------|----------|
| **88 métodos planos** (status quo) | Simple, sin abstracción | No escala, frágil, no testeable | ❌ |
| **tRPC** | Tipado fuerte, middleware | Dependencia externa, overhead | ❌ |
| **Comlink** | Proxy automático | Sin control de middleware | ❌ |
| **Proxy Gateway custom** | Sin dependencias, tipado, middleware, ~50 líneas | Mantenimiento manual | ✅ |

### Backward compatibility

Se mantuvieron los 88+ métodos originales en preload.ts. Los servicios nuevos se exponen via `window.steamtools.gateway`. Stores migran uno por uno.

## Consecuencias

### Positivas
- ✅ IPC tipado: rename de canal = error de compilación, no de runtime
- ✅ Testeable: cada servicio se testea mockeando el gateway
- ✅ Extensible: nuevo feature = nuevo service, no tocar preload
- ✅ Middleware: logging, error boundary, timing out-of-the-box
- ✅ Sin dependencias externas: ~300 líneas de TypeScript puro

### Negativas
- ❌ Backend services stub (onlinefix, drm, store) devuelven placeholders — completar en Fase 2
- ❌ Sin tests unitarios de servicios — mock gateway necesario
- ❌ Sin barrel exports (`index.ts`) en services/

## Servicios Implementados

| Servicio | Frontend | Backend | Estado |
|----------|----------|---------|--------|
| Config | ✅ | ✅ | Completo |
| Auth | ✅ | ✅ | Completo |
| Game | ✅ | ✅ | Completo |
| Store | ✅ | ⚠️ Stub | Parcial |
| Download | ✅ | ✅ | Completo |
| Log | ✅ | ✅ | Completo |
| Steam | ✅ | ✅ | Completo |
| Update | ✅ | ⚠️ Stub | Parcial |
| OnlineFix | ✅ | ⚠️ Stub | Placeholder |
| DRM | ✅ | ⚠️ Stub | Placeholder |
| SteamCMD | ✅ | ✅ | Completo |

## Próximos Pasos

- Fase 2: Migrar stores restantes, tests unitarios de servicios
- Fase 2: Completar stubs (onlinefix, drm, store)
- Fase 2: Barrel exports + useIpcEvent hook
