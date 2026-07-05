# Shared Package

Tipos y utilidades compartidas entre la API, el worker y el frontend de Electron.

## Contenido

- `src/index.ts` — Definiciones de tipos TypeScript compartidos:
  - Tipos de juegos (GameData, StoreGameData)
  - Tipos de depot keys y manifests
  - Tipos de respuestas de API
  - Constantes compartidas

## Uso

```typescript
import { type StoreGameData, type DepotKey } from '@y-core/shared'
```
