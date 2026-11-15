# NullSpace: A Night at Morgridge (frontend demo)

Playable Floors 1-2 demo built from `nullspace_build_spec_v2.md`. Runs fully offline.

```
npm install
npm run dev        # play locally
npm run build      # tsc + single-file dist/index.html
npm test           # metrics unit tests
```

Add `?speed=4` to the URL to test a night 4x faster.

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
- The start-screen counter still reads local data (`GET /api/room` exists but is not wired).

## Deviations from the spec to decide on
- `GameEvent.timed_out` is an extra column. When a timer runs out, C.A.I.-0 applies its answer and the row is logged as `accept` with `timed_out = true`.
- Task 2 says "backup circuit holds a 20% reserve" so it does not contradict the live POWER readout.
- Plain CSS instead of Tailwind. Sound is synthesized placeholder (`src/ui/sfx.ts`), swap for SFX files.
- `src/data/seedCohort.ts` rates are invented placeholders. Replace with real runs before judging.
