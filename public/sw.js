// Agentforce Voice Assistant Service Worker
// IMPORTANT: bump this version string on every deploy so stale caches are cleared
const CACHE_NAME = 'agentforce-voice-v4';

// Only pre-cache static, non-HTML assets.
// The HTML page (/) must NEVER be cached here because it contains
// Vite-generated content-hashed filenames that change on every build.
// Caching it causes "blank white page" after deployments because the
// cached HTML references asset filenames that no longer exist on the server.
const urlsToCache = [
  '/manifest.json',
  '/agentforce-logo.png',
];

// Install event - cache essential resources
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('[SW] Cache install failed:', err);
      })
  );
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches and reload any pages that were stuck
// with stale HTML from the old service worker.
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        // Identify old caches so we know whether this is an upgrade
        const oldCaches = cacheNames.filter(name => name !== CACHE_NAME);
        const isUpgrade = oldCaches.length > 0;

        return Promise.all(oldCaches.map(name => {
          console.log('[SW] Deleting old cache:', name);
          return caches.delete(name);
        }))
          // Take control of all open clients immediately
          .then(() => self.clients.claim())
          .then(() => {
            if (!isUpgrade) return; // Fresh install — no stale pages to fix

            // This is an upgrade from an old SW version. Any open pages may
            // be showing a blank screen because the old SW served cached HTML
            // with stale Vite asset hashes that 404 on the new server.
            // Force-navigate each window client to its current URL so the
            // new (network-first) SW serves fresh HTML and React can mount.
            return self.clients.matchAll({ type: 'window' })
              .then(clients => Promise.all(
                clients.map(client => {
                  console.log('[SW] Reloading client to clear stale content:', client.url);
                  return client.navigate(client.url).catch(() => {
                    // navigate() may not be available in older browsers; harmless.
                  });
                })
              ));
          });
      })
  );
});

// Fetch event
self.addEventListener('fetch', event => {
  // Only handle GET requests over http(s)
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // Always bypass the SW for API calls and audio streams
  if (url.pathname.startsWith('/api/') ||
      url.pathname.includes('audio') ||
      url.pathname.includes('tts')) {
    return;
  }

  // HTML pages — ALWAYS network-first, never serve stale HTML.
  // This is critical: the HTML contains hashed Vite asset filenames that
  // change on every deploy. Serving cached HTML after a deploy causes 404s
  // on the JS/CSS bundles, resulting in a blank white page.
  const isHtml = url.pathname === '/' ||
                 url.pathname.endsWith('.html') ||
                 !url.pathname.includes('.');
  if (isHtml) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Content-addressed static assets (/assets/index-HASH.js etc.) —
  // cache-first since the hash guarantees freshness.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        console.log('[SW] Fetch failed for:', event.request.url);
      });
    })
  );
});

// Handle background sync (future feature)
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    console.log('[SW] Background sync triggered');
    // Could queue offline voice recordings here
  }
});

// Handle push notifications (future feature)
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const options = {
    body: event.data.text(),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    },
    actions: [
      {
        action: 'open',
        title: 'Open App',
        icon: '/icon-192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Agentforce Voice', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});