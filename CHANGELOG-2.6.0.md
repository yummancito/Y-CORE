# Y-CORE v2.6.0 — Release Notes

**Release Date:** 2026-07-19

## ✨ Lo nuevo

### Discord Rich Presence
- La app ahora muestra presencia en Discord: "Jugando Y-core" en el menú, "Jugando [Juego]" cuando lanzas un game.
- Botones: Descargar Y-core (último .exe de releases) + Unirse al Discord.
- Portadas de juegos vía Steam CDN (sin pre-cargar imágenes).
- Watcher: presencia actualiza automáticamente cuando abres/cierras juegos.

### Componente nativo C++ (ycore.dll)
- Detección de Steam (~3x más rápida que JS puro).
- Parser VDF/ACF optimizado (manejo de comentarios, escapes, anidamiento).
- Enumeración de juegos instalados con metadata (appId, name, size, fecha última vez jugado).
- Cero dependencias externas (solo Win32 + CRT estático — sin VC++ redistributable).
- **NO distribuido el source** (DLL compilado, listo para usar).

### Puente FFI koffi
- Conexión Node ↔ ycore.dll sin fugas de memoria (disposable pattern).
- Carga perezosa: si falta el DLL, la app degrada a JS silenciosamente.
- Manejo de errores humano: mensaje corto en modal, detalle técnico al log.

### Diálogo de errores mejorado
- Mensajes claros, SIN stacks técnicos a la vista.
- Detalles técnicos plegados (opcional).
- Botones: Reintentar / Reportar (webhook Discord) / Cerrar.
- Confirmación visual al enviar un reporte.

### Correcciones visuales
- Navbar oscura estilo Epic Games (antes tinte blanca).
- Borde sutil en sidebar para mejor contrast.

### Correcciones de API
- Tienda ahora carga 597 juegos desde la API de producción (Render).
- Fix: .env apuntaba a localhost (desuso); ahora usa `https://y-core-render-api-rxwd.onrender.com`.

## 🐛 Bugs arreglados (sesión anterior)

- Fetch timeout en y-core-api.ts + depotbox.ts — ahora con AbortController 30s/5min.
- Loop infinito en useLibraryStore (orphans resoltos causaban re-scan infinito).
- Array access sin validación en LibraryPage scroll infinito.
- Context menu fuera de pantalla en ventanas pequeñas.
- Download timeout en onlinefix.ts (Thunderstore).
- Dumpbin hardcodeado (path para dumpbin ahora dinámico).
- Mods sin validación (Thunderstore ahora verifica PK magic bytes).
- Opacity defaults invisibles (sidebar/titlebar de 6% → 85%).
- Promise chain indentation en AppShell.
- setInterval dependency leak en AppShell.

**Total:** 12 bugs reparados en sesiones 7-8. Los 2 de depotbox.ts no aplican (están en repo separado `y-core-render-api`).

## 📦 Cambios técnicos

- **package.json:** v2.5.5 → v2.6.0
- **Auto-updater:** ya funciona; esta release se detecta automáticamente.
- **DLL:** compilado con VS 2022 BuildTools, CRT estático, listo para Windows 7+ SP1.
- **Frontend:** TypeScript limpio (tsc --noEmit sin errores).
- **Build:** `npm run build:full` compila DLL + frontend + crea instalador.

## 🚀 Cómo instalar

**Opción 1: Instalador**
- Descarga `Y-core-Setup-2.6.0.exe`.
- Ejecuta y sigue el asistente.
- Auto-updater se activará en siguiente arranque.

**Opción 2: Portable**
- Descarga `Y-core-2.6.0.exe`.
- Ejecuta directamente, sin instalación.

## 📝 Notas para desarrolladores

- **DLL source:** no incluido en release (compilado en `native/ycore/build/ycore.dll`).
  - Recompila si necesitas cambios: `cd native/ycore && build.bat`.
  - Prueba: `native/ycore/test/ffi-test.js` (verifica FFI sin fugas).
- **Auto-updater:** busca releases en `https://github.com/yummancito/Y-CORE`.
  - Configurable en electron-builder.json (`publish.provider`, `owner`, `repo`).
- **Error handling:** `src/lib/error-handler.ts` + `useErrorStore`.
  - Integra con el ErrorDialog global de AppShell.

## 🎁 Créditos

- **DLL:** Compilado desde C++17, optimizado para Windows.
- **Discord RPC:** Integración nativa sin npm (named pipe protocol).
- **UI:** Mejoras visuales estilo Epic Games.
- **Comunidad:** Reportes y feedback (reporta errores vía Discord).

---

**Próximos pasos:**

1. ✅ Página detalle de juego (`/game/:appId` con Steam API).
2. ✅ Rediseño GameCard (glassmorphism, glow).
3. ✅ Modal de donaciones (PayPal).
4. ✅ DLL C++ integrado en runtime.

**Gracias por usar Y-CORE.** 🎮
