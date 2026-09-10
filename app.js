/* Arranque de la app: instalación, cacheo offline y enlace con el juego. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    score: $('score'), best: $('best'), wave: $('wave'), lives: $('lives'),
    overlay: $('overlay'), play: $('play'), result: $('result'), tagline: $('tagline'),
    install: $('install'), download: $('download'), iosHelp: $('ios-help'),
    dot: $('offline-dot'), state: $('offline-state'), installText: $('install-text'),
    sound: $('sound'), toast: $('toast')
  };

  /* ---------------- juego ---------------- */

  var game = new Orbita.Game($('game'), {
    onStats: function (s) {
      el.score.textContent = s.score;
      el.best.textContent = s.best;
      el.wave.textContent = s.wave;
      el.lives.innerHTML = new Array(Math.max(0, s.lives) + 1).join('<i></i>');
    },
    onState: function (state) {
      if (state === 'playing') {
        el.overlay.hidden = true;
      } else if (state === 'over') {
        el.overlay.hidden = false;
        el.result.hidden = false;
        el.tagline.hidden = true;
        el.play.textContent = 'Volver a jugar';
        var record = game.score >= game.best && game.score > 0;
        el.result.innerHTML = (record ? '¡Nuevo récord! ' : 'Partida terminada. ') +
          'Puntuación <b>' + game.score + '</b> · oleada <b>' + game.wave + '</b>';
      }
    }
  });

  el.play.addEventListener('click', function () { game.start(); });
  window.orbita = game; // accesible desde la consola para depurar

  var soundOn = localStorage.getItem('orbita.sound') !== 'off';
  function applySound() {
    game.setSound(soundOn);
    el.sound.setAttribute('aria-pressed', String(soundOn));
    el.sound.textContent = soundOn ? '♪' : '♪̸';
  }
  el.sound.addEventListener('click', function () {
    soundOn = !soundOn;
    try { localStorage.setItem('orbita.sound', soundOn ? 'on' : 'off'); } catch (e) {}
    applySound();
  });
  applySound();

  /* ---------------- avisos ---------------- */

  var toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 3200);
  }

  /* ---------------- estado offline ---------------- */

  function setOffline(status, text) {
    el.dot.className = 'dot' + (status === 'ready' ? ' ready' : status === 'off' ? ' off' : '');
    el.state.textContent = text;
  }

  function swMessage(payload) {
    return new Promise(function (resolve, reject) {
      navigator.serviceWorker.ready.then(function (reg) {
        var worker = reg.active || navigator.serviceWorker.controller;
        if (!worker) return reject(new Error('sin service worker activo'));
        var ch = new MessageChannel();
        var timer = setTimeout(function () { reject(new Error('sin respuesta')); }, 30000);
        ch.port1.onmessage = function (e) { clearTimeout(timer); resolve(e.data); };
        worker.postMessage(payload, [ch.port2]);
      }, reject);
    });
  }

  function refreshStatus() {
    return swMessage({ type: 'STATUS' }).then(function (data) {
      if (data && data.cached >= data.total && data.total > 0) {
        setOffline('ready', 'Listo para jugar sin conexión');
        el.download.textContent = 'Actualizar contenido offline';
        el.installText.textContent = 'El juego ya está guardado en este dispositivo (' +
          data.cached + '/' + data.total + ' archivos). Puedes cerrar Internet y seguir jugando.';
      } else {
        setOffline('', 'Descarga incompleta (' + ((data && data.cached) || 0) + '/' + ((data && data.total) || '?') + ')');
        el.download.textContent = 'Descargar contenido offline';
      }
      return data;
    });
  }

  if ('serviceWorker' in navigator) {
    setOffline('', 'Preparando modo offline…');
    navigator.serviceWorker.register('sw.js').then(function () {
      return refreshStatus();
    }).catch(function () {
      setOffline('off', 'Modo offline no disponible');
      el.installText.textContent = 'Este navegador o esta dirección no permiten guardar el juego (hace falta HTTPS o localhost).';
      el.download.disabled = true;
    });
  } else {
    setOffline('off', 'Modo offline no disponible');
    el.download.disabled = true;
  }

  el.download.addEventListener('click', function () {
    el.download.disabled = true;
    var previous = el.download.textContent;
    el.download.textContent = 'Descargando…';
    swMessage({ type: 'PRECACHE' }).then(function (data) {
      if (data && data.ok) {
        toast('Contenido guardado: ya puedes jugar sin conexión');
      } else {
        toast('No se pudo descargar todo. Inténtalo con conexión.');
      }
      return refreshStatus();
    }).catch(function () {
      toast('No se pudo descargar el contenido');
      el.download.textContent = previous;
    }).then(function () {
      el.download.disabled = false;
    });
  });

  addEventListener('online', function () { toast('Conexión recuperada'); });
  addEventListener('offline', function () { toast('Sin conexión — el juego sigue funcionando'); });

  /* ---------------- instalación ---------------- */

  var deferred = null;
  var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function installed() {
    el.install.hidden = true;
    el.iosHelp.hidden = true;
    el.installText.textContent = 'App instalada. Ábrela desde tu pantalla de inicio y juega aunque no tengas red.';
  }

  if (standalone) installed();
  else if (isIOS) el.iosHelp.hidden = false;

  addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    el.install.hidden = false;
  });

  el.install.addEventListener('click', function () {
    if (!deferred) return;
    el.install.disabled = true;
    deferred.prompt();
    deferred.userChoice.then(function (choice) {
      if (choice.outcome === 'accepted') {
        toast('Instalando…');
      } else {
        el.install.disabled = false;
      }
      deferred = null;
    });
  });

  addEventListener('appinstalled', function () {
    installed();
    toast('Instalada. Búscala en tu pantalla de inicio.');
  });
})();
