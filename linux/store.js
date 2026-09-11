/* Almacén de imágenes importadas por el usuario.

   Van a IndexedDB y no a Cache Storage porque aquí guardamos ficheros que
   pueden pesar cientos de MB y no vienen de ninguna URL. Se guarda el Blob
   tal cual: no hay que leer el archivo entero en memoria hasta arrancarlo. */
(function (global) {
  'use strict';

  var DB = 'orbita-vm';
  var STORE = 'images';
  var db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return reject(new Error('sin IndexedDB'));
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(mode, run) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode);
        var req = run(t.objectStore(STORE));
        t.oncomplete = function () { resolve(req && req.result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  global.ImageStore = {
    disponible: !!global.indexedDB,

    guardar: function (rec) {
      return tx('readwrite', function (store) { return store.put(rec); });
    },

    listar: function () {
      return tx('readonly', function (store) { return store.getAll(); })
        .then(function (list) { return list || []; })
        .catch(function () { return []; });
    },

    obtener: function (id) {
      return tx('readonly', function (store) { return store.get(id); });
    },

    borrar: function (id) {
      return tx('readwrite', function (store) { return store.delete(id); });
    }
  };
})(window);
