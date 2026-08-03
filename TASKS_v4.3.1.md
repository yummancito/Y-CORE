# 📋 TAREAS v4.3.1 — UI/UX Improvements & Auto-Repair

## 🎯 Cambios Solicitados

### 1. **Auto-Update NO Silencioso** ⚠️
**Problema Actual:**
- App se actualiza sin que el usuario vea nada
- Si dice "Reiniciar Steam" y clickea, se reinicia
- Confusión: no sabe si se está actualizando

**Solución Requerida:**
```
Startup (splash screen con logo Y-core pequeño)
    ↓
"Buscando actualizaciones..." (loading bar)
    ↓
SI hay update:
    ├─ "Descargando v4.3.1" (progress bar %)
    ├─ "Actualización descargada"
    └─ Auto-reinicia SIN botón "Siguiente" (seamless)
    
NO hay update:
    └─ Abre app normal
```

**Files to modify:**
- `electron/main.ts` (líneas 1108-1163)
- `electron/modules/windows.ts` (splash window)
- Crear: `electron/modules/update-ui.ts` (new)

---

### 2. **Remover Botón "Reiniciar Steam"** ❌
**Problema Actual:**
```
"Blue Prince está configurado y Steam se reinició para empezar..."
[Cancelar] [Reiniciar Steam]
```

**Solución:**
- Auto-restart Steam SIN confirmación
- Mostrar: "Reiniciando Steam..." (progreso)
- Cerrar diálogo automáticamente cuando Steam se reinicie

**Files to modify:**
- `electron/services/download.service.ts` (línea 228-240)
- `src/hooks/useInstallProcessor.ts` (dialog handling)

---

### 3. **Remover Splash "Cargando Y-core"** 👻
**Problema Actual:**
- Sale splash screen al iniciar con "Cargando Y-core"
- Solo debería salir en `electron:dev`

**Solución:**
```
if (isDev) {
  // Mostrar splash "Cargando Y-core..."
} else if (isPackaged) {
  // Skip splash, ir directo a update check
  // Mostrar minimal loading (solo logo)
}
```

**Files to modify:**
- `electron/modules/windows.ts` (createSplashWindow)
- `electron/main.ts` (app.whenReady callback)

---

### 4. **Agregar Botón "Reparar" en Librería** 🔧
**Problema Actual:**
```
Librería:
├─ Amogus 3D [Descargar] [❤️]
└─ (sin opción de reparar)
```

**Solución:**
```
Librería:
├─ Amogus 3D [Descargar] [❤️] [Reparar]
│  └─ Reparar = busca DepotBox/OnlineFix → fix locales
└─ Game X [Jugar] [❤️] [Reparar]
   └─ Reparar = valida archivos + DLLs
```

**Functionality:**
- Click [Reparar] → busca en DepotBox para el juego
- Intenta descarga de OnlineFix si existe
- Si no → notificación "Sin fixes disponibles"
- Muestra progreso mientras descarga

**Files to modify:**
- `src/components/GameCard.tsx` (nuevo botón)
- `src/hooks/useRepairGame.ts` (nuevo hook)
- `electron/services/repair.service.ts` (nueva)

---

### 5. **Auto-Repair en Startup** 🤖
**Problema Actual:**
- Juegos viejos que salen como "Comprar" siguen igual
- Usuario no sabe qué hacer

**Solución:**
```
Startup:
  ↓
"Analizando tu librería..." (progress)
  ├─ Busca juegos con estado "Comprar"
  ├─ Verifica ACF InstalledDepots
  ├─ Si vacío → intenta reparar
  │  ├─ Descarga Lua desde API
  │  ├─ Regenera ACF con depots
  │  └─ Reinicia Steam si es necesario
  ├─ Si OK → deja como está
  └─
"Librería lista" (silencioso)
  ↓
App normal
```

**Mechanics:**
- Silent mode (no diálogos)
- Max 2 reiniciós de Steam
- Log everything para debugging
- Si falla, user puede clickear [Reparar] manualmente

**Files to modify:**
- Crear: `electron/services/library-repair.service.ts` (nueva)
- Crear: `electron/modules/startup-diagnostics.ts` (nueva)
- `electron/main.ts` (app.whenReady hook)

---

### 6. **Fixear Error HTTP 503 Discord Report** 🔗
**Problema Actual:**
```
Error al enviar: Report failed: HTTP 503 - {"error":"report_unavailable"}
```

**Causa:** 
- Y-core API report endpoint está down
- O URL incorrecta en código

**Solución:**
- Verificar endpoint URL en `discord-rpc.ts`
- Agregar retry logic (3 intentos con backoff)
- Si falla, guardar localmente y reintentar en 1 hora
- Mostrar toast amigable: "No pudimos enviar a Discord, lo intentaremos después"

**Files to modify:**
- `electron/modules/discord-rpc.ts` (report function)
- Crear: `electron/modules/report-queue.ts` (queue local)

---

## 📁 Archivos a Modificar/Crear

### MODIFICAR:
1. `electron/main.ts` — Auto-update, startup diagnostics
2. `electron/modules/windows.ts` — Splash screen logic
3. `electron/services/download.service.ts` — Remove restart button
4. `electron/modules/discord-rpc.ts` — Fix HTTP 503
5. `src/hooks/useInstallProcessor.ts` — Dialog handling
6. `src/components/GameCard.tsx` — Add Repair button

### CREAR (Nuevos):
1. `electron/modules/update-ui.ts` — Update progress UI
2. `electron/modules/startup-diagnostics.ts` — Library analysis
3. `electron/services/library-repair.service.ts` — Repair engine
4. `electron/services/repair.service.ts` — User-triggered repairs
5. `electron/modules/report-queue.ts` — Discord report queue
6. `src/hooks/useRepairGame.ts` — Frontend repair hook

---

## 🔄 Implementation Order

**Fase 1: High Priority (v4.3.1 Alpha)**
1. [ ] Fix HTTP 503 Discord report (5min)
2. [ ] Remove "Reiniciar Steam" button (10min)
3. [ ] Auto-update UI progress (20min)
4. [ ] Splash screen logic (15min)

**Fase 2: Medium Priority (v4.3.1 Beta)**
5. [ ] Auto-repair on startup (30min)
6. [ ] Repair button in library (25min)

**Fase 3: Polish (v4.3.1 RC)**
7. [ ] Testing on multiple PCs
8. [ ] Documentation
9. [ ] Release

---

## ⏱️ Estimated Time

| Task | Time | Priority |
|------|------|----------|
| Fix Discord HTTP 503 | 5 min | 🔴 Critical |
| Remove Restart button | 10 min | 🔴 Critical |
| Update UI progress | 20 min | 🟠 High |
| Splash screen fix | 15 min | 🟠 High |
| Auto-repair startup | 30 min | 🟡 Medium |
| Repair button | 25 min | 🟡 Medium |
| Testing | 45 min | 🟠 High |
| **TOTAL** | **~2.5 hours** | |

---

## 🎨 UI Mockups

### Update Progress (Startup)
```
╔══════════════════════════════════════╗
║         🔷 Y-CORE v4.3.1             ║
╠══════════════════════════════════════╣
║                                      ║
║    Buscando actualizaciones...       ║
║    [████░░░░░░░░░░░░░░░░░░] 35%     ║
║                                      ║
║    Descargando v4.3.1 (45 MB)        ║
╚══════════════════════════════════════╝
```

### Game Card with Repair
```
┌──────────────────────────────┐
│ Amogus 3D                    │
│ [████████████████░░░░] 80%   │
│                              │
│ [Descargar] [❤️] [Reparar]   │
└──────────────────────────────┘
```

### Startup Repair
```
╔══════════════════════════════════════╗
║    Analizando tu librería...         ║
║    [████░░░░░░░░░░░░░░░░░░] 25%     ║
║                                      ║
║    3 juegos encontrados              ║
║    Reparando... (no cierre)          ║
╚══════════════════════════════════════╝
```

---

## 📝 Notes

- Keep changes minimal and focused
- No breaking changes to existing APIs
- Add logging for all repair operations
- Ensure backwards compatibility
- Test on clean install + upgrade path

---

**Status:** 📋 Ready for Implementation  
**Assigned to:** Claude Code  
**Target Release:** v4.3.1
