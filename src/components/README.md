# Componentes

## Layout (`layout/`)

| Componente | Descripción |
|---|---|
| `AppShell.tsx` | Estructura principal: sidebar + contenido + title bar |
| `EpicSidebar.tsx` | Sidebar de navegación estilo Epic Games Store |
| `TitleBar.tsx` | Barra de título con controles de ventana (min/max/close) |

## UI (`ui/`)

| Componente | Descripción |
|---|---|
| `Button.tsx` | Botón con variantes (primary, secondary, danger, ghost) |
| `Card.tsx` | Tarjeta contenedora con padding y border |
| `CoverImage.tsx` | Imagen de portada de juego con fallback |
| `EmptyState.tsx` | Estado vacío con icono y mensaje |
| `Input.tsx` | Campo de texto con label y validación |
| `LoadingState.tsx` | Spinner / skeleton loading |
| `Modal.tsx` | Modal dialog con backdrop y cierre con ESC |
| `Toast.tsx` | Notificación temporal (success, error, warning) |

## Componentes raíz

| Componente | Descripción |
|---|---|
| `CommandPalette.tsx` | Paleta de comandos (Cmd+K) para navegación rápida |
| `Logo.tsx` | Logo de Y-core en SVG |
| `ProtectedRoute.tsx` | Wrapper que redirige a login si no hay auth |
| `VerificationCodeInput.tsx` | Input de código de verificación (6 dígitos) |
