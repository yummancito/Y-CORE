# Tests

## Tests Automatizados

### Unit Tests (Vitest)

```bash
pnpm test          # Ejecutar todos
pnpm test:watch    # Modo watch
```

| Archivo | Tests | Descripción |
|---|---|---|
| `onlinefix-compatibility.test.ts` | 17 | Compatibilidad de juegos con Online Fix (compatible, incompatible, unknown, razones) |
| `acf-launch-options.test.ts` | 18 | Lectura/escritura de LaunchOptions en archivos ACF, flujo enable/disable Online Fix, validación de AppIDs |
| `game-install-flow.test.ts` | 46 | Parser de Lua scripts, validación de depot keys, construcción de ACF, inyección en config.vdf, flujo completo de instalación |
| `game-scenarios.test.ts` | 41 | 7 escenarios por tipo de juego: normal encriptado, F2P, GoldSrc mod, DLCs, carpeta importada, Online Fix, edge cases |

**Total: 122 tests unitarios**

### DLL Smoke Test

```bash
pnpm test:dll
```

Verifica que las DLLs compiladas en `native/opensteamtool/` sean válidas:
- Las 3 DLLs existen (YCoreTool.dll, dwmapi.dll, xinput1_4.dll)
- Son archivos PE válidos
- Son de 64-bit (x64)
- No queda OpenSteamTool.dll anterior
- Tamaños mínimos correctos

**11 checks**

### Test E2E Manual

Ver `MANUAL_TEST_CHECKLIST.md` para el checklist completo de pruebas manuales con Steam real.

### Regresión rápida

```bash
pnpm test && pnpm test:dll
```
