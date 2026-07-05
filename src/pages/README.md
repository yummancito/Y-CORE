# Páginas

| Página | Ruta | Descripción |
|---|---|---|
| `LibraryPage.tsx` | `/` | Biblioteca de juegos instalados. Muestra grid de juegos con portadas, permite lanzar/desinstalar/verificar. Context menu con Online Fix. |
| `StorePage.tsx` | `/store` | Tienda de juegos. Búsqueda, categorías, recomendaciones. Instala juegos con un click (Lua + depot keys + manifests). |
| `AddGame.tsx` | `/add-game` | Añadir juego manualmente. Permite pegar Lua script, añadir depot keys y manifests manualmente. |
| `ImportGame.tsx` | `/import` | Importar juego desde carpeta (drag & drop). Detecta Lua scripts y manifests en la carpeta. |
| `LuaScripts.tsx` | `/lua-scripts` | Gestión de Lua scripts en Steam/config/lua/. Ver, importar, eliminar, parsear. |
| `ManifestFiles.tsx` | `/manifests` | Gestión de archivos manifest en depotcache/. Ver, importar, eliminar. |
| `OnlineFixPage.tsx` | `/online-fix` | Búsqueda de compatibilidad Online Fix. Muestra juegos compatibles/incompatibles con razones. |
| `LogsPage.tsx` | `/logs` | Visor de logs en tiempo real. Filtra por nivel, busca, exporta. |
| `SettingsPage.tsx` | `/settings` | Configuración: Steam path, API keys (SteamGridDB, DepotBox), tema, idioma, logs. |
| `LoginPage.tsx` | `/login` | Pantalla de login/registro. Auth con Supabase. |
| `ResetPasswordPage.tsx` | `/reset-password` | Reset de password con código de verificación. |
