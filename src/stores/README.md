# Stores (Zustand)

| Store | Descripción |
|---|---|
| `useAuthStore.ts` | Estado de autenticación: tokens, usuario, login/logout/refresh. Persiste en localStorage. |
| `useLibraryStore.ts` | Lista de juegos instalados, cache, acciones de refresh. |
| `useSteamStore.ts` | Estado de Steam: path, si está corriendo, library folders. |
| `useSettingsStore.ts` | Configuración del usuario: API keys, tema, idioma. Persiste en config file. |
| `useToastStore.ts` | Sistema de notificaciones toast (success, error, warning). Auto-dismiss. |
| `useCommandPaletteStore.ts` | Estado de la paleta de comandos (open/close). |
| `useRecommendationStore.ts` | Recomendaciones de juegos para la store. |
