/* =========================================================
   Albersmeier & Marx — Scroll-Choreografie und Bedienteile

   Die Referenz (lavadental.lv) fährt CSS scroll-driven
   animations (scroll-timeline-name + animation-timeline) und
   Lenis als Smooth-Scroll-Engine. Beides ist hier bewusst
   ersetzt: ein rAF-Loop schreibt je Sektion --p (0..1), alle
   Transforms rechnen in CSS per calc() daraus. Gleiche
   Bewegung, native Scrollbar, kein Scroll-Jacking — und es
   läuft auch im älteren Safari und in Firefox.
   ========================================================= */
(function () {
  'use strict';

  var d = document;
  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)');
  var hoverable = window.matchMedia('(hover:hover) and (pointer:fine)');

  function clamp(v, a, b) {
    a = a === undefined ? 0 : a;
    b = b === undefined ? 1 : b;
    return v < a ? a : v > b ? b : v;
  }
  /* 0 vor from, 1 ab to */
  function ramp(v, from, to) {
    return clamp((v - from) / (to - from));
  }
  function qs(sel, ctx) { return (ctx || d).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || d).querySelectorAll(sel)); }

  /* =======================================================
     1 — Sektions-Fortschritt
     Gepinnte Sektionen (eigene Höhe > Viewport, sticky Kind)
     laufen über ihren Pin-Weg; alle anderen über ihren
     Durchgang durchs Fenster (.5 = Bildmitte, für den
     Gegenlauf von Galerie, Team und Fußzeile).
     ======================================================= */
  var PINNED = ['hero', 'process', 'gallery', 'wheel', 'reveal'];

  var sections = qsa('[data-p]').map(function (el) {
    var pinned = PINNED.some(function (c) { return el.classList.contains(c); });
    return {
      el: el,
      pinned: pinned,
      kind: el.classList.contains('process') ? 'process'
          : el.classList.contains('wheel') ? 'wheel'
          : el.classList.contains('reveal') ? 'reveal' : '',
      last: -1
    };
  });

  function progressOf(s, vh) {
    var r = s.el.getBoundingClientRect();
    if (s.pinned) {
      var travel = r.height - vh;
      return travel > 1 ? clamp(-r.top / travel) : clamp(-r.top / Math.max(1, r.height));
    }
    return clamp((vh - r.top) / (vh + r.height));
  }

  /* ---- Marquee-Band: Laufweg in px, damit es genau einmal
         durchläuft und nicht ins Leere fährt
         (Lava: translate(calc(-100% + 275vw))) ---- */
  var band = qs('[data-band]');
  function measureBand() {
    if (!band) return;
    var view = band.parentElement ? band.parentElement.clientWidth : window.innerWidth;
    var run = Math.max(0, band.scrollWidth - view);
    band.style.setProperty('--run', run + 'px');
  }

  /* ---- Hero-Film: Vollbild → Rahmen ----
         CSS kann den Skalierungsfaktor nicht selbst bilden, weil calc()
         keine Laenge durch eine Laenge teilen darf. Also messen wir den
         Ruhe-Rahmen (Transform kurz auf none) und reichen Versatz und
         Faktor als Zahlen rein. Einmal pro Fenstergroesse, nicht pro Bild. */
  var film = qs('[data-film]');
  var filmFrame = film ? film.closest('.hero__media') : null;
  function measureFilm() {
    if (!filmFrame) return;
    var prev = filmFrame.style.transform;
    filmFrame.style.transform = 'none';
    var r = filmFrame.getBoundingClientRect();
    filmFrame.style.transform = prev;
    if (r.width < 1 || r.height < 1) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    filmFrame.style.setProperty('--film-dx', (vw / 2 - (r.left + r.width / 2)).toFixed(1) + 'px');
    filmFrame.style.setProperty('--film-dy', (vh / 2 - (r.top + r.height / 2)).toFixed(1) + 'px');
    filmFrame.style.setProperty('--film-s', Math.max(vw / r.width, vh / r.height).toFixed(4));
  }

  function startFilm() {
    if (!film || reduce.matches) return;
    var conn = navigator.connection;
    if (conn && (conn.saveData || /^(slow-)?2g$/.test(conn.effectiveType || ''))) return;
    /* Der Pfad steht im Markup (data-film), nicht hier. Ein in JS
       zusammengesetzter Asset-Pfad ist fuer jedes Werkzeug unsichtbar, das
       Pfade umschreibt — die passwortgeschuetzte Vorschau legt die Dateien
       in einen anderen Ordner und sieht nur Attribute. Genau daran sind in
       einem frueheren Projekt sieben Bilder lautlos auf 404 gelaufen.
       Eine Quelle pro Pfad, und die steht im HTML. */
    var basis = film.getAttribute('data-film');
    if (!basis) return;
    ['webm', 'mp4'].forEach(function (ext) {
      var s = d.createElement('source');
      s.src = basis + '.' + ext;
      s.type = ext === 'webm' ? 'video/webm' : 'video/mp4';
      film.appendChild(s);
    });
    film.preload = 'auto';
    film.load();
    film.addEventListener('playing', function () { film.classList.add('is-on'); }, { once: true });
    var play = function () { var q = film.play(); if (q && q.catch) q.catch(function () {}); };
    film.addEventListener('canplay', play, { once: true });
    play();
    /* Nicht im Bild oder Tab im Hintergrund: anhalten. Ein Video, das
       unsichtbar weiterdekodiert, kostet Akku ohne jeden Gegenwert. */
    var seen = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        seen = es[0].isIntersecting;
        if (seen && !d.hidden) play(); else film.pause();
      }, { threshold: 0 }).observe(filmFrame);
    }
    d.addEventListener('visibilitychange', function () {
      if (d.hidden || !seen) film.pause(); else play();
    });
  }

  /* ---- Rad: aktives Label je Viertelumdrehung ---- */
  var wheelLabels = qsa('.wheel__label');
  var wheelActive = -1;
  function setWheel(p) {
    if (!wheelLabels.length) return;
    var i = Math.min(wheelLabels.length - 1, Math.floor(p * wheelLabels.length));
    if (i === wheelActive) return;
    wheelActive = i;
    wheelLabels.forEach(function (el, k) {
      if (k === i) el.setAttribute('data-active', 'true');
      else el.removeAttribute('data-active');
    });
  }

  /* ---- Reveal-Panel: Wort für Wort aufhellen ---- */
  var words = [];
  var wordsOn = -1;
  (function splitWords() {
    var host = qs('[data-words]');
    if (!host) return;
    var parts = (host.textContent || '').trim().split(/\s+/);
    host.textContent = '';
    parts.forEach(function (w, i) {
      var span = d.createElement('span');
      span.className = 'w';
      span.textContent = w;
      host.appendChild(span);
      if (i < parts.length - 1) host.appendChild(d.createTextNode(' '));
      words.push(span);
    });
  }());
  function setWords(p) {
    if (!words.length) return;
    var n = Math.round(ramp(p, 0.12, 0.62) * words.length);
    if (n === wordsOn) return;
    wordsOn = n;
    words.forEach(function (el, i) {
      if (i < n) el.setAttribute('data-on', 'true');
      else el.removeAttribute('data-on');
    });
  }

  /* =======================================================
     2 — Header: Farbe folgt der Fläche darunter,
         Navigation markiert die sichtbare Sektion
     ======================================================= */
  var header = qs('[data-header]');
  var surfaces = [];
  var navLinks = qsa('.nav__link');
  var navTargets = navLinks.map(function (a) {
    var id = (a.getAttribute('href') || '').replace(/^#/, '');
    return id ? d.getElementById(id) : null;
  });
  var headerLight = null;
  var navCurrent = -1;

  function measureSurfaces() {
    var y = window.pageYOffset;
    surfaces = qsa('[data-surface]').map(function (el) {
      var r = el.getBoundingClientRect();
      return { light: el.getAttribute('data-surface') === 'light', top: r.top + y, bottom: r.bottom + y };
    });
  }

  function setHeader() {
    if (!header || !surfaces.length) return;
    var line = window.pageYOffset + (header.offsetHeight || 92) * 0.5;
    var light = false;
    for (var i = 0; i < surfaces.length; i++) {
      if (surfaces[i].top <= line) light = surfaces[i].light;
    }
    if (light === headerLight) return;
    headerLight = light;
    header.classList.toggle('header--light', light);
  }

  function setNav() {
    if (!navLinks.length) return;
    var line = window.innerHeight * 0.4;
    var found = -1;
    navTargets.forEach(function (el, i) {
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (r.top <= line && r.bottom > line) found = i;
    });
    if (found === navCurrent) return;
    navCurrent = found;
    navLinks.forEach(function (a, i) {
      if (i === found) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  /* =======================================================
     3 — Der eine rAF-Loop
     ======================================================= */
  var queued = false;
  function frame() {
    queued = false;
    var vh = window.innerHeight;

    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      var p = progressOf(s, vh);
      if (Math.abs(p - s.last) > 0.0004) {
        s.last = p;
        s.el.style.setProperty('--p', p.toFixed(4));
        if (s.kind === 'process') {
          s.el.style.setProperty('--enter', ramp(p, 0, 0.22).toFixed(4));
          s.el.style.setProperty('--vis', (1 - ramp(p, 0.52, 0.72)).toFixed(4));
        }
      }
      if (s.kind === 'wheel') setWheel(p);
      if (s.kind === 'reveal') setWords(p);
    }

    // Lesefortschritt — Rueckfall fuer Browser ohne animation-timeline
    var span = document.documentElement.scrollHeight - vh;
    document.documentElement.style.setProperty('--page', span > 1 ? clamp(window.scrollY / span).toFixed(4) : '0');

    setHeader();
    setNav();
  }
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  }

  function remeasure() {
    measureBand();
    measureFilm();
    measureSurfaces();
    sections.forEach(function (s) { s.last = -1; });
    headerLight = null;
    navCurrent = -1;
    onScroll();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', remeasure);
  window.addEventListener('load', remeasure);
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(remeasure);
  remeasure();
  /* Erst wenn das Standbild steht: der Film soll nicht mit dem LCP
     um Bandbreite konkurrieren. */
  window.addEventListener('load', startFilm, { once: true });

  /* =======================================================
     4 — Reveal beim Eintritt (einmalig)
     ======================================================= */
  var revealables = qsa('[data-rev],[data-rev-wipe]');
  if (!revealables.length) {
    /* nichts zu tun */
  } else if (reduce.matches || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.setAttribute('data-on', 'true'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.setAttribute('data-on', 'true');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* =======================================================
     5 — Bildkarussell (Lava: Manifest-Slider mit Balken-Dots)
     ======================================================= */
  (function carousel() {
    var root = qs('[data-carousel]');
    if (!root) return;
    var slides = qsa('.carousel__slide', root);
    var dots = qsa('.carousel__dot', root);
    var toggle = qs('[data-carousel-toggle]', root);
    if (slides.length < 2) return;

    var index = 0;
    var timer = null;
    var playing = false;
    var visible = true;
    var WAIT = 5200;

    function show(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (el, k) {
        if (k === index) el.setAttribute('data-active', 'true');
        else el.removeAttribute('data-active');
      });
      dots.forEach(function (el, k) {
        if (k === index) {
          el.setAttribute('data-active', 'true');
          el.setAttribute('aria-selected', 'true');
        } else {
          el.removeAttribute('data-active');
          el.setAttribute('aria-selected', 'false');
        }
      });
    }

    function icon(pause) {
      if (!toggle) return;
      toggle.innerHTML = pause
        ? '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor"><rect x="2" y="1" width="3" height="10"/><rect x="7" y="1" width="3" height="10"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor"><path d="M2 1l9 5-9 5z"/></svg>';
      toggle.setAttribute('aria-label', pause ? 'Bildwechsel anhalten' : 'Bildwechsel starten');
    }

    function tick() { show(index + 1); }

    function start() {
      playing = true;
      icon(true);
      run();
    }
    function stop() {
      playing = false;
      icon(false);
      run();
    }
    function run() {
      if (timer) { clearInterval(timer); timer = null; }
      if (playing && visible && !d.hidden) timer = setInterval(tick, WAIT);
    }

    dots.forEach(function (el, k) {
      el.addEventListener('click', function () { show(k); if (playing) run(); });
    });
    if (toggle) toggle.addEventListener('click', function () { playing ? stop() : start(); });
    d.addEventListener('visibilitychange', run);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        run();
      }, { threshold: 0.2 }).observe(root);
    }

    show(0);
    if (reduce.matches) stop(); else start();
  }());

  /* =======================================================
     6 — Verfahren: Akkordeon plus Bildbühne
     ======================================================= */
  (function services() {
    var stage = qs('[data-services]');
    if (!stage) return;
    var figures = qsa('.services__panel figure', stage);
    var buttons = qsa('[data-service]', stage);

    function showFigure(i) {
      figures.forEach(function (f, k) {
        if (k === i) f.setAttribute('data-active', 'true');
        else f.removeAttribute('data-active');
      });
    }

    buttons.forEach(function (btn) {
      var i = parseInt(btn.getAttribute('data-service'), 10) || 0;
      var detail = btn.nextElementSibling;

      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        buttons.forEach(function (other) {
          other.setAttribute('aria-expanded', 'false');
          if (other.nextElementSibling) other.nextElementSibling.setAttribute('data-open', 'false');
        });
        if (!open) {
          btn.setAttribute('aria-expanded', 'true');
          if (detail) detail.setAttribute('data-open', 'true');
        }
        showFigure(i);
      });

      if (hoverable.matches) {
        btn.addEventListener('pointerenter', function () { showFigure(i); });
      }
      btn.addEventListener('focus', function () { showFigure(i); });
    });
  }());

  /* =======================================================
     7 — Fragen: Akkordeon
     ======================================================= */
  qsa('.qa__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var answer = btn.nextElementSibling;
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (answer) answer.setAttribute('data-open', open ? 'false' : 'true');
    });
  });

  /* =======================================================
     8 — Team-Filter
     ======================================================= */
  (function teamTabs() {
    var tabs = qs('[data-tabs="team"]');
    var grid = qs('[data-team-grid]');
    if (!tabs || !grid) return;
    var buttons = qsa('.tab', tabs);
    var members = qsa('.member', grid);

    // Versatz haengt an der SICHTBAREN Position, nicht an :nth-child — sonst
    // zaehlen ausgeblendete Karten mit und die gefilterte Reihe faellt um eine
    // halbe Kartenhoehe nach unten.
    function apply(want) {
      var shown = 0;
      members.forEach(function (m) {
        var hit = want === 'alle' || m.getAttribute('data-cat') === want;
        if (hit) m.removeAttribute('hidden');
        else m.setAttribute('hidden', '');
        m.classList.toggle('member--shift', hit && shown % 2 === 1);
        if (hit) shown++;
      });
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.setAttribute('aria-selected', String(b === btn)); });
        apply(btn.getAttribute('data-filter'));
      });
    });

    var active = buttons.filter(function (b) { return b.getAttribute('aria-selected') === 'true'; })[0];
    apply(active ? active.getAttribute('data-filter') : 'alle');
  }());

  /* =======================================================
     9 — Abrechnung: Tabs auf Panels
     ======================================================= */
  (function billingTabs() {
    var tabs = qs('[data-tabs="billing"]');
    var host = qs('[data-billing-panels]');
    if (!tabs || !host) return;
    var buttons = qsa('.tab', tabs);
    var panels = qsa('.billing__panel', host);

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-panel'), 10) || 0;
        buttons.forEach(function (b) { b.setAttribute('aria-selected', String(b === btn)); });
        panels.forEach(function (p, k) {
          if (k === i) p.removeAttribute('hidden');
          else p.setAttribute('hidden', '');
        });
      });
    });
  }());

  /* =======================================================
     10 — Mobilmenü
     ======================================================= */
  (function mobnav() {
    var burger = qs('[data-burger]');
    var nav = qs('.mobnav');
    if (!burger || !nav) return;

    function set(open) {
      nav.setAttribute('data-open', String(open));
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
      d.body.style.overflow = open ? 'hidden' : '';
    }

    burger.addEventListener('click', function () {
      set(nav.getAttribute('data-open') !== 'true');
    });
    qsa('a', nav).forEach(function (a) {
      a.addEventListener('click', function () { set(false); });
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.getAttribute('data-open') === 'true') {
        set(false);
        burger.focus();
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 860 && nav.getAttribute('data-open') === 'true') set(false);
    });
  }());
}());
