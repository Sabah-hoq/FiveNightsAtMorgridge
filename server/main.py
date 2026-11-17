"""NullSpace backend (spec 6.5). The browser talks to this; this talks to Databricks.

Run:  uvicorn main:app --reload --port 8000
Check: http://localhost:8000/api/health
"""
import hashlib
import logging
import random
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from databricks_client import DatabricksError, configured, param, run_sql

log = logging.getLogger("nullspace")
app = FastAPI(title="NullSpace API")
# Open CORS is fine for a hackathon laptop. Restrict allow_origins before hosting this anywhere public.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

T = "workspace.nullspace"
ROOM_SQL = (Path(__file__).parent / "sql" / "mirror_metrics.sql").read_text()
pool = ThreadPoolExecutor(max_workers=4)

# ---- C.A.I.-0's memory -----------------------------------------------------------------------
# C.A.I.-0 lies where earlier players stopped looking. Before a night starts we ask Databricks how often
# each task was accepted without checking, and put the lies on the tasks the room hands over most.
MEMORY_SQL = f"""
SELECT task_id,
       COUNT(DISTINCT run_id) AS runs,
       AVG(CASE WHEN choice = 'accept' THEN 1.0 ELSE 0.0 END) AS handoff_rate,
       percentile_approx(decision_ms, 0.5) AS median_ms
FROM {T}.events
GROUP BY task_id
"""
HONEST_OPENERS = 2   # tasks 1 and 2 always tell the truth
LATE_LIES = 3        # lies per night, placed among the remaining tasks
NIGHT1_TASKS = 7


def lie_count(task_count: int) -> int:
    """3 lies with night 1's 7 tasks, one more per two extra tasks. Mirrors lieCount in src/core/seed.ts."""
    return LATE_LIES + max(0, task_count - NIGHT1_TASKS) // 2

MIN_RUNS_TO_LEARN = 3
RUSH_TASKS = 2       # the night clock runs faster on this many tasks: the ones players are slowest to decide on
MEMORY_TTL_S = 600
_memory: dict = {"at": 0.0, "rows": None}


def load_memory(force: bool = False) -> list[dict]:
    """Per-task handoff rates from Databricks, cached so starting a night is instant."""
    if force or _memory["rows"] is None or time.time() - _memory["at"] > MEMORY_TTL_S:
        rows = run_sql(MEMORY_SQL)
        _memory.update(at=time.time(), rows=[
            {"task_id": int(r["task_id"]), "runs": int(r["runs"]), "handoff_rate": float(r["handoff_rate"]),
             "median_ms": float(r["median_ms"] or 0)} for r in rows
        ])
    return _memory["rows"]


def refresh_memory() -> None:
    try:
        load_memory(force=True)
    except Exception as err:  # noqa: BLE001
        log.warning("memory refresh failed: %s", err)


def learned_lies(rows: list[dict], run_id: str, task_count: int) -> dict | None:
    """Pick the tasks to lie on from what the room did. None when too few people have played."""
    by_task = {r["task_id"]: r for r in rows}
    runs = max((r["runs"] for r in rows), default=0)
    if runs < MIN_RUNS_TO_LEARN:
        return None
    rng = random.Random(int(hashlib.sha256(run_id.encode()).hexdigest()[:12], 16))
    late = list(range(HONEST_OPENERS + 1, task_count + 1))
    # Most handed-over first. A little seeded noise breaks ties and keeps runs from being identical.
    late.sort(key=lambda t: by_task.get(t, {}).get("handoff_rate", 0.0) + rng.uniform(-0.04, 0.04), reverse=True)
    lies = sorted(late[:lie_count(task_count)])
    return {
        "lie_pattern": "".join("1" if t in lies else "0" for t in range(1, task_count + 1)),
        "learned_from": runs,
        "lie_tasks": lies,
    }


def learned_rush(rows: list[dict], task_count: int) -> list[int]:
    """The tasks earlier players took longest to decide on. [] when too few people have played.

    The last task (the door) is left out: its wait is already the shortest moment of the night.
    """
    if max((r["runs"] for r in rows), default=0) < MIN_RUNS_TO_LEARN:
        return []
    timed = [r for r in rows if 1 <= r["task_id"] < task_count and r.get("median_ms", 0) > 0]
    timed.sort(key=lambda r: r["median_ms"], reverse=True)
    return sorted(r["task_id"] for r in timed[:RUSH_TASKS])


# ---- Where players look ------------------------------------------------------------------------
# Every night also saves how long each camera was watched in each of six slots of the night. Before a night
# starts we ask Databricks for each camera's share of the watching in each slot, and the game routes the
# units through the cameras people look at most (ROUTE_BIAS in src/core/sentinel.ts can flip that).
WATCH_SLOTS = 6
CAM_IDS = {"CAM01", "CAM02", "CAM03", "CAM04", "CAM05", "CAM06", "CAM07"}
MIN_RUNS_TO_ROUTE = 1  # routes adapt from the first saved night
WATCH_SQL = f"""
SELECT slot, cam, SUM(view_ms) AS ms,
       (SELECT COUNT(DISTINCT run_id) FROM {T}.cam_views) AS runs
FROM {T}.cam_views
GROUP BY slot, cam
"""
_watch: dict = {"at": 0.0, "rows": None}


def load_watch(force: bool = False) -> list[dict]:
    """Total watching time per (slot, camera) from Databricks, cached like the task memory."""
    if force or _watch["rows"] is None or time.time() - _watch["at"] > MEMORY_TTL_S:
        rows = run_sql(WATCH_SQL)
        _watch.update(at=time.time(), rows=[
            {"slot": int(r["slot"]), "cam": r["cam"], "ms": float(r["ms"] or 0), "runs": int(r["runs"])} for r in rows
        ])
    return _watch["rows"]


def learned_watch(rows: list[dict]) -> dict | None:
    """Each camera's share of the watching, per slot. None when nothing has been saved yet.

    Mirrors watchShares in src/core/sentinel.ts.
    """
    runs = max((r["runs"] for r in rows), default=0)
    if runs < MIN_RUNS_TO_ROUTE:
        return None
    slots: list[dict] = [{} for _ in range(WATCH_SLOTS)]
    for r in rows:
        if 0 <= r["slot"] < WATCH_SLOTS and r["cam"] in CAM_IDS and r["ms"] > 0:
            slots[r["slot"]][r["cam"]] = slots[r["slot"]].get(r["cam"], 0.0) + r["ms"]
    watch = []
    for slot in slots:
        total = sum(slot.values())
        watch.append({cam: round(ms / total, 4) for cam, ms in slot.items()} if total else {})
    return {"watch": watch, "watch_runs": runs}


class CamView(BaseModel):
    run_id: str
    cam: str
    slot: int
    view_ms: int
    opens: int = 0


class Event(BaseModel):
    run_id: str
    task_id: int
    floor: int
    ai_correct: bool
    lie_type: str | None = None
    tactic: str
    choice: str
    checked: bool
    decision_ms: int
    pressure_s: int | None = None
    player_correct: bool
    ts: str
    timed_out: bool = False


class Run(BaseModel):
    run_id: str
    started_at: str
    ended_at: str
    mode: str
    tactic: str
    lie_pattern: str
    outcome: str
    caught_at: str | None = None
    alias: str | None = None


class RunEnd(BaseModel):
    run: Run
    events: list[Event]
    cam_views: list[CamView] = []


EVENT_COLS = [
    ("run_id", "STRING"), ("task_id", "INT"), ("floor", "INT"), ("ai_correct", "BOOLEAN"), ("lie_type", "STRING"),
    ("tactic", "STRING"), ("choice", "STRING"), ("checked", "BOOLEAN"), ("decision_ms", "INT"), ("pressure_s", "INT"),
    ("player_correct", "BOOLEAN"), ("ts", "TIMESTAMP"), ("timed_out", "BOOLEAN"),
]
RUN_COLS = [
    ("run_id", "STRING"), ("started_at", "TIMESTAMP"), ("ended_at", "TIMESTAMP"), ("mode", "STRING"), ("tactic", "STRING"),
    ("lie_pattern", "STRING"), ("outcome", "STRING"), ("caught_at", "STRING"), ("alias", "STRING"),
]


CAM_VIEW_COLS = [("run_id", "STRING"), ("cam", "STRING"), ("slot", "INT"), ("view_ms", "INT"), ("opens", "INT")]


def save_cam_views(run_id: str, views: list[CamView]) -> bool:
    """Save where the player looked. Never fails the night: if the table is missing, the run is still saved."""
    views = [v for v in views if v.cam in CAM_IDS and 0 <= v.slot < WATCH_SLOTS and (v.view_ms > 0 or v.opens > 0)]
    if not views:
        return True
    cols = ", ".join(c for c, _ in CAM_VIEW_COLS)
    rows, params = [], []
    for i, v in enumerate(views):
        rows.append("(" + ", ".join(f":v{i}_{c}" for c, _ in CAM_VIEW_COLS) + ")")
        v.run_id = run_id
        params += [param(f"v{i}_{c}", getattr(v, c), t) for c, t in CAM_VIEW_COLS]
    try:
        run_sql(f"INSERT INTO {T}.cam_views ({cols}) VALUES {', '.join(rows)}", params)
        return True
    except DatabricksError as err:
        log.warning("camera views not saved (has sql/create_tables.sql been run since cam_views was added?): %s", err)
        return False


def refresh_watch() -> None:
    try:
        load_watch(force=True)
    except Exception as err:  # noqa: BLE001
        log.warning("watch refresh failed: %s", err)


def insert_run(run: Run, events: list[Event]) -> None:
    """One run row plus all its events, written once at run end (two statements)."""
    cols = ", ".join(c for c, _ in RUN_COLS)
    vals = ", ".join(f":{c}" for c, _ in RUN_COLS)
    run_sql(f"INSERT INTO {T}.runs ({cols}) VALUES ({vals})", [param(c, getattr(run, c), t) for c, t in RUN_COLS])
    if not events:
        return
    cols = ", ".join(c for c, _ in EVENT_COLS)
    rows, params = [], []
    for i, e in enumerate(events):
        rows.append("(" + ", ".join(f":e{i}_{c}" for c, _ in EVENT_COLS) + ")")
        params += [param(f"e{i}_{c}", getattr(e, c), t) for c, t in EVENT_COLS]
    run_sql(f"INSERT INTO {T}.events ({cols}) VALUES {', '.join(rows)}", params)


def summarize(events: list[Event]) -> dict:
    """This run's own numbers. Mirrors src/core/metrics.ts summarizeRun."""
    def rate(n, d):
        return n / d if d else 0.0

    def med(xs):
        return statistics.median(xs) if xs else None

    handoff = [e for e in events if e.choice == "accept"]
    accepts = [e for e in events if e.choice in ("accept", "check_then_accept")]
    lies = [e for e in events if not e.ai_correct]
    timed = [e for e in events if e.pressure_s is not None]
    calm = [e for e in events if e.pressure_s is None]
    return {
        "tasks": len(events),
        "handoffs": len(handoff),
        "handoffRate": rate(len(handoff), len(events)),
        "checks": sum(e.checked for e in events),
        "checkRate": rate(sum(e.checked for e in events), len(events)),
        "liesTold": len(lies),
        "liesCaught": len([e for e in lies if e not in accepts]),
        "trustSpeedMs": med([e.decision_ms for e in accepts]),
        "calmAcceptMs": med([e.decision_ms for e in accepts if e.pressure_s is None]),
        "timedAcceptMs": med([e.decision_ms for e in accepts if e.pressure_s is not None]),
        "pressureShift": (
            rate(len([e for e in timed if e.choice == "accept"]), len(timed))
            - rate(len([e for e in calm if e.choice == "accept"]), len(calm))
        ) if timed and calm else None,
    }


def room_mirror(groups: list[dict], seeded: int) -> dict:
    """Roll (tactic, task) counts up into the room's mirror. Mirrors src/core/metrics.ts roomMirror."""
    def rate(n, d):
        return n / d if d else 0.0

    def total(rows, key):
        return sum(r[key] for r in rows)

    timed = [g for g in groups if g["timed"] > 0]
    calm = [g for g in groups if g["timed"] == 0]
    tactics = sorted({g["tactic"] for g in groups})
    tasks = sorted({g["task_id"] for g in groups})
    by_tactic = []
    for t in tactics:
        rows = [g for g in groups if g["tactic"] == t]
        by_tactic.append({
            "tactic": t,
            "runs": max(sum(g["runs"] for g in rows if g["task_id"] == k) for k in tasks),
            "handoffRate": rate(total(rows, "handoffs"), total(rows, "n")),
            "checkRate": rate(total(rows, "checks"), total(rows, "n")),
        })
    return {
        "runs": sum(t["runs"] for t in by_tactic),
        "syntheticRuns": seeded,
        "handoffRate": rate(total(groups, "handoffs"), total(groups, "n")),
        "checkRate": rate(total(groups, "checks"), total(groups, "n")),
        "liesTold": total(groups, "lies"),
        "liesAccepted": total(groups, "lies_accepted"),
        "timedHandoffRate": rate(total(timed, "handoffs"), total(timed, "n")) if timed else None,
        "calmHandoffRate": rate(total(calm, "handoffs"), total(calm, "n")) if calm else None,
        "byTactic": by_tactic,
        "byTask": [
            {"taskId": k, "handoffRate": rate(total([g for g in groups if g["task_id"] == k], "handoffs"),
                                               total([g for g in groups if g["task_id"] == k], "n"))}
            for k in tasks
        ],
    }


def event_group(e: Event) -> dict:
    """The run that just ended, in the same shape as one SQL result row."""
    accepted = e.choice in ("accept", "check_then_accept")
    return {
        "tactic": e.tactic, "task_id": e.task_id, "n": 1, "runs": 1,
        "handoffs": int(e.choice == "accept"), "checks": int(e.checked), "lies": int(not e.ai_correct),
        "lies_accepted": int(not e.ai_correct and accepted), "timed": int(e.pressure_s is not None),
    }


@app.get("/api/health")
def health():
    """Open this in a browser first. It proves the three .env values work."""
    if not configured():
        raise HTTPException(500, "server/.env is missing one of the three Databricks values")
    try:
        rows = run_sql(f"SELECT (SELECT COUNT(*) FROM {T}.runs) AS runs, (SELECT COUNT(*) FROM {T}.events) AS events")
    except DatabricksError as err:
        raise HTTPException(502, str(err))
    try:
        cam_views = int(run_sql(f"SELECT COUNT(*) AS n FROM {T}.cam_views")[0]["n"])
    except DatabricksError:
        cam_views = None  # table not created yet: run sql/create_tables.sql again
    return {"ok": True, "runs": int(rows[0]["runs"]), "events": int(rows[0]["events"]), "cam_views": cam_views}


class RunStart(BaseModel):
    run_id: str
    task_count: int = 7


@app.post("/api/run/start")
def run_start(body: RunStart):
    """Decide where C.A.I.-0 lies tonight, where the clock runs fast, and where the units walk, from what
    earlier players did.

    {} means: nothing learned yet, use the seeded pattern, a steady clock and a random route.
    """
    try:
        rows = load_memory()
        out = learned_lies(rows, body.run_id, body.task_count) or {}
        rush = learned_rush(rows, body.task_count)
        if rush:
            out["rush_tasks"] = rush
    except DatabricksError as err:
        log.warning("run/start could not read memory: %s", err)
        out = {}
    try:
        out.update(learned_watch(load_watch()) or {})
    except DatabricksError as err:
        log.warning("run/start could not read camera views: %s", err)
    return out


@app.post("/api/event")
def event():
    """Accepted and ignored: events are written in one batch by /api/run/end."""
    return {"ok": True}


@app.post("/api/run/end")
def run_end(body: RunEnd):
    """Save the run, then return the player's own numbers plus the room's mirror (including this run)."""
    rid = [param("run_id", body.run.run_id)]
    try:
        f_insert = pool.submit(insert_run, body.run, body.events)
        f_views = pool.submit(save_cam_views, body.run.run_id, body.cam_views)
        f_room = pool.submit(run_sql, ROOM_SQL, rid)
        f_seed = pool.submit(run_sql, f"SELECT COUNT(*) AS seeded FROM {T}.runs WHERE alias = 'seed' AND run_id <> :run_id", rid)
        f_insert.result()
        f_views.result()
        rows = f_room.result()
        seeded = int(f_seed.result()[0]["seeded"])
    except DatabricksError as err:
        log.error("run/end failed: %s", err)
        raise HTTPException(502, str(err))  # the game falls back to its local report

    ints = ("task_id", "n", "runs", "handoffs", "checks", "lies", "lies_accepted", "timed")
    groups = [{"tactic": r["tactic"], **{k: int(r[k]) for k in ints}} for r in rows]
    groups += [event_group(e) for e in body.events]
    pool.submit(refresh_memory)  # so the next player's C.A.I.-0 has learned from this one
    pool.submit(refresh_watch)
    return {"metrics": {**summarize(body.events), "room": room_mirror(groups, seeded)}}


@app.get("/api/room")
def room():
    """Live counters for the start screen and the second monitor."""
    try:
        rows = run_sql(
            f"SELECT (SELECT COUNT(*) FROM {T}.runs) AS runs, "
            f"(SELECT AVG(CASE WHEN choice = 'accept' THEN 1.0 ELSE 0.0 END) FROM {T}.events WHERE task_id = 3) AS task3_handoff"
        )
    except DatabricksError as err:
        raise HTTPException(502, str(err))
    r = rows[0]
    return {"runs": int(r["runs"]), "task3Handoff": float(r["task3_handoff"]) if r["task3_handoff"] is not None else None}
