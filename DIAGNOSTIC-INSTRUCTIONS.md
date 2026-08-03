# 🔍 Y-CORE Remote PC Diagnostic

## Instrucciones para analizar el problema en otra PC

### **¿Por qué?**
Si en tu PC los juegos muestran "Comprar" en vez de "Jugar" en Steam, este script analizará a fondo qué está fallando.

---

## 📋 **Opción 1: Ejecutar desde archivo .bat (RECOMENDADO)**

### Paso 1: Descargar archivos
Descarga estos 2 archivos del repositorio:
- `run-diagnosis.bat` 
- `diagnose-remote-pc.ps1`

O descarga el ZIP completo y extrae estos archivos.

### Paso 2: Ejecutar el análisis
1. **Abre una ventana de Command Prompt (cmd)** como administrador:
   - Click derecho en el ícono de Windows
   - Escribe `cmd`
   - Click derecho en "Command Prompt"
   - "Ejecutar como administrador"

2. **Navega a la carpeta donde descargaste los archivos:**
   ```cmd
   cd C:\ruta\a\la\carpeta
   ```

3. **Ejecuta el diagnóstico:**
   ```cmd
   run-diagnosis.bat
   ```

4. Se abrirá automáticamente un archivo de texto con los resultados

---

## 📋 **Opción 2: Ejecutar PowerShell directamente**

Si prefieres hacerlo directamente sin el .bat:

### Paso 1: Abre PowerShell como administrador
- Click derecho en el ícono de Windows
- Escribe `powershell`
- Click derecho en "Windows PowerShell"
- "Ejecutar como administrador"

### Paso 2: Ejecuta el script
```powershell
powershell -ExecutionPolicy Bypass -File C:\ruta\a\diagnose-remote-pc.ps1
```

O si estás en la misma carpeta:
```powershell
.\diagnose-remote-pc.ps1
```

---

## 📊 **¿Qué analiza?**

El script verifica:

✅ **Sistema**
- Windows version, CPU, RAM, espacio en disco

✅ **Steam**
- Dónde está instalado
- Procesos corriendo
- Configuración (config.vdf)
- Bibliotecas de juegos

✅ **Y-core**
- Dónde está instalado
- Versión
- DLLs incluidas

✅ **Hook Steam (LO IMPORTANTE)**
- ¿YCoreTool.dll está en Steam folder?
- ¿dwmapi.dll está en Steam folder?
- ¿xinput1_4.dll está en Steam folder?
- ¿hook_consent.txt existe? (permisos dados)

✅ **Antivirus**
- Windows Defender status
- ¿Hay algo en cuarentena?

✅ **Permisos**
- ¿Puedes escribir en Steam folder?

✅ **Logs**
- Últimas 100 líneas del log de Y-core

---

## 📁 **Dónde se guardan los resultados**

El archivo se guarda en:
```
C:\Users\[TU_USUARIO]\AppData\Local\Temp\ycore-diagnosis-YYYYMMDD-HHMMSS.txt
```

**O simplemente mira el título de la ventana del Notepad que se abre** — te dice la ruta exacta.

---

## 📤 **Compartir resultados**

1. **Copia TODO el contenido del archivo de resultados**
2. **Comparte con el equipo de Y-core:**
   - Discord: https://discord.gg/Z2CzV884zE
   - GitHub Issues: https://github.com/yummancito/Y-CORE/issues
   - O al desarrollador directamente

---

## ⚠️ **Si algo sale mal**

### Error: "PowerShell no encontrado"
- Windows 10/11 trae PowerShell instalado
- Si no funciona, intenta ejecutar desde PowerShell moderno:
  - Presiona Windows + X
  - Selecciona "Terminal Windows"
  - Pega el comando

### Error: "No se pudo descargar el script"
- Descarga `diagnose-remote-pc.ps1` manualmente desde GitHub
- Colócalo en la misma carpeta que `run-diagnosis.bat`
- Ejecuta de nuevo

### Error: "Acceso denegado"
- Asegúrate de ejecutar **como administrador**
- Algunos antivirus pueden bloquear scripts PowerShell

---

## 🎯 **Qué buscar en los resultados**

Si ves esto, el problema probablemente sea:

### ❌ "Hook DLL (YCoreTool.dll) NO está instalado"
→ **El hook nunca se instaló en Steam folder**
Solución:
1. Abre Y-core
2. Ve a Configuración → Steam
3. Haz click en "Verificar" (o "Repair")
4. Espera a que termine
5. Reinicia Steam

### ❌ "Usuario NO dio consentimiento"
→ **Nunca autorizaste instalar el hook**
Solución:
1. Cierra Steam completamente
2. Abre Y-core
3. Ve a Configuración → Steam → Verificar
4. Haz click en "Instalar y reiniciar Steam"
5. Espera

### ⚠️ "CUARENTENADO: YCoreTool.dll"
→ **Windows Defender bloqueó la DLL**
Solución:
1. Abre Windows Defender
2. Ve a Historial de protección
3. Busca "YCoreTool"
4. Click en "Restaurar"
5. Reinicia Y-core

### ⚠️ "Usuario actual NO PUEDE escribir en Steam folder"
→ **Problema de permisos**
Solución:
1. Cierra Steam
2. Click derecho en C:\Program Files (x86)\Steam
3. Propiedades → Seguridad
4. Editar → Selecciona tu usuario
5. Marca "Control Total" → Aplicar
6. Aceptar todo
7. Reinicia

---

## 🚀 **Después del diagnóstico**

Una vez que compartiste los resultados:

1. El equipo de Y-core analizará qué está fallando
2. Te dirá exactamente qué hacer para arreglarlo
3. Puede ser:
   - Reinstalar Y-core
   - Permitir DLLs en Defender
   - Arreglar permisos de Steam
   - Actualizar Windows

---

## ❓ **Preguntas frecuentes**

**P: ¿Es seguro ejecutar este script?**
R: Sí, solo LEE información. No modifica nada.

**P: ¿Necesito ser administrador?**
R: Sí, para acceder a ciertos datos de Defender y permisos.

**P: ¿Tarda mucho?**
R: 10-30 segundos normalmente.

**P: ¿Puedo ejecutarlo varias veces?**
R: Sí, sin problemas. Cada vez se crea un archivo nuevo con timestamp.

---

**¿Necesitas ayuda? Discord: https://discord.gg/Z2CzV884zE**
