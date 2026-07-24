import { Redis } from 'ioredis'

let redisSingleton: Redis | undefined

/** Cliente Redis compartido — instanciado una vez por proceso. */
export function getRedisClient(url: string): Redis {
  if (!redisSingleton) {
    redisSingleton = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    })
  }
  return redisSingleton
}
