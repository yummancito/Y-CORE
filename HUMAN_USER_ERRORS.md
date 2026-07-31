# Errores Comunes de Usuarios en Y-Core Mod Manager

## Guía de Escenarios Realistas y Protecciones Necesarias

**Documento**: Análisis de errores de usuario humano  
**Versión**: 1.0  
**Fecha**: 2024  
**Idioma**: Español (lenguaje natural de usuarios reales)

---

## Tabla de Contenidos

1. [Errores de Principiantes](#errores-de-principiantes)
2. [Errores de Configuración del Sistema](#errores-de-configuración-del-sistema)
3. [Errores de Flujo de Trabajo](#errores-de-flujo-de-trabajo)
4. [Errores de Comunicación y Comprensión](#errores-de-comunicación-y-comprensión)
5. [Errores de Presunción](#errores-de-presunción)
6. [Errores de Datos y Archivo](#errores-de-datos-y-archivo)
7. [Errores de Tiempo y Recursos](#errores-de-tiempo-y-recursos)
8. [Recomendaciones de Protección](#recomendaciones-de-protección)

---

## Errores de Principiantes

### 1. **Instalar Mod Sin Hacer Backup Primero**

**Escenario Realista:**
- Usuario descubre un mod genial en el catálogo
- Hace clic en "Instalar" sin leer ninguna advertencia
- El mod causa conflicto y rompe el juego
- No tiene forma de volver atrás

**Por qué ocurre:**
- No entiende qué es un backup o para qué sirve
- La app no le advierte explícitamente
- Piensa que "desinstalar" puede revertir cualquier daño

**Mensaje de Error Actual:** (Probablemente ninguno)

**Mensaje Mejorado:**
```
⚠️ IMPORTANTE - Tu primera instalación de mods

Este será tu primer mod instalado en "El Juego X".

¿Qué es un backup?
Un backup es una copia de seguridad completa del juego 
ANTES de instalar mods. Si algo sale mal, puedo restaurar 
el juego a este punto en 2 minutos.

¿Por qué necesitas uno?
- Los mods pueden conflictuar entre sí
- Pueden romper otras cosas del juego
- A veces no se pueden desinstalar completamente

Recomendación: 
✓ Crear backup automático AHORA (toma ~2 min)
✓ Después instalar el mod

[Crear Backup y Continuar] [Instalar Sin Backup] [Más Información]
```

**Protecciones Necesarias:**
- ✓ Modal bloqueante ANTES de primera instalación
- ✓ Explicar qué es un backup en lenguaje simple
- ✓ Hacer backup automático sin esperar confirmación
- ✓ Mostrar progreso visual del backup
- ✓ Guardar confirmación de usuario

---

### 2. **No Esperar a que Termine Descarga Antes de Cerrar App**

**Escenario Realista:**
```
Usuario: "Empecé a descargar un mod de 500MB"
Tiempo: 3 minutos después
Usuario: "Necesito cerrar la app rápido"
[Cierra app sin esperar]
Resultado: Descarga corrupta, mod no se instala
Usuario: "¿Por qué dice que está instalado pero no funciona?"
```

**Por qué ocurre:**
- No hay indicador claro de que está descargando
- No entiende que cerrar = perder el progreso
- Piensa que la descarga continúa en background
- No hay confirmación de cierre si hay descargas activas

**Mensaje de Error Actual:** (Probablemente una excepción silenciosa)

**Mensaje Mejorado:**
```
🔴 NO PUEDES CERRAR AHORA

Descarga en progreso: "Mod de Armas v3.2"
Progreso: ████████░░ 82% (210 MB de 256 MB)
Tiempo estimado: 1 minuto 45 segundos

Si cierras ahora:
❌ La descarga se cancela
❌ El mod quedará corrupto
❌ Tendrás que empezar de nuevo

Por favor espera a que termine.

[Minimizar en lugar de cerrar]
```

**Protecciones Necesarias:**
- ✓ Bloquear cierre si hay descargas activas
- ✓ Mostrar confirmación de cierre con advertencia
- ✓ Permitir minimizar en lugar de cerrar
- ✓ Mostrar barra de progreso visible SIEMPRE
- ✓ Notificación sonora cuando termina
- ✓ Guardar estado para reanudar si falla

---

### 3. **Cambiar Carpeta de Juego Después de Instalar Mods**

**Escenario Realista:**
```
Usuario instala 5 mods en C:\Games\MiJuego\
Semanas después, mueve el juego a D:\Games\MiJuego\
Intenta lanzar el juego... no hay mods
"¿Dónde están mis mods?"
```

**Por qué ocurre:**
- No sabe que la app guarda rutas absolutas
- Piensa que los mods se "guardan" con el juego
- No hay advertencia cuando cambia ruta del juego
- La app no detecta automáticamente la nueva ubicación

**Mensaje de Error Actual:** (Nada, mods desaparecen silenciosamente)

**Mensaje Mejorado - Al Iniciar App:**
```
⚠️ CAMBIO DETECTADO

El juego "The Witcher 3" estaba en:
C:\Games\Witcher3

Pero ahora está en:
D:\Games\Witcher3

Tus 7 mods instalados esperaban en la ubicación anterior.

¿Qué quieres hacer?

[✓] Buscar mods en la nueva ubicación
   (Buscaré en D:\Games\Witcher3\Mods)

[Restaurar] Mover juego de nuevo a C:\
   (Revierte el cambio)

[Remapear] Indicar manualmente dónde están los mods
   (Señalar carpeta específica)

[Más Información]
```

**Protecciones Necesarias:**
- ✓ Detectar cambio de ruta del juego automáticamente
- ✓ Guardar "fingerprint" del juego (archivos clave)
- ✓ Buscar mods en nueva ubicación
- ✓ Permitir remapeo manual
- ✓ NO eliminar referencias silenciosamente
- ✓ Advertencia si mueve mods a ubicación no óptima

---

### 4. **Desinstalar Mod Manualmente Sin Usar la App**

**Escenario Realista:**
```
Usuario ve carpeta "Mods" en el juego
Borra manualmente carpeta de mod: "Mod_Armas_v3"
Vuelve a abrir app: "1 de 5 mods activos"
App cree que mod sigue instalado pero no existe
Intenta activar mod: ERROR
```

**Por qué ocurre:**
- No entiende que la app gestiona mods
- Piensa que borrar carpeta = desinstalar
- No sabe que hay una base de datos con referencias
- Interfaz no es clara sobre dónde viven los mods

**Mensaje de Error Actual:** (Probablemente error de ruta no encontrada)

**Mensaje Mejorado:**
```
⚠️ INCONSISTENCIA DETECTADA

El mod "Mod_Armas_v3" desapareció de tu disco.

Base de datos dice: ✓ Instalado
Carpeta real: ✗ No existe

Esto pasó porque:
• Borraste la carpeta manualmente
• El mod se corrompió
• Se movió a otra ubicación

¿Qué quieres hacer?

[Remover de Registros] Quitar de la app
                       (No afecta nada más)

[Buscar] Dejar que busque si existe en otra parte

[Reinstalar] Descargar e instalar de nuevo

[Más Información]
```

**Protecciones Necesarias:**
- ✓ Validar integridad de mods en startup
- ✓ Detectar archivos faltantes
- ✓ Ofrecer limpiar registros automáticamente
- ✓ Permitir reparación/reinstalación
- ✓ Mostrar advertencia clara: "Solo usa la app para desinstalar"
- ✓ Logs de validación para debugging

---

### 5. **Actualizar Juego Sin Desinstalar Mods**

**Escenario Realista:**
```
Steam: "¡Nueva versión de El Juego disponible!"
Usuario: [Instala actualización]
Llega el servidor de actualización y reemplaza archivos base
Usuario intenta jugar... crash en el menú
"Los mods rompieron el juego con la actualización"
```

**Por qué ocurre:**
- No entiende que mods son frágiles a actualizaciones
- No hay advertencia cuando Steam va a actualizar
- Piensa que mods son "independientes"
- Steam no avisa a la app sobre actualizaciones próximas

**Mensaje de Error Actual - Probable Crash:** 
```
Unhandled Exception: File not found at 0x1234
```

**Mensaje Mejorado - Antes de Actualización:**
```
⚠️ ACTUALIZACIÓN DE JUEGO DETECTADA

Steam va a actualizar "The Witcher 3" 
(v1.31 → v1.32)

IMPORTANTE: Tienes 7 MODS ACTIVOS

Los mods podrían:
• No funcionar después de la actualización
• Causar crashes o errores raros
• Necesitar ser actualizados

¿Qué quieres hacer?

[✓ Desactivar Mods] Desactivar automáticamente
                    (Volver a activar después)

[Desinstalar Mods] Borrar completamente
                   (Reinstalar después si quieres)

[Continuar] Actualizar de todas formas
            (Tu responsabilidad si se rompe)

[Más Información sobre Compatibilidad]
```

**Protecciones Necesarias:**
- ✓ Monitorear versión del juego
- ✓ Detectar cambios en archivo base
- ✓ Alertar antes de activar mods si versión cambió
- ✓ Guardar "versión última conocida"
- ✓ Marcar mods como "potencialmente incompatibles"
- ✓ Sugerir desactivar en lugar de desinstalar
- ✓ Permitir activar nuevamente después
- ✓ Log de errores para reportar incompatibilidades

---

### 6. **Mezclar Mods de Juegos Diferentes**

**Escenario Realista:**
```
Usuario tiene instalados:
- Skyrim con 10 mods
- Fallout 4 con 8 mods

Abre la app, está cansado, ve mod "Armas v3"
Intenta instalar en Skyrim sin darse cuenta
"¿Por qué el mod de Fallout está aquí?"
CRASH: Archivos incompatibles
```

**Por qué ocurre:**
- Interfaz confusa: no clarifica siempre cuál juego
- Usuario fatiga (instaló muchos)
- Mods tienen nombres genéricos
- No hay confirmación visual clara del juego seleccionado

**Mensaje de Error Actual:** (Probablemente crash silencioso)

**Mensaje Mejorado:**
```
┌─────────────────────────────────────────┐
│ 🎮 GAME SELECTOR - MUY IMPORTANTE      │
├─────────────────────────────────────────┤
│                                         │
│ JUEGO SELECCIONADO: ✓ The Witcher 3   │
│                                         │
│ Esta acción afectará SOLO a este juego │
│                                         │
│ Otros juegos instalados:                │
│ • Skyrim (10 mods)                     │
│ • Fallout 4 (8 mods)                   │
│                                         │
│ [Cambiar Juego] [Continuar]            │
│                                         │
└─────────────────────────────────────────┘
```

**Protecciones Necesarias:**
- ✓ Selector de juego SIEMPRE visible
- ✓ Color diferente para cada juego
- ✓ Indicador visual grande del juego actual
- ✓ Confirmación ANTES de instalar en juego diferente
- ✓ Atajos para cambiar juego rápidamente
- ✓ No permitir arrastrar mods entre juegos
- ✓ Validación: "Este mod es para [juego X], ¿continuar?"

---

### 7. **Olvidar Cuál es el Load Order Correcto**

**Escenario Realista:**
```
Usuario: "Tenía 20 mods con un orden específico"
Accidente: Cierra app accidentalmente durante edición
Vuelve: El load order se revirtió/perdió
"¿Cuál era el orden correcto?"
```

**Por qué ocurre:**
- No guardó la orden antes de editar
- Cierre inesperado perdió cambios
- No hay historial de cambios
- No hay sistema de "deshacer"

**Mensaje de Error Actual:** (Probablemente ninguno)

**Mensaje Mejorado:**
```
┌─────────────────────────────────────────┐
│ EDITOR DE ORDEN DE CARGA               │
├─────────────────────────────────────────┤
│                                         │
│ Orden anterior: [Ver Historial]        │
│ • Armas v3                             │
│ • Texturas Altas                       │
│ • Mecánicas de Combate                 │
│                                         │
│ Nuevo orden (arrastrando):             │
│ 1. ▢ Texturas Altas                    │
│ 2. ▢ Armas v3                          │
│ 3. ▢ Mecánicas de Combate              │
│                                         │
│ [↶ Deshacer] [✓ Guardar] [Cancelar]   │
│                                         │
│ Cambios guardados automáticamente cada│
│ 10 segundos. Último cambio: hace 5 seg│
│                                         │
└─────────────────────────────────────────┘
```

**Protecciones Necesarias:**
- ✓ Guardar automáticamente cada 5-10 segundos
- ✓ Historial completo de cambios (últimos 10 estados)
- ✓ Botón "Deshacer" visible
- ✓ Snapshots nombrados ("Orden de Trabajo", "Orden Final")
- ✓ Exportar orden como archivo de texto
- ✓ Importar orden desde archivo guardado
- ✓ Confirmación clara "Cambios guardados" visual

---

### 8. **Instalar 100 Mods de Una Vez**

**Escenario Realista:**
```
Usuario descubre lista de 100 mods recomendados
Hace clic en "Instalar Todos"
La app se va lentisima
Despues de 6 horas: 40% instalados
Crash de la app
¿Qué pasó con el resto?
```

**Por qué ocurre:**
- No hay límite visible de mods
- La app no muestra cuánto durará
- No hay forma de pausar/reanudar
- Sin indicación de cosas yendo mal

**Mensaje de Error Actual:** (Probablemente hang silencioso)

**Mensaje Mejorado - Antes de Instalar:**
```
⚠️ MUCHOS MODS DETECTADOS

Estás a punto de instalar 100 mods.

Estimación de tiempo:
• Descarga: ~8 horas (depende tu velocidad)
• Instalación: ~2 horas
• TOTAL: ~10 horas

Recomendaciones:
1. Instala grupos de 10-15 mods
2. Espera a que terminen
3. Prueba que el juego funciona
4. Repite

¿Por qué? Los mods pueden conflictuar. Si instalas 
muchos y luego falla, es difícil saber cuál fue.

Opciones:

[Instalar Lote 1] Primeros 15 mods
                  (~50 min, fácil de testear)

[Instalar Todo]  Los 100 mods ahora
                 (Puede ser lento/inestable)

[Personalizar]   Elegir cuáles instalar

[Más Información]
```

**Protecciones Necesarias:**
- ✓ Validar cantidad de mods vs recursos disponibles
- ✓ Sugerir límite recomendado (30-50 activos)
- ✓ Ofrecer instalar en lotes
- ✓ Mostrar tiempo estimado realista
- ✓ Permitir pausar/reanudar
- ✓ Guardar progreso de instalación
- ✓ Alertar sobre conflictos potenciales
- ✓ Limpiador de mods rotos/duplicados

---

### 9. **No Leer la Descripción del Mod (Dependencias)**

**Escenario Realista:**
```
Mod "Mecanismo Avanzado v2.1":
Requiere: "Framework Base v3.0"

Usuario: Ve mod genial, lo instala
CRASH: "Framework Base no encontrado"
Usuario: "¿Qué es esto? Yo solo quería el mod."
```

**Por qué ocurre:**
- Descripción es texto largo en lenguaje técnico
- No hay indicador visual de dependencias
- No valida automáticamente
- Usuario no sabe que algunos mods necesitan otros

**Mensaje de Error Actual:**
```
ERROR: Dependency not found: framework_base_v3.0
```

**Mensaje Mejorado - Al Instalar:**
```
┌──────────────────────────────────────────────┐
│ ADVERTENCIA: Este Mod Tiene Requisitos     │
├──────────────────────────────────────────────┤
│                                              │
│ Mod: Mecanismo Avanzado v2.1                │
│                                              │
│ ⚠️ REQUIERE:                                │
│ ├─ Framework Base v3.0 (NO instalado)      │
│ └─ Librerías de Audio (NO instalado)       │
│                                              │
│ ¿Qué significa?                             │
│ Este mod no funcionará sin estos requisitos. │
│                                              │
│ Opciones:                                    │
│                                              │
│ [Instalar Todo] Descargar los 3 mods       │
│                 (Automático, 15 min)       │
│                                              │
│ [Solo Este]    Intentar sin requisitos      │
│               (Probablemente crasheará)    │
│                                              │
│ [Cancelar]     No instalar nada            │
│                                              │
│ [Ver Detalles] Leer descripción completa   │
│                                              │
└──────────────────────────────────────────────┘
```

**Protecciones Necesarias:**
- ✓ Parser de dependencias automático
- ✓ Indicador visual de requisitos (iconos, colores)
- ✓ Detectar dependencias ya instaladas
- ✓ Ofrecer instalar dependencias automáticamente
- ✓ Bloquear instalación si faltan requisitos críticos
- ✓ Resumen visual SIMPLE de dependencias
- ✓ Gráfico: "Este mod → Requiere → Estos otros"

---

### 10. **Aceptar Mods de Fuentes Dudosas**

**Escenario Realista:**
```
Usuario ve link en forum: "Mod SECRETO descargado"
Descarga ZIP de sitio raro
Lo instala sin escanear
La semana siguiente: Su PC es más lento, antivirus alerta
"¿Tenía malware?"
```

**Por qué ocurre:**
- Interfaz permite importar mods de cualquier lugar
- No hay escaneo automático
- Usuario desconoce riesgos de seguridad
- No hay reputación/verificación de fuentes

**Mensaje de Error Actual:** (Ninguno, hasta que se detecta malware después)

**Mensaje Mejorado:**
```
┌──────────────────────────────────────────────┐
│ ⚠️ ADVERTENCIA DE SEGURIDAD IMPORTANTE     │
├──────────────────────────────────────────────┤
│                                              │
│ Quieres importar mod de fuente DESCONOCIDA  │
│                                              │
│ Archivo: mod_secreto_v5.zip                 │
│ Origen: sitio-random.ru                     │
│ Verificado: ✗ NO                            │
│                                              │
│ RIESGOS:                                     │
│ 🦠 Podría contener malware/virus             │
│ 🔓 Podría robar contraseñas o datos         │
│ 💾 Podría ralentizar tu PC                   │
│                                              │
│ RECOMENDACIÓN:                               │
│ • Descarga desde Steam Workshop (100% seguro)
│ • O de sitios verificados: nexusmods.com    │
│                                              │
│ ¿QUIERES CONTINUAR?                         │
│                                              │
│ [No, Cancelar]  (Recomendado)              │
│ [Sí, Continuar] [Escanear Primero]         │
│                                              │
│ Si continúas, escanearé con antivirus       │
│ ANTES de instalar (toma ~2 minutos)         │
│                                              │
└──────────────────────────────────────────────┘
```

**Protecciones Necesarias:**
- ✓ Escaneo automático de malware (VirusTotal API)
- ✓ Advertencia para fuentes no verificadas
- ✓ Lista de fuentes "confiables" (Steam, NexusMods)
- ✓ Notación de riesgo por origen del mod
- ✓ Historial de detecciones de seguridad
- ✓ Opción de reportar mod sospechoso
- ✓ Sandbox mode para testear mods nuevos

---

## Errores de Configuración del Sistema

### 11. **Instalar en Unidad de Red Lenta**

**Escenario Realista:**
```
Usuario: "Instalo en la unidad compartida del trabajo"
La descarga de mods toma 30 MINUTOS
El desempeño es terrible: lag, stuttering
"¿Por qué está tan lento?"
```

**Por qué ocurre:**
- Usuario no entiende latencia de red
- Permite seleccionar cualquier carpeta
- No hay advertencia sobre rendimiento
- App no detecta velocidad de conexión

**Protecciones Necesarias:**
- ✓ Detectar unidades de red y avisar
- ✓ Test de velocidad de escritura
- ✓ Advertencia si velocidad < 5 MB/s
- ✓ Sugerir SSD local en su lugar
- ✓ Mostrar tiempo estimado de descarga
- ✓ Bloquear instalación si es muy lento (opcional)

---

### 12. **Instalar en Unidad USB (Pierde Conexión)**

**Escenario Realista:**
```
Usuario instala mods en USB externo
USB se desconecta (tira accidentalmente el cable)
"El mod desapareció"
"¿Dónde estaba el aviso?"
```

**Por qué ocurre:**
- Permitió seleccionar USB como carpeta de mods
- Sin monitoreo de conexión de dispositivo
- Sin salvaguardas contra desconexión

**Protecciones Necesarias:**
- ✓ Detectar y advertir sobre dispositivos extraíbles
- ✓ Monitorear conexión durante operaciones
- ✓ Pausar si dispositivo se desconecta
- ✓ Mostrar alerta "No desconectes durante instalación"
- ✓ Sugerir instalación en disco interno
- ✓ Guardar estado para reanudar

---

### 13. **No Tener Espacio en Disco para Backup**

**Escenario Realista:**
```
Juego: 80 GB
Usuario: Intenta hacer backup
App necesita: 80 GB de espacio libre
Usuario tiene: 40 GB libres
FALLO: "Espacio insuficiente"
Usuario: "¿Pero acabas de decir que haría backup?"
```

**Por qué ocurre:**
- No valida espacio ANTES de empezar
- Usuario presume que backup toma menos
- Sin indicación clara de requerimiento

**Mensaje de Error Actual:**
```
ERROR: Insufficient disk space
```

**Mensaje Mejorado - ANTES de Backup:**
```
┌──────────────────────────────────────────┐
│ VERIFICACIÓN DE ESPACIO DISPONIBLE      │
├──────────────────────────────────────────┤
│                                          │
│ Juego: The Witcher 3                     │
│ Tamaño del juego: 82 GB                 │
│                                          │
│ Para hacer backup necesito:              │
│ ✓ 82 GB (para la copia de seguridad)    │
│                                          │
│ Espacio disponible en disco:             │
│ ✗ Solo tienes: 35 GB                    │
│ ✗ Necesitas: 47 GB MÁS                  │
│                                          │
│ Soluciones:                              │
│                                          │
│ 1. [Liberar Espacio] Borrar archivos    │
│    (Mostrar carpetas grandes)           │
│                                          │
│ 2. [Otro Disco] Usar unidad diferente   │
│    (Seleccionar D:\ u otra)             │
│                                          │
│ 3. [Sin Backup] Instalar mod sin backup │
│    (RIESGOSO - no recomendado)          │
│                                          │
│ [Más Información]                        │
│                                          │
└──────────────────────────────────────────┘
```

**Protecciones Necesarias:**
- ✓ Verificar espacio ANTES de empezar
- ✓ Cálculo exacto del espacio necesario
- ✓ Opción de usar disco diferente
- ✓ Sugerir ubicaciones alternativas
- ✓ Mostrar archivos grandes para limpiar
- ✓ Permitir compresión del backup
- ✓ Backup incremental (solo cambios)

---

### 14. **Permiso de Lectura-Solo en Carpeta de Juego**

**Escenario Realista:**
```
Admin de empresa: Carpeta de juego con permisos restringidos
Usuario intenta instalar mod
ERROR: "Permiso denegado"
Usuario: "¿Qué significa? Yo sé que el programa está aquí."
```

**Por qué ocurre:**
- Permisos del SO bloquean escritura
- Mensaje de error técnico sin contexto
- Usuario no entiende permisos de archivos

**Mensaje de Error Actual:**
```
ERROR: Access Denied to C:\Games\Game\Mods\
Permission denied at line 234
```

**Mensaje Mejorado:**
```
┌──────────────────────────────────────────┐
│ ❌ NO TENGO PERMISOS PARA ESCRIBIR      │
├──────────────────────────────────────────┤
│                                          │
│ Carpeta de juego: C:\Games\MyGame\      │
│ Problema: La carpeta está protegida     │
│                                          │
│ Causa probable:                          │
│ • Carpeta de "Program Files" (protegida)
│ • Permisos del administrador requeridos │
│ • Antivirus bloqueando acceso           │
│ • Carpeta compartida en red             │
│                                          │
│ Soluciones:                              │
│                                          │
│ [1] Ejecutar Como Administrador         │
│     (Reinicia app con permisos mayores) │
│                                          │
│ [2] Cambiar Carpeta de Juego            │
│     (Mover a D:\ o Desktop)            │
│                                          │
│ [3] Cambiar Permisos                    │
│     (Clic derecho → Propiedades)        │
│                                          │
│ [Ver Tutorial Completo]                 │
│                                          │
└──────────────────────────────────────────┘
```

**Protecciones Necesarias:**
- ✓ Detectar carpeta de Program Files y avisar
- ✓ Verificar permisos de escritura
- ✓ Ofrecer ejecutar como administrador
- ✓ Sugerir cambiar ubicación del juego
- ✓ Intentar cambiar permisos automáticamente
- ✓ Guía paso a paso para resolver

---

### 15. **Antivirus Bloqueando Descarga Silenciosamente**

**Escenario Realista:**
```
Usuario inicia descarga de mod 50 MB
La descarga llega a 100%, pero...
"¿Dónde está el mod? Parece que se instaló."
Resulta que: Antivirus lo puso en cuarentena
Usuario no sabe y mod no aparece
```

**Por qué ocurre:**
- Antivirus no notifica a la app
- Archivo desaparece silenciosamente
- Sin verificación de integridad post-descarga
- Usuario no ve cuarentena del antivirus

**Mensaje de Error Actual:** (Probablemente ninguno)

**Mensaje Mejorado - Después de Descarga:**
```
┌──────────────────────────────────────────┐
│ ⚠️ POSIBLE BLOQUEO DE ANTIVIRUS         │
├──────────────────────────────────────────┤
│                                          │
│ Mod "Textures Pro v2.1" descargado pero │
│ NO se encuentra en la carpeta esperada  │
│                                          │
│ Probablemente bloqueado por:            │
│ • Windows Defender                      │
│ • Antivirus instalado                  │
│ • Software de seguridad                │
│                                          │
│ Qué hacer:                              │
│                                          │
│ 1. Abre tu antivirus                    │
│ 2. Busca "Cuarentena" o "Threats"       │
│ 3. Busca el archivo del mod             │
│ 4. Marca como "Seguro" y restaura       │
│                                          │
│ [Abrir Carpeta de Cuarentena]           │
│ [Reintentar Descarga]                   │
│ [Ver Tutorial Completo]                 │
│                                          │
└──────────────────────────────────────────┘
```

**Protecciones Necesarias:**
- ✓ Verificar existencia de archivo post-descarga
- ✓ Detectar si archivo fue movido/eliminado
- ✓ Buscar en carpeta de cuarentena
- ✓ Notificar sobre posible bloqueo
- ✓ Guía específica por antivirus
- ✓ Whitelist de la app en antivirus
- ✓ Sugerir descargar archivo limpio

---

### 16. **Cortafuegos Bloqueando Steam API**

**Escenario Realista:**
```
Usuario en empresa/universidad con firewall estricto
Abre app: "No puedo buscar mods"
Intenta descargar: timeout
"¿Es problema tuyo o de la app?"
```

**Por qué ocurre:**
- Cortafuegos bloquea conexión a Steam API
- Sin fallback o mensaje claro
- Usuario piensa que es error de la app

**Mensaje de Error Actual:**
```
ERROR: Timeout connecting to steam api
Connection refused
```

**Mensaje Mejorado:**
```
┌──────────────────────────────────────────┐
│ ⚠️ NO PUEDO CONECTAR A STEAM            │
├──────────────────────────────────────────┤
│                                          │
│ Intenté descargar catálogo de mods pero │
│ la conexión fue bloqueada.              │
│                                          │
│ Causa probable:                         │
│ • Cortafuegos del sistema               │
│ • Red corporativa/escuela con bloqueo  │
│ • VPN activa                           │
│ • Problema de conectividad general     │
│                                          │
│ Prueba:                                 │
│                                          │
│ [1] Usa VPN de otro país               │
│     (Si está permitido)                 │
│                                          │
│ [2] Conecta desde otra red             │
│     (Casa, móvil, etc)                 │
│                                          │
│ [3] Contacta al admin de red           │
│     (Si estás en empresa)              │
│                                          │
│ [Modo Offline] Ver mods descargados   │
│                anteriormente             │
│                                          │
│ [Reintentar] Probar conexión de nuevo  │
│                                          │
└──────────────────────────────────────────┘
```

**Protecciones Necesarias:**
- ✓ Detectar pérdida de conexión
- ✓ Verificar conectividad a Steam
- ✓ Modo offline con caché local
- ✓ Sugerir VPN como solución
- ✓ Notificación clara de bloqueo
- ✓ Permitir trabajar con mods descargados

---

## Errores de Flujo de Trabajo

### 17. **Cambiar Load Order Sin Verificar**

**Escenario Realista:**
```
Usuario: Mueve mods aleatoriamente porque "se vería bien"
Sin probar en el juego
Lanza juego: CRASH en los primeros 10 segundos
Usuario: "¿Cuál mod rompió todo?"
```

**Por qué ocurre:**
- No entiende que load order importa
- No hay test automático
- No hay indicación de que cambio requiere verificación

**Protecciones Necesarias:**
- ✓ Mostrar warning: "Cambio detectado, testea antes de jugar"
- ✓ Ofrecer guardar snapshots antes de cambiar
- ✓ Ayuda visual: "Cómo testear que todo funciona"
- ✓ Log de cambios recientes
- ✓ Botón "Revertir a orden anterior"

---

### 18. **Desactivar Mod Crítico Sin Darse Cuenta**

**Escenario Realista:**
```
Usuario tiene 15 mods activos
Desactiva uno pensando que era cosmético
Resulta que era "Framework Base" que otros necesitaban
Otros mods se rompen
"¿Por qué se rompió si solo desactivé UNO?"
```

**Por qué ocurre:**
- No ve que el mod tiene dependencias inversas
- No hay indicador visual de importancia
- Sin validación de dependencias

**Protecciones Necesarias:**
- ✓ Indicador visual de "mod crítico"
- ✓ Mostrar qué depende de este mod
- ✓ Confirmación antes de desactivar mod crítico
- ✓ Sugerir desactivar también los dependientes
- ✓ Graph de dependencias visualizado

---

### 19. **Instalar Mods Incompatibles Juntos**

**Escenario Realista:**
```
Usuario instala:
- "Sistema de Armas Realista v2.0"
- "Armas Arcade Explosivas v1.5"

Estas dos son incompatibles (ambas cambian mismos archivos)
Se instalan pero CRASH al cargar
"¿Por qué se instalaron si son incompatibles?"
```

**Por qué ocurre:**
- No hay validación de compatibilidad
- Usuario desconoce qué mods conflictúan
- Sin indicador de conflictos potenciales

**Protecciones Necesarias:**
- ✓ Análisis de compatibilidad pre-instalación
- ✓ Detectar cambios a mismos archivos
- ✓ Warning: "Estos 2 mods cambian el mismo archivo"
- ✓ Sugerir alternativas o patches
- ✓ Permitir parsear archivos de configuración
- ✓ Community ratings de compatibilidad

---

### 20. **Restaurar Backup Viejo Sin Querer**

**Escenario Realista:**
```
Usuario ve lista de 10 backups
Quiere restaurar el más reciente
Hace clic en el PRIMERO (viejo de hace 3 meses)
3 HORAS después: "Esperaba ver mods nuevos, ¿dónde están?"
```

**Por qué ocurre:**
- Lista confusa de backups
- Sin indicador claro de "cuál es cuál"
- Sin confirmación de fecha/hora

**Protecciones Necesarias:**
- ✓ Ordenar por fecha descendente (nuevos primero)
- ✓ Indicador visual: "Este backup es de hace 3 meses"
- ✓ Preview de qué contenía ese backup
- ✓ Confirmación importante antes de restaurar
- ✓ Mostrar diferencia: "Actual vs Backup"
- ✓ Permitir cambiar nombre de backups ("Antes de mod X")

---

### 21. **Perder Backup Porque No Entiende Retención**

**Escenario Realista:**
```
App guarda: "Mantén últimos 3 backups"
Usuario hace 4 backups
El primero desaparece automáticamente (política de retención)
Usuario: "¿Dónde está mi backup? ¡Lo necesitaba!"
```

**Por qué ocurre:**
- Política automática sin informar
- Usuario no entiende "retención de X días"
- Sin notificación antes de eliminar

**Mensaje de Error Actual:** (Ninguno)

**Mensaje Mejorado:**
```
┌──────────────────────────────────────────┐
│ ⚠️ POLÍTICA DE LIMPIEZA DE BACKUPS     │
├──────────────────────────────────────────┤
│                                          │
│ Tienes 4 backups pero solo guardo 3    │
│                                          │
│ El backup más viejo va a borrarse:      │
│ "Backup_2024_01_15_Antes_Armas_v2"    │
│ Hecho: Hace 45 días                    │
│ Tamaño: 78 GB                          │
│                                          │
│ ¿Por qué?                              │
│ Para ahorrar espacio en disco           │
│ (Política por defecto: mantener 3)     │
│                                          │
│ Opciones:                              │
│                                          │
│ [Mantener Este] Exportar a USB/nube   │
│                 (Liberar espacio luego) │
│                                          │
│ [Borrar Otro]   Seleccionar cuál       │
│                 eliminar manualmente    │
│                                          │
│ [Cambiar Política] Guardar 5 o 10      │
│                     (Necesitarás espacio)│
│                                          │
│ [Ahora No] Dejar como está             │
│                                          │
└──────────────────────────────────────────┘
```

**Protecciones Necesarias:**
- ✓ Notificación ANTES de eliminar backup automático
- ✓ Opción de "Congelador" para backups importantes
- ✓ Exportar backup a archivo para archivarlo
- ✓ Configurar política de retención manualmente
- ✓ Mostrar cuánto espacio ocupan backups
- ✓ Recordatorio de cambiar política si se queda sin espacio

---

### 22. **Instalar Mod Corrupto**

**Escenario Realista:**
```
Usuario descarga mod desde sitio aleatorio
Archivo tiene error (descarga incompleta)
Intenta instalar: "✓ Instalado"
Pero archivos internos están rotos
Juego funciona pero con bugs raros
"¿Es el mod o mi PC?"
```

**Por qué ocurre:**
- Sin validación de integridad del archivo
- ZIP corrupto se extrae parcialmente sin error
- Usuario no sabe diferenciar

**Protecciones Necesarias:**
- ✓ Verificar integridad del ZIP antes de extraer
- ✓ Test de extracción completa
- ✓ Validar archivos esperados después de extraer
- ✓ Checksum de descarga (SHA256)
- ✓ Reintento automático si corrupto
- ✓ Notificación clara: "Archivo corrupto, reintentando"

---

## Errores de Comunicación y Comprensión

### 23. **No Entender "Malware Scan" (Piensa que app Tiene Virus)**

**Escenario Realista:**
```
App: "Escaneo de malware en progreso..."
Usuario: "¿Qué? ¿Yo tengo virus?"
"¿Significa que la app me infectó?"
Cierra app asustado
```

**Por qué ocurre:**
- Lenguaje técnico confunde
- Sin contexto claro
- "Scan" suena a problema grave

**Mensaje Mejorado:**
```
┌──────────────────────────────────────────┐
│ ✓ VERIFICACIÓN DE SEGURIDAD EN CURSO    │
├──────────────────────────────────────────┤
│                                          │
│ Estoy verificando el mod que descargaste│
│ para asegurarme que es seguro.          │
│                                          │
│ Tiempo estimado: 15 segundos            │
│                                          │
│ ¿Qué estoy haciendo?                    │
│ • Verificando firma digital              │
│ • Comparando contra base de datos       │
│ • Analizando código potencialmente peligroso
│                                          │
│ Esto es NORMAL y toma tiempo. No hay   │
│ problema, solo es precaución.           │
│                                          │
│ ████████░░ 80%                          │
│                                          │
│ [Puede cerrar este diálogo]              │
│ [Escaneo ocurrirá en background]        │
│                                          │
└──────────────────────────────────────────┘
```

**Protecciones Necesarias:**
- ✓ Renombrar a "Verificación de Seguridad"
- ✓ Explicar qué se verifica
- ✓ Mostrar que es proceso normal
- ✓ Resultado claro: ✓ "Mod verificado como seguro"
- ✓ No asustar con mensajes técnicos

---

### 24. **No Entender "Load Order" (Ordena Alfabéticamente)**

**Escenario Realista:**
```
Usuario: "Load order no importa, ¿verdad?"
Ordena mods alfabéticamente: "A, B, C, D..."
Falla: Mod C depende de que Mod D se cargue primero
CRASH
"¿Pero estaban en orden!"
```

**Por qué ocurre:**
- Concepto abstracto para usuario no-técnico
- Piensa que "orden" = "organización visual"
- No entiende carga secuencial

**Protecciones Necesarias:**
- ✓ Explicación simple: "Order = orden de aplicación"
- ✓ Animación: Mostrar que se aplica "de arriba a abajo"
- ✓ Warning si detecta orden inválido
- ✓ Auto-sort por dependencias (ofrecer)
- ✓ Tutorial interactivo simple

---

### 25. **Pensar que Backup = Otro Juego Instalado**

**Escenario Realista:**
```
App: "Backup creado: 82 GB"
Usuario: "¿Dónde está? ¿Es otro juego instalado?"
Busca por todo el disco
No lo encuentra (está en carpeta oculta de app)
"¿Desapareció? ¿Dónde está mi backup?"
```

**Por qué ocurre:**
- No entiende que backup está en lugar especial
- Espera ver carpeta de juego duplicada
- Sin indicación de dónde se guarda

**Protecciones Necesarias:**
- ✓ Mostrar ubicación clara del backup
- ✓ Hacer accesible/visible la carpeta
- ✓ Opción de abrir carpeta desde app
- ✓ Estimado de espacio usado
- ✓ Notar si está en disco externo/nube

---

### 26. **Confundir "Deshabilitar" con "Desinstalar"**

**Escenario Realista:**
```
Mod página: "Desactivar (Disable)"
Usuario interpreta: "Desinstalar (Uninstall)"
Hace clic
Luego: "¿Dónde está el mod? ¿Lo borraste?"
```

**Por qué ocurre:**
- Palabras similares en español
- Sin diferenciación visual clara
- Sin explicación de diferencia

**Protecciones Necesarias:**
- ✓ Usar verbos más claros: "Desactivar" vs "Eliminar"
- ✓ Iconos diferentes para cada acción
- ✓ Tooltip: "Desactivar = no usar; Eliminar = borrar"
- ✓ Confirmaciones diferentes
- ✓ En descripción: aclarar diferencia

---

### 27. **No Saber que Mods Requieren Juego en Idioma Específico**

**Escenario Realista:**
```
Mod: "Requiere juego en INGLÉS"
Usuario instala en juego en ESPAÑOL
Mods funcionan pero textos están rotos
"¿Por qué aparecen caracteres raros?"
```

**Por qué ocurre:**
- No lee requisitos completamente
- No entiende implicación de idioma
- Sin validación automática

**Protecciones Necesarias:**
- ✓ Detectar idioma del juego instalado
- ✓ Mostrar requisito: "Juego DEBE estar en inglés"
- ✓ Validar idioma antes de instalar
- ✓ Bloquear si idioma no coincide
- ✓ Guiar: "Cómo cambiar idioma en Steam"

---

### 28. **No Leer Mensajes de Error**

**Escenario Realista:**
```
Mensaje importante: "La descarga fue interrumpida 
debido a pérdida de conexión a internet."

Usuario: Reintenta
Mensaje: Idéntico
Usuario: "¿Está roto? ¡No puedo descargar!"
Realidad: Su wifi está off
```

**Por qué ocurre:**
- Usuarios en prisa no leen
- Mensaje de error es párrafo de texto
- Sin indicación visual de problema

**Protecciones Necesarias:**
- ✓ Título claro en ROJO: "Conexión Perdida"
- ✓ Icono ilustrativo (⚠️, 🌐)
- ✓ Una oración: "¿Está conectado a internet?"
- ✓ Acciones sugeridas: [Reconectar] [Reintentar]
- ✓ Menos párrafos de explicación

---

## Errores de Presunción

### 29. **Presume que App es Como Vortex/Mod Organizer**

**Escenario Realista:**
```
Usuario experto en Vortex:
"¿Dónde está el panel de plugins?"
"¿Cómo creo reglas de conflicto personalizadas?"
"¿Dónde veo el graph de dependencias?"
App: No tiene estas cosas (diseño simplificado)
Usuario: "App está incompleta"
```

**Por qué ocurre:**
- Usuario presume características basadas en otras apps
- No lee diferencias documentadas
- Diferentes filosofías de diseño

**Protecciones Necesarias:**
- ✓ Documentación clara: "Lo que Y-Core NO tiene"
- ✓ Migración guide desde Vortex
- ✓ Comparación de features
- ✓ Explicar por qué ciertas cosas están simplificadas

---

### 30. **Presume que Todos los Mods Funcionan Juntos**

**Escenario Realista:**
```
Usuario: "Veo 50 mods populares, los instalo todos"
Resultado: CRASH on start 80% de las veces
Usuario: "¿Está roto tu gestor?"
Realidad: Tres mods conflictúan y nadie lo notó
```

**Por qué ocurre:**
- Usuario desconoce el concepto de compatibilidad
- Presume que "popular" = "funciona con todo"
- Sin validación comunitaria visible

**Protecciones Necesarias:**
- ✓ Rating de compatibilidad entre mods
- ✓ "Packs" verificados de mods que funcionan juntos
- ✓ Advertencia: "Instalar muchos mods riesgoso"
- ✓ Comunidad tagging: "✓ Funciona con Mod X"
- ✓ Inicio gradual recomendado

---

### 31. **Presume que Backup Toma Segundos**

**Escenario Realista:**
```
Juego: 120 GB
Usuario: Hace clic en "Backup"
Espera 5 segundos: "¿Terminó?"
Intenta instalar mod: "Error: Backup aún en progreso"
Usuario: "¿Es muy lento tu app?"
```

**Por qué ocurre:**
- Usuario no entiende qué es un backup
- Presume es like "guardar" (instant)
- Sin indicación clara de tiempo

**Protecciones Necesarias:**
- ✓ Mostrar tiempo estimado ANTES
- ✓ Explicar: "Backup de 120 GB toma ~15 minutos"
- ✓ Barra de progreso visible siempre
- ✓ Permitir usar app mientras se hace backup
- ✓ Notificación sonora cuando termina

---

### 32. **Presume que Puede Cambiar Juego y Mods Siguen**

**Escenario Realista:**
```
Usuario:
- Instaló mods en Skyrim
- Cambia a Fallout 4
- "¿Dónde están mis mods?"
"¿Me los borraste?"
Realidad: Mods son juego-específicos
```

**Por qué ocurre:**
- No entiende que mods son por-juego
- Interfaz no clarifica esto bien
- Presunción lógica (pero incorrecta)

**Protecciones Necesarias:**
- ✓ Muy visible: "Esto es para [JUEGO X]"
- ✓ Advertencia al cambiar juego
- ✓ No mostrar mods de otro juego en lista
- ✓ Explicar: "Cada juego tiene sus mods"

---

### 33. **Presume que App es Igual en Mac/Windows/Linux**

**Escenario Realista:**
```
Usuario Windows: "Funcionó bien"
Usuario Mac: Abre app, interfaz diferente
"¿Por qué está todo en distinto lugar?"
Espera: Paths son diferentes
"¿Por qué busca en Applications?"
```

**Por qué ocurre:**
- Diferentes rutas de archivos por SO
- Interfaz puede adaptar por disponibilidad
- Sin documentación de diferencias

**Protecciones Necesarias:**
- ✓ Documentación por SO
- ✓ Tutorial específico: "Cómo instalar en Mac"
- ✓ Detectar SO y mostrar rutas relevantes
- ✓ Cambiar rutas según idioma/SO

---

## Errores de Datos y Archivo

### 34. **Copia Mod a Carpeta Manualmente (Duplicado)**

**Escenario Realista:**
```
Usuario ve carpeta "Mods"
Copia manualmente archivo ZIP a la carpeta
Abre app: El mod aparece dos veces
O: No aparece porque app no sabe de la copia
Usuario: "Está duplicado/perdido"
```

**Por qué ocurre:**
- Carpeta es accesible por explorador
- Usuario presume que copiar = instalar
- App no monitorea cambios externos

**Protecciones Necesarias:**
- ✓ Monitorear cambios en carpeta de mods
- ✓ Detectar archivos añadidos externamente
- ✓ Importarlos automáticamente
- ✓ Advertencia: "No copies archivos manualmente"
- ✓ Validar duplicados en base de datos

---

### 35. **Borra Archivo de Backup Accidentalmente**

**Escenario Realista:**
```
Usuario limpia "archivos viejos"
Ve carpeta "mod-backups-2024-01-15"
"Esto se ve viejo, lo borro"
[Elimina]
Más tarde: "Necesito ese backup"
"¿Dónde está?"
```

**Por qué ocurre:**
- Carpeta de backup tiene nombre vago
- Accesible al explorador de archivos
- Sin protección contra borrado

**Protecciones Necesarias:**
- ✓ Nombrar claros: "BACKUP_DO_NOT_DELETE_Game_Date"
- ✓ Esconder en carpeta dot (Linux/.hidden en Windows)
- ✓ Protección contra borrado accidental
- ✓ Papelera: Recuperable si se borra
- ✓ Advertencia al intentar borrar

---

### 36. **Comparte Backup entre Dos Usuarios (Conflicto)**

**Escenario Realista:**
```
Usuario A: Hace backup en D:\Shared\Backup
Usuario B: Accede a la carpeta desde su PC
Intenta restaurar el mismo backup
CONFLICTO: Dos escrituras simultáneas
Datos corruptos
```

**Por qué ocurre:**
- Backup en ubicación compartida
- Sin sistema de bloqueo
- Ambos intentan usar simultáneamente

**Protecciones Necesarias:**
- ✓ Archivo de lock (.backup.lock)
- ✓ Detectar uso simultáneo
- ✓ Bloquear segunda instancia
- ✓ Advertencia: "Backup siendo usado por otro usuario"
- ✓ Sugerir copiar backup localmente

---

### 37. **Intenta Restaurar Backup de Juego Diferente**

**Escenario Realista:**
```
Carpeta: mod-backups/
Backups de Skyrim y Fallout 4 mezclados
Usuario ve "backup_2024_01_15"
¿De cuál juego era?
Restaura en Fallout 4
Resultado: Archivos de Skyrim se aplicaron
CRASH total
```

**Por qué ocurre:**
- Backups no claramente etiquetados por juego
- Interfaz no muestra qué backup es para qué
- Sin validación pre-restore

**Protecciones Necesarias:**
- ✓ Metadatos: Qué juego es este backup
- ✓ Validar juego antes de restaurar
- ✓ Bloquear si backup es de juego diferente
- ✓ Mostrar "Este es backup de [JUEGO X]"
- ✓ Nombrar backups con juego: "Skyrim_2024_01_15"

---

### 38. **Pierde Contraseña de Steam (No Puede Redescargar)**

**Escenario Realista:**
```
Usuario: Pierde acceso a cuenta Steam
No puede descargar mods nuevamente
Intenta en otra PC: Sin mods
Backup está corrupto
"Perdí todo mis mods, ¿no hay copia?"
```

**Por qué ocurre:**
- Dependencia única en Steam
- Sin opción de backup offline
- Mods ligados a cuenta

**Protecciones Necesarias:**
- ✓ Exportar mod list JSON
- ✓ Permitir "backup portátil" sin login
- ✓ Instrucciones: Cómo recuperar si pierdes acceso
- ✓ Guardar referencia a todas las descargas
- ✓ Ofercer mirror/fallback de descargas

---

## Errores de Tiempo y Recursos

### 39. **Cierra App Durante Backup**

**Escenario Realista:**
```
Usuario: Inicia backup (será rápido con hardlinks, 2 minutos)
Espera 1 minuto: "¿Esto cuánto toma?"
Cierra app
Backup queda a medio hacer
Estado: ¿Corrupto?
```

**Por qué ocurre:**
- Usuario impaciente
- Sin indicación clara de progreso
- Sin bloqueo de cierre

**Protecciones Necesarias:**
- ✓ Bloquear cierre si operación en progreso
- ✓ Mostrar progreso realista
- ✓ Permitir minimizar en lugar de cerrar
- ✓ Guardar estado para reanudar
- ✓ Notificación cuando termina

---

### 40. **Desconecta Internet Durante Descarga**

**Escenario Realista:**
```
Descargando mod 250 MB
Conexión cae (router se reinicia)
Descarga: Interrupted en 50%
Usuario: "¿Puedo reanudar de donde paré?"
App: Comienza de nuevo desde 0%
```

**Por qué ocurre:**
- Sin soporte para reanudación
- Sin caché parcial
- Archivo incompleto se descarta

**Protecciones Necesarias:**
- ✓ Guardar descarga parcial
- ✓ Headers HTTP para "resume"
- ✓ Detectar desconexión
- ✓ Reanudar automáticamente
- ✓ Mostrar: "Reanudando desde 50%"

---

### 41. **Apaga PC Durante Instalación**

**Escenario Realista:**
```
Instalando 20 GB de mod
Usuario: Se va de casa
(PC se apaga o pierde poder)
Vuelve: Mod a medio instalar
App: "¿Está en progreso? ¿Está corrupto?"
```

**Por qué ocurre:**
- Sin indicación de que no cerrar
- Sin guard rails
- Sin recuperación tras crash

**Protecciones Necesarias:**
- ✓ Bloquear apagado si instalación en progreso
- ✓ Detectar crash/apagado inesperado
- ✓ Verificar integridad post-crash
- ✓ Limpiar archivos incompletos
- ✓ Ofrecer reintento automático

---

### 42. **Reinicia Durante Transacción**

**Escenario Realista:**
```
Actualizando load order (10 mods)
A mitad: Usuario reinicia Windows
Base de datos: ¿Guardó los cambios?
Resultado: Load order inconsistente o perdido
```

**Por qué ocurre:**
- Sin transacciones atómicas
- Sin sincronización antes de reinicio
- Sin WAL (Write-Ahead Logging)

**Protecciones Necesarias:**
- ✓ Transacciones ACID en base de datos
- ✓ WAL para recuperación
- ✓ Checkpoint antes de cambios importantes
- ✓ Validar integridad en startup
- ✓ Rollback automático si inconsistencia

---

### 43. **Actualiza Sistema Mientras App Está Corriendo**

**Escenario Realista:**
```
Windows Update inicia
PC se reinicia
App estaba:
- Creando backup
- Descargando mod
- Sincronizando base de datos
Resultado: Estado inconsistente
```

**Por qué ocurre:**
- Sin manejo de signals de shutdown
- Recursos no liberados
- Datos no flushed

**Protecciones Necesarias:**
- ✓ Escuchar eventos de shutdown
- ✓ Pausar operaciones largas
- ✓ Flush todos los datos a disco
- ✓ Cerrar conexiones de BD
- ✓ Mostrar "Sistema apagándose, esperando..."
- ✓ Timeout de gracia antes de matar

---

### 44. **Instalación Muy Lenta (No Sabe si Progresa)**

**Escenario Realista:**
```
Instalando mod grande
La barra de progreso se queda en 40% por 5 minutos
Usuario: "¿Se quedó colgado? ¿Sigo o cancelo?"
Realidad: Estaba escribiendo a disco lentamente
```

**Por qué ocurre:**
- Falta indicador de actividad
- UI se actualiza "bloqueada"
- Sin "heartbeat" de progreso

**Protecciones Necesarias:**
- ✓ Actualizar progreso cada 100-500ms
- ✓ Indicador de "aún escribiendo"
- ✓ Log en tiempo real de qué archivo
- ✓ Velocidad actual (MB/s)
- ✓ Tiempo restante estimado
- ✓ Spinner si actividad pero sin progreso medible

---

### 45. **Usuario Cierra Ventana Modal por Error**

**Escenario Realista:**
```
Modal: "Confirma restauración de backup"
Botones: [Restaurar] [Cancelar]
Usuario: Hace clic fuera del modal
Modal cierra sin confirmar
Usuario: "¿Se restauró?"
No se restauró, usuario confundido
```

**Por qué ocurre:**
- Modal permite cerrar by clicking outside
- Sin indicación clara de que debe decidir
- Ambiguo si fue aceptado o rechazado

**Protecciones Necesarias:**
- ✓ Modal bloqueante (no cerrar al hacer click outside)
- ✓ Forzar decisión: Click en botón
- ✓ X solo en modales informativos
- ✓ Confirmación visual después: "Se restauró" o "Cancelado"

---

## Recomendaciones de Protección

### A. Mejoras de Interfaz Críticas

```
1. INDICADORES CONSTANTES
   ├─ Juego seleccionado (grande, color)
   ├─ Estado de operación (descargando, backup, etc)
   ├─ Barra de progreso visible SIEMPRE si hay operación
   └─ Tiempo estimado realista

2. CONFIRMACIONES ANTES DE ACCIONES PELIGROSAS
   ├─ Desinstalar mod
   ├─ Cambiar load order
   ├─ Restaurar backup
   └─ Borrar archivos

3. EXPLICACIONES EN LENGUAJE SIMPLE
   ├─ Evitar jerga técnica
   ├─ Usar emojis/iconos
   ├─ Párrafos cortos
   └─ Ejemplos concretos

4. PREVENCIÓN DE ERRORES
   ├─ Validar entrada temprano
   ├─ Sugerir acciones antes de error
   ├─ Bloquear acciones peligrosas
   └─ Guiar al usuario correcto
```

### B. Mensajes de Error Mejorados

**Estructura Recomendada:**

```
┌─ Título Claro (1 línea)
├─ Icono/Color de severidad
├─ Explicación Simple (2-3 líneas)
├─ Por qué pasó
├─ Acciones Recomendadas [Botones]
├─ Cosas Técnicas [Opcional: expandible]
└─ Link a Documentación
```

**Ejemplos:**

❌ **MAL:**
```
ERROR: ENOENT: no such file or directory, open 
'C:\Users\...\Mods\mod_x\manifest.json' at 
Object.openSync (fs.js:476:48)
```

✓ **BIEN:**
```
⚠️ MOD NO ENCONTRADO

El mod "Weapon Pack v2" desapareció del disco.

Probablemente porque:
• Lo borraste manualmente
• Se movió a otra carpeta
• El disco falló

Opciones:
[Reinstalar] [Remover de lista] [Buscar]
```

### C. Protecciones en Código

```typescript
// 1. Validación temprana
if (!hasEnoughSpace(backupSize)) {
  showNotificationBeforeAction()
  return
}

// 2. Transacciones atómicas
withTransaction(async () => {
  await updateDatabase()
  await syncFiles()
})

// 3. Cleanup automático
onError(() => {
  deletePartialFiles()
  rollbackDatabase()
  notifyUser()
})

// 4. Monitoreo de salud
setInterval(() => {
  validateBackupIntegrity()
  checkDiskSpace()
  verifyInstalledMods()
})
```

### D. Tutoriales y Documentación

**Videos necesarios:**
- Qué es un backup y por qué lo necesitas
- Cómo instalar tu primer mod seguramente
- Cómo detectar y resolver conflictos
- Cómo cambiar load order correctamente
- Recuperación de errores comunes

**Guías escritas:**
- Requisitos de sistema
- Instalación en cada SO
- Migración desde Vortex
- Troubleshooting por síntoma
- Compatibilidad entre mods

**En-app hints:**
- Tooltip en elementos confusos
- Links a documentación relevante
- Mini-tutoriales en primer uso
- Contextual help basado en error

---

## Conclusión

El Y-Core Mod Manager es poderoso pero necesita protecciones adicionales contra errores de usuario. Las recomendaciones anteriores abordan:

1. **Prevención**: Evitar errores antes de que ocurran
2. **Detección**: Identificar cuando algo sale mal
3. **Recuperación**: Permitir que usuarios se recuperen
4. **Comunicación**: Mensajes claros en español natural

Prioridad de implementación:

**CRÍTICO (Implementar YA):**
- Confirmaciones antes de acciones destructivas
- Mensajes de error más claros
- Validación de espacio en disco
- Bloqueo de cierre durante operaciones

**IMPORTANTE (Próxima versión):**
- Detección de cambios en juego
- Historial de cambios (deshacer)
- Guías en-app para conceptos
- Escaneo de integridad en startup

**NICE-TO-HAVE (Futuro):**
- Video tutoriales
- Recomendaciones basadas en IA
- Pack verificados de mods
- Modo principiante/experto

Este documento debería actualizarse conforme se reciban reportes reales de usuarios.
