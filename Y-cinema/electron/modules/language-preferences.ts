// language-preferences.ts — Preferencias de idioma de audio y subtítulos (Fase 4)
// Persiste por usuario con electron-store (mismo mecanismo que history.ts).

import Store from 'electron-store'

export type AudioLanguage = 'latino' | 'castellano' | 'english' | 'japanese'
export type SubtitleLanguage = 'es' | 'en' | 'none'

export interface LanguagePreferences {
  audio: AudioLanguage
  subtitles: SubtitleLanguage
  fallbackAudio: AudioLanguage
  /** Activar subtítulos automáticamente al iniciar la reproducción */
  autoSubtitles: boolean
  /** Recordar preferencias entre sesiones (si false, se resetean al arrancar) */
  remember: boolean
}

const DEFAULTS: LanguagePreferences = {
  audio: 'latino',
  subtitles: 'es',
  fallbackAudio: 'english',
  autoSubtitles: true,
  remember: true,
}

// Mapa de idioma → patrones que suelen aparecer en nombres de archivos/pistas,
// para que subtitle-service y el player elijan la pista correcta
export const AUDIO_MATCHERS: Record<AudioLanguage, string[]> = {
  latino: ['latino', 'latin', 'lat', 'español latino', 'spa-lat', 'es-la', 'esp latino'],
  castellano: ['castellano', 'españa', 'spain', 'cast', 'es-es', 'esp'],
  english: ['english', 'eng', 'en', 'ingles', 'inglés'],
  japanese: ['japanese', 'jpn', 'jp', 'japones', 'japonés', '日本語'],
}

export const SUBTITLE_MATCHERS: Record<Exclude<SubtitleLanguage, 'none'>, string[]> = {
  es: ['spanish', 'español', 'espanol', 'es', 'spa', 'esp', 'latino', 'castellano'],
  en: ['english', 'ingles', 'inglés', 'en', 'eng'],
}

interface StoreData {
  languagePreferences: LanguagePreferences
}

export class LanguagePreferencesStore {
  private store: Store<StoreData>

  constructor() {
    this.store = new Store<StoreData>({
      name: 'y-cinema-lang',
      defaults: { languagePreferences: DEFAULTS },
    })
    // Si el usuario pidió no recordar, arrancar la sesión desde defaults
    // (conservando la propia flag remember para que el toggle siga en 'off')
    const saved = this.store.get('languagePreferences')
    if (saved && saved.remember === false) {
      this.store.set('languagePreferences', { ...DEFAULTS, remember: false })
      console.log('[Language] remember=false → preferencias reseteadas a defaults')
    }
  }

  get(): LanguagePreferences {
    return { ...DEFAULTS, ...this.store.get('languagePreferences') }
  }

  set(prefs: Partial<LanguagePreferences>): LanguagePreferences {
    const next = { ...this.get(), ...prefs }
    this.store.set('languagePreferences', next)
    console.log('[Language] preferencias actualizadas:', JSON.stringify(next))
    return next
  }

  reset(): LanguagePreferences {
    this.store.set('languagePreferences', DEFAULTS)
    console.log('[Language] preferencias reseteadas a defaults')
    return DEFAULTS
  }

  /** Devuelve los patrones de audio del idioma preferido (con fallback) */
  getAudioMatchers(): { preferred: string[]; fallback: string[] } {
    const p = this.get()
    return {
      preferred: AUDIO_MATCHERS[p.audio] || [],
      fallback: AUDIO_MATCHERS[p.fallbackAudio] || [],
    }
  }

  /** Patrones de subtítulos del idioma preferido (vacío si 'none') */
  getSubtitleMatchers(): string[] {
    const p = this.get()
    if (p.subtitles === 'none') return []
    return SUBTITLE_MATCHERS[p.subtitles] || []
  }
}
