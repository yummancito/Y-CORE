# Imágenes de DepotBox / Supabase

## Estado actual

Las imágenes de juegos en la Store se resuelven de forma simple y directa:

- **Juegos DepotBox**: se cargan directamente desde el proxy de DepotBox:
  ```
  https://depotbox.org/api/images/steam-header/{appId}
  ```
- **Juegos Supabase / biblioteca**: se intentan con `header_image_url` o con la URL estándar de Steam CDN (`library_600x900.jpg`). Si la imagen falla, se reintenta automáticamente con el proxy de DepotBox para el mismo `appId`.

## Componente `CoverImage`

`src/components/ui/CoverImage.tsx` acepta un `src` principal y un `fallbackSrc` opcional. Si el `src` falla (`onError`), el componente cambia al `fallbackSrc` antes de mostrar el placeholder. Esto permite usar el proxy de DepotBox como fallback sin lógica adicional en los padres.

## Archivos modificados

### `src/pages/StorePage.tsx`
- Eliminado `useResolvedImageUrls`, `imageSrcMap` y el efecto heartbeat.
- Eliminados los logs de debug de DepotBox.
- Añadidas `getDepotBoxImageUrl(appId)` y `getDefaultGameImageUrl(game)`.
- `GameCard` y el modal de detalle reciben `fallbackSrc` con la URL de DepotBox.

### `src/components/ui/CoverImage.tsx`
- Añadido soporte para `fallbackSrc` con reintento automático.

### `src/lib/depotbox.ts`
- Eliminados logs de debug.

### `src/domain/utils.ts`
- Eliminado `getDepotBoxImageAlternatives` (código muerto).

### `electron/main.ts`
- Eliminado el handler `image:resolve`, el cache en memoria, la lógica de fallback de URLs y el protocolo `app-image://`.

### `electron/preload.ts`
- Eliminado `resolveImages`.

### `src/vite-env.d.ts`
- Eliminada la declaración de `resolveImages`.

## Código eliminado

- Resolución de imágenes por IPC (`image:resolve`).
- Cache LRU de 500 entradas en el proceso principal.
- Protocolo personalizado `app-image://`.
- `getDepotBoxImageAlternatives`.

## Por qué se simplificó

El proxy de DepotBox (`https://depotbox.org/api/images/steam-header/{appId}`) devuelve las imágenes de forma fiable, por lo que el resolver intermediario en el proceso principal, el cache en memoria y el protocolo personalizado eran complejidad innecesaria.

## Cómo probar

```bash
npm run typecheck
npm run electron:dev
```

Si falla por `Port 5173 is already in use`, matar el proceso anterior:

```powershell
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```
