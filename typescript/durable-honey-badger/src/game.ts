// One game = one DBOS workflow.
//
//   generateWorld (step)            random maze, checkpointed so replays see the same world
//   setEvent("state")               publish what the browser may see
//   loop:
//     recv("move")                  durably wait for the player's next move
//     moveBadger (step)             resolve the move; honey amounts are rolled at random here
//     moveCobras (step)             every cobra roams to a randomly chosen neighboring tile
//     setEvent("state")
//
// If a cobra gets the badger, moveBadger throws and the workflow ends in ERROR.
// The player can then DBOS.rewindWorkflow() it back to any earlier checkpoint. The cobras
// rewind with it: their positions only ever come from checkpointed moveCobras outputs.
// If the server dies, DBOS recovers the workflow and replays it from its checkpoints.

import { DBOS } from '@dbos-inc/dbos-sdk';
import {
  applyCobras, applyMove, deathState, generateWorld, initialState, moveCobras, resolveMove, view,
  type CobraMoveRecord, type Dir, type GameState, type MoveRecord, type World,
} from './world.ts';

export const IDLE_TIMEOUT_S = 30 * 60;

/**
 * In-memory only, for the browser's "replaying" banner: where each game's workflow function is
 * right now. After a rewind or a crash, DBOS re-runs the workflow from the top and every step and
 * recv returns its checkpointed result, so `turn` climbs as the replay catches up. `waiting` is
 * true while it sits in a recv; once that recv is past the last checkpoint, it's a live wait for
 * the player's next move. This never feeds back into the workflow's own logic.
 */
export const progress = new Map<string, { seq: number; turn: number; waiting: boolean }>();

export type GameMessage = { dir: Dir } | { rewind: true };
export interface GameResult {
  outcome: 'escaped' | 'napping' | 'stopped-for-rewind';
  honey: number;
  turns: number;
}

const DIRS = new Set<Dir>(['up', 'down', 'left', 'right', 'wait']);

class BadgerDown extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadgerDown';
  }
}

async function generateWorldStep(): Promise<World> {
  const seed = Math.floor(Math.random() * 2 ** 31);
  return generateWorld(seed);
}

async function moveBadgerStep(world: World, s: GameState, dir: Dir): Promise<MoveRecord> {
  const out = resolveMove(world, s, dir);
  if (out.death) throw new BadgerDown(out.death.text);
  // Nondeterministic on purpose: the checkpoint is what keeps this stable across replays.
  const honey = out.ate !== null ? 5 + Math.floor(Math.random() * 21) : 0;
  return { dir, from: s.pos, to: out.to, bumped: out.bumped, ate: out.ate, honey, escaped: out.escaped };
}

async function moveCobrasStep(world: World, s: GameState): Promise<CobraMoveRecord> {
  // Math.random picks every cobra's next tile. A replay reads the checkpoint instead of
  // rolling again; a rewind deletes the checkpoint, so that turn is rolled anew.
  return moveCobras(world, s.cobras, s.turn, Math.random);
}

async function badgerGameFn(): Promise<GameResult> {
  const id = DBOS.workflowID!;
  try {
    return await playGame(id);
  } finally {
    progress.delete(id);
  }
}

async function playGame(id: string): Promise<GameResult> {
  const world = await DBOS.runStep(generateWorldStep, { name: 'generateWorld' });
  let s = initialState(world);
  await DBOS.setEvent('state', view(world, s));

  for (;;) {
    progress.set(id, { seq: s.seq, turn: s.turn, waiting: true });
    const msg = await DBOS.recv<GameMessage>('move', { timeoutSeconds: IDLE_TIMEOUT_S });
    progress.set(id, { seq: s.seq, turn: s.turn, waiting: false });

    if (msg === null) {
      s = { ...s, seq: s.seq + 1, status: 'napping', last: { kind: 'nap', text: 'The badger got bored and fell asleep.' } };
      await DBOS.setEvent('state', view(world, s));
      return { outcome: 'napping', honey: s.honey, turns: s.turn };
    }
    // Only a finished workflow can be rewound, so a live game ends itself before a rewind.
    if ('rewind' in msg) return { outcome: 'stopped-for-rewind', honey: s.honey, turns: s.turn };

    const dir: Dir = DIRS.has(msg.dir) ? msg.dir : 'wait';
    let rec: MoveRecord;
    try {
      const before = s;
      rec = await DBOS.runStep(() => moveBadgerStep(world, before, dir), { name: 'moveBadger' });
    } catch (err) {
      const out = resolveMove(world, s, dir);
      if (!out.death) throw err;
      s = deathState(s, dir, out.death);
      await DBOS.setEvent('state', view(world, s));
      throw err; // workflow ends in ERROR
    }
    s = applyMove(world, s, rec);
    if (!rec.bumped && s.status === 'alive') {
      // The badger used a turn, so the cobras get one too.
      const afterBadger = s;
      const cob = await DBOS.runStep(() => moveCobrasStep(world, afterBadger), { name: 'moveCobras' });
      s = applyCobras(s, cob);
    }
    await DBOS.setEvent('state', view(world, s));
    if (s.status === 'escaped') return { outcome: 'escaped', honey: s.honey, turns: s.turn };
  }
}

export const badgerGame = DBOS.registerWorkflow(badgerGameFn, { name: 'badgerGame', maxRecoveryAttempts: 1000 });
