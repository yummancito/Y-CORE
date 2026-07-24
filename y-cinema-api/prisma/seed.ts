import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const LANGUAGES: Array<{ code: string; name: string }> = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'pt', name: 'Português' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ko', name: '한국어' },
  { code: 'it', name: 'Italiano' },
]

// slug/name/weight — weight define prioridad al fusionar duplicados entre
// proveedores en la Fase 5 (mayor weight gana en caso de conflicto de datos).
const PROVIDERS: Array<{ slug: string; name: string; weight: number }> = [
  { slug: 'tmdb', name: 'The Movie Database', weight: 100 },
  { slug: 'anilist', name: 'AniList', weight: 90 },
  { slug: 'tvmaze', name: 'TVMaze', weight: 70 },
  { slug: 'jikan', name: 'Jikan (MyAnimeList)', weight: 60 },
  { slug: 'kitsu', name: 'Kitsu', weight: 50 },
  { slug: 'fanart', name: 'FanArt.tv', weight: 40 },
  { slug: 'omdb', name: 'OMDb', weight: 30 },
]

async function main(): Promise<void> {
  for (const lang of LANGUAGES) {
    await prisma.language.upsert({
      where: { code: lang.code },
      update: { name: lang.name },
      create: lang,
    })
  }

  for (const provider of PROVIDERS) {
    await prisma.provider.upsert({
      where: { slug: provider.slug },
      update: { name: provider.name, weight: provider.weight },
      create: provider,
    })
  }

  console.log(`Seed completo: ${LANGUAGES.length} idiomas, ${PROVIDERS.length} proveedores.`)
}

main()
  .catch((err) => {
    console.error('Seed falló:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
