// Benchmark básico de los endpoints más usados — Fase 13.
// Requiere la API corriendo (`npm run dev`) y datos sembrados en Postgres.
// Uso: tsx scripts/benchmark.ts [baseUrl]

const baseUrl = process.argv[2] ?? 'http://localhost:4000'
const ITERATIONS = 50

interface BenchmarkResult {
  endpoint: string
  iterations: number
  minMs: number
  maxMs: number
  avgMs: number
  p95Ms: number
}

async function timeRequest(url: string): Promise<number> {
  const start = performance.now()
  const res = await fetch(url)
  await res.arrayBuffer() // consume el body para medir la transferencia completa
  return performance.now() - start
}

async function benchmark(name: string, url: string, iterations: number): Promise<BenchmarkResult> {
  const timings: number[] = []
  for (let i = 0; i < iterations; i += 1) {
    timings.push(await timeRequest(url))
  }
  timings.sort((a, b) => a - b)

  return {
    endpoint: name,
    iterations,
    minMs: timings[0]!,
    maxMs: timings[timings.length - 1]!,
    avgMs: timings.reduce((a, b) => a + b, 0) / timings.length,
    p95Ms: timings[Math.floor(timings.length * 0.95)]!,
  }
}

function formatResult(r: BenchmarkResult): string {
  return `${r.endpoint.padEnd(30)} min=${r.minMs.toFixed(1)}ms avg=${r.avgMs.toFixed(1)}ms p95=${r.p95Ms.toFixed(1)}ms max=${r.maxMs.toFixed(1)}ms (n=${r.iterations})`
}

async function main(): Promise<void> {
  console.log(`Benchmarking ${baseUrl} (${ITERATIONS} iteraciones por endpoint)\n`)

  const targets = [
    { name: 'GET /health', url: `${baseUrl}/health` },
    { name: 'GET /api/v1/media (lista, sin cache frío)', url: `${baseUrl}/api/v1/media?pageSize=20` },
    { name: 'GET /api/v1/media (lista, cache caliente)', url: `${baseUrl}/api/v1/media?pageSize=20` },
    { name: 'GET /api/v1/search?q=matrix', url: `${baseUrl}/api/v1/search?q=matrix` },
  ]

  for (const target of targets) {
    const result = await benchmark(target.name, target.url, ITERATIONS)
    console.log(formatResult(result))
  }

  console.log(
    '\nNota: la primera corrida de "lista" mide con cache probablemente frío; la segunda mide\ncon cache caliente (mismo query, TTL 300s) — la diferencia entre ambas es una medida\ndirecta del beneficio del cache-aside de Fase 7.',
  )
}

main().catch((err) => {
  console.error('Benchmark falló:', err)
  process.exit(1)
})
