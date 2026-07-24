import { MeiliSearch } from 'meilisearch'

let clientSingleton: MeiliSearch | undefined

/** Cliente Meilisearch compartido — instanciado una vez por proceso,
 * mismo patrón que database/prisma.ts y cache/redisClient.ts. */
export function getMeiliClient(host: string, apiKey: string | undefined): MeiliSearch {
  if (!clientSingleton) {
    clientSingleton = new MeiliSearch({ host, apiKey })
  }
  return clientSingleton
}
