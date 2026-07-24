import axios, { type AxiosInstance } from 'axios'

const DEFAULT_TIMEOUT_MS = 8000

/** Cliente axios con timeout por defecto — sin esto, una llamada colgada a
 * un proveedor externo puede bloquear indefinidamente un job o un request
 * (bug real encontrado y corregido en Y-cinema/electron con youtube-api.ts,
 * ver historial del proyecto hermano). Cada proveedor crea el suyo con su
 * baseURL propia. */
export function createHttpClient(baseURL: string, timeoutMs = DEFAULT_TIMEOUT_MS): AxiosInstance {
  return axios.create({ baseURL, timeout: timeoutMs })
}
