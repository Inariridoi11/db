/* Almacén local en IndexedDB.

   Guarda dos cosas: las imágenes que importa el usuario y los estados de las
   máquinas (la foto completa de la RAM y los dispositivos). No usamos Cache
   Storage porque son ficheros de cientos de MB que no vienen de ninguna URL, y
   el Blob se guarda tal cual, sin leerlo entero en memoria hasta que hace falta. */
(function (global) {
  'use strict';

  var DB = 'orbita-vm';
  var IMAGES = 'images';
  var STATES = 'states';
  var db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('sin IndexedDB'));
      var req = indexedDB.open(DB, 2);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(IMAGES)) d.createObjectStore(IMAGES, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STATES)) d.createObjectStore(STATES, { keyPath: 'id' });
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { reject(req.error); };
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
      listar: function () {
        return tx(store, 'readonly', function (s) { return s.getAll(); })
          .then(function (list) { return list || []; })
          .catch(function () { return []; });
      }
    };
  }

  global.ImageStore = api(IMAGES);
  global.StateStore = api(STATES);
  global.ImageStore.disponible = !!global.indexedDB;
  global.StateStore.disponible = !!global.indexedDB;
})(window);
