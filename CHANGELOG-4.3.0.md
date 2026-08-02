# Y-CORE v4.3.0 — Release Notes

**Release Date:** 2026-08-03

## ✨ Lo nuevo

### Auto-reparación del hook de Steam en segundo plano
- **Watcher continuo** (`hook-auto-repair.ts`): revisa el hook cada 60s sin límite de intentos. Reemplaza el reintento acotado (30 intentos × 1 min = se rendía para siempre).
- **Siempre instalado**: si `YCoreTool.dll`, `dwmapi.dll` o `xinput1_4.dll` falta o el build de Steam cambió, se reinstala **solo** y **en silencio** (sin diálogos, sin toasts).
- **Sin falsos positivos**: si el trío completo está presente y el build no cambió, no toca nada.
- **Sin falsos negativos**: la verificación ahora cubre el trío completo de DLLs (antes solo miraba el nombre del hook — una `dwmapi.dll` faltante pasaba desapercibida).
- **Que no pase nada malo**: nunca fuerza el cierre de Steam en segundo plano. Si Steam está corriendo, difiere y reintenta al cerrarse (con re-chequeo justo antes de instalar).
- **Consentimiento preservado**: sin `hook_consent.txt` (ni hook pre-existente = consentimiento implícito) no instala en silencio.
- Logs solo en transiciones de estado (sin spam cada 60s).

### Analizador de PC corregido (Analizar Sistema)
- Detección de la sección `depots` en `config.vdf` corregida: Steam la escribe en minúsculas (`"depots"`), antes se buscaba `"Depots"` y daba falsos negativos.
- El reporte ahora muestra el **tamaño real** y **número real de exports** de `ycore_steam.dll` (antes salía `?MB, 0 exports` por valores hardcodeados).
- Eliminado el par de issues contradictorios de `config.vdf` (no podían faltar y existir a la vez).
- `cmake` ausente ya no es WARNING cuando el emulador ya está incluido — pasa a INFO.
- Hook ausente con consentimiento = "reparación pendiente" (INFO con el estado real del watchdog), no una alarma falsa.

### Tests E2E del auto-reparador
- `tests/e2e-hook-auto-repair.test.ts` (15 tests): verificación de contenido + matriz de decisión completa (healthy, falso negativo por `dwmapi.dll` faltante, defer con Steam corriendo, race window, consent gate, `install-failed`, build cambiado).

## 🐛 Bugs arreglados

- `pc-analyzer.ts` usaba `version` en lugar de `dllVersion` en el payload nativo (`NativeDiagnosticsPayload`).
- `pc-analyzer.ts` reportaba `0 exports` / `?MB` para el emulador aunque estuviera cargado (stubs hardcodeados).
- Issues #1 y #2 de `config.vdf` se contradicen (ambos disparaban a la vez).
- `revalidateHookIfUpdated` solo detectaba el nombre del hook, no el trío completo → `dwmapi.dll` faltante no se reparaba.
- El reintento de hook se rendía tras 30 minutos → hook roto para siempre si Steam estaba cerrado >30 min.

## 📦 Cambios técnicos

- **package.json:** v4.2.9 → v4.3.0
- **Nuevo módulo:** `electron/modules/hook-auto-repair.ts` (watchdog de fondo, timer `unref`, teardown en `before-quit`).
- **Exports nuevos en `dll-inject.ts`:** `readLastBuildId`, `hasHookConsent`, `hookPresent`.
- **main.ts:** reemplazo del bloque de reintento acotado por `startHookAutoRepair()`.
- **TypeScript:** `tsc --noEmit` limpio (electron).
- **Tests:** 55/55 pasan en las suites verificadas (15 del E2E nuevo + 40 de acf-pure-functions, depot-keys, vdf-parser y local-installation-diagnostics).

## 🚀 Cómo instalar

**Opción 1: Instalador**
- Descarga `Y-core-Setup-4.3.0.exe`.
- Ejecuta y sigue el asistente.
- Auto-updater se activará en siguiente arranque.

**Opción 2: Portable**
- Descarga `Y-core-4.3.0.exe`.
- Ejecuta directamente, sin instalación.

## 📝 Notas para desarrolladores

- El watchdog arranca en `app.whenReady()` y corre cada 60s (configurable vía `startHookAutoRepair({ intervalMs })`).
- Para probar la matriz de decisión: `npx vitest run tests/e2e-hook-auto-repair.test.ts`.
- El estado del watchdog está disponible para diagnóstico vía `getHookAutoRepairState()` (integración en `analyzePc`).
- Auto-updater busca releases en `https://github.com/yummancito/Y-CORE`.

## 🎁 Créditos

- **Auto-reparación:** diseño orientado a "que no pase nada malo" — sin forzar Steam, sin UI, con consentimiento explícito.
- **Diagnóstico:** reporte de Discord ahora refleja el estado real del sistema.
- **Comunidad:** reportes y feedback (reporta errores vía Discord).

---

**Próximos pasos:**

1. ✅ Auto-reparación del hook Steam en segundo plano.
2. ✅ Analizador de PC corregido (falsos positivos/negativos).
3. ✅ Tests E2E del auto-reparador.
4. ⏳ Auto-reparar también `ycore_steam.dll` / `ycore.dll` (emulador + nativo).

**Gracias por usar Y-CORE.** 🎮
