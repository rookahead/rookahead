// Rookahead's service worker: makes the app installable and quick to open.
// Pages come from the network first (so a new version shows at once) and from the cache when offline;
// the hashed bundles in /assets never change, so they're served from the cache once fetched.
// Everything else (the engine, puzzles, accounts) goes straight to the network.
const CACHE = 'rookahead-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== location.origin) return

  // The plain pages (About, Privacy, the embed viewer) aren't the app: leave them to the network.
  if (/^\/(about|privacy|embed)/.test(url.pathname)) return

  if (request.mode === 'navigate') {
    // The app is one page: any address opens it, and the router takes over.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put('/', copy))
          }
          return response
        })
        .catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(CACHE).then((cache) => cache.put(request, copy))
            }
            return response
          }),
      ),
    )
  }
})
