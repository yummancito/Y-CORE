# Resumen de Implementación de Correcciones de Auditoría — Y-Core

**Fecha**: 2026-07-05  
**Rama**: `security-audit-staging`  
**Repositorios involucrados**:
- `c:\Users\mitch\Desktop\y-core-backup` (app Electron + API local)
- `c:\Users\mitch\Desktop\y-core-render-api` (API desplegada en Render)

---

## 1. Objetivo de la sesión

Completar las tareas de auditoría pendientes:

1. Reintegrar protección de intentos de reset de contraseña en el backend (ambos repositorios).
2. Actualizar Electron a una versión parcheada.
3. Completar la internacionalización (i18n) de strings hardcoded en toda la aplicación.

---

## 2. Estado de las tareas principales

| Tarea | Estado | Repositorios / archivos afectados |
|-------|--------|-------------------------------------|
| Password reset attempts | ✅ Completado | `apps/api/src/routes/auth.ts`, `y-core-render-api/src/routes/auth.ts` |
| Electron upgrade | ✅ Completado | `package.json`, `pnpm-lock.yaml`, `node_modules/.pnpm/electron@39.8.10` |
| i18n app completa | ✅ Completado (cobertura extendida) | `src/lib/i18n.ts` + 14 archivos de componentes/páginas |
| Verificación de build | ✅ Completado | `pnpm typecheck`, `pnpm test`, `pnpm build` |

---

## 3. Detalle de cambios

### 3.1 Password reset attempt protection

Se reintegró la protección contra fuerza bruta en los endpoints de `verify-reset-code` y `reset-password`.

- Constante: `MAX_RESET_ATTEMPTS = 5`.
- Helper `incrementResetAttempts(code, current)` actualiza el contador `attempts` en `password_resets`.
- En cada fallo (código usado, expirado, demasiados intentos, reset fallido), se incrementa el contador.
- Tras un reset exitoso, `attempts` se establece a `0`.
- Se evita filtrar errores de base de datos al cliente.

**Commits**:
- `y-core-backup`: `8eae2f7` (seguridad + i18n en este resumen)
- `y-core-render-api`: `7ccd6b2` — `security(auth): re-enable reset-code attempt counter with brute-force protection` (ya en `origin/master`)

### 3.2 Actualización de Electron

- Versión anterior: `31.7.7`.
- Versión objetivo: `39.8.10`.
- Motivación: resolver CVE de use-after-free (`GHSA-532v-xpq5-8h95`) y otras correcciones de seguridad de Chromium.
- Se forzó la descarga del binario con `force_no_cache=true` y se extrajo manualmente el ZIP porque el postinstall de `pnpm` no descargó el ejecutable en el entorno de desarrollo.
- Verificación: `node -e "console.log(require('electron'))"` resuelve la ruta correcta a `electron.exe`.

**Commit**:
- `e503f39` — `deps: upgrade electron 31.7.7 -> 39.8.10 to resolve CVE-2025-XXXX / GHSA-532v-xpq5-8h95`

### 3.3 Internacionalización (i18n)

Se tradujeron strings hardcoded en inglés y español en los diccionarios `es` e `en` de `src/lib/i18n.ts`. Los demás idiomas (`fr`, `pt`, `de`, `zh`, `hi`) usan fallback al inglés gracias a la función `t()`.

#### Áreas traducidas

- **StorePage**: mensajes de carga, instalación, importación, errores de Steam, progreso de importación, Half-Life base.
- **LibraryPage**: lanzamiento, verificación, apertura de ubicación.
- **AddGame**: archivos sospechosos, confirmación de importación, rechazo de juego.
- **ImportGame**: resumen de importación, reinicio de Steam, errores.
- **LuaScripts**: importación, eliminación, placeholders, descripción del motor, botones.
- **ManifestFiles**: importación, eliminación, arrastre, estadísticas, modal.
- **LogsPage**: copiar, exportar, limpiar, encabezado del terminal.
- **LoginPage**: errores de envío de email, código inválido, token inválido, mensajes de rate limiting, placeholder de usuario.
- **ResetPasswordPage**: token inválido, error de reset.
- **SettingsPage**: alt de imagen de perfil.
- **CommandPalette**: comandos, categorías, placeholder, tecla Esc, sin resultados.
- **UpdateNotification**: actualización lista, descargando, instalar y reiniciar.
- **EpicSidebar**: nombre de la app, Discord, unirse a la comunidad.
- **SignaturePendingModal**: etiqueta de beta, aria-label de cierre.
- **Toast / Modal / Input**: aria-labels de descartar, cerrar y limpiar.
- **GameCard**: nombre fallback genérico `App {{id}}`.
- **onlinefix-compatibility.ts**: razones de incompatibilidad (servidores dedicados, Photon, autenticación, etc.).
- **useLibraryStore**: error de carga de juegos.
- **StorePage**: mensajes del splash screen (`Loading catalog...`, `Preparing store...`).
- **y-core-api.ts**: errores de sesión expirada, solicitud fallida, job polling timeout.

#### Nuevas claves principales (ejemplos)

```text
store.failedLoadStore, store.failedLoadBrowse, store.searchFailed
store.failedCloseSteamManual, store.installingHalfLifeBase, store.halfLifeBaseNotAvailable
store.installingNamed, store.installSuccess, store.importProgress
library.launching, library.failedLaunch, library.verificationStarted
addgame.suspiciousAll, addgame.gameConfirmed, addgame.rejectedByUser
importgame.importSummary, importgame.steamRestarted
luascripts.scriptsDescription, luascripts.filePath, manifests.totalManifests
logs.copiedToClipboard, logs.exportFailed, logs.logHeader
login.emailNotConfigured, login.tooManyAttempts, login.invalidResetToken
commandPalette.*, update.*, sidebar.*, api.*
```

**Commits**:
- `ddb53fb` — i18n de páginas principales
- `c73eccf` — i18n de EpicSidebar y SignaturePendingModal
- `8eae2f7` — i18n de mensajes de API
- `43899e0` — i18n de splash screen de Store y resumen de auditoría
- `adc684a` — i18n de GameCard fallback y aria-labels de UI
- `fc64cda` — i18n de razones de compatibilidad de Online Fix
- `9d434d6` — i18n de error de carga en useLibraryStore

---

## 4. Verificación ejecutada

```bash
pnpm typecheck   # ✅ tsc --noEmit (renderer + electron)
pnpm test        # ✅ 7 test files, 157 tests
pnpm build       # ✅ dist-electron generado
```

Además, se verificó que:
- Electron se resuelve correctamente: `require('electron')` apunta a `electron.exe`.
- El backend local y el deployado tienen la misma lógica de `password_resets.attempts`.
- `y-core-render-api` está en `origin/master` con el commit `7ccd6b2`.

---

## 5. Pendientes menores / notas

Algunos textos técnicos o de desarrollo se dejaron sin traducir intencionalmente:

- Logs de consola y mensajes de debug (`AppShell` pick-mode, `console.log` internos).
- Términos técnicos como `AppID`, `App {id}` fallback en `GameCard`.
- Nombres de marca: `Y-core`, `Discord`, `Steam`.
- Nombres de idiomas y temas de color en `SettingsPage`.

Si en una revisión posterior se requiere traducir también estos elementos, se puede extender el diccionario `i18n.ts` de la misma forma.

---

## 6. Archivos de referencia

- `SECURITY-AUDIT-REPORT.md` — reporte detallado de hallazgos de seguridad y correcciones.
- `AUDIT-REPORT-v2.md` — resumen de auditoría y tareas pendientes.
- `AUDIT-IMPLEMENTATION-SUMMARY.md` — este documento.
- `src/lib/i18n.ts` — diccionarios de traducción.
- `apps/api/src/routes/auth.ts` — backend local de autenticación.
- `y-core-render-api/src/routes/auth.ts` — backend deployado de autenticación.

---

## 7. Recomendaciones

1. **Testing manual**: probar el flujo completo de reset de contraseña y verificar que tras 5 intentos fallidos el código se bloquea.
2. **Testing manual de Electron**: lanzar la app en modo producción y verificar que el binario `39.8.10` arranca correctamente.
3. **Testing manual de i18n**: cambiar el idioma en Configuración y revisar que los nuevos textos se reflejan en las páginas traducidas.
4. **Sync**: cuando se desee, sincronizar los cambios de `security-audit-staging` con la rama principal.
