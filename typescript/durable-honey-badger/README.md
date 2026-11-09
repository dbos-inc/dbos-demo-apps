# Durable Honey Badger

A small pixel-art maze game that shows off non-deterministic DBOS workflows and rewinding.
You steer a honey badger through a maze with hidden regions, eat honey, dodge cobras, and
find the den. Every game is a DBOS workflow, and every move is checkpointed. When a cobra
gets the badger, you rewind the workflow to an earlier checkpoint and try again. You can also
kill the server process mid-game, start it again, and watch DBOS pick the game back up.

![A cobra bites the badger, and rewinding the workflow takes the game back to an earlier checkpoint](honeybadger.gif)

## Setup

You need Node 22.18+ (it runs the TypeScript directly).

1. Install dependencies:

```shell
npm install
```

2. Start Postgres in a Docker container (if you already use Postgres, instead set the `DBOS_SYSTEM_DATABASE_URL` environment variable to your database connection string):

```shell
npx dbos postgres start
```

3. Start the application:

```shell
npm start
```

Visit http://localhost:3000 to play!

By default the server connects to `postgresql://postgres:dbos@localhost:5432/dbos_badger` and
DBOS creates that database on first launch. Use these environment variables to change things:

| Variable | Default | |
| --- | --- | --- |
| `DBOS_SYSTEM_DATABASE_URL` | `postgresql://postgres:dbos@localhost:5432/dbos_badger` | Postgres for DBOS checkpoints |
| `PORT` | `3000` | HTTP port |
| `APP_VERSION` | `durable-badger-v3` | DBOS application version (see notes) |

## The game

- **Arrows / WASD** move, **Space** waits a turn, **R** opens the rewind picker.
- The map is split into 6 hidden regions. A region is revealed when the badger digs into it.
- **Roaming cobras** (4 of them) start in lairs around the map and wander the whole maze, one
  tile per turn, only when you do. They mostly keep slithering forward, pick a random branch
  at junctions, sometimes double back, and each has its own random laziness that decides how
  often it stops. Every cobra commits to its next tile a turn ahead, and the red tile shows
  it, even when the cobra itself is still hidden in an unexplored region.
  **They strike:** a cobra can commit to the tile you're standing on. The badger then flashes
  red with "A cobra is about to strike! Move!", and you have one turn to get out of the way
  without walking into another red tile or slipping past the cobra. Dead ends are where you
  get cornered. Cobras keep out of the den's tunnel, so they can never block the exit for good.
- **Hidden cobras** (5 of them) lie in burrows and are invisible. The badger can smell one next door: the
  **SNIFF** stat switches from `nothing` to `COBRA!` and a `!` pops over its head. The generator never puts a
  burrow where it would seal anything off: every tunnel that isn't a burrow stays reachable
  without stepping on one, so the den, every honey pot and every region can always be reached.
- Each honey pot holds a random amount of honey. The amount is rolled inside a step, so it is
  checkpointed.

## What it demonstrates

| In the game | In DBOS |
| --- | --- |
| A game | One workflow, `badgerGame` ([src/game.ts](src/game.ts)) |
| Generating the maze | `DBOS.runStep(generateWorld)`. Random, so replays read the checkpoint |
| Waiting for your move | `DBOS.recv('move')`, a durable wait for a message |
| Sending a move | `DBOS.send(gameId, { dir }, 'move', idempotencyKey)` |
| Applying a move | `DBOS.runStep(moveBadger)`, checkpointed. Honey rolls happen here |
| Cobras moving | `DBOS.runStep(moveCobras)` after every turn, checkpointed. Every cobra's next tile is rolled at random inside the step |
| What the browser sees | `DBOS.setEvent('state', view)` and `DBOS.getEvent` |
| Bitten by a cobra | `moveBadger` throws, so the workflow ends in `ERROR` |
| Rewind | `DBOS.rewindWorkflow(gameId, { startStep })` |
| Checkpoint log panel | `DBOS.listWorkflowSteps(gameId)` in full when a game or the rewind panel opens; after a move, `{ offset }` fetches only the new steps |
| GAMES selector | `DBOS.listWorkflows({ workflowName: 'badgerGame' })`, newest first |
| Reopening a stopped or finished game | `DBOS.rewindWorkflow` to its latest checkpoint brings it back to life |
| Server killed mid-game | On restart, `DBOS.launch()` recovers the `PENDING` workflow by replaying its checkpoints |

### Things to try

1. Make a few moves and watch the **checkpoint log**. Each move adds a `recv`, a `moveBadger`
   step, a `moveCobras` step and a `setEvent`. (The dim `sleep` rows are the timeout timer
   `recv` records.)
2. Kill the server mid-game from another terminal:

   ```shell
   pkill -9 -f src/server.ts
   ```

   The page shows SERVER DOWN. Run `npm start` again, and DBOS recovers the workflow by
   replaying its checkpoints. Neither the badger nor the cobras have moved: the
   cobras' random moves come back from the log rather than being rolled again.
3. Walk into a cobra. The workflow goes to `ERROR`. Pick a checkpoint and **REWIND**. DBOS
   deletes the checkpoints after that step, rolls the `state` event back, and re-runs the
   *same* workflow ID from there. The cobras slide back with the badger to where that turn's
   `moveCobras` checkpoint left them. From then on their moves are rolled fresh, so they may
   not repeat the erased timeline.
4. Press **R** while alive to rewind on purpose, or rewind after escaping to go back for honey.
5. Start a **NEW GAME**, then pick an earlier one from **GAMES**. Every game is its own
   workflow, and starting a new one leaves the others alone. A live game picks up where it
   was. A finished, bitten, sleeping or stopped one opens its rewind panel, and rewinding it
   puts the same workflow back to work. The list shows games from the current app version.

## How rewind works here

`rewindWorkflow` only accepts a workflow that has finished (`SUCCESS`, `ERROR` or
`CANCELLED`).

- **After a death**, the workflow is already in `ERROR`, so the server rewinds it directly.
- **Mid-game**, the server first sends the workflow a `{ rewind: true }` message. The workflow
  returns cleanly from its `recv`, and then the server rewinds it.

The server avoids "cancel, then rewind" on a live workflow because the old execution can still
be parked in `recv` when the rewind re-queues the workflow. You would then have two executions
of one workflow.

Rewind targets come from `listWorkflowSteps`. For turn *N*, `startStep` is the step right after
the `setEvent` that published turn *N*'s state, which is the `recv` that waits for the next
move. Everything before `startStep` is kept and replayed from the log. The `state` event rolls
back with it.

Cobra positions are workflow state that only ever comes from checkpointed `moveCobras`
outputs. So a rewind puts them back exactly as of turn *N* with no extra code, and the steps
after the cut run again with new random rolls. For the rewind animation, the steps endpoint
also rebuilds each turn's cobra positions from those checkpoints (`cobraTrail`).

After a rewind (or a crash recovery) the workflow is `ENQUEUED` until a worker picks it up, about
a second. Then DBOS re-runs the workflow function from the top, and every step and `recv` returns
its checkpointed result instead of running again, until it reaches the `recv` for the current turn.
In a long game that replay takes a few seconds (about 2.4 s for 2,600 checkpoints). The page shows
a banner on the map with a progress bar meanwhile, starts the rewind animation while the server is
still rewinding, and holds your next key press until the workflow is listening. To know when that
is, the workflow function notes in memory (not durably, and never feeding back into its own logic)
which state it has replayed up to and whether it is waiting in `recv`; `GET /api/games/:id` reports
it as `ready` and `replaySeq`.

## Files

```
src/world.ts          pure game rules: maze generation, cobras, moves, the visible "view"
src/game.ts           the DBOS workflow and its steps
src/server.ts         Express API: games, move, steps, rewind
public/               canvas game, sprites, and the DBOS panel (no build step)
```

## Notes and limits

- DBOS only recovers workflows started under the same application version. That version is
  pinned to `durable-badger-v3`, so games survive restarts while you edit the code. When you
  change the workflow's sequence of steps or the shape of its state, bump it, because games
  started under the old code can't replay on the new code. The page starts a new game when its saved game is from another version.
- To tune the cobras, edit the constants at the top of [src/world.ts](src/world.ts):
  `COBRA_FORWARD_WEIGHT` (how strongly they keep going forward) and `COBRA_LAZINESS_MIN/MAX`.
- An idle game ends after 30 minutes without a move (the badger falls asleep). Rewind to keep
  playing.
