# 📋 PLAN: MODS MANAGER SECTION - Y-CORE

**Objetivo**: Sección completa de Mods con seguridad, backup automático y UI tipo Biblioteca

---

## 🏗️ TECNOLOGÍAS CANDIDATAS

### **1. Steam Workshop API**
- `steamworks-sdk` / `node-steamuser`
- Obtener catálogo de mods
- Info de mods (ratings, descargas, detalles)
- Posiblemente descargar directamente

### **2. Análisis de Seguridad (Malware Detection)**

**Opciones a investigar:**
- **VirusTotal API** (free tier: 4 requests/min)
- **YARA rules** (regex de malware conocidos)
- **Clamav** (open-source antivirus)
- **PE parser** (analizar headers de EXE/DLL)
- **Manifest scanning** (detectar scripts sospechosos)
- **Sandbox execution** (ejecutar en entorno aislado)

### **3. Backup/Restore Strategy**

**Opciones a investigar:**
- **Full backup** (copia completa antes de instalar)
- **Incremental backup** (solo cambios)
- **Deduplication** (eliminar duplicados entre backups)
- **Sparse files** (optimizar almacenamiento)
- **Snapshot-based** (NTFS VSS / btrfs snapshots)
- **Rsync incremental** (solo cambios)

### **4. UI & Storage**

**Frontend:**
- React + Tailwind (componentes tipo card)
- Grid/Masonry layout para cards de mods
- State management (Zustand)

**Backend:**
- Electron IPC handlers
- Node.js filesystem API
- SQLite/PostgreSQL para metadata local

### **5. Mod Management**

**Funcionalidades:**
- Enable/disable (mover/eliminar archivos)
- Load order (archivo de configuración)
- Conflict detection (comparar hashes)
- Cleanup (detectar mods huérfanos)

---

## 📊 ARQUITECTURA PROPUESTA

```
┌─────────────────────────────────────────────────────────┐
│           MODS MANAGER - Y-CORE                         │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  Frontend (React)                                       │
│  ├─ ModsPage.tsx (main view)                           │
│  ├─ GameModsGrid.tsx (cards layout)                    │
│  ├─ ModCard.tsx (individual mod card)                  │
│  ├─ CatalogView.tsx (Steam Workshop search)            │
│  └─ MyModsView.tsx (installed mods)                    │
│                                                           │
│  ↓ IPC                                                   │
│                                                           │
│  Backend (Electron/Node)                                │
│  ├─ mods-manager.service.ts                            │
│  │  ├─ downloadMod()                                    │
│  │  ├─ installMod() [with backup]                      │
│  │  ├─ scanForMalware()                                │
│  │  ├─ enableMod()                                      │
│  │  └─ disableMod()                                     │
│  │                                                       │
│  ├─ backup-manager.ts                                   │
│  │  ├─ createBackup() [fast/incremental]               │
│  │  ├─ restoreBackup()                                 │
│  │  └─ cleanupOldBackups()                             │
│  │                                                       │
│  ├─ malware-scanner.ts                                  │
│  │  ├─ scanFile() [VirusTotal/YARA/PE]                 │
│  │  ├─ blockSuspiciousExtensions()                     │
│  │  └─ sandboxExecute() [if needed]                    │
│  │                                                       │
│  ├─ steam-workshop-api.ts                              │
│  │  ├─ getCatalog()                                     │
│  │  ├─ searchMods()                                     │
│  │  ├─ getModDetails()                                 │
│  │  └─ downloadMod()                                    │
│  │                                                       │
│  └─ mods-database.ts [SQLite]                          │
│     ├─ mod metadata (local)                            │
│     ├─ install history                                 │
│     └─ backup tracking                                 │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 🔒 SEGURIDAD - VALIDACIONES

1. **Pre-download check:**
   - Verificar tamaño (mods >500MB = sospechoso?)
   - Check file extension whitelist

2. **Post-download scan:**
   - VirusTotal API scan
   - YARA signature matching
   - PE header analysis (detect packed executables)

3. **File validation:**
   - Block: `.exe`, `.bat`, `.ps1`, `.vbs`, `.js` (en mods)
   - Whitelist: `.dll`, `.ini`, `.json`, `.xml`, `.lua`
   - Context-aware (algunos juegos aceptan DLLs, otros no)

4. **Backup safety:**
   - Always backup before install
   - Verify backup integrity
   - Keep last 3 backups minimum

---

## 📊 ESTIMACIÓN DE LÍNEAS

| Componente | Líneas | Notas |
|-----------|--------|-------|
| Frontend (React) | 1,500 | Cards, grid, search |
| Mods Manager Service | 800 | Install, enable, disable |
| Backup Manager | 600 | Incremental, restore |
| Malware Scanner | 500 | Multi-source scanning |
| Steam API Handler | 400 | Catalog, search, download |
| Database Layer | 300 | SQLite metadata |
| IPC Handlers | 300 | Electron bridge |
| **TOTAL** | **4,400** | Production ready |

---

## 🔍 INVESTIGACIÓN REQUERIDA

### **Agente 1: Malware Detection Research**
**Pregunta**: ¿Cuál es la forma más rápida, confiable y segura de detectar mods maliciosos?

Investigar:
- VirusTotal API (velocidad, accuracy, free tier)
- YARA rules (falsos positivos)
- PE header analysis (packed executables)
- Behavioral sandbox (sandbox.io, Any.run)
- Hybrid approach (combinar múltiples)

### **Agente 2: Backup Strategy Research**
**Pregunta**: ¿Cuál es la mejor estrategia para backups rápidos de juegos grandes (50GB+)?

Investigar:
- Full vs incremental (speed comparison)
- Deduplication (storage savings)
- NTFS VSS (Windows snapshots)
- Rsync (Linux-style incremental)
- ZFS/Btrfs (filesystem snapshots)
- Sparse files (sparse backup optimization)

---

## 🚀 SIGUIENTE PASO

Lanzar 2 agentes para investigar:
1. **Malware detection** - Métodos más rápidos y seguros
2. **Backup strategies** - Forma más eficiente para juegos grandes

---

**Status**: 📋 PLANIFICACIÓN EN CURSO
