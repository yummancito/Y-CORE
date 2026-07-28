# Y-Core — Roadmap Maestro (reconciliación)

> Este documento reemplaza, en términos de priorización, a `PLAN-100K.md` (raíz) y al orden recomendado en `reference/architecture-proposals.md`. Ninguno de los dos se elimina — quedan como insumo histórico — pero de aquí en adelante este es el índice de referencia.

## Por qué existían dos planes

- **`reference/architecture-proposals.md`** — diagnóstico + 3 propuestas (Service Layer, Game Runtime Environment, Plugin System), ~63,000 líneas estimadas, orden recomendado: Service Layer → GRE → Plugins. Framing: valor arquitectónico y capacidad del producto.
- **`PLAN-100K.md`** (raíz) — 3 fases (Motor de Descargas, Biblioteca Inteligente, Perfiles/Runtime), ~40,000 líneas estimadas. Framing explícito: alcanzar 100,000 líneas totales ("Meta: 100,000 líneas de código que se NOTEN").

Ninguno de los dos documentos menciona al otro. El resultado observable es el que documenta `reference/analysis/INVENTORY.md`: ~3,400 líneas de la Fase 1 de `PLAN-100K.md` (Download Engine v2) ya están escritas, sin tests, con workers simulados, y sin montar en la UI — trabajo real invertido sin que el Service Layer (que ambos documentos coinciden en que es prerequisito) exista siquiera.

## Principio de reconciliación

Se reemplaza el framing por conteo de líneas de `PLAN-100K.md` por un framing de **valor + dependencias**: qué sistema desbloquea a los demás, qué trabajo ya invertido se recupera o se pierde, y qué es visible para el usuario final. El tamaño en líneas es una consecuencia, no un objetivo.

## Orden priorizado (sujeto a lo que arroje la investigación OSS en curso)

| # | Sistema | Estado actual | Por qué este orden | Bloquea a |
|---|---|---|---|---|
| 1 | **Resolución Download Engine V1/V2** | ~40% escrito (V2), V1 en producción, decisión de arquitectura pendiente de investigación (ver `reference/DECISION-download-engine-v2.md`) | Mayor sunk cost inmediato; mayor riesgo de que código no funcional (workers simulados) se perciba como terminado; es lo primero que un usuario nota | Nada directamente, pero informa si el Service Layer debe diseñarse ya pensando en el motor de descargas como primer consumidor real |
| 2 | **Service Layer + IPC Gateway** | 0% — no existe `src/services/` ni `electron/services/` | Fundacional: sin esto, cualquier sistema nuevo repite el patrón de 88 métodos planos sin abstracción. Ambos planes preexistentes coinciden en que es prerequisito | GRE, Plugin System, y cualquier refactor limpio del propio Download Engine |
| 3 | **Game Runtime Environment (GRE)** | 0% | Mayor impacto de cara al usuario (runtime detection, launch profiles, saves, playtime) — transforma "downloader" en "launcher" | Nada crítico, pero se beneficia de Service Layer para no repetir deuda |
| 4 | **Plugin / Extension System** | 0% | Estratégico pero no urgente; requiere que el core (Service Layer + GRE) esté estable antes de exponer una API pública que no se puede romper después | Nada — es el techo, no la base |
| 5 | **Smart Library** (de `PLAN-100K.md` Fase 2) | 0% | Valor de producto claro pero no bloqueante; puede ejecutarse en paralelo con GRE una vez exista Service Layer | Nada |

Este orden es una hipótesis a validar, no una decisión cerrada — el paso 1 en particular está explícitamente gateado por la investigación OSS en curso (ver `reference/research/download-engine/`), que puede concluir que ni V1 ni V2 son la arquitectura correcta.

## Qué NO se investiga en esta ronda

- **Remote Play / Game Streaming** — no está en ninguno de los dos planes preexistentes ni fue solicitado; fuera de alcance salvo pedido explícito.
- Investigación OSS de profundidad completa (10-30 repos) para GRE y Plugin System — ambos siguen siendo especulativos (0% iniciados) y más lejanos en el orden priorizado; se les da una pasada más liviana (4-6 repos cada uno) suficiente para escribir ARCHITECTURE.md, no el tratamiento completo que sí se le está dando a Service Layer y a Download Engine.

## Documentos derivados de este roadmap

- `reference/analysis/INVENTORY.md` — Fase 0, estado actual completo del repo
- `reference/DECISION-download-engine-v2.md` — framing de la decisión #1 (sin resolver aún, gateado por investigación)
- `reference/research/download-engine/` — investigación OSS en curso para la decisión #1
- `reference/service-layer/` — investigación + arquitectura para el sistema #2 (pendiente)
- `reference/game-runtime/` — investigación + arquitectura liviana para el sistema #3 (pendiente)
- `reference/plugin-system/` — investigación + arquitectura liviana para el sistema #4 (pendiente)
- `reference/MEMORY.md` — se actualiza al cierre de esta ronda con el estado consolidado

## Estado de esta reconciliación

Este documento se revisará una vez completada la investigación del Download Engine (Paso 4 del proceso de research) para confirmar o ajustar el orden priorizado antes de presentar el plan maestro final al usuario para aprobación.
