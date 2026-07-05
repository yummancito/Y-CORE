# Scripts de Desarrollo

Scripts para testing manual durante el desarrollo.

| Script | Uso |
|---|---|
| `test_api.ps1` | `.\test_api.ps1` — Testea endpoints de manifests en múltiples APIs |
| `test_depot_keys.sh` | `API_BASE=http://localhost:3000 TEST_EMAIL=x@y.com TEST_PASSWORD=xxx ./test_depot_keys.sh` — Testea depot keys con auth |

Requieren que la API esté corriendo (`pnpm --filter @y-core/api dev`).
