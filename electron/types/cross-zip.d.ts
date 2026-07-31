declare module 'cross-zip' {
  export function zip(src: string, dest: string, callback: (err?: Error | null) => void): void
  export function unzip(src: string, dest: string, callback: (err?: Error | null) => void): void
  export function extract(src: string, dest: string, callback: (err?: Error | null) => void): void
}
