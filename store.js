/* Almacén local en IndexedDB.

   Guarda dos cosas: las imágenes que importa el usuario y los estados de las
   máquinas (la foto completa de la RAM y los dispositivos). No usamos Cache
   Storage porque son ficheros de cientos de MB que no vienen de ninguna URL, y
   el Blob se guarda tal cual, sin leerlo entero en memoria hasta que hace falta. */
(function (global) {
  'use strict';

  var DB = 'orbita-vm';
  var VERSION = 2;
  var IMAGES = 'images';
  var STATES = 'states';
  var TIMEOUT = 6000;
  var db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('este navegador no tiene IndexedDB'));

      var settled = false;
      function fail(msg) {
        if (settled) return;
        settled = true;
        reject(new Error(msg));
      }

      // Si otra pestaña tiene abierta una versión anterior, la actualización se
      // queda bloqueada y la petición no responde ni con éxito ni con error.
      // Sin este plazo, la página esperaría para siempre.
      var timer = setTimeout(function () {
        fail('la base de datos no responde; cierra las demás pestañas de esta web y recarga');
      }, TIMEOUT);

      var req = indexedDB.open(DB, VERSION);

      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(IMAGES)) d.createObjectStore(IMAGES, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STATES)) d.createObjectStore(STATES, { keyPath: 'id' });
      };

      req.onblocked = function () {
        clearTimeout(timer);
        fail('hay otra pestaña de esta web abierta con una versión anterior: ciérrala y recarga');
      };

      req.onsuccess = function () {
        clearTimeout(timer);
        var d = req.result;
        // Si otra pestaña actualiza la base, soltamos la conexión para no
        // bloquearla a ella igual que nos bloquearon a nosotros.
        d.onversionchange = function () {
          d.close();
          if (db === d) db = null;
        };
        if (settled) { d.close(); return; }
        settled = true;
        db = d;
        resolve(d);
      };

      req.onerror = function () {
        clearTimeout(timer);
        fail((req.error && req.error.message) || 'no se pudo abrir la base de datos');
      };
    });
  }

  function tx(store, mode, run) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(store, mode);
        var req = run(t.objectStore(store));
        t.oncomplete = function () { resolve(req && req.result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function api(store) {
    return {
      guardar: function (rec) { return tx(store, 'readwrite', function (s) { return s.put(rec); }); },
      obtener: function (id) { return tx(store, 'readonly', function (s) { return s.get(id); }); },
      borrar: function (id) { return tx(store, 'readwrite', function (s) { return s.delete(id); }); },
      // Los errores se propagan a propósito: quien llama decide qué enseñar.
      listar: function () {
        return tx(store, 'readonly', function (s) { return s.getAll(); })
          .then(function (list) { return list || []; });
      }
    };
  }

  global.ImageStore = api(IMAGES);
  global.StateStore = api(STATES);
  global.ImageStore.disponible = !!global.indexedDB;
  global.StateStore.disponible = !!global.indexedDB;
})(window);
