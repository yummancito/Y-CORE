import type { NormalizedMediaInput } from '../../types/media.js'
import type { AniListMedia } from '../../providers/anilist/anilist.types.js'
import { slugify } from '../../utils/slugify.js'

/** Convierte el Media NATIVO de AniList al contrato NormalizedMediaInput. */
export function normalizeAniListMedia(media: AniListMedia): NormalizedMediaInput {
  const title = media.title.english || media.title.romaji || media.title.native || 'Sin título'
  const releaseDate = formatStartDate(media.startDate)

  return {
    type: 'ANIME',
    title,
    originalTitle: media.title.native,
    overview: media.description ? stripHtml(media.description) : null,
    tagline: null,
    status: 'RELEASED',
    releaseDate,
    runtimeMinutes: null,
    originalLangCode: 'ja',
    popularity: 0,
    genres: media.genres.map((name) => ({ slug: slugify(name), name })),
    people: [],
    images: buildImages(media),
    ratings: media.averageScore != null
      ? [{ source: 'anilist', value: media.averageScore / 10, scale: 10, voteCount: null }]
      : [],
    seasons: [],
    externalRef: {
      providerSlug: 'anilist',
      externalId: String(media.id),
      raw: media,
    },
  }
}

function buildImages(media: AniListMedia): NormalizedMediaInput['images'] {
  const images: NormalizedMediaInput['images'] = []
  const poster = media.coverImage.extraLarge || media.coverImage.large
  if (poster) {
    images.push({ type: 'POSTER', url: poster, width: null, height: null, languageCode: null })
  }
  if (media.bannerImage) {
    images.push({
      type: 'BANNER',
      url: media.bannerImage,
      width: null,
      height: null,
      languageCode: null,
    })
  }
  return images
}

function formatStartDate(date: AniListMedia['startDate']): string | null {
  if (date.year == null) return null
  const month = String(date.month ?? 1).padStart(2, '0')
  const day = String(date.day ?? 1).padStart(2, '0')
  return `${date.year}-${month}-${day}`
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}
