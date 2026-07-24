/** Convierte un nombre libre (género, estudio, etc.) a un slug estable
 * usado como clave de deduplicación — p.ej. "Ciencia Ficción" → "ciencia-ficcion". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita marcas diacríticas (acentos)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
