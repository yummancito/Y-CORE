import axios from 'axios'

export interface SubtitleInfo {
  name: string
  url: string
  lang: string
  format: string
}

export class SubtitleEngine {
  // Delegar al torrent engine para subtítulos embebidos en el torrent
  // Este módulo es para fuentes externas (OpenSubtitles)

  /** Estado de OpenSubtitles para diagnóstico (no expone la key en sí) */
  getStatus(): { apiKeyDetected: boolean; endpoint: string } {
    return {
      apiKeyDetected: !!(process.env.VITE_OPENSUBTITLES_API_KEY || '').trim(),
      endpoint: 'https://api.opensubtitles.com/api/v1/subtitles',
    }
  }

  async getFromTorrent(infoHash: string): Promise<any[]> {
    // Los subtítulos del torrent se sirven desde TorrentEngine
    // Esta función es un placeholder que Claude Code conectará
    return []
  }

  async searchOpenSubtitles(
    query: string,
    year?: number,
    lang: string = 'es',
    opts: { tmdbId?: number; mediaType?: 'movie' | 'episode'; season?: number; episode?: number } = {}
  ): Promise<SubtitleInfo[]> {
    try {
      const isEpisode = opts.mediaType === 'episode'
      // Documentación oficial: para episodios de serie, usar parent_tmdb_id +
      // season_number + episode_number en vez de solo texto libre — si no,
      // OpenSubtitles devuelve resultados de contenido no relacionado (mismo
      // texto "S09E09" matchea títulos random que no son la serie buscada).
      const params: Record<string, unknown> = {
        languages: lang,
        type: isEpisode ? 'episode' : 'movie',
        order_by: 'download_count',
        order_direction: 'desc',
        limit: 5,
      }
      if (isEpisode && opts.tmdbId) {
        params.parent_tmdb_id = opts.tmdbId
        params.season_number = opts.season
        params.episode_number = opts.episode
      } else if (!isEpisode && opts.tmdbId) {
        params.tmdb_id = opts.tmdbId
      } else {
        // Sin tmdbId disponible, fallback al texto libre (comportamiento previo)
        params.query = query
        params.year = year
      }

      // OpenSubtitles REST API v2
      const { data } = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
        params,
        headers: {
          'Api-Key': process.env.VITE_OPENSUBTITLES_API_KEY || '',
          'User-Agent': 'Y-CINEMA v1.0',
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      })

      if (!data?.data) return []

      return data.data.map((item: any) => {
        // Extraer file_id del primer archivo (necesario para el POST de descarga)
        const fileId = item.attributes?.files?.[0]?.file_id
        return {
          name: item.attributes?.release || 'Unknown',
          // Usar formato especial: "os:file_id:N" para que el proxy sepa
          // que debe hacer POST a /api/v1/download en vez de GET directo
          url: fileId ? `os:file_id:${fileId}` : '',
          lang: item.attributes?.language || lang,
          format: item.attributes?.format || 'srt',
        }
      })
    } catch {
      console.warn('[Subtitles] OpenSubtitles search failed')
      return []
    }
  }

  // Detectar idioma por nombre de archivo
  detectLanguage(fileName: string): string {
    const name = fileName.toLowerCase()
    if (name.includes('spanish') || name.includes('español') || name.includes('esp') || name.includes('.es.')) return 'Español'
    if (name.includes('english') || name.includes('.en.')) return 'English'
    if (name.includes('french') || name.includes('francais') || name.includes('.fr.')) return 'Français'
    if (name.includes('portuguese') || name.includes('.pt.') || name.includes('.br.')) return 'Português'
    if (name.includes('german') || name.includes('.de.')) return 'Deutsch'
    if (name.includes('japanese') || name.includes('.jp.')) return '日本語'
    if (name.includes('multi') || name.includes('v2')) return 'Multi'
    return 'Unknown'
  }
}
