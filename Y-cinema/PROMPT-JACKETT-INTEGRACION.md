# Y-CINEMA — Integrar Jackett para Torrents en Español

## Objetivo

Investigar y proponer cómo integrar **Jackett** en Y-CINEMA para buscar torrents de sitios en español (Gnula, DonTorrent, EliteTorrent, etc.) y ofrecer audio/subtítulos en español latino y castellano.

**NO implementes nada todavía.** Solo investigá y devolvé una propuesta técnica detallada.

---

## Contexto técnico (ya investigado)

### ¿Qué es Jackett?
- Es un proxy **.NET (C#)** que actúa como intermediario entre tu app y +70 sitios de torrents
- Corre como servidor local en puerto **9117**
- Exponé una API **Torznab** (XML) para buscar torrents
- Soporta indexers en español como: DonTorrent, EliteTorrent, MejorTorrent, Puntotorrent

### API de Jackett
```
# Buscar en TODOS los indexers configurados:
GET http://localhost:9117/api/v2.0/indexers/all/results/torznab/api
  ?apikey={KEY}
  &t=search
  &q=Inception+2010
```

**Respuesta (XML Torznab):**
```xml
<rss version="2.0">
  <channel>
    <item>
      <title>Inception.2010.1080p.Latino.GNULA</title>
      <link>magnet:?xt=urn:btih:...</link>
      <torznab:attr name="seeders" value="45"/>
      <torznab:attr name="size" value="2147483648"/>
    </item>
  </channel>
</rss>
```

### Alternativa: Prowlarr
- Hecho por el equipo de Sonarr/Radarr
- Misma tecnología (.NET), pero más moderno y activo
- API más limpia, soporta JSON además de XML
- **Recomendado sobre Jackett** para proyectos nuevos

---

## Lo que necesitamos investigar

### 1. Integración como proceso hijo en Electron

Jackett necesita .NET Runtime instalado en el sistema. Explorar:

- **Opción A:** Requerir que el usuario instale Jackett manualmente (menos user-friendly)
- **Opción B:** Bundlear Jackett con la app + verificar si .NET está instalado
- **Opción C:** Usar Prowlarr (misma dependencia .NET)
- **Opción D:** Usar una API online existente (evita dependencias locales, pero necesita internet)

Para cada opción:
- ¿Cómo detectar si Jackett/Prowlarr está corriendo?
- ¿Cómo spawnearlo como child process?
- ¿Qué pasa si no está instalado? Mostrar diálogo de descarga?

### 2. API Key

- La API Key se genera automáticamente al iniciar Jackett
- Se guarda en `ServerConfig.json`
- ¿Cómo leerla desde Node.js/Electron?
- ¿Se puede configurar una key fija desde el inicio?

### 3. Indexers pre-configurados para español

Investigar qué indexers en Jackett/Prowlarr tienen:
- **Audio español latino** → Gnula, Divisam, NewPct
- **Audio castellano (España)** → EliteTorrent, DonTorrent, MejorTorrent
- **Películas 1080p/4K** con buenos seeders

¿Se puede pre-configurar Jackett para que solo tenga estos indexers?

### 4. Cómo detectar el idioma del torrent

Los nombres de torrents suelen incluir pistas:
- "Latino" → Español latino
- "Castellano" → Español de España
- "Español" → Genérico
- "EN/ENG" → Inglés

Hacer un parser que detecte el idioma desde el título del torrent.

### 5. Integración con WebTorrent

Ya tenemos `torrent-engine.ts` que recibe magnet links y reproduce. Jackett devuelve magnet links. El flujo sería:

```
Jackett search → devuelve magnet → torrent-engine.play(magnet) → reproduce
```

Esto ya funciona, solo conectar las piezas.

### 6. UI para selector de idioma

¿Cómo debería verse en la UI?

- Antes de reproducir: el usuario elige idioma
- Se muestran opciones: "Español Latino", "Español Castellano", "Inglés", "Subtítulos ES"
- Cada opción busca en una fuente diferente
- Si no encuentra, muestra "No disponible" con el motivo

---

## Lo que NO tenés que hacer

- ❌ No implementar nada — solo investigar y proponer
- ❌ No modificar ningún archivo existente
- ❌ No instalar dependencias

---

## Lo que SÍ tenés que entregar

Un análisis que cubra:

1. **Arquitectura propuesta** — cómo integrar Jackett/Prowlarr en Electron
2. **Dependencias** — qué necesita el usuario (sí o sí .NET?)
3. **Código ejemplo** — cómo spawnear Jackett como child process
4. **API calls** — ejemplos de búsqueda con diferentes indexers
5. **Detección de idioma** — cómo parsear el título del torrent
6. **UI/UX** — cómo debería verse el selector de idioma
7. **Recomendación final** — ¿Jackett, Prowlarr, o alternativa?
