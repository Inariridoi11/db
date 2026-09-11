/* Service worker: guarda la web entera para poder abrirla sin conexión.
   Las imágenes de los sistemas van en su propia caché, gestionada por boot.js,
   y las que importa el usuario viven en IndexedDB. */
var VERSION = 'vm-shell-v4';
var KEEP = [VERSION, 'vm-systems-v1'];
var ASSETS = [
  './',
  'index.html',
  'styles.css',
  'boot.js',
  'term.js',
  'store.js',
  'manifest.webmanifest',
  'vendor/libv86.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
];

function urls() {
  return ASSETS.map(function (path) { return new URL(path, self.registration.scope).href; });
}

function precache() {
  return caches.open(VERSION).then(function (cache) {
    // Uno a uno: si un archivo falla, el resto se guarda igualmente.
    return Promise.all(urls().map(function (url) {
      return fetch(url, { cache: 'reload' }).then(function (res) {
        if (!res.ok) throw new Error(url);
        return cache.put(url, res);
      }).catch(function () { return null; });
    })).then(function () { return countCached(cache); });
  });
}

function countCached(cache) {
  return Promise.all(urls().map(function (url) {
    return cache.match(url, { ignoreSearch: true }).then(Boolean);
  })).then(function (found) {
    var cached = found.filter(Boolean).length;
    return { cached: cached, total: found.length, ok: cached === found.length };
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(precache().then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return KEEP.indexOf(k) >= 0 ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  var reply = function (data) { if (e.ports && e.ports[0]) e.ports[0].postMessage(data); };
  if (!e.data) return;
  if (e.data.type === 'PRECACHE') {
    e.waitUntil(precache().then(reply, function () { reply({ ok: false, cached: 0, total: ASSETS.length }); }));
  } else if (e.data.type === 'STATUS') {
    e.waitUntil(caches.open(VERSION).then(countCached).then(reply, function () {
      reply({ ok: false, cached: 0, total: ASSETS.length });
    }));
  }
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones: intenta la red y cae a la copia guardada (esto es lo que
  // permite abrir la web estando offline).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        var candidates = [req.url];
        if (url.pathname.charAt(url.pathname.length - 1) === '/') {
          candidates.push(url.origin + url.pathname + 'index.html');
        }
        candidates.push(new URL('index.html', self.registration.scope).href);

        return candidates.reduce(function (chain, candidate) {
          return chain.then(function (hit) {
            return hit || caches.match(candidate, { ignoreSearch: true });
          });
        }, Promise.resolve(null)).then(function (hit) {
          return hit || new Response('Sin conexion y sin copia guardada.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
    );
    return;
  }

  // Resto de archivos: primero la caché (rápido y offline), y refresco en segundo plano.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var network = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});
