declare module 'node-fetch' {
  export = fetch
  function fetch(url: string | URL | Request, init?: RequestInit): Promise<Response>

  interface RequestInit {
    method?: string
    headers?: HeadersInit
    body?: BodyInit
    redirect?: RequestRedirect
    signal?: AbortSignal
    timeout?: number
  }

  type HeadersInit = Record<string, string> | Array<[string, string]>
  type BodyInit = Blob | BufferSource | FormData | URLSearchParams | ReadableStream<Uint8Array> | string
  type RequestRedirect = 'follow' | 'error' | 'manual'

  interface Response {
    status: number
    statusText: string
    headers: Headers
    ok: boolean
    body: ReadableStream<Uint8Array> | null
    json(): Promise<any>
    text(): Promise<string>
    blob(): Promise<Blob>
    arrayBuffer(): Promise<ArrayBuffer>
    clone(): Response
  }

  interface Headers {
    get(name: string): string | null
  }

  interface Blob {
    stream(): ReadableStream<Uint8Array>
  }

  type BufferSource = ArrayBufferView | ArrayBuffer
  interface FormData {}
  interface URLSearchParams {}
  interface ReadableStream<R> {}
  interface AbortSignal {}
}
