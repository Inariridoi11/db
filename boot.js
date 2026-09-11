/* Catálogo de sistemas para v86: descarga cada uno a la caché del navegador y
   lo arranca desde ahí, con o sin conexión.

   Los sistemas de consola sacan la pantalla por el puerto serie y la dibuja
   term.js; los gráficos usan el canvas de v86, con teclado y ratón. */
(function () {
  'use strict';

  var CACHE = 'vm-systems-v1';

  // Archivos que necesita cualquier sistema: el emulador y las dos BIOS.
  var RUNTIME = [
    { url: 'vendor/v86.wasm',    bytes: 2101621 },
    { url: 'vendor/seabios.bin', bytes: 131072 },
    { url: 'vendor/vgabios.bin', bytes: 36352 }
  ];

  var SYSTEMS = [
    {
      id: 'kolibri',
      name: 'KolibriOS',
      tag: 'gráfico',
      kind: 'graphical',
      desc: 'Escritorio completo escrito en ensamblador que cabe en un disquete. ' +
            'Arranca en un segundo y trae editor, calculadora, gestor de archivos y juegos.',
      hint: 'Ratón y teclado van a la máquina. Abre el menú de abajo a la izquierda.',
      files: [{ url: 'system/kolibri.img', bytes: 1474560 }],
      options: function (bufs) {
        return { fda: { buffer: bufs[0] }, boot_order: 0x123 };
      }
    },
    {
      id: 'tux',
      name: 'Linux 6.12',
      tag: 'consola',
      kind: 'serial',
      desc: 'Kernel Linux con BusyBox: una shell de verdad con sus comandos, ' +
            'sistema de archivos y editor vi. Arranca en un par de segundos.',
      hint: 'Escribe directamente. Prueba uname -a, ls /, cat /proc/cpuinfo, free -m o vi hola.txt.',
      files: [
        { url: 'system/bzImage.bin', bytes: 5788160 },
        { url: 'system/initrd.gz',   bytes: 2276000 }
      ],
      options: function (bufs) {
        return {
          bzimage: { buffer: bufs[0] },
          initrd: { buffer: bufs[1] },
          // La consola VGA de v86 se congela con este kernel: usamos la serie.
          cmdline: 'console=ttyS0 rootfstype=ramfs tsc=reliable mitigations=off random.trust_cpu=on'
        };
      }
    }
  ];

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    phase: $('phase'), pack: $('pack'), stage: $('stage'), list: $('systems'),
    mine: $('mine'), drop: $('drop'), file: $('file'), importState: $('import-state'),
    term: $('term'), termWrap: $('term-wrap'), screen: $('screen'), keys: $('keys'),
    input: $('mobile-input'), kbd: $('kbd'), hint: $('hint'), net: $('net'),
    pause: $('pause'), reset: $('reset'), close: $('close'), full: $('full'), save: $('save')
  };

  var mb = function (n) { return (n / 1048576).toFixed(1) + ' MB'; };
  var runtimeBytes = RUNTIME.reduce(function (n, f) { return n + f.bytes; }, 0);
  var emulator = null;
  var term = null;
  var current = null;
  // El móvil de Apple no deja poner en pantalla completa nada que no sea vídeo.
  var canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  function totalBytes(sys) {
    return sys.files.reduce(function (n, f) { return n + f.bytes; }, 0) + runtimeBytes;
  }

  function setPhase(text, on) {
    el.phase.textContent = text;
    el.phase.classList.toggle('on', !!on);
  }

  /* ---------- fichas ---------- */

  SYSTEMS.forEach(function (sys) {
    var li = document.createElement('li');
    li.className = 'card';
    li.innerHTML =
      '<div class="card-head">' +
        '<b class="card-name"></b>' +
        '<span class="tag"></span>' +
        '<span class="card-size"></span>' +
      '</div>' +
      '<p class="card-desc"></p>' +
      '<div class="bar" hidden><div class="bar-fill"></div></div>' +
      '<p class="card-state"></p>' +
      '<div class="card-actions">' +
        '<button class="btn primary small" data-act="get"></button>' +
        '<button class="btn ghost small" data-act="boot">Arrancar</button>' +
        '<button class="btn ghost small" data-act="restore" hidden></button>' +
        '<button class="btn ghost small" data-act="forget" hidden>Olvidar estado</button>' +
        '<button class="btn ghost small" data-act="drop" hidden>Borrar</button>' +
      '</div>';
    li.querySelector('.card-name').textContent = sys.name;
    li.querySelector('.tag').textContent = sys.tag;
    li.querySelector('.card-size').textContent = mb(totalBytes(sys));
    li.querySelector('.card-desc').textContent = sys.desc;
    li.querySelector('[data-act="get"]').textContent = 'Descargar ' + mb(totalBytes(sys));
    el.list.appendChild(li);

    sys.el = {
      card: li,
      bar: li.querySelector('.bar-fill'),
      barWrap: li.querySelector('.bar'),
      state: li.querySelector('.card-state'),
      get: li.querySelector('[data-act="get"]'),
      boot: li.querySelector('[data-act="boot"]'),
      drop: li.querySelector('[data-act="drop"]'),
      restore: li.querySelector('[data-act="restore"]'),
      forget: li.querySelector('[data-act="forget"]')
    };
    sys.el.get.addEventListener('click', function () { fetchSystem(sys); });
    sys.el.boot.addEventListener('click', function () { boot(sys); });
    sys.el.drop.addEventListener('click', function () { drop(sys); });
    sys.el.restore.addEventListener('click', function () { boot(sys, states[sys.id]); });
    sys.el.forget.addEventListener('click', function () {
      StateStore.borrar(sys.id).then(refreshStates);
    });
  });

  /* ---------- estado en caché ---------- */

  function need(sys) { return RUNTIME.concat(sys.files); }

  function missing(sys) {
    if (!('caches' in window)) return Promise.resolve(need(sys));
    return caches.open(CACHE).then(function (c) {
      return Promise.all(need(sys).map(function (f) {
        return c.match(f.url).then(function (hit) { return hit ? null : f; });
      }));
    }).then(function (list) { return list.filter(Boolean); });
  }

  function refresh(sys) {
    return missing(sys).then(function (left) {
      var ready = left.length === 0;
      sys.el.boot.disabled = !ready;
      sys.el.get.hidden = ready;
      sys.el.drop.hidden = !ready;
      sys.el.card.classList.toggle('ready', ready);
      sys.el.state.textContent = ready ? 'Guardado — funciona sin conexión' : '';
      if (!ready) { sys.el.restore.hidden = true; sys.el.forget.hidden = true; }
      else paintState(sys);
      return ready;
    });
  }

  function refreshAll() {
    return Promise.all(SYSTEMS.map(refresh)).then(function (states) {
      var ready = states.filter(Boolean).length;
      if (ready) setPhase(ready + (ready > 1 ? ' sistemas listos' : ' sistema listo') + ' sin conexión', true);
      else setPhase('Elige un sistema');
    });
  }

  /* ---------- descarga ---------- */

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

  function fetchSystem(sys) {
    if (!('caches' in window)) {
      sys.el.state.textContent = 'Este navegador no puede guardar sistemas (falta Cache Storage).';
      return;
    }
    sys.el.get.disabled = true;
    sys.el.barWrap.hidden = false;
    setPhase('Descargando ' + sys.name + '…');

    missing(sys).then(function (left) {
      var total = left.reduce(function (n, f) { return n + f.bytes; }, 0) || 1;
      var got = 0;
      return caches.open(CACHE).then(function (cache) {
        return left.reduce(function (chain, f) {
          return chain.then(function () {
            return download(f, function (n) {
              got += n;
              var pct = Math.min(100, got / total * 100);
              sys.el.bar.style.width = pct.toFixed(1) + '%';
              sys.el.state.textContent = mb(got) + ' de ' + mb(total) + ' (' + pct.toFixed(0) + '%)';
            }).then(function (buf) {
              return cache.put(f.url, new Response(buf));
            });
          });
        }, Promise.resolve());
      });
    }).then(function () {
      sys.el.bar.style.width = '100%';
      return refreshAll();
    }).catch(function (err) {
      sys.el.state.textContent = 'No se pudo descargar: ' + err.message + '. Reintenta con conexión.';
      setPhase('Error en la descarga');
    }).then(function () {
      sys.el.get.disabled = false;
    });
  }

  function drop(sys) {
    caches.open(CACHE).then(function (cache) {
      // El runtime lo comparten todos: solo se borra si no queda nadie más.
      var others = SYSTEMS.filter(function (s) { return s !== sys; });
      return Promise.all(others.map(function (s) {
        return missing(s).then(function (left) { return left.length === 0; });
      })).then(function (readyOthers) {
        var files = sys.files.slice();
        if (readyOthers.indexOf(true) < 0) files = files.concat(RUNTIME);
        return Promise.all(files.map(function (f) { return cache.delete(f.url); }));
      });
    }).then(function () {
      sys.el.bar.style.width = '0';
      sys.el.barWrap.hidden = true;
      sys.el.state.textContent = '';
      return refreshAll();
    });
  }

  /* ---------- arranque ---------- */

  function load(url) {
    var open = ('caches' in window) ? caches.open(CACHE).then(function (c) { return c.match(url); })
                                    : Promise.resolve(null);
    return open.then(function (hit) { return hit || fetch(url); })
               .then(function (res) { return res.arrayBuffer(); });
  }

  function boot(sys, state) {
    sys.el.boot.disabled = true;
    setPhase('Cargando ' + sys.name + '…');
    Promise.all(sys.files.map(function (f) { return load(f.url); }))
      .then(function (bufs) { return withState(sys, bufs, state); })
      .catch(function (err) {
        setPhase('No se pudo arrancar');
        sys.el.boot.disabled = false;
        console.error(err);
      });
  }

  // Si hay estado guardado, se lo pasamos a v86 como imagen inicial: la máquina
  // aparece tal y como la dejaste, sin repetir el arranque.
  function withState(sys, bufs, state) {
    if (!state) return bootWith(sys, bufs);
    return state.blob.arrayBuffer().then(function (buf) {
      bootWith(sys, bufs, buf);
    });
  }

  function bootWith(sys, bufs, stateBuffer) {
    current = sys;
    el.pack.hidden = true;
    el.stage.hidden = false;
    el.hint.textContent = sys.hint;

    // De una imagen importada no sabemos cómo pinta: enseñamos el canvas y, si
    // además habla por el puerto serie, aparece el terminal debajo.
    var graphical = sys.kind !== 'serial';
    el.screen.hidden = !graphical;
    el.termWrap.hidden = sys.kind !== 'serial';
    el.keys.hidden = sys.kind !== 'serial';
    if (el.full) el.full.hidden = !canFullscreen;
    setPhase('Arrancando ' + sys.name + '…');

    var opts = {
      wasm_path: 'vendor/v86.wasm',
      memory_size: (sys.memory || 128) * 1024 * 1024,
      vga_memory_size: 8 * 1024 * 1024,
      bios: { url: 'vendor/seabios.bin' },
      vga_bios: { url: 'vendor/vgabios.bin' },
      disable_speaker: true,
      autostart: true
    };
    var extra = sys.options(bufs);
    for (var k in extra) if (extra.hasOwnProperty(k)) opts[k] = extra[k];
    if (graphical) opts.screen_container = el.screen;
    if (stateBuffer) {
      opts.initial_state = { buffer: stateBuffer };
      setPhase('Restaurando ' + sys.name + '…');
    }

    // Los sistemas de consola y las imágenes importadas escuchan el serie.
    if (sys.kind !== 'graphical') term = new Term(el.term, 80, 26);

    var Emu = window.V86 || window.V86Starter;
    emulator = new Emu(opts);

    if (graphical || stateBuffer) {
      emulator.add_listener('emulator-started', function () { setPhase('En marcha', true); });
    }
    if (term) {
      var booted = false;
      emulator.add_listener('serial0-output-byte', function (byte) {
        term.write(byte);
        if (!booted) {
          booted = true;
          setPhase('En marcha', true);
          if (sys.kind === 'imported') el.termWrap.hidden = false;
        }
      });
      if (sys.kind === 'serial') el.term.focus();
    }
    window.emulator = emulator; // útil desde la consola del navegador
  }


  /* ---------- estados guardados ---------- */

  // Arrancar un escritorio pesado cuesta minutos; restaurarlo, un par de
  // segundos. El estado es una foto de la RAM y de los dispositivos.
  function saveState() {
    if (!emulator || !current) return;
    if (!StateStore.disponible) {
      setPhase('Este navegador no puede guardar estados');
      return;
    }
    var sys = current;
    var running = emulator.is_running();
    el.save.disabled = true;
    setPhase('Guardando estado…');
    if (running) emulator.stop();

    emulator.save_state().then(function (buf) {
      return StateStore.guardar({
        id: sys.id,
        name: sys.name,
        size: buf.byteLength,
        saved: Date.now(),
        blob: new Blob([buf])
      });
    }).then(function () {
      setPhase('Estado guardado', true);
      return refreshStates();
    }).catch(function (err) {
      setPhase('No se pudo guardar el estado');
      console.error(err);
    }).then(function () {
      if (running && emulator) emulator.run();
      el.save.disabled = false;
    });
  }

  var states = {};

  function refreshStates() {
    return StateStore.listar().catch(function () { return []; }).then(function (list) {
      states = {};
      list.forEach(function (st) { states[st.id] = st; });
      SYSTEMS.forEach(paintState);
      return renderMine();
    });
  }

  function paintState(sys) {
    if (!sys.el || !sys.el.restore) return;
    var st = states[sys.id];
    sys.el.restore.hidden = !st;
    sys.el.forget.hidden = !st;
    if (st) sys.el.restore.textContent = 'Restaurar estado (' + mb(st.size) + ')';
  }

  if (el.save) el.save.addEventListener('click', saveState);


  /* ---------- imágenes importadas por el usuario ---------- */

  var FLOPPY_MAX = 2949120;       // 2,88 MB: por encima de eso no es un disquete
  var HUGE = 400 * 1048576;       // a partir de aquí avisamos: puede no caber en memoria

  function kindOf(file) {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'iso') return 'cdrom';
    if (file.size <= FLOPPY_MAX) return 'fda';
    return 'hda';
  }

  var MEDIA = { fda: 'disquete', cdrom: 'CD-ROM', hda: 'disco duro' };

  // Copiar medio giga a IndexedDB tarda y no aporta nada para usarla ya: las
  // imágenes grandes quedan disponibles al instante y se guardan solo si lo pides.
  var AUTO_SAVE_MAX = 64 * 1048576;
  var session = [];

  function importFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;

    list.forEach(function (file) {
      var rec = {
        id: 'user:' + file.name,
        name: file.name,
        media: kindOf(file),
        size: file.size,
        blob: file,
        added: Date.now(),
        stored: false
      };
      session = session.filter(function (r) { return r.id !== rec.id; });
      session.push(rec);
    });

    el.importState.textContent = list.length === 1
      ? list[0].name + ' lista para arrancar.'
      : list.length + ' imágenes listas para arrancar.';

    renderMine();

    // Las pequeñas se guardan solas; las grandes esperan a que pulses el botón.
    var small = session.filter(function (r) { return !r.stored && r.size <= AUTO_SAVE_MAX; });
    return small.reduce(function (chain, rec) {
      return chain.then(function () { return persist(rec, true); });
    }, Promise.resolve());
  }

  function warnStore(err) {
    var msg = (err && err.message) ? err.message : String(err);
    el.importState.textContent = 'Aviso: ' + msg + '. Las imágenes sueltas siguen funcionando ' +
      'en esta sesión.';
  }

  function persist(rec, quiet) {
    if (!ImageStore.disponible) {
      el.importState.textContent = 'Este navegador no puede guardar imágenes (falta IndexedDB).';
      return Promise.resolve();
    }
    if (!quiet) {
      el.importState.textContent = 'Copiando ' + rec.name + ' (' + mb(rec.size) +
        ') al dispositivo. Con imágenes grandes tarda un rato; mientras tanto ya puedes arrancarla.';
    }
    return ImageStore.guardar(rec).then(function () {
      rec.stored = true;
      if (!quiet) el.importState.textContent = rec.name + ' guardada: ya funciona sin conexión.';
      return refreshStates();
    }).catch(function (err) {
      el.importState.textContent = 'No se pudo guardar ' + rec.name + ': ' +
        (err && err.message ? err.message : err) + '. Puedes arrancarla igual en esta sesión.';
    });
  }

  function importedSystem(rec) {
    return {
      id: rec.id,
      name: rec.name,
      tag: MEDIA[rec.media],
      kind: 'imported',
      hint: 'Imagen tuya, arrancada como ' + MEDIA[rec.media] +
            '. Teclado y ratón van a la máquina.',
      files: [],
      record: rec,
      memory: rec.memory || 256,
      options: function (bufs) {
        var o = {};
        o[rec.media] = { buffer: bufs[0] };   // ArrayBuffer o File, v86 admite ambos
        return o;                             // y elige solo el orden de arranque
      }
    };
  }

  function renderMine() {
    // Lo que acabas de soltar se pinta ya, sin esperar a la base de datos: si
    // está bloqueada por otra pestaña, la imagen se usa igual.
    paintMine([]);
    return ImageStore.listar().catch(function (err) {
      warnStore(err);
      return [];
    }).then(paintMine);
  }

  function paintMine(stored) {
      // Lo guardado en el dispositivo, más lo que acabas de soltar en esta
      // sesión y todavía no se ha copiado.
      var recs = stored.map(function (r) { r.stored = true; return r; });
      session.forEach(function (r) {
        if (!recs.some(function (s) { return s.id === r.id; })) recs.push(r);
      });

      el.mine.innerHTML = '';
      recs.sort(function (a, b) { return b.added - a.added; }).forEach(function (rec) {
        var sys = importedSystem(rec);
        var li = document.createElement('li');
        li.className = 'card' + (rec.stored ? ' ready' : '');
        li.innerHTML =
          '<div class="card-head">' +
            '<b class="card-name"></b><span class="tag"></span><span class="card-size"></span>' +
          '</div>' +
          '<p class="card-state"></p>' +
          '<div class="card-actions">' +
            '<button class="btn primary small" data-act="boot">Arrancar</button>' +
            '<button class="btn ghost small" data-act="restore" hidden></button>' +
            '<button class="btn ghost small" data-act="forget" hidden>Olvidar estado</button>' +
            '<label class="mem">RAM ' +
              '<select data-act="mem">' +
                '<option value="128">128 MB</option>' +
                '<option value="256">256 MB</option>' +
                '<option value="512">512 MB</option>' +
                '<option value="1024">1 GB</option>' +
                '<option value="2048">2 GB (puede no caber)</option>' +
              '</select></label>' +
            '<button class="btn ghost small" data-act="keep" hidden>Guardar en el dispositivo</button>' +
            '<button class="btn ghost small" data-act="drop">Borrar</button>' +
          '</div>';
        li.querySelector('.card-name').textContent = rec.name;
        li.querySelector('.tag').textContent = MEDIA[rec.media];
        li.querySelector('.card-size').textContent = mb(rec.size);
        li.querySelector('.card-state').textContent = rec.stored
          ? 'Guardada en el dispositivo — funciona sin conexión'
          : 'Solo en esta sesión: al recargar la página habrá que volver a soltarla.';

        var mem = li.querySelector('[data-act="mem"]');
        mem.value = String(sys.memory);
        mem.addEventListener('change', function () {
          sys.memory = parseInt(mem.value, 10);
          rec.memory = sys.memory;
          if (rec.stored) ImageStore.guardar(rec);   // recordamos la elección
        });

        sys.el = { boot: li.querySelector('[data-act="boot"]') };
        li.querySelector('[data-act="boot"]').addEventListener('click', function () {
          bootImported(sys);
        });

        var keep = li.querySelector('[data-act="keep"]');
        if (!rec.stored) {
          keep.hidden = false;
          keep.addEventListener('click', function () {
            keep.disabled = true;
            keep.textContent = 'Copiando…';
            persist(rec).then(renderMine);
          });
        }

        var st = states[rec.id];
        var restore = li.querySelector('[data-act="restore"]');
        var forget = li.querySelector('[data-act="forget"]');
        if (st) {
          restore.hidden = false;
          forget.hidden = false;
          restore.textContent = 'Restaurar estado (' + mb(st.size) + ')';
          restore.addEventListener('click', function () { bootImported(sys, st); });
          forget.addEventListener('click', function () {
            StateStore.borrar(rec.id).then(refreshStates);
          });
        }

        li.querySelector('[data-act="drop"]').addEventListener('click', function () {
          session = session.filter(function (r) { return r.id !== rec.id; });
          Promise.all([ImageStore.borrar(rec.id), StateStore.borrar(rec.id)]).then(refreshStates);
        });
        el.mine.appendChild(li);
      });
  }

  function bootImported(sys, state) {
    sys.el.boot.disabled = true;
    setPhase('Cargando ' + sys.name + '…');
    // El emulador tiene que estar descargado aunque la imagen sea tuya.
    var runtimeReady = ('caches' in window)
      ? caches.open(CACHE).then(function (c) { return c.match(RUNTIME[0].url); })
      : Promise.resolve(null);

    runtimeReady.then(function (hit) {
      if (!hit && !navigator.onLine) {
        throw new Error('falta el emulador y no hay conexión: descarga antes cualquier sistema');
      }
      // Se lo pasamos a v86 como File: por encima de 256 MB lo lee a trozos.
      var blob = sys.record.blob;
      var file = (typeof File !== 'undefined' && blob instanceof File)
        ? blob : new File([blob], sys.record.name);
      return withState(sys, [file], state);
    }).catch(function (err) {
      setPhase('No se pudo arrancar');
      sys.el.boot.disabled = false;
      el.importState.textContent = 'Error al arrancar ' + sys.name + ': ' + err.message;
      console.error(err);
    });
  }

  if (el.drop) {
    el.file.addEventListener('change', function () {
      importFiles(el.file.files);
      el.file.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      el.drop.addEventListener(ev, function (e) {
        e.preventDefault();
        el.drop.classList.add('over');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      el.drop.addEventListener(ev, function (e) {
        e.preventDefault();
        el.drop.classList.remove('over');
        if (ev === 'drop') importFiles(e.dataTransfer.files);
      });
    });
  }

  /* ---------- teclado de los sistemas de consola ---------- */

  // El puerto serie emulado no tiene cola: si le metemos las teclas de golpe
  // (teclear rápido, pegar texto) se pierden bytes. Las soltamos de una en una.
  var pending = '';
  var drain = null;

  function send(text) {
    if (!emulator || !text || !current || current.kind !== 'serial') return;
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
    // En los sistemas gráficos el teclado lo gestiona el propio v86.
    if (!emulator || el.stage.hidden || !current || current.kind !== 'serial') return;
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

  /* ---------- pantalla completa ---------- */

  function toggleFullscreen() {
    var out = document.fullscreenElement || document.webkitFullscreenElement;
    if (out) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    // Va a pantalla completa el bloque entero, no solo la pantalla: así los
    // botones de pausar, reiniciar y salir siguen a mano.
    var node = el.stage;
    var enter = node.requestFullscreen || node.webkitRequestFullscreen;
    if (enter) {
      var r = enter.call(node);
      if (r && r.catch) r.catch(function (err) { console.warn('pantalla completa:', err); });
    }
  }

  function syncFullscreenLabel() {
    var out = document.fullscreenElement || document.webkitFullscreenElement;
    el.full.textContent = out ? 'Salir de pantalla completa' : 'Pantalla completa';
  }

  if (el.full && canFullscreen) {
    el.full.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', syncFullscreenLabel);
    document.addEventListener('webkitfullscreenchange', syncFullscreenLabel);
  }

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
    if (term) term.reset();
    emulator.restart();
    setPhase('Reiniciando…');
  });

  el.close.addEventListener('click', function () {
    if (emulator) { emulator.destroy(); emulator = null; }
    if (term) { term.destroy(); term = null; }
    pending = '';
    el.term.textContent = '';
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
    el.stage.hidden = true;
    el.pack.hidden = false;
    el.pause.textContent = 'Pausar';
    current = null;
    refreshAll();
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

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  refreshAll();
  refreshStates();
})();
