const CACHE_NAME = 'freznel-offline-v3'
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/src/styles.css',
  '/src/main.js',
  '/src/auth.js',
  '/src/offline.js',
  '/src/firebase-config.js',
  '/model-worker.js',
  '/models.json',
  'https://cdn.jsdelivr.net/npm/@spectrum-css/tokens@16.0.2/dist/css/index.css',
  'https://cdn.jsdelivr.net/npm/@spectrum-css/page@9.2.0/dist/index.css',
  'https://cdn.jsdelivr.net/npm/@spectrum-css/typography@8.2.0/dist/index.css',
  'https://cdn.jsdelivr.net/npm/@spectrum-css/button@14.2.0/dist/index.css',
  'https://cdn.jsdelivr.net/npm/@spectrum-css/textfield@8.2.0/dist/index.css',
  'https://cdn.jsdelivr.net/npm/@spectrum-css/fieldlabel@10.2.0/dist/index.css',
  'https://cdn.jsdelivr.net/npm/@spectrum-css/card@11.2.0/dist/index.css',
  'https://cdn.jsdelivr.net/npm/@spectrum-css/link@7.2.0/dist/index.css'
]

self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        PRECACHE_ASSETS.map(url => cache.add(url).catch(() => null))
      ))
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => name.startsWith('freznel-offline-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_FILES') return

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => Promise.all(
      event.data.urls.map(url => cache.add(url).catch(() => null))
    ))
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  const sameOrigin = url.origin === self.location.origin
  const vendorAsset = (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
    || url.hostname === 'cdn.jsdelivr.net'
  if (!sameOrigin && !vendorAsset) return

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      fetch(event.request)
        .then(response => {
          if (response.ok) cache.put(event.request, response.clone())
          return response
        })
        .catch(() => cache.match(event.request)
          .then(cached => {
            if (cached) return cached
            if (event.request.mode === 'navigate') {
              return cache.match('/').then(home =>
                home || new Response('The app is not available offline yet.', {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain' }
                })
              )
            }
            return new Response('Offline resource unavailable', { status: 503 })
          }))
    )
  )
})
