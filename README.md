# Five Nights at Morgridge (working name during the build: NullSpace)

Playable Floors 1-2 demo built from `nullspace_build_spec_v2.md`. Runs fully offline.

```
npm install
npm run dev        # play locally
npm run build      # tsc + single-file dist/index.html
npm test           # metrics unit tests
```

Add `?speed=4` to the URL to test a night 4x faster.

## Night 1 as it plays now
- **Office view** (`src/ui/Office.tsx`): the play area is a drawn office wider than the screen. Move the mouse to look left and right. Door L is at the far left, Door R at the far right, each with a wall button. `A` / `D` still work and turn you toward that door.
- **Monitor** (`S`, the bar under the office, or clicking the old monitor on the desk): raise it to see the map and cameras. While it is up it covers the office. A camera only draws power while the monitor is up. `1`-`4` and `M` raise it for you.
- **It waits behind the monitor**: if a unit gets through a door while the monitor is up, every feed drops to SIGNAL LOST and it takes you when you lower the monitor, or after `INSIDE_MAX_MS` (6s). With the monitor down it takes you at once.
- **Eyes in the doorway**: for the last quarter of a unit's wait at an open door (`DOOR_EYES_FROM`), its eyes can be seen from the office. A last chance for players who look for themselves.
- **C.A.I.-0 as a character**: a lens that follows the pointer, in a dialogue box. Its mood reflects what the player just did (accepted, refused), never whether it is lying.
- **Interface glitches** from 55% of the night (`useGlitches` in `src/ui/SecurityDesk.tsx`): the title, the clock, a door label or C.A.I.-0's line slips for a moment. Only between tasks, the same for every voice, so they are not a tell.
- **Night card and ending**: a 12:00 AM card before the clock starts, and the clock rolling over to 2:00 AM at the end.
- **Memory on show**: the HUD says whether C.A.I.-0's memory (Databricks) is live and how many nights it learned from, the night card says the same, the analyzing screen lists what is being sent, and the report has a WHAT C.A.I.-0 STORED panel with the exact rows.

## What is here
- `src/core/` pure TypeScript game rules (no React/DOM): clock, power, doors, lights, seeded sentinel path, seeded lie pattern, task resolution -> `GameEvent`, local Mirror metrics.
- `src/data/` the 5 tasks, C.A.I.-0 fallback lines per task x tactic, a SYNTHETIC seed cohort.
- `src/services/api.ts` calls our backend only. Set `VITE_API_URL` to turn on `POST /api/run/start`, `/api/event`, `/api/run/end`. Without it, local lines + local metrics.
- `src/ui/` React skin: StartScreen, SecurityDesk, CameraGrid, MirrorReport.

## Backend (Databricks)
```
cd server
cp .env.example .env          # paste DATABRICKS_HOST, DATABRICKS_WAREHOUSE_ID, DATABRICKS_TOKEN
python3 -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Check http://localhost:8000/api/health, then in the project root create `.env.local` with
`VITE_API_URL=http://localhost:8000` and run `npm run dev`.

Each finished run writes 1 row to `runs` and 5 rows to `events`, and the Mirror Report comparison runs in SQL
(`server/sql/mirror_metrics.sql`). If the backend is down or slow (8s), the game uses its local report.

## Not built yet
- Model Serving call for the Mirror Report text, Genie space, AI/BI dashboard, storyboard.
- The room's mirror is shown only after a run (never on the start screen or in-game). `GET /api/room` exists for a second-screen view but is not wired.

## C.A.I.-0's memory (Databricks is part of the game)
When a night starts, `POST /api/run/start` asks Databricks how often each task was accepted without checking
(`MEMORY_SQL` in `server/main.py`). C.A.I.-0 puts its 3 lies on the late tasks the room hands over most.
Tasks 1 and 2 stay honest. It needs at least 3 saved nights to learn; before that, or if Databricks is slow
(3s), the game uses the seeded random pattern. The report tells the player which tasks were chosen and why.
The memory is cached on the server and refreshed after every finished night.

**New table.** Camera views are saved to `workspace.nullspace.cam_views`. If you created the tables before this
was added, run `server/sql/create_tables.sql` again (it only adds what is missing). Until then nights still save,
routes just stay random, and `/api/health` shows `"cam_views": null`.

Useful queries:

```sql
-- Where players look, by slot of the night (0 = 12:00-12:20 ... 5 = 1:40-2:00)
SELECT slot, cam, SUM(view_ms) / 1000 AS seconds, COUNT(DISTINCT run_id) AS nights
FROM workspace.nullspace.cam_views GROUP BY slot, cam ORDER BY slot, seconds DESC;

-- How often players run out the 20 seconds, by task
SELECT task_id, COUNT(*) AS decisions, SUM(CASE WHEN timed_out THEN 1 ELSE 0 END) AS timed_out
FROM workspace.nullspace.events GROUP BY task_id ORDER BY task_id;
```

The same query also returns the median time players take to decide on each task. The two slowest tasks come back as
`rush_tasks`, and the night clock runs `RUSH_SCALE` (1.5) times faster while one of them is open, so hesitating costs
more exactly where people hesitate. The door task is never rushed. Decision time is saved in real time, so the faster
clock does not feed back into the numbers. The HUD clock flashes while it runs fast, and the report names the tasks.

## Design changes after playtests (Nov 14)
- Seven tasks (`src/data/tasks.ts`), each a thing people hand to AI in daily life, placed in the night shift.
  Core and UI switch on `task.kind` (`note`, `math`, `code`, `cam`, `rank`, `radio`, `door`), not on the task number.
- C.A.I.-0 is honest on tasks 1 and 2, then lies on 3 of tasks 3 to 7 (which ones is seeded from run_id).
- No task has a timer. The night clock never stops, so the units keep moving while the player decides.
  If a task is still open when the next comes due, the next one waits. Tasks not reached by 2:00 AM are not logged.
- The cam task is settled by looking: opening CAM 03 by any route logs "checked, then did it yourself".
- Lights removed. Four cameras: CAM 01 = Door L, CAM 02 = Door R, CAM 03, CAM 04. The monitor's home view is a security map.
- Black unit reaches a door when the door task comes due and waits `attackWindowMs(night)` (9s on night 1).
  White unit joins on floor 2 and tries a door near 2:00 AM with no offer from C.A.I.-0.
- An open camera feed drains a little power (`CAM_DRAIN` in `src/core/gameState.ts`, about 12% if left open all of night 1). The map is free. Power out also cuts the feeds.
- Units move inside a camera view (`unitMotion` in core, routes in `src/ui/CameraGrid.tsx`): they pace a hall and drift closer, then walk up to a door and run for the last 40% of the wait.
- The units are drawn in `src/ui/CameraGrid.tsx`: a thin hunched figure with slit eyes on the feeds (`Figure`) and a full-screen face for the "IT GOT IN" screen (`ScareFace`). The robot photos in `src/assets/sentinel*.jpg` are no longer used.
- Getting caught: the face rushes in from the side of the door it used (`caughtSide`). With the power out the office goes dark and its eyes flash in one doorway for 5 seconds (`DARK_WAIT_MS`), then it comes in through that door.
- Fake-outs: about 1 feed in 25, at most twice a night, the face fills the camera for a quarter of a second with no attack (`FAKEOUT` in `src/ui/CameraGrid.tsx`). Add `?fakeout=1` to the URL to see it on every feed. 
- Units stand still most of the time and relocate in short bursts (`BEAT_MS`, `MOVE_CHANCE` in `src/ui/CameraGrid.tsx`). They only get closer while moving.
- Ambience (`src/ui/sfx.ts`): clashing low drones, a drifting high whine, wind, and a random building sound every 8 to 24 seconds. `setDread` raises it through the night, `setHeartbeat` runs while something is at a door, and everything cuts to silence just before the scream.
- The scare and the fake-out play even when the device has reduced motion turned on. Looping effects (grain, blinking) still respect it.
- **Cameras and the monitor.** A camera only counts as watched (for learning routes) while the monitor is raised. Raising the monitor onto a feed counts as one look.
- **Seven cameras.** CAM 05 (main entrance), CAM 06 (cafe) and CAM 07 (study lounge) join the first four. Keys `1` to `7`.
- **Routes adapt to where players look.** The units no longer walk CAM 04 > CAM 03 > door every night. They wander CAM 04 to 07, then come to CAM 03, then a door. Each stop is picked from where players watched at that time of night (`cfg.watch`); a unit may also stay where it is. The game saves how long each camera was watched in six 20-minute slots (`cam_views` table) and reads the shares back before the next night. With no server it learns from nights played on this device. `ROUTE_BIAS` in `src/core/sentinel.ts` flips between going to the most-watched cameras (`'watched'`, the default) and avoiding them (`'unwatched'`).
- **Doing a job yourself takes longer.** After choosing to do it yourself, the answer cannot be locked in for `SELF_EXTRA_MS` (3.5 s, `src/core/tasks.ts`). Accepting C.A.I.-0 is instant.
- **20 seconds to decide.** If an offer sits for `DECIDE_LIMIT_MS` (20 s real time), C.A.I.-0's answer is applied and the event is saved with `timed_out = true` (choice stays `accept`). The door task never reaches it: its own wait is shorter.
- **Saved progress.** Surviving a night unlocks the next (up to night 5) and saves it in the browser, with shift length and nickname (`src/services/progress.ts`). The start screen offers CONTINUE or START OVER, and a checkbox turns saving off. Nights 2 to 5 are night 1 with the existing scaling (faster power drain, shorter door waits) until they are designed.
- Night 1 power is generous; `powerScale(night)` in `src/core/gameState.ts` makes later nights drain faster. Power out = caught.
- The choice buttons are styled identically. The room's mirror is shown only after a run.
- Shift lengths: short 3 min, full 5 min. Keys: `S` monitor, `1-7` cameras, `M` map, `A`/`D` doors, `Enter` accept, `Space` do it myself, `C` check.
- Rows saved before this version used 5 tasks. Clear them before judging:
  `TRUNCATE TABLE workspace.nullspace.events; TRUNCATE TABLE workspace.nullspace.runs;`

## Deviations from the spec to decide on
- `pressure_s` is now always null and `timed_out` always false (columns kept so the table schema is unchanged).
- Task 2 says "backup circuit holds a 20% reserve" so it does not contradict the live POWER readout.
- Plain CSS instead of Tailwind. Sound is synthesized (`src/ui/sfx.ts`); the scream is the only recording.
- `src/data/seedCohort.ts` rates are invented placeholders. Replace with real runs before judging.
- The map in `src/ui/MorgridgeMap.tsx` is a simplified drawing made for the game, not a copy of the architect's plan.
