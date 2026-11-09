(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const T = 16; // logical pixels per tile
  const ZX = 3; // hidden regions across
  const ZY = 2; // hidden regions down
  const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], wait: [0, 0] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp01 = (p) => Math.max(0, Math.min(1, p));
  const easeOut = (p) => 1 - (1 - p) * (1 - p);
  const hash = (x, y, s = 0) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  async function api(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      const err = new Error('server unreachable');
      err.network = true;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ------------------------------------------------------------------ state

  const G = {
    id: null,
    view: null, // the workflow's published "state" event
    wf: null, // DBOS workflow status
    boot: null, // server process id; changes when the server restarts
    steps: [],
    checkpoints: [],
    cobraTrail: [], // per turn: [[id, x, y], ...] from the checkpointed moveCobras steps
    appVersion: null,
    mode: 'boot', // boot | play | sheet | rewinding | crash | loading
    busy: false,
    queue: [],
    erasing: false,
    games: [], // recent games, from DBOS.listWorkflows
    stats: { rewinds: 0, crashes: 0 },
  };
  const R = {
    bad: null,
    cob: new Map(),
    reveal: new Map(),
    particles: [],
    floaters: [],
    shake: null,
    rings: [], 
    preview: null,
    rewindFx: null,
    replay: null, // { t0, turn, targetSeq, seq, status, end? } while the workflow catches up after a rewind/crash
    deathT0: 0,
  };

  function loadPerGame() {
    G.stats = store.get(`badger:stats:${G.id}`, { rewinds: 0, crashes: 0 });
  }
  function savePerGame() {
    store.set(`badger:stats:${G.id}`, G.stats);
  }
  // Older versions kept skulls for deaths in erased timelines; drop what they saved.
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('badger:ghosts:')) localStorage.removeItem(k);
  } catch { /* storage unavailable */ }

  // ------------------------------------------------------------------ canvases

  const canvas = $('#view');
  const ctx = canvas.getContext('2d');
  const buf = document.createElement('canvas'); // everything is drawn here at 1x, then scaled up
  const b = buf.getContext('2d');
  const layer = document.createElement('canvas'); // static terrain
  const lg = layer.getContext('2d');
  let W = 25;
  let H = 17;
  let mapKey = '';

  const PAL = {
    // DBOS colors (www.dbos.dev): slate tunnels, ink walls, lime accents.
    sand: '#475872', sandL: '#556884', sandD: '#3c4b62', sandShadow: '#334157',
    pebble: '#6a87a6', pebbleHi: '#b8ccd8', tuft: '#87fb6b', tuftD: '#4c9a3b',
    bush: '#121b2b', bushD: '#0b111c', bushL: '#1d2a40', bushTop: '#2a3b58', bushFace: '#0b111c', bushFaceD: '#050608',
    bushEdge: '#c8f62e',
    fog: '#050608', fogD: '#0d1016', fogStar: '#6a87a6', q: '#232f45',
    trail: 'rgba(9, 13, 21, 0.45)',
  };

  const fogTile = (() => {
    const c = document.createElement('canvas');
    c.width = T;
    c.height = T;
    const g = c.getContext('2d');
    g.fillStyle = PAL.fog;
    g.fillRect(0, 0, T, T);
    g.fillStyle = PAL.fogD;
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x + y * 3) % 5 === 0) g.fillRect(x, y, 1, 1);
    return c;
  })();

  function resize() {
    const lw = W * T;
    const lh = H * T;
    if (buf.width !== lw || buf.height !== lh) { buf.width = lw; buf.height = lh; }
    const box = $('#screen').clientWidth;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.floor((box * dpr) / lw);
    // Prefer an integer scale for crisp pixels, unless it would waste too much room.
    const cssW = k >= 1 && (k * lw) / dpr >= box * 0.86 ? (k * lw) / dpr : box;
    const cssH = (cssW * lh) / lw;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  window.addEventListener('resize', resize);

  const tileAt = (v, x, y) => v.map[y]?.[x] ?? '#';
  const zoneOf = (x, y) => Math.min(ZY - 1, Math.floor((y * ZY) / H)) * ZX + Math.min(ZX - 1, Math.floor((x * ZX) / W));

  function drawFloor(g, x, y, v) {
    const px = x * T;
    const py = y * T;
    g.fillStyle = PAL.sand;
    g.fillRect(px, py, T, T);
    if (tileAt(v, x, y - 1) === '#') {
      g.fillStyle = PAL.sandShadow;
      g.fillRect(px, py, T, 3);
      g.fillStyle = PAL.sandD;
      g.fillRect(px, py, T, 1);
    }
    for (let i = 0; i < 9; i++) {
      g.fillStyle = hash(x, y, i * 3 + 3) < 0.5 ? PAL.sandL : PAL.sandD;
      g.fillRect(px + Math.floor(hash(x, y, i * 3 + 1) * T), py + 3 + Math.floor(hash(x, y, i * 3 + 2) * (T - 3)), 1, 1);
    }
    if (hash(x, y, 91) < 0.16) {
      const sx = 2 + Math.floor(hash(x, y, 92) * 10);
      const sy = 5 + Math.floor(hash(x, y, 93) * 9);
      g.fillStyle = PAL.pebble;
      g.fillRect(px + sx, py + sy, 3, 2);
      g.fillStyle = PAL.pebbleHi;
      g.fillRect(px + sx, py + sy, 2, 1);
    }
    if (hash(x, y, 94) < 0.1) {
      const sx = 2 + Math.floor(hash(x, y, 95) * 10);
      const sy = 7 + Math.floor(hash(x, y, 96) * 7);
      g.fillStyle = PAL.tuftD;
      g.fillRect(px + sx, py + sy, 3, 1);
      g.fillStyle = PAL.tuft;
      g.fillRect(px + sx, py + sy - 1, 1, 1);
      g.fillRect(px + sx + 2, py + sy - 2, 1, 2);
    }
  }

  function drawWall(g, x, y, v) {
    const px = x * T;
    const py = y * T;
    g.fillStyle = PAL.bush;
    g.fillRect(px, py, T, T);
    for (let i = 0; i < 6; i++) {
      const cx = Math.floor(hash(x, y, i * 5 + 11) * 13);
      const cy = Math.floor(hash(x, y, i * 5 + 12) * 10);
      g.fillStyle = PAL.bushD;
      g.fillRect(px + cx, py + cy + 2, 3, 1);
      g.fillStyle = PAL.bushL;
      g.fillRect(px + cx, py + cy, 3, 2);
      g.fillStyle = PAL.bushTop;
      g.fillRect(px + cx + 1, py + cy, 1, 1);
    }
    if (tileAt(v, x, y + 1) === '.') {
      g.fillStyle = PAL.bushFace;
      g.fillRect(px, py + T - 5, T, 5);
      g.fillStyle = PAL.bushFaceD;
      g.fillRect(px, py + T - 1, T, 1);
      g.fillStyle = PAL.bush;
      for (let i = 0; i < T; i += 3) g.fillRect(px + i, py + T - 5, 2, 1 + Math.floor(hash(x, y, i + 50) * 3));
    }
    if (tileAt(v, x, y - 1) === '.') {
      g.fillStyle = PAL.bushEdge;
      for (let i = 0; i < T; i += 2) g.fillRect(px + i, py + (hash(x, y, i + 70) < 0.5 ? 0 : 1), 1, 1);
    }
  }

  function rebuildLayer(v) {
    const key = v.map.join('');
    if (key === mapKey && layer.width === v.w * T) return;
    mapKey = key;
    layer.width = v.w * T;
    layer.height = v.h * T;
    lg.clearRect(0, 0, layer.width, layer.height);
    for (let y = 0; y < v.h; y++) {
      for (let x = 0; x < v.w; x++) {
        const c = v.map[y][x];
        if (c === '#') drawWall(lg, x, y, v);
        else if (c !== '?') drawFloor(lg, x, y, v);
      }
    }
  }

  // ------------------------------------------------------------------ animation state

  function badgerNow(t) {
    const a = R.bad;
    if (!a) return null;
    const p = clamp01((t - a.t0) / a.dur);
    const e = easeOut(p);
    return { x: a.fx + (a.x - a.fx) * e, y: a.fy + (a.y - a.fy) * e, p, moving: p < 1 };
  }
  function setBadger(pos, animate) {
    const t = performance.now();
    const cur = badgerNow(t);
    const near = cur && Math.abs(cur.x - pos[0]) + Math.abs(cur.y - pos[1]) <= 1.01;
    R.bad = animate && near
      ? { fx: cur.x, fy: cur.y, x: pos[0], y: pos[1], t0: t, dur: 140 }
      : { fx: pos[0], fy: pos[1], x: pos[0], y: pos[1], t0: t, dur: 1 };
  }
  function setCobras(list, animate) {
    const t = performance.now();
    const next = new Map();
    for (const c of list) {
      const prev = R.cob.get(c.id);
      if (prev && animate) {
        const p = easeOut(clamp01((t - prev.t0) / prev.dur));
        next.set(c.id, {
          fx: prev.fx + (prev.x - prev.fx) * p, fy: prev.fy + (prev.y - prev.fy) * p,
          x: c.at[0], y: c.at[1], nx: c.next[0], ny: c.next[1], t0: t, dur: 170, born: prev.born,
        });
      } else {
        next.set(c.id, { fx: c.at[0], fy: c.at[1], x: c.at[0], y: c.at[1], nx: c.next[0], ny: c.next[1], t0: t, dur: 1, born: prev ? prev.born : t });
      }
    }
    R.cob = next;
  }
  function burst(pos, colors, n) {
    const t = performance.now();
    for (let i = 0; i < n; i++) {
      R.particles.push({
        x: pos[0] * T + 8, y: pos[1] * T + 8,
        vx: (Math.random() - 0.5) * 70, vy: -Math.random() * 80 - 20,
        t0: t, life: 450 + Math.random() * 450, c: colors[i % colors.length],
      });
    }
  }
  function floater(text, pos, color) {
    R.floaters.push({ text, x: pos[0] * T + 8, y: pos[1] * T + 2, t0: performance.now(), color });
  }
  /** An expanding pixel ring centered on a tile: a shockwave that stays where the action is. */
  function ring(pos, color, { delay = 0, dur = 600, r0 = 3, r1 = 24 } = {}) {
    R.rings.push({ x: pos[0] * T + 8, y: pos[1] * T + 8, t0: performance.now() + delay, dur, r0, r1, color });
  }

  // Warnings pulse slowly or move in place; big moments get a screen shake and effects at the spot
  // where they happen. With prefers-reduced-motion, shakes and pulses are turned off too.
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  /** 0..1 sine wave with the given period in ms (a constant 0.5 under reduced motion). */
  const wave = (t, period, phase = 0) => (calm.matches ? 0.5 : 0.5 + 0.5 * Math.sin((t / period) * Math.PI * 2 + phase));

  // ------------------------------------------------------------------ applying a new state

  function applyView(v, { animate = true } = {}) {
    if (!v) return;
    const prev = G.view;
    G.view = v;
    if (v.w !== W || v.h !== H) { W = v.w; H = v.h; resize(); }
    rebuildLayer(v);
    const anim = animate && prev && prev.seq !== v.seq;
    const t = performance.now();
    if (anim) {
      for (const z of v.zones) if (!prev.zones.includes(z)) R.reveal.set(z, t);
      if (v.den && !prev.den) {
        // Just dug into the den's region: point it out once the fog has lifted.
        ring(v.den, '200,246,46', { delay: 450, dur: 900, r1: 30 });
        setTimeout(() => floater('THE DEN!', v.den, '#c8f62e'), 450);
      }
      if (v.honey > prev.honey) {
        floater(`+${v.honey - prev.honey}`, v.pos, '#ffb627');
        burst(v.pos, ['#ffb627', '#ffc93c', '#ff9418'], 16);
        pop('#hud-honey');
      }
      if (v.last?.kind === 'bump') bonk(v.pos);
      if (v.status === 'dead' && prev.status !== 'dead') onDeath(v);
      if (v.status === 'escaped' && prev.status !== 'escaped') onWin(v);
    }
    setBadger(v.pos, anim);
    setCobras(v.cobras, anim);
    renderHud();
    renderMsg();
    renderWf();
    renderButtons();
  }

  function bonk(pos) {
    R.shake = { t0: performance.now(), mag: 1.6, dur: 170 };
    floater('BONK', pos, '#f3f6f8');
  }

  function onDeath(v) {
    const t = performance.now();
    R.deathT0 = t;
    R.shake = { t0: t, mag: 4, dur: 480 };
    ring(v.pos, '255,92,122', { dur: 650, r1: 28 });
    ring(v.pos, '255,92,122', { delay: 140, dur: 650, r1: 20 });
    burst(v.pos, ['#ff5c7a', '#f3f6f8', '#87fb6b'], 24);
    setTimeout(refreshCurrentWf, 600);
    const id = G.id;
    setTimeout(() => {
      if (G.id === id && G.view?.status === 'dead' && G.mode === 'play') openSheet('death');
    }, 1100);
  }

  function onWin(v) {
    for (let i = 0; i < 4; i++) setTimeout(() => burst(v.pos, ['#c8f62e', '#87fb6b', '#00f5cc', '#48e1fe', '#80d4ff'], 18), i * 160);
    setTimeout(refreshCurrentWf, 600);
    const id = G.id;
    setTimeout(() => {
      if (G.id === id && G.view?.status === 'escaped' && G.mode === 'play') openSheet('win');
    }, 900);
  }

  // ------------------------------------------------------------------ drawing

  const QMARK = ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'];
  let zoneCenters = null;
  let zoneCentersKey = '';
  function getZoneCenters() {
    const key = `${W}x${H}`;
    if (zoneCenters && zoneCentersKey === key) return zoneCenters;
    const bounds = Array.from({ length: ZX * ZY }, () => ({ x0: 1e9, y0: 1e9, x1: -1, y1: -1 }));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const bd = bounds[zoneOf(x, y)];
        bd.x0 = Math.min(bd.x0, x); bd.y0 = Math.min(bd.y0, y);
        bd.x1 = Math.max(bd.x1, x); bd.y1 = Math.max(bd.y1, y);
      }
    }
    zoneCenters = bounds.map((bd) => [((bd.x0 + bd.x1 + 1) / 2) * T, ((bd.y0 + bd.y1 + 1) / 2) * T]);
    zoneCentersKey = key;
    return zoneCenters;
  }

  function drawTrail(v) {
    const seen = new Set();
    b.fillStyle = PAL.trail;
    for (let i = 0; i < v.trail.length - 1; i++) {
      const [x, y] = v.trail[i];
      const k = `${x},${y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      b.fillRect(x * T + 4, y * T + 9, 2, 2);
      b.fillRect(x * T + 9, y * T + 6, 2, 2);
    }
  }

  // The goal: a pool of lime light on the tunnels around the den, the burrow with its
  // finish flag, and motes drifting up out of the hole.
  function drawDen(v, t) {
    if (!v.den) return;
    const [x, y] = v.den;
    const glow = 0.13 + 0.05 * wave(t, 2400);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const d = Math.abs(dx) + Math.abs(dy);
        const ch = tileAt(v, x + dx, y + dy);
        if (d > 2 || ch === '#' || ch === '?') continue;
        b.fillStyle = `rgba(200, 246, 46, ${glow * [1.6, 0.8, 0.35][d]})`;
        b.fillRect((x + dx) * T, (y + dy) * T, T, T);
      }
    }
    const flutter = calm.matches ? 0 : Math.floor(t / 450) % 2;
    b.drawImage(Sprites.den[flutter], x * T, y * T);
    if (!calm.matches) {
      for (let i = 0; i < 3; i++) {
        const p = (t / 1800 + i / 3) % 1;
        b.globalAlpha = Math.sin(p * Math.PI) * 0.9;
        b.fillStyle = i === 1 ? '#f3f6f8' : '#c8f62e';
        b.fillRect(Math.round(x * T + 8 + Math.sin(p * 7 + i * 2) * 2.5), Math.round(y * T + 11 - p * 15), 1, 1);
      }
      b.globalAlpha = 1;
    }
  }

  function drawPots(v, t) {
    for (const [x, y] of v.pots) {
      const bob = Math.round(Math.sin(t / 380 + x * 1.7 + y));
      b.fillStyle = 'rgba(5, 6, 8, 0.3)';
      b.fillRect(x * T + 4, y * T + 13, 8, 2);
      b.drawImage(Sprites.pot, x * T, y * T - 1 + bob);
      if (Math.sin(t / 260 + x * 3 + y * 5) > 0.93) {
        b.fillStyle = '#ffffff';
        b.fillRect(x * T + 11, y * T + 3 + bob, 1, 1);
        b.fillRect(x * T + 10, y * T + 4 + bob, 3, 1);
        b.fillRect(x * T + 11, y * T + 5 + bob, 1, 1);
      }
    }
  }

  /** Checkpointed cobras for turn k ([id, x, y, nextX, nextY] each), or the closest turn before it. */
  function cobraFrame(k) {
    for (let x = Math.min(k, G.cobraTrail.length - 1); x >= 0; x--) if (G.cobraTrail[x]) return G.cobraTrail[x];
    return [];
  }

  function drawCobraMarks(v, t) {
    if (v.status !== 'alive' || R.rewindFx || R.preview != null) return;
    const a = 0.6 + 0.25 * wave(t, 1600);
    for (const c of R.cob.values()) {
      const px = c.nx * T;
      const py = c.ny * T;
      // The tile this cobra will strike on your next move.
      b.fillStyle = 'rgba(255, 92, 122, 0.22)';
      b.fillRect(px, py, T, T);
      b.fillStyle = `rgba(255, 92, 122, ${a})`;
      b.fillRect(px + 1, py + 1, 3, 1); b.fillRect(px + 1, py + 1, 1, 3);
      b.fillRect(px + 12, py + 1, 3, 1); b.fillRect(px + 14, py + 1, 1, 3);
      b.fillRect(px + 1, py + 14, 3, 1); b.fillRect(px + 1, py + 12, 1, 3);
      b.fillRect(px + 12, py + 14, 3, 1); b.fillRect(px + 14, py + 12, 1, 3);
    }
  }

  function drawCobraSprite(id, x, y, t) {
    const px = Math.round(x * T);
    const py = Math.round(y * T);
    b.fillStyle = 'rgba(0, 0, 0, 0.2)';
    b.fillRect(px + 2, py + 13, 12, 2);
    b.drawImage(Sprites.cobra[Math.floor(t / 320 + id * 0.7) % 2], px, py - 1);
  }

  // During a rewind the cobras slide back through their checkpointed positions, in step
  // with the badger.
  function drawRewindCobras(t) {
    const fx = R.rewindFx;
    const n = fx.cobras.length;
    const f = clamp01((t - fx.t0) / fx.dur) * (n - 1);
    const i = Math.min(n - 1, Math.floor(f));
    const j = Math.min(n - 1, i + 1);
    const u = f - i;
    const a = fx.cobras[i];
    const c = fx.cobras[j];
    for (const [id, [x, y]] of a) {
      const [x2, y2] = c.get(id) ?? [x, y];
      drawCobraSprite(id, x + (x2 - x) * u, y + (y2 - y) * u, t);
    }
    for (const [id, [x, y]] of c) if (!a.has(id)) drawCobraSprite(id, x, y, t);
  }

  function drawCobras(t) {
    if (R.rewindFx?.cobras) { drawRewindCobras(t); return; }
    for (const [id, c] of R.cob) {
      const p = easeOut(clamp01((t - c.t0) / c.dur));
      const px = Math.round((c.fx + (c.x - c.fx) * p) * T);
      const py = Math.round((c.fy + (c.y - c.fy) * p) * T);
      const frame = Math.floor(t / 320 + id * 0.7) % 2;
      // Fade the live cobras while previewing a rewind, so the ghosts stand out.
      b.globalAlpha = clamp01((t - c.born) / 350) * (R.preview != null ? 0.3 : 1);
      b.fillStyle = 'rgba(0, 0, 0, 0.2)';
      b.fillRect(px + 2, py + 13, 12, 2);
      b.drawImage(Sprites.cobra[frame], px, py - 1);
      b.globalAlpha = 1;
    }
  }

  // A hidden cobra that just bit the badger rises out of its burrow.
  function drawLurker(v, t) {
    if (v.status !== 'dead' || v.death?.kind !== 'lurker' || R.rewindFx) return;
    const [x, y] = v.death.at;
    const px = x * T;
    const py = y * T;
    b.fillStyle = '#232d40';
    b.fillRect(px + 4, py + 11, 11, 4);
    b.fillStyle = '#050608';
    b.fillRect(px + 5, py + 12, 9, 2);
    const rise = Math.round((1 - easeOut(clamp01((t - R.deathT0) / 450))) * 12);
    b.save();
    b.beginPath();
    b.rect(px - 4, py - 16, T + 8, T + 16 - 3);
    b.clip();
    b.drawImage(Sprites.cobra[Math.floor(t / 320) % 2], px + 3, py - 3 + rise);
    b.restore();
  }

  function drawPreview(v, t) {
    if (R.preview == null) return;
    const k = R.preview;
    const tr = v.trail;
    const seg = (a, c) => {
      const x0 = Math.min(a[0], c[0]);
      const y0 = Math.min(a[1], c[1]);
      b.fillRect(x0 * T + 7, y0 * T + 7, Math.abs(a[0] - c[0]) * T + 2, Math.abs(a[1] - c[1]) * T + 2);
    };
    b.fillStyle = 'rgba(255, 92, 122, 0.75)';
    for (let i = k; i < tr.length - 1; i++) seg(tr[i], tr[i + 1]);
    b.fillStyle = 'rgba(72, 225, 254, 0.9)';
    for (let i = 0; i < k; i++) seg(tr[i], tr[i + 1]);
    const bob = Math.round(Math.sin(t / 200));

    // Ghost cobras: where the turn-k moveCobras checkpoint has them, plus the tile each one
    // had committed to next. This is exactly what you resume into after rewinding.
    const markA = 0.6 + 0.25 * wave(t, 1600);
    for (const [id, x, y, nx, ny] of cobraFrame(k)) {
      if (nx !== undefined) {
        const px = nx * T;
        const py = ny * T;
        b.fillStyle = 'rgba(255, 92, 122, 0.2)';
        b.fillRect(px, py, T, T);
        b.fillStyle = `rgba(255, 92, 122, ${markA})`;
        b.fillRect(px + 1, py + 1, 3, 1); b.fillRect(px + 1, py + 1, 1, 3);
        b.fillRect(px + 12, py + 1, 3, 1); b.fillRect(px + 14, py + 1, 1, 3);
        b.fillRect(px + 1, py + 14, 3, 1); b.fillRect(px + 1, py + 12, 1, 3);
        b.fillRect(px + 12, py + 14, 3, 1); b.fillRect(px + 14, py + 12, 1, 3);
      }
      b.globalAlpha = 0.9;
      b.drawImage(Sprites.ghostCobra[Math.floor(t / 320 + id * 0.7) % 2], x * T, y * T - 1 + bob);
      b.globalAlpha = 1;
    }

    const [gx, gy] = tr[k];
    b.globalAlpha = 0.9;
    b.drawImage(Sprites.ghost[Math.floor(t / 300) % 2][v.facing], gx * T, gy * T - 2 + bob);
    b.globalAlpha = 1;
    b.font = '8px "Press Start 2P"';
    b.textAlign = 'center';
    b.fillStyle = '#000';
    b.fillText(`T${k}`, gx * T + 9, gy * T - 3 + bob);
    b.fillStyle = '#48e1fe';
    b.fillText(`T${k}`, gx * T + 8, gy * T - 4 + bob);
  }

  function rewindPos(t) {
    const fx = R.rewindFx;
    const path = fx.path;
    const p = clamp01((t - fx.t0) / fx.dur);
    const f = p * (path.length - 1);
    const i = Math.min(path.length - 1, Math.floor(f));
    const j = Math.min(path.length - 1, i + 1);
    const u = f - i;
    const dx = path[j][0] - path[i][0];
    return {
      x: path[i][0] + dx * u,
      y: path[i][1] + (path[j][1] - path[i][1]) * u,
      p: u,
      moving: true,
      facing: dx < 0 ? 'left' : dx > 0 ? 'right' : null,
    };
  }

  let lastFacing = 'right';
  function drawBadger(v, t) {
    const cur = R.rewindFx ? rewindPos(t) : badgerNow(t);
    if (!cur) return;
    let px = Math.round(cur.x * T);
    const py = Math.round(cur.y * T);
    if (!R.rewindFx) lastFacing = v.facing;
    else if (cur.facing) lastFacing = cur.facing;
    const facing = lastFacing;
    if (v.status === 'dead' && !R.rewindFx) {
      px -= 3;
      b.fillStyle = 'rgba(0, 0, 0, 0.22)';
      b.fillRect(px + 2, py + 13, 12, 2);
      b.drawImage(Sprites.dead[facing], px, py + 3);
      for (let i = 0; i < 3; i++) {
        const ang = t / 260 + (i * Math.PI * 2) / 3;
        b.fillStyle = i === 1 ? '#f3f6f8' : '#c8f62e';
        b.fillRect(Math.round(px + 8 + Math.cos(ang) * 6), Math.round(py + 2 + Math.sin(ang) * 2), 1, 1);
      }
      return;
    }
    if (R.rewindFx && !calm.matches) {
      // Afterimages trail the badger as it slides back through its checkpoints.
      for (const [lag, alpha] of [[150, 0.18], [75, 0.32]]) {
        const ghost = rewindPos(Math.max(R.rewindFx.t0, t - lag));
        b.globalAlpha = alpha;
        b.drawImage(Sprites.ghost[0][facing], Math.round(ghost.x * T), Math.round(ghost.y * T));
      }
      b.globalAlpha = 1;
    }
    const hop = cur.moving ? Math.round(Math.sin(Math.PI * cur.p) * 3) : 0;
    const frame = cur.moving ? (cur.p < 0.5 ? 1 : 0) : 0;
    b.fillStyle = 'rgba(0, 0, 0, 0.22)';
    b.fillRect(px + 3, py + 13, 11, 2);
    b.drawImage(Sprites.badger[frame][facing], px, py - hop);
    // A cobra has committed to striking the badger's tile: draw the warning on top of the
    // sprite, since the red tile itself is hidden underneath it.
    if (isThreatened(v) && !cur.moving && !R.rewindFx && R.preview == null) {
      const o = -1 - Math.round(2 * wave(t, 700)); // the brackets breathe out and back in
      const e = 12 - 2 * o; // from the near corners to the far ones
      b.fillStyle = '#ff5c7a';
      b.fillRect(px + o, py + o, 4, 2); b.fillRect(px + o, py + o, 2, 4);
      b.fillRect(px + o + e, py + o, 4, 2); b.fillRect(px + o + e + 2, py + o, 2, 4);
      b.fillRect(px + o, py + o + e + 2, 4, 2); b.fillRect(px + o, py + o + e, 2, 4);
      b.fillRect(px + o + e, py + o + e + 2, 4, 2); b.fillRect(px + o + e + 2, py + o + e, 2, 4);
    }
    if (v.status === 'alive' && v.sniff > 0 && !cur.moving && !R.rewindFx && R.preview == null) {
      const bob = Math.round(Math.sin(t / 140));
      const bx = px + (facing === 'right' ? 10 : -2);
      const by = py - 6 + bob;
      b.fillStyle = '#050608';
      b.fillRect(bx - 1, by - 1, 10, 11);
      b.fillStyle = '#ffffff';
      b.fillRect(bx, by, 8, 9);
      b.fillStyle = '#ff5c7a';
      b.fillRect(bx + 3, by + 1, 2, 5);
      b.fillRect(bx + 3, by + 7, 2, 1);
    }
  }

  function drawFog(v, t) {
    for (let y = 0; y < v.h; y++) {
      for (let x = 0; x < v.w; x++) {
        let alpha = 0;
        if (v.map[y][x] === '?') alpha = 1;
        else {
          const z0 = R.reveal.get(zoneOf(x, y));
          if (z0 !== undefined) alpha = 1 - clamp01((t - z0 - hash(x, y, 5) * 480) / 220);
        }
        if (alpha <= 0) continue;
        b.globalAlpha = alpha;
        b.drawImage(fogTile, x * T, y * T);
        if (hash(x, y, 7) < 0.07) {
          b.globalAlpha = alpha * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t / 420 + hash(x, y, 8) * 30)));
          b.fillStyle = PAL.fogStar;
          b.fillRect(x * T + Math.floor(hash(x, y, 9) * 14), y * T + Math.floor(hash(x, y, 10) * 14), 1, 1);
        }
      }
    }
    b.globalAlpha = 1;
    for (const [z, t0] of R.reveal) if (t - t0 > 1000) R.reveal.delete(z);
    const centers = getZoneCenters();
    b.fillStyle = PAL.q;
    for (let z = 0; z < ZX * ZY; z++) {
      if (v.zones.includes(z)) continue;
      const [cx, cy] = centers[z];
      const bob = Math.round(Math.sin(t / 600 + z) * 2);
      QMARK.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch === '#') b.fillRect(Math.round(cx) - 7 + i * 3, Math.round(cy) - 10 + j * 3 + bob, 3, 3);
      }));
    }
  }

  function drawParticles(t) {
    R.particles = R.particles.filter((p) => t - p.t0 < p.life);
    for (const p of R.particles) {
      const s = (t - p.t0) / 1000;
      b.globalAlpha = 1 - (t - p.t0) / p.life;
      b.fillStyle = p.c;
      b.fillRect(Math.round(p.x + p.vx * s), Math.round(p.y + p.vy * s + 140 * s * s), 1, 1);
    }
    b.globalAlpha = 1;
  }

  function drawFloaters(t) {
    R.floaters = R.floaters.filter((f) => t - f.t0 < 900);
    b.font = '8px "Press Start 2P"';
    b.textAlign = 'center';
    for (const f of R.floaters) {
      const p = (t - f.t0) / 900;
      const y = Math.round(f.y - easeOut(p) * 14);
      b.globalAlpha = 1 - p * p;
      b.fillStyle = '#000';
      b.fillText(f.text, f.x + 1, y + 1);
      b.fillStyle = f.color;
      b.fillText(f.text, f.x, y);
    }
    b.globalAlpha = 1;
  }

  function drawRings(t) {
    R.rings = R.rings.filter((r) => t - r.t0 < r.dur);
    for (const r of R.rings) {
      const p = (t - r.t0) / r.dur;
      if (p < 0) continue; // delayed ring, not started yet
      const rad = r.r0 + (r.r1 - r.r0) * easeOut(p);
      const n = Math.max(12, Math.round(rad * 5));
      b.fillStyle = `rgba(${r.color}, ${0.85 * (1 - p)})`;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        b.fillRect(Math.round(r.x + Math.cos(ang) * rad), Math.round(r.y + Math.sin(ang) * rad), 1, 1);
      }
    }
  }

  function drawOverlays(t) {
    if (R.rewindFx) {
      // A faint tint that eases in and out, one soft tracking band rolling up the screen,
      // and a steady label. No flicker.
      const fx = R.rewindFx;
      const p = clamp01((t - fx.t0) / fx.dur);
      const fade = Math.min(1, p / 0.2, (1 - p) / 0.2);
      b.fillStyle = `rgba(72, 225, 254, ${0.08 * fade})`;
      b.fillRect(0, 0, buf.width, buf.height);
      if (!calm.matches) {
        const band = Math.round((1 - (((t - fx.t0) / 900) % 1)) * (buf.height + 16)) - 8;
        b.fillStyle = `rgba(243, 246, 248, ${0.05 * fade})`;
        b.fillRect(0, band, buf.width, 8);
      }
      b.globalAlpha = fade;
      b.font = '8px "Press Start 2P"';
      b.textAlign = 'left';
      b.fillStyle = '#000';
      b.fillText('<< REWIND', 9, 15);
      b.fillStyle = '#48e1fe';
      b.fillText('<< REWIND', 8, 14);
      b.globalAlpha = 1;
    }
    if (R.replay) drawReplayBanner(t);
  }

  /** A banner along the bottom of the map while the workflow catches up: spinner, label, progress. */
  function drawReplayBanner(t) {
    const rp = R.replay;
    let a = clamp01((t - rp.t0 - 300) / 200); // grace period: quick replays never show it
    if (rp.end) {
      a = Math.min(a, 1 - clamp01((t - rp.end) / 200));
      if (t - rp.end > 200) { R.replay = null; return; }
    }
    if (a <= 0) return;
    const queued = rp.status === 'ENQUEUED';
    const label = queued ? 'QUEUED: WAITING FOR A WORKER' : `FETCHING HISTORY TO TURN ${rp.turn}`;
    const w = buf.width - 16;
    const h = 20;
    const x0 = 8;
    const y0 = buf.height - h - 8;
    b.globalAlpha = a;
    b.fillStyle = 'rgba(5, 6, 8, 0.88)';
    b.fillRect(x0, y0, w, h);
    b.fillStyle = '#48e1fe';
    b.fillRect(x0, y0, w, 1);
    // progress along the bottom edge
    const p = queued || !rp.targetSeq ? 0 : clamp01(rp.seq / rp.targetSeq);
    b.fillStyle = 'rgba(72, 225, 254, 0.25)';
    b.fillRect(x0, y0 + h - 2, w, 2);
    b.fillStyle = '#48e1fe';
    b.fillRect(x0, y0 + h - 2, Math.round(w * p), 2);
    // spinner: eight dots, one bright one going round (a frozen ring under reduced motion)
    const cx = x0 + 11;
    const cy = y0 + 9;
    const lead = calm.matches ? 0 : Math.floor(t / 110) % 8;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const age = (lead - i + 8) % 8;
      b.fillStyle = age === 0 ? '#f3f6f8' : age < 3 ? '#48e1fe' : '#2a4d63';
      b.fillRect(Math.round(cx + Math.cos(ang) * 5) - 1, Math.round(cy + Math.sin(ang) * 5) - 1, 2, 2);
    }
    b.font = '8px "Press Start 2P"';
    b.textAlign = 'left';
    b.fillStyle = '#48e1fe';
    b.fillText(label, x0 + 22, y0 + 13);
    b.globalAlpha = 1;
  }

  function draw(t) {
    const v = G.view;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.fillStyle = '#050608';
    b.fillRect(0, 0, buf.width, buf.height);
    if (v) {
      let sx = 0;
      let sy = 0;
      if (R.shake) {
        const p = (t - R.shake.t0) / R.shake.dur;
        if (p >= 1) R.shake = null;
        else {
          const m = calm.matches ? 0 : R.shake.mag * (1 - p);
          sx = Math.round((Math.random() * 2 - 1) * m);
          sy = Math.round((Math.random() * 2 - 1) * m);
        }
      }
      b.setTransform(1, 0, 0, 1, sx, sy);
      b.drawImage(layer, 0, 0);
      drawTrail(v);
      drawDen(v, t);
      drawPots(v, t);
      drawCobraMarks(v, t);
      drawCobras(t);
      drawLurker(v, t);
      drawPreview(v, t);
      drawBadger(v, t);
      drawFog(v, t);
      drawRings(t);
      drawParticles(t);
      drawFloaters(t);
      b.setTransform(1, 0, 0, 1, 0, 0);
      drawOverlays(t);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);
    requestAnimationFrame(draw);
  }

  // ------------------------------------------------------------------ DOM panels

  function pop(sel) {
    const el = $(sel)?.closest('.stat');
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function renderHud() {
    const v = G.view;
    if (!v) return;
    $('#hud-honey').textContent = v.honey;
    $('#hud-turn').textContent = v.turn;
    $('#hud-pots').textContent = `${v.eatenCount}/${v.potsTotal}`;
    $('#hud-zones').textContent = `${v.zones.length}/${v.zonesTotal}`;
    $('#hud-rewinds').textContent = G.stats.rewinds;
    const alert = v.status === 'alive' && v.sniff > 0;
    $('#hud-sniff').textContent = alert ? (v.sniff > 1 ? `COBRA x${v.sniff}` : 'COBRA!') : 'nothing';
    $('#hud-sniff-wrap').classList.toggle('alert', alert);
  }

  function isThreatened(v) {
    return v.status === 'alive' && v.cobras.some((c) => c.next[0] === v.pos[0] && c.next[1] === v.pos[1]);
  }

  function renderMsg(text) {
    const v = G.view;
    if (!v) return;
    $('#msg-text').textContent = text ?? v.last?.text ?? '';
    const warnings = [];
    if (isThreatened(v)) warnings.push('A cobra is about to strike! Move!');
    if (v.status === 'alive' && v.sniff > 0) warnings.push('*sniff sniff* A cobra is hiding right next to you.');
    $('#msg-sniff').textContent = warnings.join(' ');
  }

  // ------------------------------------------------------------------ games list (DBOS.listWorkflows)

  const BADGER_LABEL = { alive: 'playing', dead: 'bitten', escaped: 'escaped', napping: 'asleep', stopped: 'stopped' };
  const isLive = (wfStatus) => wfStatus === 'PENDING' || wfStatus === 'ENQUEUED';
  const ago = (ms) => {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  /** Keep the current game's row in sync with what this page knows, then redraw. */
  function renderWf() {
    if (G.id) {
      const row = {
        id: G.id,
        status: G.wf?.status ?? '…',
        createdAt: G.wf?.createdAt ?? Date.now(),
        badger: G.view?.status ?? 'alive',
        turn: G.view?.turn ?? 0,
        honey: G.view?.honey ?? 0,
      };
      const cur = G.games.find((g) => g.id === G.id);
      if (cur) Object.assign(cur, row);
      else G.games.unshift(row);
    }
    renderGames();
    renderLogMeta();
  }

  function renderLogMeta() {
    $('#log-meta').textContent = G.id
      ? `DBOS.listWorkflowSteps("${G.id}") · ${G.steps.length} checkpoints`
      : 'DBOS.listWorkflowSteps()';
  }

  function renderGames() {
    const ol = $('#games');
    if (!G.games.length) {
      ol.innerHTML = '<li class="games-empty">No games yet.</li>';
      return;
    }
    ol.innerHTML = G.games.map((g) => {
      // A badger that is "alive" in a workflow that isn't running any more was stopped.
      const b = g.badger === 'alive' && !isLive(g.status) ? 'stopped' : g.badger;
      const cur = g.id === G.id;
      return `<li><button class="game-row${cur ? ' current' : ''}" data-id="${esc(g.id)}"${cur ? ' aria-current="true"' : ''}>`
        + `<span class="gid">${cur ? '▶ ' : ''}${esc(g.id)}</span><span class="pill ${esc(g.status)}">${esc(g.status)}</span>`
        + `<span class="gmeta"><span class="b-${esc(b)}">${esc(BADGER_LABEL[b] ?? b)}</span> · turn ${g.turn} · ${g.honey} honey · started ${ago(g.createdAt)}</span>`
        + '</button></li>';
    }).join('');
  }

  async function refreshGames() {
    try {
      const r = await api('GET', '/api/games?limit=30');
      G.games = r.games;
    } catch {
      return;
    }
    renderWf();
  }

  /** Re-read the current game's workflow status (it changes a moment after a death or escape). */
  async function refreshCurrentWf() {
    const id = G.id;
    try {
      const r = await api('GET', `/api/games/${encodeURIComponent(id)}`);
      if (G.id === id) { G.wf = r.workflow; renderWf(); }
    } catch { /* next refresh will catch up */ }
  }

  async function loadGame(id) {
    if (id === G.id || G.busy || ['crash', 'rewinding', 'loading'].includes(G.mode)) return;
    $('#sheet').classList.add('hidden');
    R.preview = null;
    sheetKind = null;
    setMode('loading');
    try {
      const r = await api('GET', `/api/games/${encodeURIComponent(id)}`);
      setGame(r);
      setMode('play');
      openRelevantSheet();
    } catch (e) {
      setMode('play');
      if (e.network) enterCrash();
      else toast(e.message);
    }
  }

  function renderButtons() {
    const v = G.view;
    const crash = G.mode === 'crash';
    $('#btn-new').disabled = crash || G.mode === 'rewinding';
    $('#btn-rewind').disabled = crash || G.mode === 'rewinding' || !v || v.turn === 0;
  }

  function setMode(m) {
    G.mode = m;
    renderButtons();
  }

  function setServer(online) {
    const el = $('#server');
    el.classList.toggle('down', !online);
    $('#server-text').textContent = online ? `SERVER UP · boot ${G.boot ?? '?'}` : 'SERVER DOWN';
  }

  let toastTimer = 0;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  // ------------------------------------------------------------------ checkpoint log

  // A full load (opening a game, the rewind panel, after a rewind or a crash) reads every step.
  // After a move, only the steps the browser doesn't have yet are fetched, and only their rows
  // are added to the list, so a move costs the same at turn 5 as at turn 500.
  const stepEls = new Map(); // step ID -> <li>
  const NAMES = { 'DBOS.recv': 'recv', 'DBOS.setEvent': 'setEvent', 'DBOS.sleep': 'sleep' };
  const waitEl = document.createElement('li');
  let firstRender = true;
  let nextStep = 0; // the lowest step ID the browser doesn't have yet
  let stepsBusy = false;
  let stepsAgain = false;
  let stepsAgainFull = false;

  /** Insert or update the rows for `rows`, every step with ID >= `from`. Rows below `from` are untouched. */
  function renderSteps(rows, from = 0) {
    const ol = $('#steps');
    const nearBottom = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 60;
    const keep = new Set(rows.map((s) => s.id));
    for (const [id, el] of stepEls) {
      if (id >= from && !keep.has(id)) { el.remove(); stepEls.delete(id); }
    }
    let added = 0;
    for (const s of rows) {
      const html = `<span class="fid">${s.id}</span><span class="nm">${esc(NAMES[s.name] ?? s.name)}</span><span class="tx">${esc(s.text)}</span>`;
      let el = stepEls.get(s.id);
      if (!el) {
        el = document.createElement('li');
        el.dataset.id = s.id;
        stepEls.set(s.id, el);
        if (!firstRender) {
          added++;
          el.dataset.fresh = '1';
          setTimeout(() => { delete el.dataset.fresh; el.classList.remove('fresh'); }, 400);
        }
        // Rows go in step-ID order. New steps nearly always belong at the end; a recv lands just
        // before its own timeout timer, which was saved first.
        let prev = waitEl.isConnected ? waitEl.previousElementSibling : ol.lastElementChild;
        while (prev && Number(prev.dataset.id) > s.id) prev = prev.previousElementSibling;
        ol.insertBefore(el, prev ? prev.nextSibling : ol.firstChild);
      }
      el.className = `st k-${s.kind}${el.dataset.fresh ? ' fresh' : ''}`;
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    }
    nextStep = from;
    while (stepEls.has(nextStep)) nextStep++;
    renderWait();
    if (firstRender || nearBottom || added) ol.scrollTop = ol.scrollHeight;
    firstRender = false;
    renderLogMeta();
  }

  /** The dashed "waiting for your next move" row at the bottom of the log. */
  function renderWait() {
    const wfs = G.wf?.status;
    if (G.view?.status === 'alive' && (wfs === 'PENDING' || wfs === 'ENQUEUED')) {
      waitEl.className = 'st k-wait';
      const doing = wfs === 'ENQUEUED' ? 're-enqueued, waiting for a worker'
        : R.replay && !R.replay.end ? 'replaying checkpoints to catch up'
        : 'waiting for your next move';
      const html = `<span class="fid">…</span><span class="nm">recv</span><span class="tx">${doing}<span class="cur">_</span></span>`;
      if (waitEl.dataset.html !== html) { waitEl.innerHTML = html; waitEl.dataset.html = html; }
      if ($('#steps').lastElementChild !== waitEl) $('#steps').appendChild(waitEl);
    } else {
      waitEl.remove();
    }
  }

  /** A full /steps response: the whole log plus the rewind data built from it. */
  function applyFullSteps(r) {
    G.checkpoints = r.checkpoints;
    G.cobraTrail = r.cobraTrail ?? [];
    G.steps = r.steps;
    if (!G.erasing) renderSteps(r.steps, 0);
  }

  async function loadSteps({ full = false } = {}) {
    const id = G.id;
    // Ask from one step before the first missing one: that overlapping row must match ours, or
    // the history changed under us (say, a rewind in another tab) and we reload it all.
    const from = full || nextStep === 0 ? null : nextStep - 1;
    const r = await api('GET', `/api/games/${encodeURIComponent(id)}/steps${from === null ? '' : `?from=${from}`}`);
    if (id !== G.id) return r; // switched games while this was in flight
    if (from === null) {
      applyFullSteps(r);
      return r;
    }
    // IDs 0..nextStep-1 are all present, so normally index = ID.
    const mine = G.steps[from]?.id === from ? G.steps[from] : G.steps.find((s) => s.id === from);
    const head = r.steps[0];
    if (!mine || !head || head.id !== from || head.name !== mine.name || head.text !== mine.text) {
      return loadSteps({ full: true });
    }
    G.steps = G.steps.filter((s) => s.id < from).concat(r.steps);
    if (!G.erasing) renderSteps(r.steps, from);
    return r;
  }

  async function refreshSteps({ full = false } = {}) {
    if (!G.id) return;
    if (stepsBusy || G.erasing) {
      stepsAgain = true;
      stepsAgainFull ||= full;
      return;
    }
    stepsBusy = true;
    try { await loadSteps({ full }); } catch { /* the next refresh will catch up */ }
    stepsBusy = false;
    if (stepsAgain) {
      const again = { full: stepsAgainFull };
      stepsAgain = false;
      stepsAgainFull = false;
      refreshSteps(again);
    }
  }

  function markErased(startStep) {
    G.erasing = true;
    waitEl.remove();
    const ol = $('#steps');
    let first = null;
    for (const [id, el] of stepEls) {
      if (id < startStep) continue;
      el.classList.add('erased');
      if (!first) first = el;
    }
    if (first) ol.scrollTop = Math.max(0, first.offsetTop - ol.offsetTop - 80);
    // A rewind is rare enough to re-read the whole history. Fetch it now, while the erased rows
    // fade out and the badger slides back, so it's ready the moment the animation ends.
    const gid = G.id;
    const pre = api('GET', `/api/games/${encodeURIComponent(gid)}/steps`).catch(() => null);
    setTimeout(async () => {
      for (const [id, el] of [...stepEls]) {
        if (id >= startStep) { el.remove(); stepEls.delete(id); }
      }
      G.erasing = false;
      const r = await pre;
      if (G.id !== gid) return;
      if (r) applyFullSteps(r);
      refreshSteps({ full: !r }); // and anything that has happened since
    }, 950);
  }

  // ------------------------------------------------------------------ moves

  async function move(dir) {
    const v = G.view;
    if (G.mode !== 'play' || !v || v.status !== 'alive') return;
    if (R.replay && !R.replay.end) {
      // The workflow isn't listening yet: keep the latest key and send it the moment it is.
      G.queue = [dir];
      renderMsg('Hold on: DBOS is replaying the workflow. Your move goes in as soon as it is listening.');
      return;
    }
    // A stopped workflow isn't listening for moves; offer to rewind it back to life instead.
    if (G.wf && !isLive(G.wf.status)) { openRelevantSheet(); return; }
    if (G.busy) { if (G.queue.length < 2) G.queue.push(dir); return; }
    if (dir !== 'wait') {
      const [dx, dy] = DIR[dir];
      if (tileAt(v, v.pos[0] + dx, v.pos[1] + dy) === '#') {
        bonk(v.pos); // known rock: no need to bother the workflow
        renderMsg('Bonk! Solid rock.');
        return;
      }
    }
    G.busy = true;
    try {
      const r = await api('POST', `/api/games/${encodeURIComponent(G.id)}/move`, { dir, key: uid() });
      G.wf = r.workflow;
      applyView(r.state);
      refreshSteps();
    } catch (e) {
      G.busy = false;
      G.queue = [];
      if (e.network) { enterCrash(); return; }
      if (e.status === 409 && e.data?.state) applyView(e.data.state);
      else toast(e.message);
      return;
    }
    G.busy = false;
    if (G.queue.length && G.mode === 'play') move(G.queue.shift());
  }

  // ------------------------------------------------------------------ rewind sheet

  let sheetKind = null;
  let cps = [];
  const range = $('#rw-range');

  // Keep the panel off the maze: top of the DBOS column when there is one, else under the map.
  // The breakpoint matches the single-column layout in style.css.
  const wideLayout = window.matchMedia('(min-width: 1061px)');
  function placeSheet() {
    const sheet = $('#sheet');
    if (wideLayout.matches) $('.dbos').prepend(sheet);
    else $('#screen').after(sheet);
  }
  wideLayout.addEventListener('change', placeSheet);
  placeSheet();

  async function openSheet(kind) {
    const v = G.view;
    if (!v || G.mode === 'crash' || G.mode === 'rewinding') return;
    if (kind !== 'win') {
      try { await loadSteps({ full: true }); } catch (e) { if (e.network) enterCrash(); return; }
      const limit = v.status === 'napping' || kind === 'stopped' ? v.turn : v.turn - 1;
      cps = G.checkpoints.filter((c) => c.turn <= limit);
      if (!cps.length) { toast('Nothing to rewind to yet. Make a move first.'); return; }
    }
    sheetKind = kind;
    const sheet = $('#sheet');
    sheet.className = `sheet ${kind}`;
    const sub = $('#sheet-sub');
    const rw = $('#rewind-ui');
    if (kind === 'win') {
      $('#sheet-title').textContent = 'ESCAPED!';
      sub.textContent = `${v.honey} honey · ${v.turn} turns · ${G.stats.rewinds} rewinds`
        + (G.stats.crashes ? ` · ${G.stats.crashes} crashes survived` : '');
      rw.classList.add('hidden');
      $('#sheet-go').textContent = 'PLAY AGAIN';
      $('#sheet-alt').textContent = 'REWIND FOR MORE HONEY';
    } else {
      if (kind === 'death') {
        $('#sheet-title').textContent = 'BADGER DOWN!';
        sub.textContent = `${v.death.text}, turn ${v.death.turn}. The step threw and the workflow ended in ERROR. Pick a checkpoint to rewind to.`;
        $('#sheet-alt').textContent = 'NEW GAME';
      } else if (kind === 'stopped') {
        $('#sheet-title').textContent = 'PAUSED';
        sub.textContent = 'This workflow was stopped, so it isn\'t waiting for moves. Rewind it to pick up where you left off.';
        $('#sheet-alt').textContent = 'NEW GAME';
      } else if (kind === 'nap') {
        $('#sheet-title').textContent = 'ZZZ...';
        sub.textContent = 'Nobody moved for 30 minutes, so the workflow finished. Rewind to keep playing.';
        $('#sheet-alt').textContent = 'NEW GAME';
      } else {
        $('#sheet-title').textContent = 'TIME TRAVEL';
        sub.textContent = 'Pick a checkpoint. DBOS keeps everything before it and erases everything after.';
        $('#sheet-alt').textContent = 'CANCEL';
      }
      $('#sheet-go').textContent = 'REWIND';
      range.max = String(cps.length - 1);
      range.value = String(cps.length - 1);
      rw.classList.remove('hidden');
      updateRewindUi();
    }
    sheet.classList.remove('hidden');
    sheet.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setMode('sheet');
  }

  function updateRewindUi() {
    const cp = cps[Number(range.value)];
    if (!cp) return;
    $('#rw-turn').textContent = cp.turn;
    $('#rw-drop').textContent = G.steps.filter((s) => s.id >= cp.startStep).length;
    $('#rw-code').textContent = `await DBOS.rewindWorkflow("${G.id}", { startStep: ${cp.startStep} });`;
    R.preview = cp.turn;
  }

  function closeSheet() {
    $('#sheet').classList.add('hidden');
    R.preview = null;
    sheetKind = null;
    if (G.mode === 'sheet') setMode('play');
  }

  function nudge(d) {
    range.value = String(Math.max(0, Math.min(cps.length - 1, Number(range.value) + d)));
    updateRewindUi();
  }

  async function doRewind(turn) {
    const v = G.view;
    closeSheet();
    setMode('rewinding');
    // Start the slide-back right away and rewind the workflow at the same time, so the server's
    // work hides behind the animation. Everything the animation needs is already in the browser.
    const path = v.trail.slice(turn).reverse();
    // Cobra positions for the same turns, newest first (the escape/death turn has no
    // moveCobras step, so it reuses the turn before).
    const lastTurn = v.trail.length - 1;
    const cobras = G.cobraTrail.length
      ? path.map((_, j) => new Map(cobraFrame(lastTurn - j).map(([id, cx, cy]) => [id, [cx, cy]])))
      : null;
    const dur = Math.min(1500, 350 + path.length * 45);
    R.rewindFx = { t0: performance.now(), dur, path, cobras };
    ring(path[0], '72,225,254', { dur: 500, r1: 18 });
    const call = api('POST', `/api/games/${encodeURIComponent(G.id)}/rewind`, { turn })
      .then((res) => { markErased(res.startStep); return res; });
    let r;
    try {
      [r] = await Promise.all([call, sleep(dur)]);
    } catch (e) {
      R.rewindFx = null; // the badger snaps back: nothing was rewound
      setMode('play');
      if (e.network) { enterCrash(); return; }
      toast(`Rewind failed: ${e.message}`);
      return;
    }
    ring(path[path.length - 1], '72,225,254', { dur: 550, r1: 22 });
    R.rewindFx = null;
    G.stats.rewinds++;
    savePerGame();
    G.wf = r.workflow;
    R.reveal.clear();
    applyView(r.state, { animate: false });
    renderMsg(`Rewound to turn ${r.turn}. The badger shakes it off.`);
    setMode('play');
    waitUntilReady();
  }

  /**
   * After a rewind or a crash, the workflow first waits in the queue for a worker, then re-runs
   * from the top, every step and recv returning its checkpoint, until it reaches the recv for the
   * current turn. In a long game that takes a few seconds. Show it on the map (after a short grace
   * period, so quick replays don't flash a banner), hold the player's move, and send it the moment
   * the workflow is listening.
   */
  async function waitUntilReady() {
    const id = G.id;
    if (!id || G.view?.status !== 'alive') return;
    R.replay = { t0: performance.now(), turn: G.view.turn, targetSeq: G.view.seq, seq: 0, status: G.wf?.status };
    renderWait();
    for (let i = 0; i < 300; i++) { // gives up after about a minute
      let r;
      try {
        r = await api('GET', `/api/games/${encodeURIComponent(id)}`);
      } catch (e) {
        R.replay = null;
        if (e.network && G.id === id) enterCrash();
        return;
      }
      if (G.id !== id) return;
      G.wf = r.workflow;
      if (R.replay) Object.assign(R.replay, { seq: r.replaySeq ?? 0, status: r.workflow?.status });
      renderWf();
      if (!G.erasing) renderWait();
      if (r.ready || !isLive(r.workflow?.status) || r.state?.status !== 'alive') break;
      await sleep(200);
    }
    if (R.replay) R.replay.end = performance.now();
    if (G.id !== id) return;
    renderWait();
    if (G.queue.length && G.mode === 'play') { move(G.queue.shift()); return; }
    renderMsg();
    // The recv saves its timeout timer a moment after it starts listening; pick that row up.
    for (let i = 0; i < 5 && G.id === id && G.steps.at(-1)?.name !== 'DBOS.sleep'; i++) {
      await refreshSteps();
      if (G.steps.at(-1)?.name !== 'DBOS.sleep') await sleep(250);
    }
  }

  // ------------------------------------------------------------------ crashes

  // The server went away (killed, crashed, restarted). Wait for it to come back, then show
  // DBOS recovering the game.
  async function enterCrash(reason = 'lost contact with the server') {
    if (G.mode === 'crash') return;
    $('#sheet').classList.add('hidden');
    R.preview = null;
    sheetKind = null;
    setMode('crash');
    G.queue = [];
    const oldBoot = G.boot;
    setServer(false);
    const box = $('#crash');
    box.classList.remove('hidden', 'recovered');
    $('.crash-title').textContent = 'SERVER DOWN';
    const term = $('#crash-term');
    term.innerHTML = '';
    const line = (text, cls = '') => {
      const li = document.createElement('li');
      li.className = cls;
      li.textContent = text;
      term.appendChild(li);
    };
    line(reason, 'bad');
    await sleep(450);
    line('waiting for the server. Start it again with: npm start');

    let h = null;
    for (;;) {
      try {
        h = await api('GET', '/api/health');
        if (h.bootId !== oldBoot) break;
      } catch { /* still down */ }
      await sleep(250);
    }
    G.boot = h.bootId;
    setServer(true);
    line(`new server process is up (boot ${h.bootId})`, 'ok');
    await sleep(250);
    line('DBOS.launch() recovers the workflows that were PENDING...');

    let r = null;
    for (let i = 0; i < 40 && !r; i++) {
      try { r = await api('GET', `/api/games/${encodeURIComponent(G.id)}`); } catch { await sleep(250); }
    }
    try { await loadSteps({ full: true }); } catch { /* shown below as 0 */ }
    const n = G.steps.length;
    await sleep(350);
    line(`${G.id}: ${n} checkpoints replayed from the log`, 'ok');
    line('the badger is exactly where you left it', 'ok');
    box.classList.add('recovered');
    $('.crash-title').textContent = 'RECOVERED';
    G.stats.crashes++;
    savePerGame();
    await sleep(1800);
    box.classList.add('hidden');
    setMode('play');
    if (r) { G.wf = r.workflow; applyView(r.state, { animate: true }); }
    refreshGames();
    renderWait();
    waitUntilReady(); // recovery queues the workflow, then it replays before it can take a move
  }

  // ------------------------------------------------------------------ games

  function setGame(r) {
    G.id = r.id;
    store.set('badger:current', r.id);
    G.wf = r.workflow;
    if (r.bootId) G.boot = r.bootId;
    loadPerGame();
    for (const el of stepEls.values()) el.remove();
    stepEls.clear();
    waitEl.remove();
    firstRender = true;
    nextStep = 0;
    G.steps = [];
    G.view = null;
    mapKey = '';
    R.reveal.clear();
    R.cob.clear();
    R.particles = [];
    R.floaters = [];
    R.rings = [];
    R.replay = null;
    G.queue = [];
    R.bad = null;
    applyView(r.state, { animate: false });
    refreshSteps({ full: true });
    // Opened while its workflow is still queued or replaying (say, right after a server restart)?
    if (r.ready === false && isLive(r.workflow?.status) && r.state?.status === 'alive') waitUntilReady();
  }

  async function newGame() {
    if (G.mode === 'crash' || G.mode === 'rewinding') return;
    $('#sheet').classList.add('hidden');
    R.preview = null;
    sheetKind = null;
    setMode('loading');
    try {
      const r = await api('POST', '/api/games', {});
      setGame(r);
      refreshGames();
      setMode('play');
    } catch (e) {
      setMode('play');
      if (e.network) enterCrash();
      else toast(e.message);
    }
  }

  function openRelevantSheet() {
    const s = G.view?.status;
    if (s === 'dead') openSheet('death');
    else if (s === 'escaped') openSheet('win');
    else if (s === 'napping') openSheet('nap');
    else if (s === 'alive' && G.wf && !isLive(G.wf.status)) openSheet('stopped');
  }

  // ------------------------------------------------------------------ input

  const KEYS = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ' ': 'wait',
  };

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (G.mode === 'sheet') {
      if (sheetKind === 'win') {
        if (k === 'Enter') { e.preventDefault(); newGame(); }
        else if (k === 'r' || k === 'R') { e.preventDefault(); openSheet('manual'); }
        return;
      }
      if (e.target === range && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
      if (k === 'ArrowLeft' || k === 'a' || k === 'ArrowDown') { e.preventDefault(); nudge(-1); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'ArrowUp') { e.preventDefault(); nudge(1); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); $('#sheet-go').click(); }
      else if (k === 'Escape' && sheetKind === 'manual') { e.preventDefault(); closeSheet(); }
      return;
    }
    if (KEYS[k]) { e.preventDefault(); move(KEYS[k]); return; }
    if (k === 'r' || k === 'R') {
      e.preventDefault();
      if (G.mode !== 'play') return;
      if (G.view?.status === 'alive' && isLive(G.wf?.status)) openSheet('manual');
      else openRelevantSheet();
    }
  });

  // Buttons give focus back to the game so Space/Enter never re-trigger them.
  document.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => btn.blur()));
  $('#btn-new').addEventListener('click', () => newGame());
  $('#btn-rewind').addEventListener('click', () => {
    if (G.mode === 'sheet') return;
    if (G.view?.status === 'alive' && isLive(G.wf?.status)) openSheet('manual');
    else openRelevantSheet();
  });
  $('#rw-first').addEventListener('click', () => { range.value = '0'; updateRewindUi(); });
  $('#rw-prev').addEventListener('click', () => nudge(-1));
  $('#rw-next').addEventListener('click', () => nudge(1));
  range.addEventListener('input', updateRewindUi);
  $('#sheet-go').addEventListener('click', () => {
    if (sheetKind === 'win') newGame();
    else if (cps[Number(range.value)]) doRewind(cps[Number(range.value)].turn);
  });
  $('#sheet-alt').addEventListener('click', () => {
    if (sheetKind === 'manual') closeSheet();
    else if (sheetKind === 'win') { closeSheet(); openSheet('manual'); }
    else newGame();
  });
  document.querySelectorAll('#dpad [data-dir]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); move(btn.dataset.dir); });
  });

  // ------------------------------------------------------------------ boot

  function drawLogo() {
    const logo = $('#logo').getContext('2d');
    logo.imageSmoothingEnabled = false;
    logo.drawImage(Sprites.badger[0].right, 0, 0);
    const fav = document.createElement('canvas');
    fav.width = 32;
    fav.height = 32;
    const fg = fav.getContext('2d');
    fg.imageSmoothingEnabled = false;
    fg.drawImage(Sprites.badger[0].right, 0, -4, 32, 32);
    $('#favicon').href = fav.toDataURL();
  }

  async function boot() {
    drawLogo();
    resize();
    requestAnimationFrame(draw);
    for (;;) {
      try {
        const h = await api('GET', '/api/health');
        G.boot = h.bootId;
        G.appVersion = h.appVersion ?? null;
        setServer(true);
        break;
      } catch {
        setServer(false);
        await sleep(1000);
      }
    }
    const saved = store.get('badger:current', null);
    if (saved) {
      try {
        const r = await api('GET', `/api/games/${encodeURIComponent(saved)}`);
        // A game started by an older version of the workflow code won't run on this server.
        const stale = G.appVersion && r.workflow?.version && r.workflow.version !== G.appVersion;
        if (stale) toast('That game was saved by an older version. Starting a new one.');
        if (r.state && r.workflow && !stale) {
          setGame(r);
          setMode('play');
          refreshGames();
          openRelevantSheet();
          return;
        }
      } catch { /* start fresh */ }
    }
    await newGame();
  }

  if (document.fonts?.ready) document.fonts.ready.then(() => { mapKey = ''; if (G.view) rebuildLayer(G.view); });
  $('#games').addEventListener('click', (e) => {
    const row = e.target.closest('.game-row');
    if (!row) return;
    row.blur();
    loadGame(row.dataset.id);
  });
  setInterval(renderGames, 60_000); // keep "started 5m ago" fresh

  // Heartbeat: notice when the server dies or restarts between moves (e.g. `pkill -9 -f
  // src/server.ts`), so the recovery shows up right away rather than on the next move.
  let beating = false;
  setInterval(async () => {
    if (beating || !G.boot || ['boot', 'crash'].includes(G.mode)) return;
    beating = true;
    try {
      const h = await api('GET', '/api/health');
      if (h.bootId !== G.boot && G.mode !== 'crash') enterCrash('the server process restarted');
    } catch (e) {
      if (e.network) enterCrash();
    } finally {
      beating = false;
    }
  }, 2000);

  boot();
})();
