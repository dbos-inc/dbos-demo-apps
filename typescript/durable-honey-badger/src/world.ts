// Pure game rules: maze generation, cobras, move resolution, and the public "view"
// the browser is allowed to see. Nothing in here touches DBOS — the workflow in
// game.ts decides what gets checkpointed.

export type Pos = [number, number];
export type Dir = 'up' | 'down' | 'left' | 'right' | 'wait';

export const DELTA: Record<Dir, Pos> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
  wait: [0, 0],
};
const CARD: Pos[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Maze cells; tiles are (2*cells+1) so walls sit between cells. 12x8 cells → 25x17 tiles.
export const CELLS_W = 12;
export const CELLS_H = 8;
// The map is split into 3x2 hidden regions that are revealed when the badger walks in.
export const ZONES_X = 3;
export const ZONES_Y = 2;

const HONEY_POTS = 9;
// Cobras are dangerous (roaming ones will strike the badger), so there aren't many of them.
const PATROL_COBRAS = 4;
const LURKING_COBRAS = 5;
// Extra walls knocked out at random after braiding. Each one adds a loop: more ways to dodge a
// cobra, and more places a hidden burrow can go without sealing anything off (see step 6).
const EXTRA_LOOPS = 6;
// How roaming cobras move. They roam the whole maze: every turn each one picks a random
// neighboring tunnel tile, strongly preferring to keep slithering forward (weight 8) over
// doubling back (weight 1), taking a random branch at junctions, and sometimes just stopping. How often
// it stops is the cobra's own "laziness", rolled per cobra when the maze is generated.
export const COBRA_FORWARD_WEIGHT = 8;
export const COBRA_LAZINESS_MIN = 0.05;
export const COBRA_LAZINESS_MAX = 0.3;
const COBRA_LAIR_SPACING = 5; // lairs start at least this far apart

/** A cobra that roams the maze, starting from its lair. */
export interface PatrolCobra { id: number; lair: Pos; laziness: number; firstMove: Pos }
/**
 * Where a roaming cobra is, the tile it has already committed to for the next turn (the red
 * tile in the UI), and the tile it came from (so it can prefer not to double back).
 */
export interface CobraState { id: number; at: Pos; next: Pos; prev: Pos | null }
/** A cobra hiding in a burrow. Invisible, but the badger can smell it from next door. */
export interface LurkingCobra { id: number; at: Pos }
export interface HoneyPot { id: number; at: Pos }

export interface World {
  seed: number;
  w: number;
  h: number;
  tiles: string[]; // '#' rock, '.' tunnel
  start: Pos;
  den: Pos;
  denApproach?: Pos[]; // the den's tunnel out to the nearest junctions; cobras keep out
  honey: HoneyPot[];
  patrols: PatrolCobra[];
  lurkers: LurkingCobra[];
}

export interface Death {
  kind: 'patrol' | 'lurker';
  at: Pos;
  turn: number;
  cobra: number;
  text: string;
}

export interface LastEvent {
  kind: 'start' | 'move' | 'wait' | 'bump' | 'honey' | 'zone' | 'escaped' | 'death' | 'nap';
  text: string;
  amount?: number;
}

export interface GameState {
  seq: number; // bumps on every processed message, so clients can wait for "the next state"
  turn: number; // bumps on every move that actually happened (cobras move on turns)
  pos: Pos;
  facing: 'left' | 'right';
  honey: number;
  eaten: number[];
  zones: number[];
  trail: [number, number, number][]; // [x, y, honey] after each turn; index = turn
  cobras: CobraState[]; // patrolling cobras, as last checkpointed by a moveCobras step
  status: 'alive' | 'dead' | 'escaped' | 'napping';
  death?: Death;
  last: LastEvent;
}

/** What one moveCobras step returns (and DBOS checkpoints). */
export interface CobraMoveRecord {
  turn: number;
  cobras: CobraState[];
  paused: number; // how many cobras decided to stop next turn
  doubledBack: number; // how many decided to turn back the way they came
}

/** What one moveBadger step returns (and DBOS checkpoints). */
export interface MoveRecord {
  dir: Dir;
  from: Pos;
  to: Pos;
  bumped: boolean;
  ate: number | null; // honey pot id
  honey: number; // honey amount, rolled at random inside the step
  escaped: boolean;
}

// ---------------------------------------------------------------- helpers

const eq = (a: Pos, b: Pos) => a[0] === b[0] && a[1] === b[1];
const key = (p: Pos) => `${p[0]},${p[1]}`;
const manhattan = (a: Pos, b: Pos) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isFloor(world: World, [x, y]: Pos): boolean {
  return x >= 0 && y >= 0 && x < world.w && y < world.h && world.tiles[y][x] !== '#';
}

export function zoneOf(world: World, [x, y]: Pos): number {
  const zx = Math.min(ZONES_X - 1, Math.floor((x * ZONES_X) / world.w));
  const zy = Math.min(ZONES_Y - 1, Math.floor((y * ZONES_Y) / world.h));
  return zy * ZONES_X + zx;
}

/** Every cobra starts in its lair, already committed to a first move. */
export function initialCobras(world: World): CobraState[] {
  return world.patrols.map((c) => ({ id: c.id, at: c.lair, next: c.firstMove, prev: null }));
}

/**
 * Advance every roaming cobra by one turn: each moves onto the tile it committed to, then
 * rolls where it goes next. `rnd` makes every choice, so the caller must checkpoint the result
 * (the moveCobras step) for replays to see the same cobras.
 *
 * Cobras go anywhere in the tunnels except the den's tunnel, the hidden cobras' burrows, and a
 * tile another cobra is on or heading to. That includes the badger's tile: a cobra can commit
 * to striking the badger, and the red tile under the badger is its one turn of warning.
 */
export function moveCobras(world: World, cobras: CobraState[], turn: number, rnd: () => number): CobraMoveRecord {
  let paused = 0;
  let doubledBack = 0;
  const offLimits = new Set([
    key(world.den),
    ...world.lurkers.map((l) => key(l.at)),
    ...(world.denApproach ?? []).map(key), // older saved mazes don't have it
  ]);
  const claimed = new Set(cobras.map((c) => key(c.next))); // where every cobra is about to be
  const out = cobras.map((c) => {
    const cobra = world.patrols[c.id];
    const at = c.next;
    const prev = eq(c.next, c.at) ? c.prev : c.at;
    let next = at;
    if (rnd() >= cobra.laziness) {
      const options = CARD.map(([dx, dy]) => [at[0] + dx, at[1] + dy] as Pos)
        .filter((p) => isFloor(world, p) && !offLimits.has(key(p)) && !claimed.has(key(p)));
      if (options.length) {
        const weights = options.map((p) => (prev && eq(p, prev) ? 1 : COBRA_FORWARD_WEIGHT));
        let r = rnd() * weights.reduce((a, b) => a + b, 0);
        let k = 0;
        while (k < options.length - 1 && r >= weights[k]) r -= weights[k++];
        next = options[k];
      }
    }
    claimed.add(key(next));
    if (eq(next, at)) paused++;
    else if (prev && eq(next, prev)) doubledBack++;
    return { id: c.id, at, next, prev };
  });
  return { turn, cobras: out, paused, doubledBack };
}

function reachable(w: number, h: number, g: string[][], from: Pos, blocked: Set<string>): Set<string> {
  const seen = new Set<string>([key(from)]);
  const q: Pos[] = [from];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of CARD) {
      const n: Pos = [x + dx, y + dy];
      if (n[0] < 0 || n[1] < 0 || n[0] >= w || n[1] >= h) continue;
      if (g[n[1]][n[0]] === '#' || blocked.has(key(n)) || seen.has(key(n))) continue;
      seen.add(key(n));
      q.push(n);
    }
  }
  return seen;
}

function distances(w: number, h: number, g: string[][], from: Pos): Map<string, number> {
  const dist = new Map<string, number>([[key(from), 0]]);
  const q: Pos[] = [from];
  while (q.length) {
    const p = q.shift()!;
    for (const [dx, dy] of CARD) {
      const n: Pos = [p[0] + dx, p[1] + dy];
      if (n[0] < 0 || n[1] < 0 || n[0] >= w || n[1] >= h) continue;
      if (g[n[1]][n[0]] === '#' || dist.has(key(n))) continue;
      dist.set(key(n), dist.get(key(p))! + 1);
      q.push(n);
    }
  }
  return dist;
}

// ---------------------------------------------------------------- world generation

export function generateWorld(seed: number): World {
  const rnd = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const shuffle = <T>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const w = CELLS_W * 2 + 1;
  const h = CELLS_H * 2 + 1;
  const g: string[][] = Array.from({ length: h }, () => Array<string>(w).fill('#'));
  const dig = (x: number, y: number) => { g[y][x] = '.'; };
  const inCells = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < CELLS_W && cy < CELLS_H;

  // 1. Perfect maze via randomized depth-first search.
  const seen = new Set<number>([0]);
  const stack: Pos[] = [[0, 0]];
  dig(1, 1);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options = CARD.map(([dx, dy]) => [cx + dx, cy + dy] as Pos)
      .filter(([nx, ny]) => inCells(nx, ny) && !seen.has(ny * CELLS_W + nx));
    if (!options.length) { stack.pop(); continue; }
    const [nx, ny] = pick(options);
    dig(cx * 2 + 1 + (nx - cx), cy * 2 + 1 + (ny - cy));
    dig(nx * 2 + 1, ny * 2 + 1);
    seen.add(ny * CELLS_W + nx);
    stack.push([nx, ny]);
  }

  // 2. Braid: knock out about half of the dead ends so there are loops and detours.
  for (let cy = 0; cy < CELLS_H; cy++) {
    for (let cx = 0; cx < CELLS_W; cx++) {
      const openings = CARD.filter(([dx, dy]) => g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] === '.');
      if (openings.length !== 1 || rnd() > 0.5) continue;
      const closed = CARD.filter(([dx, dy]) => inCells(cx + dx, cy + dy) && g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] === '#');
      if (closed.length) {
        const [dx, dy] = pick(closed);
        dig(cx * 2 + 1 + dx, cy * 2 + 1 + dy);
      }
    }
  }

  // 2b. A few more loops: open random walls between neighboring cells.
  for (let added = 0, tries = 0; added < EXTRA_LOOPS && tries < 500; tries++) {
    const cx = Math.floor(rnd() * CELLS_W);
    const cy = Math.floor(rnd() * CELLS_H);
    const [dx, dy] = pick(CARD);
    if (!inCells(cx + dx, cy + dy) || g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] === '.') continue;
    dig(cx * 2 + 1 + dx, cy * 2 + 1 + dy);
    added++;
  }

  const floors: Pos[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x] === '.') floors.push([x, y]);
  const degree = ([x, y]: Pos) => CARD.filter(([dx, dy]) => g[y + dy]?.[x + dx] === '.').length;
  const proto: World = { seed, w, h, tiles: [], start: [1, 1], den: [1, 1], honey: [], patrols: [], lurkers: [] };
  const start: Pos = [1, 1];

  // 3. The den (exit) is the farthest cell in the bottom-right region.
  const dist = distances(w, h, g, start);
  const lastZone = ZONES_X * ZONES_Y - 1;
  let den: Pos = start;
  for (const p of floors) {
    if (p[0] % 2 === 0 || p[1] % 2 === 0 || zoneOf(proto, p) !== lastZone) continue;
    if ((dist.get(key(p)) ?? -1) > (dist.get(key(den)) ?? -1)) den = p;
  }

  const taken = new Set<string>([key(start), key(den)]);

  // 3b. Cobras keep away from the badger's home: the den's tunnel, out to the nearest junction
  //     in every direction, is off-limits to them. Otherwise a cobra could get wedged between
  //     the den (where it may not go) and the badger (whose tile it never takes), and block the
  //     only exit. At a junction a cobra always has another way out.
  const denApproach: Pos[] = [den];
  const inApproach = (p: Pos) => denApproach.some((a) => eq(a, p));
  for (const [dx, dy] of CARD) {
    let from = den;
    let cur: Pos = [den[0] + dx, den[1] + dy];
    for (let n = 0; n < 80 && g[cur[1]]?.[cur[0]] === '.' && degree(cur) <= 2 && !inApproach(cur); n++) {
      denApproach.push(cur);
      const next = CARD.map(([ax, ay]) => [cur[0] + ax, cur[1] + ay] as Pos).find((p) => g[p[1]]?.[p[0]] === '.' && !eq(p, from));
      if (!next) break;
      from = cur;
      cur = next;
    }
  }

  // 4. Honey pots, preferring dead ends (where a greedy badger walks into trouble).
  const cellCenters = floors.filter((p) => p[0] % 2 === 1 && p[1] % 2 === 1 && manhattan(p, start) > 2);
  const deadEnds = shuffle(cellCenters.filter((p) => degree(p) === 1));
  const others = shuffle(cellCenters.filter((p) => degree(p) > 1));
  const honey: HoneyPot[] = [];
  for (const p of [...deadEnds.slice(0, 6), ...others]) {
    if (honey.length >= HONEY_POTS) break;
    if (taken.has(key(p))) continue;
    honey.push({ id: honey.length, at: p });
    taken.add(key(p));
  }

  // 5. Roaming cobras. Each starts in a lair outside the starting region, spread apart, and
  //    from there wanders anywhere in the maze (see moveCobras).
  const patrols: PatrolCobra[] = [];
  const patrolTiles = new Set<string>(); // lairs and first moves, kept free of burrows
  for (let tries = 0; tries < 600 && patrols.length < PATROL_COBRAS; tries++) {
    const lair = pick(floors);
    if (zoneOf(proto, lair) === 0 || manhattan(lair, start) < 9 || taken.has(key(lair)) || inApproach(lair)) continue;
    if (patrols.some((p) => manhattan(p.lair, lair) < COBRA_LAIR_SPACING)) continue;
    const firstMoves = CARD.map(([dx, dy]) => [lair[0] + dx, lair[1] + dy] as Pos)
      .filter((p) => g[p[1]]?.[p[0]] === '.' && !inApproach(p));
    if (!firstMoves.length) continue;
    const firstMove = pick(firstMoves);
    patrolTiles.add(key(lair));
    patrolTiles.add(key(firstMove));
    patrols.push({
      id: patrols.length,
      lair,
      laziness: COBRA_LAZINESS_MIN + rnd() * (COBRA_LAZINESS_MAX - COBRA_LAZINESS_MIN),
      firstMove,
    });
  }

  // 6. Lurking cobras hidden in burrows, mostly in corridors. Never next to each other
  //    (so the badger's nose is useful), and never where they would seal anything off: every
  //    tunnel tile that isn't a burrow must stay reachable from the start without stepping on
  //    one. That keeps the den, every honey pot, every hidden region and every cobra lair open.
  //    Valid spots are scarce: a burrow can only sit on a loop (one per loop, or the stretch
  //    between two would be sealed) or at the very tip of a dead end. So try every tunnel tile
  //    in random order, first preferring corridors, then filling any remaining slots with
  //    dead-end tips (which never seal anything off).
  const lurkers: LurkingCobra[] = [];
  const lurkTiles = new Set<string>();
  for (const pass of ['corridors', 'any'] as const) {
    for (const t of shuffle([...floors])) {
      if (lurkers.length >= LURKING_COBRAS) break;
      if (manhattan(t, start) < 4 || taken.has(key(t)) || patrolTiles.has(key(t)) || lurkTiles.has(key(t))) continue;
      if (CARD.some(([dx, dy]) => lurkTiles.has(key([t[0] + dx, t[1] + dy])))) continue;
      if (pass === 'corridors' && degree(t) < 2 && rnd() < 0.7) continue;
      const open = reachable(w, h, g, start, new Set([...lurkTiles, key(t)]));
      if (open.size !== floors.length - lurkTiles.size - 1) continue; // something got sealed off
      lurkTiles.add(key(t));
      lurkers.push({ id: PATROL_COBRAS + lurkers.length, at: t });
    }
  }

  return { ...proto, tiles: g.map((r) => r.join('')), den, denApproach, honey, patrols, lurkers };
}

// ---------------------------------------------------------------- rules

export function initialState(world: World): GameState {
  return {
    seq: 0,
    turn: 0,
    pos: world.start,
    facing: 'right',
    honey: 0,
    eaten: [],
    zones: [zoneOf(world, world.start)],
    trail: [[world.start[0], world.start[1], 0]],
    cobras: initialCobras(world),
    status: 'alive',
    last: { kind: 'start', text: 'The honey badger wakes up. Find the den. Mind the cobras.' },
  };
}

/** Deterministic outcome of a move, before any randomness. Shared by the step and the workflow. */
export function resolveMove(world: World, s: GameState, dir: Dir):
  { to: Pos; bumped: boolean; ate: number | null; escaped: boolean; death: Death | null } {
  const [dx, dy] = DELTA[dir];
  const from = s.pos;
  const to: Pos = [from[0] + dx, from[1] + dy];
  if (dir !== 'wait' && !isFloor(world, to)) return { to: from, bumped: true, ate: null, escaped: false, death: null };
  const turn = s.turn + 1;

  const lurker = world.lurkers.find((c) => eq(c.at, to));
  if (lurker) {
    return {
      to, bumped: false, ate: null, escaped: false,
      death: { kind: 'lurker', at: to, turn, cobra: lurker.id, text: `Ambushed by a cobra hiding in its burrow at (${to[0]},${to[1]})` },
    };
  }
  for (const c of s.cobras) {
    const now = c.at;
    const next = c.next;
    // Either the cobra ends up on the badger, or they try to slip past each other.
    const swap = eq(now, to) && eq(next, from);
    if (eq(next, to) || swap) {
      const where = `(${to[0]},${to[1]})`;
      const text = swap ? `Tried to slip past a cobra at ${where}`
        : dir === 'wait' ? `A cobra struck the badger at ${where}`
        : `Walked into a striking cobra at ${where}`;
      return { to, bumped: false, ate: null, escaped: false, death: { kind: 'patrol', at: to, turn, cobra: c.id, text } };
    }
  }
  const pot = world.honey.find((hp) => eq(hp.at, to) && !s.eaten.includes(hp.id));
  return { to, bumped: false, ate: pot ? pot.id : null, escaped: eq(to, world.den), death: null };
}

export function applyMove(world: World, s: GameState, rec: MoveRecord): GameState {
  if (rec.bumped) return { ...s, seq: s.seq + 1, last: { kind: 'bump', text: 'Bonk! Solid rock.' } };
  const pos = rec.to;
  const turn = s.turn + 1;
  const honey = s.honey + rec.honey;
  const eaten = rec.ate !== null ? [...s.eaten, rec.ate] : s.eaten;
  const zone = zoneOf(world, pos);
  const newZone = !s.zones.includes(zone);
  const zones = newZone ? [...s.zones, zone] : s.zones;
  const facing = rec.dir === 'left' ? 'left' : rec.dir === 'right' ? 'right' : s.facing;
  let last: LastEvent = { kind: rec.dir === 'wait' ? 'wait' : 'move', text: rec.dir === 'wait' ? 'The badger waits. Cobras slither.' : '' };
  if (newZone) last = { kind: 'zone', text: 'The badger digs into a hidden region!' };
  if (rec.ate !== null) last = { kind: 'honey', text: `Honey! +${rec.honey}`, amount: rec.honey };
  if (rec.escaped) last = { kind: 'escaped', text: 'Home sweet den! The honey badger escaped.' };
  return {
    ...s,
    seq: s.seq + 1,
    turn,
    pos,
    facing,
    honey,
    eaten,
    zones,
    trail: [...s.trail, [pos[0], pos[1], honey]],
    status: rec.escaped ? 'escaped' : 'alive',
    last,
  };
}

export function applyCobras(s: GameState, rec: CobraMoveRecord): GameState {
  return { ...s, cobras: rec.cobras };
}

export function deathState(s: GameState, dir: Dir, death: Death): GameState {
  const facing = dir === 'left' ? 'left' : dir === 'right' ? 'right' : s.facing;
  return {
    ...s,
    seq: s.seq + 1,
    turn: death.turn,
    pos: death.at,
    facing,
    trail: [...s.trail, [death.at[0], death.at[1], s.honey]],
    status: 'dead',
    death,
    last: { kind: 'death', text: death.text },
  };
}

// ---------------------------------------------------------------- what the browser sees

export interface View {
  seq: number;
  turn: number;
  status: GameState['status'];
  pos: Pos;
  facing: 'left' | 'right';
  honey: number;
  eatenCount: number;
  potsTotal: number;
  w: number;
  h: number;
  map: string[]; // '?' = still hidden
  zones: number[];
  zonesTotal: number;
  pots: Pos[];
  cobras: { id: number; at: Pos; next: Pos }[];
  den: Pos | null;
  sniff: number;
  trail: [number, number, number][];
  last: LastEvent;
  death?: Death;
}

export function view(world: World, s: GameState): View {
  const zones = new Set(s.zones);
  const visible = (p: Pos) => zones.has(zoneOf(world, p));
  const map = world.tiles.map((row, y) => [...row].map((c, x) => (visible([x, y]) ? c : '?')).join(''));
  // Cobras roam in and out of the fog. Send any cobra that is in sight *or about to strike a
  // tile in sight*: the browser draws fog over the hidden ones, so you see the red tile
  // (fair warning at a region's edge) but not the cobra itself.
  const cobras = s.cobras
    .map((c) => ({ id: c.id, at: c.at, next: c.next }))
    .filter((c) => visible(c.at) || visible(c.next));
  const sniff = s.status === 'alive'
    ? CARD.filter(([dx, dy]) => world.lurkers.some((c) => eq(c.at, [s.pos[0] + dx, s.pos[1] + dy]))).length
    : 0;
  return {
    seq: s.seq,
    turn: s.turn,
    status: s.status,
    pos: s.pos,
    facing: s.facing,
    honey: s.honey,
    eatenCount: s.eaten.length,
    potsTotal: world.honey.length,
    w: world.w,
    h: world.h,
    map,
    zones: s.zones,
    zonesTotal: ZONES_X * ZONES_Y,
    pots: world.honey.filter((hp) => !s.eaten.includes(hp.id) && visible(hp.at)).map((hp) => hp.at),
    cobras,
    den: visible(world.den) ? world.den : null,
    sniff,
    trail: s.trail,
    last: s.last,
    death: s.death,
  };
}
