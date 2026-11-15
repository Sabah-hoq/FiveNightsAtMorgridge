"""NullSpace backend (spec 6.5). The browser talks to this; this talks to Databricks.

Run:  uvicorn main:app --reload --port 8000
Check: http://localhost:8000/api/health
"""
import logging
import statistics
import threading
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
COHORT_SQL, TACTIC_SQL = (Path(__file__).parent / "sql" / "mirror_metrics.sql").read_text().split("-- @@")
pool = ThreadPoolExecutor(max_workers=4)


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


EVENT_COLS = [
    ("run_id", "STRING"), ("task_id", "INT"), ("floor", "INT"), ("ai_correct", "BOOLEAN"), ("lie_type", "STRING"),
    ("tactic", "STRING"), ("choice", "STRING"), ("checked", "BOOLEAN"), ("decision_ms", "INT"), ("pressure_s", "INT"),
    ("player_correct", "BOOLEAN"), ("ts", "TIMESTAMP"), ("timed_out", "BOOLEAN"),
]
RUN_COLS = [
    ("run_id", "STRING"), ("started_at", "TIMESTAMP"), ("ended_at", "TIMESTAMP"), ("mode", "STRING"), ("tactic", "STRING"),
    ("lie_pattern", "STRING"), ("outcome", "STRING"), ("caught_at", "STRING"), ("alias", "STRING"),
]


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


@app.get("/api/health")
def health():
    """Open this in a browser first. It proves the three .env values work."""
    if not configured():
        raise HTTPException(500, "server/.env is missing one of the three Databricks values")
    try:
        rows = run_sql(f"SELECT (SELECT COUNT(*) FROM {T}.runs) AS runs, (SELECT COUNT(*) FROM {T}.events) AS events")
    except DatabricksError as err:
        raise HTTPException(502, str(err))
    return {"ok": True, "runs": int(rows[0]["runs"]), "events": int(rows[0]["events"])}


@app.post("/api/run/start")
def run_start():
    """C.A.I.-0 lines stay fixed per style (cleaner experiment), so this only wakes the warehouse."""
    def warm():
        try:
            run_sql("SELECT 1")
        except Exception as err:  # noqa: BLE001
            log.warning("warm-up failed: %s", err)

    threading.Thread(target=warm, daemon=True).start()
    return {}


@app.post("/api/event")
def event():
    """Accepted and ignored: events are written in one batch by /api/run/end."""
    return {"ok": True}


@app.post("/api/run/end")
def run_end(body: RunEnd):
    mine = summarize(body.events)
    rid = [param("run_id", body.run.run_id)]
    try:
        f_insert = pool.submit(insert_run, body.run, body.events)
        f_cohort = pool.submit(run_sql, COHORT_SQL, rid + [param("my_rate", mine["handoffRate"], "DOUBLE")])
        f_tactic = pool.submit(run_sql, TACTIC_SQL, rid)
        f_insert.result()
        cohort = f_cohort.result()[0]
        tactics = f_tactic.result()
    except DatabricksError as err:
        log.error("run/end failed: %s", err)
        raise HTTPException(502, str(err))  # the game falls back to its local report

    effects = [
        {"tactic": r["tactic"], "runs": int(r["runs"]), "handoffRate": float(r["handoff_rate"]), "checkRate": float(r["check_rate"])}
        for r in tactics
    ]
    size = int(cohort["cohort_size"])
    return {"metrics": {
        **mine,
        "cohortSize": size,
        "syntheticRuns": int(cohort["synthetic_runs"] or 0),
        "percentile": float(cohort["percentile"]) if size and cohort["percentile"] is not None else None,
        "tacticEffects": effects,
        "leastCheckedTactic": min(effects, key=lambda t: t["checkRate"])["tactic"] if effects else None,
    }}


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
