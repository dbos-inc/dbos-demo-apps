import crypto from 'node:crypto';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { DBOS } from '@dbos-inc/dbos-sdk';
import { badgerGame, progress, type GameMessage } from './game.ts';
import { initialCobras, zoneOf, type CobraMoveRecord, type CobraState, type MoveRecord, type View, type World } from './world.ts';

type StepInfo = NonNullable<Awaited<ReturnType<typeof DBOS.listWorkflowSteps>>>[number];

const PORT = Number(process.env.PORT ?? 3000);
const DB_URL = process.env.DBOS_SYSTEM_DATABASE_URL ?? 'postgresql://postgres:dbos@localhost:5432/dbos_badger';
const BOOT_ID = crypto.randomBytes(4).toString('hex');
const BOOTED_AT = Date.now();

// DBOS only recovers workflows started by the same application version. By default that is a
// hash of the workflow code; pinning it keeps games recoverable while you tweak the code.
// Bump it whenever the workflow's sequence of steps changes.
const APP_VERSION = process.env.APP_VERSION ?? 'durable-badger-v3';

DBOS.setConfig({ name: 'dbos-badger', systemDatabaseUrl: DB_URL, applicationVersion: APP_VERSION });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (e: unknown) => (e instanceof Error ? e.message : e == null ? null : String((e as { message?: string }).message ?? e));

// ---------------------------------------------------------------- DBOS helpers

async function readState(id: string): Promise<View | null> {
  return DBOS.getEvent<View>(id, 'state', { timeoutSeconds: 0 });
}

/** Wait until the workflow publishes a state newer than `afterSeq` (or the timeout passes). */
async function waitForState(id: string, afterSeq: number, timeoutMs = 10_000): Promise<View | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await readState(id);
    if (v && v.seq > afterSeq) return v;
    if (Date.now() > deadline) return v;
    await sleep(25);
  }
}

async function workflowInfo(id: string) {
  const st = await DBOS.getWorkflowStatus(id);
  if (!st) return null;
  return {
    id: st.workflowID,
    name: st.workflowName,
    status: st.status,
    recoveryAttempts: st.recoveryAttempts ?? null,
    executor: st.executorId ?? null,
    version: st.applicationVersion ?? null,
    createdAt: st.createdAt,
    updatedAt: st.updatedAt ?? null,
    error: errText(st.error),
  };
}

function summarizeStep(st: StepInfo) {
  const base = {
    id: st.functionID,
    name: st.name,
    ms: st.startedAtEpochMs && st.completedAtEpochMs ? st.completedAtEpochMs - st.startedAtEpochMs : null,
  };
  if (st.error) return { ...base, kind: 'fail', text: errText(st.error) };
  switch (st.name) {
    case 'generateWorld': {
      // Summarized on purpose: the raw checkpoint holds the whole map, hidden cobras included.
      const w = st.output as World;
      return { ...base, kind: 'step', text: `seed ${w.seed}: ${w.w}x${w.h} maze, ${w.honey.length} honey pots, ${w.patrols.length + w.lurkers.length} cobras (${w.lurkers.length} hidden)` };
    }
    case 'moveBadger': {
      const r = st.output as MoveRecord;
      const text = r.bumped
        ? `${r.dir}: bonk, rock`
        : `${r.dir} -> (${r.to[0]},${r.to[1]})${r.honey ? `  honey +${r.honey}` : ''}${r.escaped ? '  ESCAPED' : ''}`;
      return { ...base, kind: 'step', text };
    }
    case 'moveCobras': {
      const r = st.output as CobraMoveRecord;
      const plans = [r.paused ? `${r.paused} pausing` : '', r.doubledBack ? `${r.doubledBack} doubling back` : ''].filter(Boolean);
      return { ...base, kind: 'step', text: `${r.cobras.length} cobras moved${plans.length ? ` (${plans.join(', ')})` : ''}` };
    }
    case 'DBOS.recv': {
      const m = st.output as GameMessage | null;
      const text = m === null ? 'timed out' : 'rewind' in m ? 'rewind request' : `move <- ${m.dir}`;
      return { ...base, kind: 'recv', text };
    }
    case 'DBOS.sleep':
      return { ...base, kind: 'internal', text: 'recv timeout timer' };
    case 'DBOS.setEvent':
      return { ...base, kind: 'event', text: 'state published' };
    default:
      return { ...base, kind: 'other', text: st.name };
  }
}

/**
 * Rewind targets: for each turn, the step right after the setEvent that published that turn's
 * state. Rewinding there keeps that state (and everything before it) and re-runs from the
 * recv that waits for the next move.
 */
function checkpoints(steps: StepInfo[]) {
  const out: { turn: number; startStep: number }[] = [];
  let turn = 0;
  let over = false;
  for (const st of [...steps].sort((a, b) => a.functionID - b.functionID)) {
    if (st.name === 'moveBadger') {
      if (st.error) { over = true; continue; }
      const r = st.output as MoveRecord;
      if (!r.bumped) turn++;
      if (r.escaped) over = true;
    } else if (st.name === 'DBOS.setEvent' && !over && out.at(-1)?.turn !== turn) {
      out.push({ turn, startStep: st.functionID + 1 }); // first state published for this turn
    }
  }
  return out;
}

/**
 * Where the patrolling cobras were after each turn, rebuilt from the checkpointed
 * moveCobras outputs (index = turn): [id, x, y, nextX, nextY]. Like the live view, it only
 * includes cobras in, or about to strike into, regions the badger had uncovered by then. The
 * browser uses it to preview the cobras at a rewind target and to slide them back during a rewind.
 */
type CobraFrame = [number, number, number, number, number][];
function cobraTrail(steps: StepInfo[]): CobraFrame[] {
  const sorted = [...steps].sort((a, b) => a.functionID - b.functionID);
  const world = sorted.find((s) => s.name === 'generateWorld')?.output as World | undefined;
  if (!world) return [];
  const zones = new Set([zoneOf(world, world.start)]);
  const frame = (cs: CobraState[]): CobraFrame => cs
    .map((c) => [c.id, ...c.at, ...c.next] as CobraFrame[number])
    .filter(([, x, y, nx, ny]) => zones.has(zoneOf(world, [x, y])) || zones.has(zoneOf(world, [nx, ny])));
  const out = [frame(initialCobras(world))];
  for (const st of sorted) {
    if (st.error) continue;
    if (st.name === 'moveBadger') {
      const r = st.output as MoveRecord;
      if (!r.bumped) zones.add(zoneOf(world, r.to));
    } else if (st.name === 'moveCobras') {
      const r = st.output as CobraMoveRecord;
      out[r.turn] = frame(r.cobras);
    }
  }
  return out;
}

async function waitUntilFinished(id: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const st = await DBOS.getWorkflowStatus(id);
    if (!st || !['PENDING', 'ENQUEUED', 'DELAYED'].includes(st.status)) return st;
    if (Date.now() > deadline) throw new Error(`workflow ${id} is still ${st.status}`);
    await sleep(25);
  }
}

// ---------------------------------------------------------------- HTTP API

const app = express();
app.use(express.json());
app.use(express.static(path.join(import.meta.dirname, '..', 'public')));

const route = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: errText(e) });
  });
};
const gameId = (req: Request) => String(req.params.id);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, bootId: BOOT_ID, bootedAt: BOOTED_AT, appVersion: APP_VERSION });
});

// Past games, newest first: every badgerGame workflow this app version can run.
app.get('/api/games', route(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
  const wfs = await DBOS.listWorkflows({
    workflowName: 'badgerGame',
    applicationVersion: APP_VERSION,
    sortDesc: true,
    limit,
    loadInput: false,
    loadOutput: false,
  });
  const games = await Promise.all(wfs.map(async (w) => {
    const v = await readState(w.workflowID).catch(() => null);
    return {
      id: w.workflowID,
      status: w.status,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt ?? w.createdAt,
      badger: v?.status ?? null,
      turn: v?.turn ?? 0,
      honey: v?.honey ?? 0,
      zones: v?.zones.length ?? 0,
    };
  }));
  res.json({ games, appVersion: APP_VERSION });
}));

// Start a new game workflow. Earlier games are left alone so you can go back to them.
app.post('/api/games', route(async (_req, res) => {
  const id = `badger-${crypto.randomBytes(3).toString('hex')}`;
  await DBOS.startWorkflow(badgerGame, { workflowID: id })();
  const state = await DBOS.getEvent<View>(id, 'state', { timeoutSeconds: 10 });
  res.json({ id, state, workflow: await workflowInfo(id), bootId: BOOT_ID });
}));

/**
 * Is the workflow ready for a move? Only once it waits in the recv that follows the state the
 * browser has. Until then it is queued or still replaying its checkpoints; `replaySeq` (which goes
 * up once per move, bumps included) says how far the replay has got.
 */
function liveness(id: string, state: View | null) {
  const p = progress.get(id);
  return { ready: !!p && !!state && p.waiting && p.seq === state.seq, replaySeq: p?.seq ?? null };
}

// Current state (optionally waiting for one newer than ?after=seq).
app.get('/api/games/:id', route(async (req, res) => {
  const id = gameId(req);
  const workflow = await workflowInfo(id);
  if (!workflow) return res.status(404).json({ error: 'no such game' });
  const after = req.query.after !== undefined ? Number(req.query.after) : null;
  const state = after === null ? await readState(id) : await waitForState(id, after, 10_000);
  res.json({ id, state, workflow: await workflowInfo(id), ...liveness(id, state), bootId: BOOT_ID });
}));

// Send a move to the workflow and wait for the state it publishes.
app.post('/api/games/:id/move', route(async (req, res) => {
  const id = gameId(req);
  const dir = req.body?.dir;
  const key = typeof req.body?.key === 'string' ? req.body.key : crypto.randomUUID();
  const cur = await readState(id);
  if (!cur) return res.status(404).json({ error: 'no such game' });
  if (cur.status !== 'alive') return res.status(409).json({ error: `badger is ${cur.status}`, state: cur });
  await DBOS.send<GameMessage>(id, { dir }, 'move', key); // idempotency key: a retried request is not a second move
  const state = await waitForState(id, cur.seq);
  res.json({ id, state, workflow: await workflowInfo(id), bootId: BOOT_ID });
}));

// The checkpoint log, straight from DBOS.listWorkflowSteps.
//
// With ?from=N, only the steps from step ID N on, so each move ships just its own new rows.
// listWorkflowSteps' offset counts rows, not IDs, but here they line up: step IDs run 0, 1, 2...
// with no gaps below the newest few. (The one gap is at the very end: while the workflow waits in
// recv, the recv's timeout timer, ID N+1, is already saved but the recv itself, ID N, is only saved
// when the move arrives. So the browser asks from its first missing ID, not its row count.)
//
// Without ?from, the whole log plus the rewind data built from it: the checkpoint for each turn
// and where the cobras were. The browser asks for that when it opens a game or the rewind panel.
app.get('/api/games/:id/steps', route(async (req, res) => {
  const id = gameId(req);
  if (req.query.from !== undefined) {
    const from = Math.max(0, Math.floor(Number(req.query.from)) || 0);
    const steps = await DBOS.listWorkflowSteps(id, { offset: from });
    if (!steps) return res.status(404).json({ error: 'no such game' });
    return res.json({ from, steps: steps.map(summarizeStep) });
  }
  const steps = (await DBOS.listWorkflowSteps(id)) ?? [];
  res.json({ steps: steps.map(summarizeStep), checkpoints: checkpoints(steps), cobraTrail: cobraTrail(steps) });
}));

// Rewind the workflow to the checkpoint for `turn`.
app.post('/api/games/:id/rewind', route(async (req, res) => {
  const id = gameId(req);
  const turn = Number(req.body?.turn);
  const before = await DBOS.getWorkflowStatus(id);
  if (!before) return res.status(404).json({ error: 'no such game' });
  const steps = (await DBOS.listWorkflowSteps(id)) ?? [];
  const cp = checkpoints(steps).find((c) => c.turn === turn);
  if (!cp) return res.status(400).json({ error: `no checkpoint for turn ${turn}` });

  if (['PENDING', 'ENQUEUED'].includes(before.status)) {
    // rewindWorkflow needs a finished workflow. Ask the live game to end itself at its recv.
    await DBOS.send<GameMessage>(id, { rewind: true }, 'move', `rewind-${crypto.randomUUID()}`);
    await waitUntilFinished(id);
  }
  await DBOS.rewindWorkflow(id, { startStep: cp.startStep });
  const state = await readState(id);
  res.json({
    id,
    turn,
    startStep: cp.startStep,
    dropped: steps.filter((s) => s.functionID >= cp.startStep).length,
    previousStatus: before.status,
    state,
    workflow: await workflowInfo(id),
    bootId: BOOT_ID,
  });
}));

await DBOS.launch(); // recovers any game workflows that were running when the last process died
app.listen(PORT, () => {
  console.log(`🦡 Durable Honey Badger on http://localhost:${PORT}  (boot ${BOOT_ID})`);
});
