# Guía Completa: Compilar v4.3.21 Correctamente

## Problema Actual
El instalador NSIS generado es solo 1.3 MB (stub incompleto). Debería ser 400+ MB con todo el código.

## Diagnóstico

### 1. Verificar que `dist-electron` existe y tiene archivos
```powershell
Get-ChildItem "C:\Users\User Unkown\Desktop\proyectos\Y-CORE\dist-electron" -Recurse | Measure-Object
# Debe mostrar cientos de archivos, no vacío
```

### 2. Verificar que `dist` existe (frontend compilado)
```powershell
Get-ChildItem "C:\Users\User Unkown\Desktop\proyectos\Y-CORE\dist" -Recurse | Measure-Object
# Debe mostrar archivos .js, .css, .html
```

### 3. Verificar node_modules
```powershell
Get-ChildItem "C:\Users\User Unkown\Desktop\proyectos\Y-CORE\node_modules" | Measure-Object
# Debe tener miles de paquetes
```

## Pasos Correctos

### PASO 1: Limpiar todo
```powershell
cd "C:\Users\User Unkown\Desktop\proyectos\Y-CORE"
pnpm run clean
Remove-Item -Recurse -Force release -ErrorAction SilentlyContinue
```

### PASO 2: Instalar dependencias
```powershell
pnpm install
```

### PASO 3: Compilar TypeScript + Vite + Electron
```powershell
pnpm run build
```

**Verificar:**
- `dist/` debe existir (frontend)
- `dist-electron/` debe existir (electron principal/renderer)

### PASO 4: Compilar DLLs nativas
```powershell
pnpm run build:native
```

### PASO 5: Crear instalador
```powershell
pnpm run dist
```

**Verificar:**
- `release/Y-core-Setup-4.3.21.exe` debe tener 400+ MB

## Si Falla

### Si el .exe sigue siendo 1.3 MB:

**Problema:** electron-builder solo está empaquetando el esqueleto, sin archivos reales.

**Solución:**
1. Verificar `package.json` section `"build"` → `"files"`
2. Verificar que NO hay un `.asar` que esté siendo usado
3. Verificar que `asarUnpack` está correctamente configurado

```json
"files": [
  "dist/**/*",
  "dist-electron/**/*",
  "native/**/*",
  "build/**/*",
  "public/logo.ico",
  "public/logo.svg",
  "package.json",
  "node_modules/**/*"
],
"asarUnpack": [
  "**/*.node",
  "**/*.dll",
  "**/node_modules/koffi/**",
  "**/node_modules/@koromix/**",
  "**/node_modules/7zip-bin/**",
  "electron/dll/**",
  "native/opensteamtool/**"
]
```

### Si node_modules falta:

```powershell
pnpm install --force
pnpm install --shamefully-hoist
```

### Si dist o dist-electron faltan:

```powershell
pnpm run build
# Si falla, revisar errores de TypeScript/Vite
```

## Debugging

### Ver qué archivos incluye electron-builder:
```powershell
pnpm run dist -- --debug 2>&1 | tail -200
```

### Ver tamaño de carpetas:
```powershell
# Frontend
(Get-ChildItem "C:\Users\User Unkown\Desktop\proyectos\Y-CORE\dist" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB

# Electron
(Get-ChildItem "C:\Users\User Unkown\Desktop\proyectos\Y-CORE\dist-electron" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB

# Node modules
(Get-ChildItem "C:\Users\User Unkown\Desktop\proyectos\Y-CORE\node_modules" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
```

## Flujo Automático Recomendado

```powershell
# SCRIPT COMPLETO
cd "C:\Users\User Unkown\Desktop\proyectos\Y-CORE"

# Limpiar
Write-Host "=== LIMPIAR ===" -ForegroundColor Cyan
pnpm run clean
Remove-Item -Recurse -Force release -ErrorAction SilentlyContinue

# Instalar
Write-Host "=== INSTALAR DEPENDENCIAS ===" -ForegroundColor Cyan
pnpm install --shamefully-hoist

# Compilar código
Write-Host "=== COMPILAR CÓDIGO ===" -ForegroundColor Cyan
pnpm run build

# Verificar compilación
Write-Host "=== VERIFICAR ===" -ForegroundColor Cyan
$distSize = (Get-ChildItem dist -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$electronSize = (Get-ChildItem dist-electron -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "dist: ${distSize}MB, dist-electron: ${electronSize}MB"

# Compilar DLLs
Write-Host "=== COMPILAR DLLs ===" -ForegroundColor Cyan
pnpm run build:native

# Crear instalador
Write-Host "=== CREAR INSTALADOR ===" -ForegroundColor Cyan
pnpm run dist

# Verificar resultado
Write-Host "=== RESULTADO ===" -ForegroundColor Green
Get-ChildItem release -File | Select-Object Name, @{N="Size(MB)";E={[Math]::Round($_.Length/1MB,2)}}
```

## Checklist Final

- [ ] `dist/` existe y tiene 50+ MB
- [ ] `dist-electron/` existe y tiene 20+ MB
- [ ] `node_modules/` tiene 1000+ carpetas
- [ ] `release/Y-core-Setup-4.3.21.exe` tiene 400+ MB
- [ ] `release/latest.yml` existe
- [ ] Hash SHA512 calculado correctamente
- [ ] GitHub release creada con ambos archivos

## Próximos Pasos

Una vez que tengas el .exe de 400+ MB:

1. Calcula el hash SHA512
2. Crea `latest.yml` con el hash correcto
3. Sube a GitHub release
4. Cierra v4.3.19 para auto-actualizar a v4.3.21
