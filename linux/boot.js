/* Descarga el sistema a la caché del navegador y arranca v86 con lo guardado.
   La consola de la máquina virtual sale por el puerto serie y la dibuja term.js. */
(function () {
  'use strict';

  var CACHE = 'orbita-linux-v1';
  var PACK = [
    { url: 'vendor/v86.wasm',    label: 'Emulador (WebAssembly)', bytes: 2101621 },
    { url: 'vendor/seabios.bin', label: 'BIOS',                   bytes: 131072 },
    { url: 'vendor/vgabios.bin', label: 'BIOS de vídeo',          bytes: 36352 },
    { url: 'system/bzImage.bin', label: 'Kernel Linux 6.12',      bytes: 5788160 },
    { url: 'system/initrd.gz',   label: 'Sistema de archivos',    bytes: 2276000 }
  ];
  var TOTAL = PACK.reduce(function (n, f) { return n + f.bytes; }, 0);

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    phase: $('phase'), pack: $('pack'), stage: $('stage'), files: $('files'),
    get: $('get'), boot: $('boot'), drop: $('drop'), progress: $('progress'),
    bar: $('bar'), barWrap: $('bar-wrap'), net: $('net'),
    term: $('term'), input: $('mobile-input'), kbd: $('kbd'),
    pause: $('pause'), reset: $('reset'), close: $('close')
  };

  var mb = function (n) { return (n / 1048576).toFixed(1) + ' MB'; };
  var emulator = null;
  var term = null;

  /* ---------- lista de archivos ---------- */

  PACK.forEach(function (f) {
    var li = document.createElement('li');
    li.innerHTML = '<span></span><b></b>';
    li.firstChild.textContent = f.label;
    li.lastChild.textContent = mb(f.bytes);
    li.lastChild.setAttribute('data-for', f.url);
    el.files.appendChild(li);
  });

  function mark(url, text, done) {
    var b = el.files.querySelector('[data-for="' + url + '"]');
    if (!b) return;
    b.textContent = text;
    b.parentNode.classList.toggle('done', !!done);
  }

  function setPhase(text, on) {
    el.phase.textContent = text;
    el.phase.classList.toggle('on', !!on);
  }

  /* ---------- estado de la descarga ---------- */

  function cached() {
    if (!('caches' in window)) return Promise.resolve([]);
    return caches.open(CACHE).then(function (c) {
      return Promise.all(PACK.map(function (f) {
        return c.match(f.url).then(function (hit) { return hit ? f.url : null; });
      }));
    }).then(function (list) { return list.filter(Boolean); });
  }

  function refresh() {
    return cached().then(function (have) {
      var all = have.length === PACK.length;
      PACK.forEach(function (f) {
        if (have.indexOf(f.url) >= 0) mark(f.url, 'guardado', true);
      });
      el.boot.disabled = !all;
      el.drop.hidden = have.length === 0;
      el.get.hidden = all;
      if (all) {
        setPhase('Guardado — listo sin conexión', true);
        el.progress.textContent = 'Sistema guardado en el dispositivo (' + mb(TOTAL) + '). Ya no hace falta internet.';
      } else if (have.length) {
        setPhase('Descarga incompleta');
        el.progress.textContent = 'Faltan archivos: vuelve a pulsar descargar.';
      }
      return all;
    });
  }

  /* ---------- descarga con progreso ---------- */

  function download(file, onChunk) {
    return fetch(file.url, { cache: 'reload' }).then(function (res) {
      if (!res.ok) throw new Error(file.url);
      if (!res.body || !res.body.getReader) {
        return res.arrayBuffer().then(function (buf) { onChunk(buf.byteLength); return buf; });
      }
      var reader = res.body.getReader();
      var chunks = [], size = 0;
      return (function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            var out = new Uint8Array(size), at = 0;
            chunks.forEach(function (c) { out.set(c, at); at += c.length; });
            return out.buffer;
          }
          chunks.push(r.value);
          size += r.value.length;
          onChunk(r.value.length);
          return pump();
        });
      })();
    });
  }

  el.get.addEventListener('click', function () {
    if (!('caches' in window)) {
      el.progress.textContent = 'Este navegador no puede guardar el sistema (falta Cache Storage).';
      return;
    }
    el.get.disabled = true;
    el.barWrap.hidden = false;
    setPhase('Descargando…');
    var got = 0;
    caches.open(CACHE).then(function (cache) {
      return PACK.reduce(function (chain, f) {
        return chain.then(function () {
          mark(f.url, 'descargando…');
          return download(f, function (n) {
            got += n;
            var pct = Math.min(100, got / TOTAL * 100);
            el.bar.style.width = pct.toFixed(1) + '%';
            el.progress.textContent = mb(got) + ' de ' + mb(TOTAL) + ' (' + pct.toFixed(0) + '%)';
          }).then(function (buf) {
            return cache.put(f.url, new Response(buf));
          }).then(function () {
            mark(f.url, 'guardado', true);
          });
        });
      }, Promise.resolve());
    }).then(function () {
      el.bar.style.width = '100%';
      return refresh();
    }).catch(function (err) {
      setPhase('Error en la descarga');
      el.progress.textContent = 'No se pudo descargar todo: ' + err.message + '. Reintenta con conexión.';
    }).then(function () {
      el.get.disabled = false;
    });
  });

  el.drop.addEventListener('click', function () {
    caches.delete(CACHE).then(function () {
      PACK.forEach(function (f) { mark(f.url, mb(f.bytes), false); });
      el.bar.style.width = '0';
      el.get.hidden = false;
      el.drop.hidden = true;
      el.boot.disabled = true;
      setPhase('Sin descargar');
      el.progress.textContent = 'Borrado. Pesa unos 10 MB en total.';
    });
  });

  /* ---------- arranque ---------- */

  function load(url) {
    var open = ('caches' in window) ? caches.open(CACHE).then(function (c) { return c.match(url); })
                                    : Promise.resolve(null);
    return open.then(function (hit) { return hit || fetch(url); })
               .then(function (res) { return res.arrayBuffer(); });
  }

  el.boot.addEventListener('click', function () {
    el.boot.disabled = true;
    setPhase('Cargando en memoria…');
    Promise.all([load('system/bzImage.bin'), load('system/initrd.gz')]).then(function (parts) {
      el.pack.hidden = true;
      el.stage.hidden = false;
      setPhase('Arrancando…');

      term = new Term(el.term, 80, 26);
      var Emu = window.V86 || window.V86Starter;
      emulator = new Emu({
        wasm_path: 'vendor/v86.wasm',
        memory_size: 128 * 1024 * 1024,
        vga_memory_size: 2 * 1024 * 1024,
        bios: { url: 'vendor/seabios.bin' },
        vga_bios: { url: 'vendor/vgabios.bin' },
        bzimage: { buffer: parts[0] },
        initrd: { buffer: parts[1] },
        // La consola VGA de v86 se congela con este kernel: usamos la serie.
        cmdline: 'console=ttyS0 rootfstype=ramfs tsc=reliable mitigations=off random.trust_cpu=on',
        disable_speaker: true,
        autostart: true
      });

      var booted = false;
      emulator.add_listener('serial0-output-byte', function (byte) {
        term.write(byte);
        if (!booted) { booted = true; setPhase('En marcha', true); }
      });
      el.term.focus();
      window.emulator = emulator; // útil desde la consola del navegador
    }).catch(function (err) {
      setPhase('No se pudo arrancar');
      el.boot.disabled = false;
      console.error(err);
    });
  });

  /* ---------- teclado ---------- */

  // El puerto serie emulado no tiene cola: si le metemos las teclas de golpe
  // (teclear rápido, pegar texto) se pierden bytes. Las soltamos de una en una.
  var pending = '';
  var drain = null;

  function send(text) {
    if (!emulator || !text) return;
    pending += text;
    if (drain) return;
    drain = setInterval(function () {
      if (!emulator || !pending) {
        clearInterval(drain);
        drain = null;
        return;
      }
      emulator.serial0_send(pending.charAt(0));
      pending = pending.slice(1);
    }, 12);
  }

  document.addEventListener('keydown', function (e) {
    if (!emulator || el.stage.hidden) return;
    if (e.metaKey || e.altKey) return;
    if (e.ctrlKey && (e.key === 'c' || e.key === 'v') && window.getSelection().toString()) return;
    var bytes = Term.keyToBytes(e);
    if (bytes === null) return;
    e.preventDefault();
    send(bytes);
  });

  // En móvil no hay keydown útil: un campo invisible saca el teclado del sistema.
  el.input.addEventListener('input', function () {
    send(el.input.value);
    el.input.value = '';
  });
  el.kbd.addEventListener('click', function () { el.input.focus(); });
  el.term.addEventListener('click', function () {
    if (matchMedia('(pointer: coarse)').matches) el.input.focus();
  });

  Array.prototype.forEach.call(document.querySelectorAll('.key[data-send]'), function (btn) {
    btn.addEventListener('click', function () { send(btn.getAttribute('data-send')); });
  });

  /* ---------- controles ---------- */

  el.pause.addEventListener('click', function () {
    if (!emulator) return;
    if (emulator.is_running()) {
      emulator.stop();
      el.pause.textContent = 'Reanudar';
      setPhase('En pausa');
    } else {
      emulator.run();
      el.pause.textContent = 'Pausar';
      setPhase('En marcha', true);
    }
  });

  el.reset.addEventListener('click', function () {
    if (!emulator) return;
    term.reset();
    emulator.restart();
    setPhase('Reiniciando…');
  });

  el.close.addEventListener('click', function () {
    if (emulator) { emulator.destroy(); emulator = null; }
    if (term) { term.destroy(); term = null; }
    pending = '';
    el.term.textContent = '';
    el.stage.hidden = true;
    el.pack.hidden = false;
    el.pause.textContent = 'Pausar';
    refresh();
  });

  /* ---------- red ---------- */

  function net() {
    var off = !navigator.onLine;
    el.net.textContent = off ? 'Sin conexión — funcionando desde el dispositivo' : '';
    el.net.classList.toggle('off', off);
  }
  addEventListener('online', net);
  addEventListener('offline', net);
  net();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js');
  refresh();
})();
