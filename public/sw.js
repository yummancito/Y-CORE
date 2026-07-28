// ============================================================================
// Y-Core Service Worker — CDN Cache Layer
// ----------------------------------------------------------------------------
// Estrategias:
//   • Steam CDN images (*.steamstatic.com, depotbox.org):
//     → Cache-First (almacena en caché local después de la primera carga)
//   • Todo lo demás → Network-Only
//
// Almacena hasta 500 imágenes (límite LRU implícito por el navegador).
// ============================================================================

const CACHE_NAME = 'y-core-cdn-v1'
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

// CDNs de Steam que cacheamos
const CDN_PATTERNS = [
  /\.steamstatic\.com\/steam\/apps\//i,
  /depotbox\.org\/api\/images\//i,
  /cdn\.akamai\.steamstatic\.com\//i,
  /cdn\.cloudflare\.steamstatic\.com\//i,
]

function isCdnUrl(url) {
  return CDN_PATTERNS.some(function (p) { return p.test(url) })
}

self.addEventListener('install', function (event) {
  // Activar inmediatamente sin esperar a que termine el ciclo anterior
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  // Limpiar cachés antiguas (de versiones anteriores del SW)
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE_NAME })
          .map(function (k) { return caches.delete(k) }),
      )
    }),
  )
})

self.addEventListener('fetch', function (event) {
  var request = event.request
  var url = request.url

  // Solo cacheamos GET requests a CDNs de Steam
  if (request.method !== 'GET' || !isCdnUrl(url)) return

  event.respondWith(handleCdnRequest(request))
})

function handleCdnRequest(request) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) {
        // Verificar si la caché sigue fresca (por fecha)
        var cachedDate = cached.headers.get('date')
        if (cachedDate) {
          var age = Date.now() - new Date(cachedDate).getTime()
          if (age < MAX_CACHE_AGE_MS) {
            return cached
          }
        } else {
          // Sin fecha, asumir fresco (imágenes de Steam no suelen cambiar)
          return cached
        }
      }

      // No está en caché o expiró → fetch de red
      return fetch(request).then(function (response) {
        // Solo cachear respuestas exitosas de imágenes
        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
          var cloned = response.clone()
          cache.put(request, cloned).catch(function () {
            // Ignorar errores de caché (cuota excedida, etc.)
          })
        }
        return response
      }).catch(function () {
        // Fallback: si hay error de red y tenemos caché expirada, usarla
        if (cached) return cached
        // Sin conexión y sin caché → devolver placeholder transparente
        return new Response(null, { status: 204 })
      })
    })
  })
}
