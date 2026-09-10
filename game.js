/* Órbita — arcade offline. Todo el juego vive aquí: sin assets externos,
   así que una vez cacheado funciona igual sin red. */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ---------------- audio ---------------- */

  var Sfx = {
    ctx: null,
    on: true,
    ensure: function () {
      if (!this.ctx && global.AudioContext) this.ctx = new AudioContext();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    play: function (type, freq, dur, gain) {
      if (!this.on) return;
      var ctx = this.ensure();
      if (!ctx) return;
      var osc = ctx.createOscillator();
      var amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.4), ctx.currentTime + dur);
      amp.gain.setValueAtTime(gain, ctx.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(amp).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    },
    shoot: function () { this.play('square', 660, 0.08, 0.05); },
    hit: function () { this.play('triangle', 320, 0.18, 0.10); },
    boom: function () { this.play('sawtooth', 150, 0.42, 0.14); },
    power: function () { this.play('sine', 880, 0.25, 0.10); }
  };

  /* ---------------- entidades ---------------- */

  function Asteroid(w, wave) {
    this.r = rand(16, 34);
    this.x = rand(this.r, w - this.r);
    this.y = -this.r - 10;
    this.vx = rand(-40, 40);
    this.vy = rand(55, 95) + wave * 7;
    this.spin = rand(-1.6, 1.6);
    this.a = rand(0, TAU);
    this.hp = this.r > 27 ? 2 : 1;
    this.shape = [];
    var n = 8 + ((Math.random() * 4) | 0);
    for (var i = 0; i < n; i++) this.shape.push({ a: (i / n) * TAU, r: rand(0.72, 1.12) });
  }

  function Hunter(w, wave) {
    this.r = 15;
    this.x = rand(40, w - 40);
    this.y = -30;
    this.vx = rand(-70, 70);
    this.vy = 45 + wave * 4;
    this.hp = 2;
    this.cool = rand(0.8, 1.8);
  }

  function Powerup(x, y) {
    this.r = 12;
    this.x = x;
    this.y = y;
    this.vy = 70;
    this.kind = pick(['shield', 'rapid', 'rapid', 'life']);
    this.a = 0;
  }

  /* ---------------- juego ---------------- */

  function Game(canvas, hooks) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks || {};
    this.state = 'menu';
    this.keys = {};
    this.w = 360;
    this.h = 640;
    this.dpr = 1;
    this.best = +(localStorage.getItem('orbita.best') || 0) || 0;
    this.stars = [];
    this.reset();
    this.bind();
    this.resize();
    var self = this;
    this.last = 0;
    requestAnimationFrame(function step(t) {
      var dt = self.last ? Math.min(0.05, (t - self.last) / 1000) : 0;
      self.last = t;
      self.frame(dt);
      requestAnimationFrame(step);
    });
  }

  Game.prototype.reset = function () {
    this.score = 0;
    this.wave = 1;
    this.waveTimer = 0;
    this.lives = 3;
    this.rocks = [];
    this.hunters = [];
    this.bullets = [];
    this.foeShots = [];
    this.parts = [];
    this.drops = [];
    this.spawn = 1.1;
    this.spawnTimer = 0;
    this.shake = 0;
    this.touchX = null;
    this.player = {
      x: this.w / 2, y: this.h - 72, r: 14,
      vx: 0, cool: 0, shield: 0, rapid: 0, invuln: 2, thrust: 0
    };
    this.emit();
  };

  Game.prototype.emit = function () {
    if (this.hooks.onStats) {
      this.hooks.onStats({ score: this.score, best: this.best, wave: this.wave, lives: this.lives });
    }
  };

  /* -------- entrada -------- */

  Game.prototype.bind = function () {
    var self = this;

    addEventListener('resize', function () { self.resize(); });
    addEventListener('keydown', function (e) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Space'].indexOf(e.key) >= 0) e.preventDefault();
      self.keys[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'p') self.togglePause();
      if (e.key === 'Enter' && self.state !== 'playing') self.start();
    });
    addEventListener('keyup', function (e) { self.keys[e.key.toLowerCase()] = false; });
    addEventListener('blur', function () {
      self.keys = {};
      if (self.state === 'playing') self.togglePause();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && self.state === 'playing') self.togglePause();
    });

    var track = function (e) {
      if (self.state !== 'playing') return;
      e.preventDefault();
      var rect = self.cv.getBoundingClientRect();
      self.touchX = e.touches[0].clientX - rect.left;
    };
    this.cv.addEventListener('touchstart', track, { passive: false });
    this.cv.addEventListener('touchmove', track, { passive: false });
    this.cv.addEventListener('touchend', function () { self.touchX = null; });
  };

  Game.prototype.resize = function () {
    var rect = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, global.devicePixelRatio || 1);
    this.w = Math.max(240, rect.width);
    this.h = Math.max(320, rect.height);
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.player.y = this.h - 72;
    this.player.x = clamp(this.player.x, 20, this.w - 20);
    this.stars = [];
    for (var i = 0; i < 90; i++) {
      this.stars.push({ x: Math.random() * this.w, y: Math.random() * this.h, z: rand(0.25, 1), s: rand(0.6, 1.8) });
    }
  };

  /* -------- ciclo -------- */

  Game.prototype.start = function () {
    Sfx.ensure();
    this.reset();
    this.state = 'playing';
    if (this.hooks.onState) this.hooks.onState('playing');
  };

  Game.prototype.togglePause = function () {
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
    else return;
    if (this.hooks.onState) this.hooks.onState(this.state);
  };

  Game.prototype.gameOver = function () {
    this.state = 'over';
    if (this.score > this.best) {
      this.best = this.score;
      try { localStorage.setItem('orbita.best', String(this.best)); } catch (e) {}
    }
    this.emit();
    if (this.hooks.onState) this.hooks.onState('over');
  };

  Game.prototype.frame = function (dt) {
    if (this.state === 'playing') this.update(dt);
    else this.updateStars(dt * 0.35);
    this.draw();
  };

  Game.prototype.updateStars = function (dt) {
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      s.y += (28 + s.z * 90) * dt;
      if (s.y > this.h) { s.y = -2; s.x = Math.random() * this.w; }
    }
  };

  Game.prototype.burst = function (x, y, n, color) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, sp = rand(40, 260);
      this.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.25, 0.7), t: 0, c: color });
    }
  };

  Game.prototype.update = function (dt) {
    var p = this.player, i, j;
    this.updateStars(dt);
    this.shake = Math.max(0, this.shake - dt * 3);

    /* oleadas */
    this.waveTimer += dt;
    if (this.waveTimer > 22) {
      this.waveTimer = 0;
      this.wave++;
      this.spawn = Math.max(0.32, this.spawn * 0.86);
      this.emit();
    }

    /* nave */
    var dir = 0;
    if (this.keys.arrowleft || this.keys.a) dir -= 1;
    if (this.keys.arrowright || this.keys.d) dir += 1;
    if (this.touchX != null) {
      var diff = this.touchX - p.x;
      dir = clamp(diff / 40, -1, 1);
    }
    p.vx += dir * 2600 * dt;
    p.vx *= Math.pow(0.0016, dt);
    p.x = clamp(p.x + p.vx * dt, p.r, this.w - p.r);
    if (p.x <= p.r || p.x >= this.w - p.r) p.vx = 0;
    p.thrust = Math.abs(dir) > 0.1 ? 1 : 0.55;

    p.invuln = Math.max(0, p.invuln - dt);
    p.shield = Math.max(0, p.shield - dt);
    p.rapid = Math.max(0, p.rapid - dt);
    p.cool -= dt;

    var firing = this.keys[' '] || this.keys.arrowup || this.keys.w || this.touchX != null;
    if (firing && p.cool <= 0) {
      p.cool = p.rapid > 0 ? 0.09 : 0.19;
      this.bullets.push({ x: p.x, y: p.y - 16, vy: -640 });
      if (p.rapid > 0) {
        this.bullets.push({ x: p.x - 10, y: p.y - 8, vy: -620 });
        this.bullets.push({ x: p.x + 10, y: p.y - 8, vy: -620 });
      }
      Sfx.shoot();
    }

    /* aparición de enemigos */
    this.spawnTimer = (this.spawnTimer || 0) + dt;
    if (this.spawnTimer > this.spawn) {
      this.spawnTimer = 0;
      this.rocks.push(new Asteroid(this.w, this.wave));
      if (this.wave >= 3 && Math.random() < 0.22) this.hunters.push(new Hunter(this.w, this.wave));
    }

    /* proyectiles propios */
    for (i = this.bullets.length - 1; i >= 0; i--) {
      var b = this.bullets[i];
      b.y += b.vy * dt;
      if (b.y < -12) this.bullets.splice(i, 1);
    }

    /* asteroides */
    for (i = this.rocks.length - 1; i >= 0; i--) {
      var r = this.rocks[i];
      r.x += r.vx * dt; r.y += r.vy * dt; r.a += r.spin * dt;
      if (r.x < r.r || r.x > this.w - r.r) r.vx *= -1;
      if (r.y - r.r > this.h) { this.rocks.splice(i, 1); continue; }

      for (j = this.bullets.length - 1; j >= 0; j--) {
        var bb = this.bullets[j];
        if (Math.hypot(bb.x - r.x, bb.y - r.y) < r.r) {
          this.bullets.splice(j, 1);
          r.hp--;
          this.burst(bb.x, bb.y, 5, '#4af0ff');
          if (r.hp <= 0) {
            this.rocks.splice(i, 1);
            this.score += 10 + this.wave;
            this.burst(r.x, r.y, 18, '#ff5cc6');
            this.shake = 0.35;
            Sfx.boom();
            if (Math.random() < 0.1) this.drops.push(new Powerup(r.x, r.y));
            this.emit();
          } else {
            Sfx.hit();
          }
          break;
        }
      }
      if (this.rocks[i] === r && this.hitsPlayer(r)) this.damage(r.x, r.y);
    }

    /* cazas */
    for (i = this.hunters.length - 1; i >= 0; i--) {
      var hn = this.hunters[i];
      hn.x += hn.vx * dt; hn.y += hn.vy * dt;
      if (hn.x < 24 || hn.x > this.w - 24) hn.vx *= -1;
      hn.cool -= dt;
      if (hn.cool <= 0 && hn.y > 0 && hn.y < this.h * 0.7) {
        hn.cool = rand(1.1, 2.2);
        var ang = Math.atan2(p.y - hn.y, p.x - hn.x);
        this.foeShots.push({ x: hn.x, y: hn.y, vx: Math.cos(ang) * 220, vy: Math.sin(ang) * 220 });
      }
      if (hn.y - hn.r > this.h) { this.hunters.splice(i, 1); continue; }

      for (j = this.bullets.length - 1; j >= 0; j--) {
        var b2 = this.bullets[j];
        if (Math.hypot(b2.x - hn.x, b2.y - hn.y) < hn.r + 3) {
          this.bullets.splice(j, 1);
          hn.hp--;
          if (hn.hp <= 0) {
            this.hunters.splice(i, 1);
            this.score += 35 + this.wave * 2;
            this.burst(hn.x, hn.y, 22, '#ffd166');
            this.shake = 0.4;
            Sfx.boom();
            if (Math.random() < 0.3) this.drops.push(new Powerup(hn.x, hn.y));
            this.emit();
          } else Sfx.hit();
          break;
        }
      }
      if (this.hunters[i] === hn && this.hitsPlayer(hn)) this.damage(hn.x, hn.y);
    }

    /* disparos enemigos */
    for (i = this.foeShots.length - 1; i >= 0; i--) {
      var f = this.foeShots[i];
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.y > this.h + 10 || f.y < -10 || f.x < -10 || f.x > this.w + 10) { this.foeShots.splice(i, 1); continue; }
      if (Math.hypot(f.x - p.x, f.y - p.y) < p.r) {
        this.foeShots.splice(i, 1);
        this.damage(f.x, f.y);
      }
    }

    /* mejoras */
    for (i = this.drops.length - 1; i >= 0; i--) {
      var d = this.drops[i];
      d.y += d.vy * dt; d.a += dt * 3;
      if (d.y > this.h + 20) { this.drops.splice(i, 1); continue; }
      if (Math.hypot(d.x - p.x, d.y - p.y) < p.r + d.r) {
        this.drops.splice(i, 1);
        if (d.kind === 'shield') p.shield = 8;
        else if (d.kind === 'rapid') p.rapid = 8;
        else { this.lives = Math.min(5, this.lives + 1); this.emit(); }
        this.burst(d.x, d.y, 12, '#45ffa8');
        Sfx.power();
      }
    }

    /* partículas */
    for (i = this.parts.length - 1; i >= 0; i--) {
      var pa = this.parts[i];
      pa.t += dt;
      if (pa.t >= pa.life) { this.parts.splice(i, 1); continue; }
      pa.x += pa.vx * dt; pa.y += pa.vy * dt;
      pa.vx *= Math.pow(0.15, dt); pa.vy *= Math.pow(0.15, dt);
    }
  };

  Game.prototype.hitsPlayer = function (e) {
    var p = this.player;
    return Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r - 4;
  };

  Game.prototype.damage = function (x, y) {
    var p = this.player;
    if (p.invuln > 0) return;
    if (p.shield > 0) {
      p.shield = 0;
      p.invuln = 1;
      this.burst(p.x, p.y, 20, '#4af0ff');
      Sfx.hit();
      return;
    }
    this.lives--;
    p.invuln = 2;
    p.rapid = 0;
    this.shake = 0.9;
    this.burst(x, y, 26, '#ff4d6d');
    Sfx.boom();
    this.emit();
    if (this.lives <= 0) this.gameOver();
  };

  /* -------- dibujo -------- */

  Game.prototype.draw = function () {
    var c = this.ctx, i, p = this.player;
    c.save();
    if (this.shake > 0) c.translate(rand(-1, 1) * this.shake * 6, rand(-1, 1) * this.shake * 6);

    var g = c.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#101430');
    g.addColorStop(1, '#05060f');
    c.fillStyle = g;
    c.fillRect(-20, -20, this.w + 40, this.h + 40);

    for (i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      c.globalAlpha = 0.25 + s.z * 0.6;
      c.fillStyle = '#cfd8ff';
      c.fillRect(s.x, s.y, s.s, s.s);
    }
    c.globalAlpha = 1;

    /* asteroides */
    for (i = 0; i < this.rocks.length; i++) {
      var r = this.rocks[i];
      c.save();
      c.translate(r.x, r.y);
      c.rotate(r.a);
      c.beginPath();
      for (var k = 0; k < r.shape.length; k++) {
        var v = r.shape[k];
        var px = Math.cos(v.a) * r.r * v.r, py = Math.sin(v.a) * r.r * v.r;
        k ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath();
      c.fillStyle = r.hp > 1 ? '#2b3466' : '#232a52';
      c.fill();
      c.strokeStyle = '#7d8bd8';
      c.lineWidth = 1.6;
      c.stroke();
      c.restore();
    }

    /* cazas */
    for (i = 0; i < this.hunters.length; i++) {
      var hn = this.hunters[i];
      c.save();
      c.translate(hn.x, hn.y);
      c.fillStyle = '#ffd166';
      c.beginPath();
      c.moveTo(0, 14); c.lineTo(-14, -10); c.lineTo(0, -4); c.lineTo(14, -10);
      c.closePath();
      c.fill();
      c.restore();
    }

    /* mejoras */
    for (i = 0; i < this.drops.length; i++) {
      var d = this.drops[i];
      c.save();
      c.translate(d.x, d.y);
      c.rotate(d.a);
      c.fillStyle = d.kind === 'shield' ? '#4af0ff' : d.kind === 'rapid' ? '#ff5cc6' : '#45ffa8';
      c.fillRect(-9, -9, 18, 18);
      c.fillStyle = '#06101c';
      c.font = 'bold 12px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(d.kind === 'shield' ? 'S' : d.kind === 'rapid' ? 'R' : '+', 0, 1);
      c.restore();
    }

    /* disparos */
    c.fillStyle = '#9ef7ff';
    for (i = 0; i < this.bullets.length; i++) c.fillRect(this.bullets[i].x - 1.5, this.bullets[i].y - 9, 3, 12);
    c.fillStyle = '#ff8fa3';
    for (i = 0; i < this.foeShots.length; i++) {
      c.beginPath();
      c.arc(this.foeShots[i].x, this.foeShots[i].y, 4, 0, TAU);
      c.fill();
    }

    /* partículas */
    for (i = 0; i < this.parts.length; i++) {
      var pa = this.parts[i];
      c.globalAlpha = 1 - pa.t / pa.life;
      c.fillStyle = pa.c;
      c.fillRect(pa.x - 2, pa.y - 2, 4, 4);
    }
    c.globalAlpha = 1;

    /* nave */
    if (this.state !== 'over' && !(p.invuln > 0 && ((p.invuln * 12) | 0) % 2)) {
      c.save();
      c.translate(p.x, p.y);
      var flame = 10 + Math.random() * 10 * p.thrust;
      c.fillStyle = 'rgba(255,150,80,.9)';
      c.beginPath();
      c.moveTo(-5, 10); c.lineTo(0, 10 + flame); c.lineTo(5, 10);
      c.closePath();
      c.fill();
      var pg = c.createLinearGradient(0, -18, 0, 14);
      pg.addColorStop(0, '#9ef7ff');
      pg.addColorStop(1, '#ff5cc6');
      c.fillStyle = pg;
      c.beginPath();
      c.moveTo(0, -18); c.lineTo(13, 12); c.lineTo(0, 5); c.lineTo(-13, 12);
      c.closePath();
      c.fill();
      if (p.shield > 0) {
        c.strokeStyle = 'rgba(74,240,255,' + (p.shield < 2 ? 0.4 + 0.4 * Math.sin(p.shield * 18) : 0.75) + ')';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(0, 0, 24, 0, TAU);
        c.stroke();
      }
      c.restore();
    }

    c.restore();

    if (this.state === 'paused') {
      c.fillStyle = 'rgba(5,6,16,.72)';
      c.fillRect(0, 0, this.w, this.h);
      c.fillStyle = '#e8ecff';
      c.font = '600 22px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText('Pausa — pulsa P para seguir', this.w / 2, this.h / 2);
    }
  };

  Game.prototype.setSound = function (on) {
    Sfx.on = on;
    if (on) Sfx.ensure();
  };

  global.Orbita = { Game: Game };
})(window);
