// Agentforce Voice Assistant Service Worker
const CACHE_NAME = 'agentforce-voice-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  // Static assets will be automatically cached by Vite in production
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

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip non-http(s) requests
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // Skip API calls and audio streams - always fetch fresh
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('audio/') ||
      event.request.url.includes('tts')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        
        return fetch(event.request).then(response => {
          // Don't cache if not a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response for caching
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch(() => {
        // Fallback for offline - could show offline page
        console.log('[SW] Fetch failed for:', event.request.url);
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