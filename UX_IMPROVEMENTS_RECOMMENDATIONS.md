# UX Improvements - Y-Core Mod Manager

**Mejoras de Experiencia de Usuario Recomendadas**

---

## 1. Interfaz de Primeras Instalaciones (Onboarding)

### Problema
Nueva instalación sin explicación de conceptos = confusión total.

### Solución Recomendada

```tsx
// FirstModModal.tsx
export function FirstModWizard() {
  return (
    <Dialog open fullscreen>
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        
        {/* Step 1: Educación */}
        <div className="space-y-4">
          <h1>Bienvenido a Y-Core Mod Manager</h1>
          <p>3 conceptos clave antes de empezar:</p>
          
          {/* Backup explicado con animación */}
          <Card>
            <h3>1. Backup (Copia de Seguridad)</h3>
            <p>Antes de instalar mods, hago una copia del juego.</p>
            <p>Si algo sale mal, puedo restaurarlo en 2 minutos.</p>
            <VideoPreview src="/tutorials/what-is-backup.mp4" />
          </Card>
          
          {/* Load Order explicado */}
          <Card>
            <h3>2. Load Order (Orden de Carga)</h3>
            <p>Algunos mods necesitan cargarse en orden específico.</p>
            <p>Si están en orden equivocado = crash.</p>
            <Visualization>
              {/* Mostrar visualmente: Mod A → Mod B → Mod C */}
            </Visualization>
          </Card>
          
          {/* Compatibilidad */}
          <Card>
            <h3>3. Compatibilidad</h3>
            <p>No todos los mods funcionan juntos.</p>
            <p>Si dos cambian lo mismo = problema.</p>
          </Card>
        </div>
        
        {/* Step 2: Acción */}
        <div className="space-y-4">
          <h2>Listo, instalemos tu primer mod</h2>
          
          <div className="bg-blue-500/20 p-4 rounded">
            <p>Ahora voy a:</p>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Crear backup automático (15 min)</li>
              <li>Descargar el mod (2 min)</li>
              <li>Instalar (1 min)</li>
              <li>Verificar que todo funcione</li>
            </ol>
            <p className="text-sm text-gray-500 mt-4">
              Total: ~18 minutos. Puedo dejar la app en background.
            </p>
          </div>
          
          <Button variant="primary" size="lg">
            Crear Backup y Continuar
          </Button>
          <Button variant="outline">
            Ver Tutoriales (YouTube)
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
```

---

## 2. Indicadores de Estado Visuales Mejorados

### Problema
Usuario no sabe si app está haciendo algo.

### Solución

```tsx
// StatusBar.tsx - Barra en top de la app
export function StatusBar() {
  return (
    <div className="bg-surface-2 px-4 py-2 flex items-center justify-between">
      
      {/* Juego actual - MUY VISIBLE */}
      <div className="flex items-center gap-3">
        <GameIcon />
        <div>
          <p className="text-sm font-bold">The Witcher 3</p>
          <p className="text-xs text-gray-500">
            7 mods activos | Last played: 2 days ago
          </p>
        </div>
      </div>
      
      {/* Operación en progreso */}
      {isDownloading && (
        <div className="flex items-center gap-3">
          <Spinner />
          <div className="text-sm">
            <p>Descargando: Weapon Pack v3.2</p>
            <ProgressBar value={progress} width="200px" />
            <p className="text-xs">{timeRemaining}</p>
          </div>
        </div>
      )}
      
      {/* Estado de salud */}
      <div className="flex items-center gap-2">
        {hasConflicts && (
          <Badge color="orange">3 conflictos</Badge>
        )}
        {needsUpdate && (
          <Badge color="blue">Actualización disponible</Badge>
        )}
        {isOnline ? (
          <Badge color="green">Online</Badge>
        ) : (
          <Badge color="gray">Offline</Badge>
        )}
      </div>
      
    </div>
  )
}
```

---

## 3. Selector de Juego Mejorado

### Problema
Usuario confunde juegos en menú dropdown.

### Solución

```tsx
// GameSelector.tsx
export function GameSelector() {
  return (
    <div className="fixed left-0 top-20 bottom-0 w-64 bg-surface-1 border-r border-surface-3">
      
      <div className="p-4 space-y-2">
        <p className="text-xs font-bold text-gray-500">JUEGOS INSTALADOS</p>
        
        {games.map(game => (
          <button
            key={game.id}
            onClick={() => selectGame(game.id)}
            className={`w-full text-left p-3 rounded transition-all ${
              selectedGame.id === game.id
                ? 'bg-accent text-accent-foreground ring-2 ring-accent'
                : 'hover:bg-surface-2'
            }`}
          >
            {/* Portada del juego pequeña */}
            <div className="flex gap-2">
              <img 
                src={game.poster} 
                alt={game.name}
                className="w-12 h-18 object-cover rounded"
              />
              <div className="flex-1">
                <p className="font-bold text-sm">{game.name}</p>
                <p className="text-xs text-gray-500">
                  {game.modsCount} mods
                </p>
                {game.hasConflicts && (
                  <Badge size="sm" color="orange">
                    ⚠️ {game.conflictCount} conflictos
                  </Badge>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
      
    </div>
  )
}
```

---

## 4. Confirmación de Acciones Destructivas

### Problema
Usuario borra mod/backup sin querer.

### Solución

```tsx
// DestructiveActionDialog.tsx
export function DestructiveActionDialog({
  action,
  targetName,
  consequences,
  onConfirm,
  onCancel,
}) {
  const [confirmed, setConfirmed] = useState(false)
  
  return (
    <Dialog open>
      <div className="max-w-md space-y-4">
        
        {/* Header alerta roja */}
        <div className="bg-red-500/20 p-4 rounded-lg border border-red-500/50">
          <p className="text-red-500 font-bold text-lg">
            ⚠️ Acción Irreversible
          </p>
        </div>
        
        {/* Qué pasará */}
        <div>
          <p className="font-bold">Vas a {action}</p>
          <code className="bg-surface-2 p-2 rounded text-sm block my-2">
            "{targetName}"
          </code>
        </div>
        
        {/* Consecuencias */}
        <div className="bg-orange-500/20 p-3 rounded">
          <p className="font-bold text-sm mb-2">Esto causará:</p>
          <ul className="space-y-1 text-sm">
            {consequences.map(c => (
              <li key={c} className="flex gap-2">
                <span>❌</span> {c}
              </li>
            ))}
          </ul>
        </div>
        
        {/* Confirmación activa */}
        <div className="space-y-2">
          <p className="text-sm">
            Para confirmar, escribe el nombre del {action}:
          </p>
          <input
            placeholder={targetName}
            onChange={(e) => setConfirmed(e.target.value === targetName)}
            className="w-full border rounded p-2"
          />
          <p className="text-xs text-gray-500">
            (Esto previene clics accidentales)
          </p>
        </div>
        
        {/* Botones */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={!confirmed}
            onClick={onConfirm}
          >
            Sí, {action}
          </Button>
        </div>
        
        {/* Links útiles */}
        <div className="border-t pt-3 space-y-1 text-xs">
          <p>¿No estás seguro?</p>
          <ul>
            <li><a href="#help">[?] ¿Qué es {action}?</a></li>
            <li><a href="#backup">[+] Crear backup primero</a></li>
            <li><a href="#docs">[📖] Documentación</a></li>
          </ul>
        </div>
        
      </div>
    </Dialog>
  )
}
```

---

## 5. Progreso de Backup/Instalación Mejorado

### Problema
Barra de progreso se queda congelada, usuario no sabe qué pasa.

### Solución

```tsx
// OperationProgress.tsx
export function OperationProgress({ operation }) {
  const [details, setDetails] = useState('')
  
  return (
    <Dialog open fullscreen>
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        
        {/* Título */}
        <h1>
          {operation.type === 'backup' && '💾 Creando Copia de Seguridad'}
          {operation.type === 'download' && '⬇️ Descargando'}
          {operation.type === 'install' && '📦 Instalando'}
        </h1>
        
        {/* Progreso general */}
        <div className="space-y-2">
          <ProgressBar 
            value={operation.progress} 
            max={100}
            animated
          />
          <p className="text-sm font-mono">
            {operation.progress}% — {operation.stage}
          </p>
        </div>
        
        {/* Estadísticas */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <p className="text-xs text-gray-500">VELOCIDAD</p>
            <p className="text-lg font-bold">{operation.speed} MB/s</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">TRANSFERIDO</p>
            <p className="text-lg font-bold">
              {operation.transferred} / {operation.total}
            </p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">TIEMPO RESTANTE</p>
            <p className="text-lg font-bold">{operation.eta}</p>
          </Card>
        </div>
        
        {/* Detalles en vivo */}
        <div className="bg-surface-2 rounded p-4 max-h-48 overflow-y-auto font-mono text-xs">
          <p className="text-gray-500">Procesando archivo:</p>
          <p>{operation.currentFile}</p>
          <p className="text-gray-500 mt-2">Actividad reciente:</p>
          {operation.logs.slice(-5).map((log, i) => (
            <p key={i} className="text-gray-600 text-xs">{log}</p>
          ))}
        </div>
        
        {/* Puede minimizar */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => minimize()}>
            [–] Minimizar
          </Button>
          <p className="text-xs text-gray-500">
            Notificación cuando termine
          </p>
        </div>
        
      </div>
    </Dialog>
  )
}
```

---

## 6. Detección Automática de Problemas

### Problema
Usuario no sabe que algo está mal hasta que crashes.

### Solución

```tsx
// HealthCheck.tsx - Ejecuta cada cierto tiempo
export async function performHealthCheck() {
  const checks = [
    // Espacio en disco
    async () => {
      if (availableSpace < RECOMMENDED_BUFFER) {
        notify({
          type: 'warning',
          icon: '💾',
          title: 'Poco espacio en disco',
          description: `Solo ${formatBytes(availableSpace)} libres. 
                        Recomienda ${formatBytes(RECOMMENDED_BUFFER)}.`,
          action: () => showCleanupSuggestions()
        })
      }
    },
    
    // Mods faltantes
    async () => {
      const missing = await validateInstalledMods()
      if (missing.length > 0) {
        notify({
          type: 'warning',
          icon: '❌',
          title: `${missing.length} mods no encontrados`,
          description: 'Click para ver cuáles',
          action: () => showMissingMods(missing)
        })
      }
    },
    
    // Versión de juego cambió
    async () => {
      const version = await getGameVersion()
      if (version !== storedVersion) {
        notify({
          type: 'info',
          icon: '🎮',
          title: 'Juego actualizado',
          description: `${storedVersion} → ${version}. 
                        Mods podrían incompatibles.`,
          action: () => validateModCompatibility()
        })
      }
    },
    
    // Load order quebrado
    async () => {
      const issues = await validateLoadOrder()
      if (issues.length > 0) {
        notify({
          type: 'warning',
          icon: '⚡',
          title: 'Load order potencialmente inválido',
          description: issues.join(', '),
          action: () => suggestValidLoadOrder()
        })
      }
    },
    
    // Antivirus bloqueó algo
    async () => {
      const blocked = await checkAntivirus()
      if (blocked.length > 0) {
        notify({
          type: 'warning',
          icon: '🛡️',
          title: 'Antivirus bloqueó archivos',
          description: `${blocked.length} archivos en cuarentena`,
          action: () => helpRecoverBlocked(blocked)
        })
      }
    }
  ]
  
  for (const check of checks) {
    await check()
  }
}

// Ejecutar cada 1 hora
setInterval(performHealthCheck, 60 * 60 * 1000)
```

---

## 7. Sistema de Backups Mejorado

### Problema
Usuario confundido sobre dónde están backups y cuándo se crean.

### Solución

```tsx
// BackupPanel.tsx
export function BackupPanel({ gameId }) {
  return (
    <div className="space-y-4">
      
      {/* Estado de backup automático */}
      <Card>
        <h3>Protección Automática</h3>
        <ToggleSwitch
          label="Hacer backup antes de instalar mods"
          enabled={autoBackupEnabled}
          onChange={toggleAutoBackup}
        />
        <p className="text-xs text-gray-500">
          Se crea automáticamente cada vez que instalas un mod.
          (Toma ~15 minutos, pero solo se hace UNA VEZ por sesión)
        </p>
      </Card>
      
      {/* Backups existentes */}
      <Card>
        <h3>Tus Backups</h3>
        <p className="text-sm text-gray-500 mb-4">
          Backups guardados: {backups.length}
          <br />
          Espacio usado: {formatBytes(totalBackupSize)}
        </p>
        
        {backups.map(backup => (
          <div key={backup.id} className="border-b pb-3 mb-3 last:border-0">
            
            {/* Identificación clara */}
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold">{backup.name}</p>
                <p className="text-xs text-gray-500">
                  {formatDate(backup.createdAt)} ({backup.age})
                </p>
              </div>
              <p className="text-sm font-mono">
                {formatBytes(backup.size)}
              </p>
            </div>
            
            {/* Qué contenía */}
            <p className="text-xs text-gray-600 mt-1">
              {backup.modsCount} mods, {backup.gameVersion}
            </p>
            
            {/* Acciones */}
            <div className="flex gap-2 mt-2 flex-wrap">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => previewBackup(backup)}
              >
                👁️ Ver contenido
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => renameBackup(backup)}
              >
                ✎ Renombrar
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => deleteBackup(backup)}
              >
                🗑️ Eliminar
              </Button>
            </div>
            
          </div>
        ))}
      </Card>
      
      {/* Crear backup manual */}
      <Card>
        <h3>Backup Manual</h3>
        <p className="text-sm text-gray-500 mb-3">
          Haz un backup en este momento para que no se borre.
        </p>
        <div className="flex gap-2">
          <input
            placeholder="Nombre descriptivo (ej: Antes de Armas v3)"
            className="flex-1 border rounded p-2 text-sm"
            defaultValue={suggestedBackupName}
          />
          <Button onClick={createManualBackup}>
            Crear
          </Button>
        </div>
      </Card>
      
    </div>
  )
}
```

---

## 8. Validación de Espacio en Disco

### Problema
Usuario ve "No espacio disponible" después de haber empezado.

### Solución

```tsx
// SpaceValidator.tsx
export async function validateDiskSpaceBeforeOperation(
  operation: 'install' | 'backup' | 'download',
  size: number
) {
  const available = await getDiskSpace()
  const required = calculateRequired(operation, size)
  
  if (available < required) {
    return showSpaceWarning({
      available,
      required,
      deficit: required - available,
      solutions: [
        {
          title: 'Limpiar archivos grandes',
          action: () => showCleanupWizard(),
          estimate: calculateDeletableSizes()
        },
        {
          title: 'Usar otro disco',
          action: () => showDiskSelector(),
          available: getOtherDrivesSpace()
        },
        {
          title: 'Comprimir backups antiguos',
          action: () => compressOldBackups(),
          savings: calculateCompressionSavings()
        },
        {
          title: 'Continuar sin backup',
          action: () => proceedWithoutBackup(),
          risk: 'RIESGOSO - No recomendado'
        }
      ]
    })
  }
  
  return { canProceed: true }
}
```

---

## 9. Tutorial en Contexto

### Problema
Usuario no entiende conceptos mientras usa app.

### Solución

```tsx
// ContextualTutorial.tsx
export function useContextualHelp() {
  const [hints, setHints] = useState([])
  
  // Mostrar cuando usuario interactúa con elemento confuso
  useEffect(() => {
    document.addEventListener('mouseenter', (e) => {
      const help = getHelpFor(e.target.id)
      if (help) {
        showTooltip({
          title: help.title,
          body: help.description,
          example: help.videoUrl,
          link: help.docUrl
        })
      }
    })
  }, [])
  
  return hints
}

// Ejemplos de ayuda contextual
const CONTEXTUAL_HELP = {
  'load-order-editor': {
    title: 'Load Order (Orden de Carga)',
    description: `Los mods se aplican de arriba a abajo.
                  Algunos dependen de que otros se carguen primero.
                  Prueba el juego después de cambiar este orden.`,
    videoUrl: '/help/load-order.mp4',
    docUrl: '/docs/load-order'
  },
  
  'backup-button': {
    title: '¿Qué es un Backup?',
    description: `Una copia de seguridad completa del juego.
                  Si algo se daña, restauro esto en 2 minutos.
                  RECOMENDADO: Hacer uno antes de instalar mods nuevos.`,
    videoUrl: '/help/what-is-backup.mp4',
    docUrl: '/docs/backup'
  },
  
  'conflict-detector': {
    title: 'Detección de Conflictos',
    description: `Muestro qué mods cambian los mismos archivos.
                  Si dos mods cambian lo mismo = problema.
                  Uno va a "ganar" y sobrescribir al otro.`,
    videoUrl: '/help/conflicts.mp4',
    docUrl: '/docs/conflicts'
  }
}
```

---

## 10. Recuperación de Errores Mejorada

### Problema
Cuando error ocurre, usuario no sabe qué hacer.

### Solución

```tsx
// ErrorRecovery.tsx
export function showRecoveryOptions(error: AppError) {
  const solutions = resolveSolutions(error.code)
  
  return (
    <ErrorDialog>
      <div className="space-y-4">
        
        {/* Qué pasó (claro) */}
        <div>
          <h2 className="text-red-500 font-bold">
            {error.userTitle}
          </h2>
          <p className="text-sm">
            {error.userDescription}
          </p>
        </div>
        
        {/* Soluciones prácticas */}
        {solutions.length > 0 && (
          <div className="space-y-2">
            <p className="font-bold">Prueba esto:</p>
            {solutions.map((solution, i) => (
              <Button
                key={i}
                onClick={solution.action}
                variant="outline"
              >
                {i + 1}. {solution.title}
              </Button>
            ))}
          </div>
        )}
        
        {/* Info técnica (expandible) */}
        <details>
          <summary className="text-xs text-gray-500 cursor-pointer">
            Detalles técnicos (para desarrolladores)
          </summary>
          <pre className="bg-surface-2 p-2 rounded text-xs overflow-auto mt-2">
            {error.technicalMessage}
          </pre>
        </details>
        
        {/* Contacto */}
        <div className="text-xs text-gray-500 border-t pt-3">
          <p>¿Nada funcionó?</p>
          <Button size="sm" variant="outline">
            📧 Reportar Problema
          </Button>
          <Button size="sm" variant="outline">
            📖 Ver Documentación
          </Button>
        </div>
        
      </div>
    </ErrorDialog>
  )
}
```

---

## 11. Animaciones y Feedback Claro

### Problema
Acciones se sienten "instantáneas" o laggy.

### Solución

```tsx
// Feedback mejorado

// ✓ Cuando desactivas un mod
onClick={() => {
  // Optimistic update
  disableMod(modId)
  
  // Feedback inmediato
  addToast({
    type: 'success',
    icon: '✓',
    message: 'Mod desactivado',
    autoClose: 2000
  })
  
  // Animación suave
  animate(modElement, { opacity: 0.7 }, 200)
}}

// ✓ Cuando empieza descarga
onDownloadStart={() => {
  // Cambio visual inmediato
  setIsDownloading(true)
  
  // Barra de progreso aparece
  addProgress({
    id: modId,
    progress: 0,
    animated: true
  })
  
  // Sonido opcional (si habilitado)
  playSound('download-start')
}

// ✓ Cuando falla algo
onError((error) => {
  // Notificación con sound
  notify({
    type: 'error',
    title: error.title,
    sound: true,
    persistent: true, // No se cierra automáticamente
    actions: [
      { label: 'Reintentar', action: retry },
      { label: 'Ayuda', action: showHelp }
    ]
  })
  
  // Vibración si soportado (mobile)
  navigator.vibrate?.(200)
})
```

---

## 12. Tema y Accesibilidad

### Problema
Contraste bajo, texto pequeño, sin modo oscuro en algunas partes.

### Solución

```css
/* Dark mode por defecto, asegura contraste WCAG AA */
:root {
  --text-bright: #FFFFFF;    /* Brightness: 100% */
  --text-normal: #E8E8E8;    /* Brightness: 91% */
  --text-dim: #999999;       /* Brightness: 60% */
  
  /* Verificar contraste */
  --bg-surface: #1A1A1A;     /* Contrast vs text-bright: 21:1 ✓ */
  --accent: #00D4FF;         /* Brightness: 90%, muy visible */
}

/* Texto pequeño siempre >= 12px en mobile */
body {
  font-size: clamp(12px, 2vw, 16px);
  line-height: 1.5;
}

/* Botones fáciles de clickear */
button {
  min-height: 44px;  /* Mobile touch target */
  min-width: 44px;
  padding: 12px 16px;
}

/* Focus visible para navegación con keyboard */
*:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

---

## 13. Notificaciones y Alertas

### Problema
Mensajes confusos o demasiados, usuario ignora.

### Solución

```tsx
// Tipologías claras de notificaciones

// INFO - Azul, no urgente
notify('info', {
  icon: 'ℹ️',
  title: 'Tip',
  message: 'Puedes arrastrar mods para reordenar',
  autoClose: 5000
})

// WARNING - Naranja, requiere atención
notify('warning', {
  icon: '⚠️',
  title: 'Advertencia',
  message: 'Load order cambió, recomienda testear',
  autoClose: false,
  actions: ['Testear Ahora', 'Ignorar']
})

// ERROR - Rojo, acción requerida
notify('error', {
  icon: '❌',
  title: 'Error crítico',
  message: 'Instalación fallida: Espacio insuficiente',
  autoClose: false,
  actions: ['Liberar Espacio', 'Ayuda', 'Reportar'],
  sound: true
})

// SUCCESS - Verde, confirmación
notify('success', {
  icon: '✓',
  title: 'Listo',
  message: 'Mod instalado correctamente',
  autoClose: 2000,
  sound: true
})
```

---

## Prioridad de Implementación

**CRÍTICO (Semana 1):**
- [ ] First mod wizard
- [ ] Game selector mejorado
- [ ] Status bar con indicador de juego
- [ ] Confirmación de acciones destructivas

**IMPORTANTE (Semana 2):**
- [ ] Health check automático
- [ ] Validación de espacio en disco
- [ ] Backups mejorados con nombres claros
- [ ] Mensajes de error contextuales

**NICE (Semana 3+):**
- [ ] Animaciones y feedback visual
- [ ] Tutoriales en contexto
- [ ] Sistema de recovery mejorado
- [ ] Accesibilidad (WCAG AA)

---

## Medidas de Éxito

- **Reducir crashes** por error de usuario: -80%
- **Reducir support tickets** sobre conceptos: -70%
- **Tiempo hasta primera mod instalada**: < 10 minutos
- **User satisfaction**: +2 puntos (escala 1-5)
- **Retention a 30 días**: +15%
