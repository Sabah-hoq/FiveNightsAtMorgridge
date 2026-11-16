CREATE SCHEMA IF NOT EXISTS workspace.nullspace;

CREATE TABLE IF NOT EXISTS workspace.nullspace.runs (
  run_id STRING, started_at TIMESTAMP, ended_at TIMESTAMP, mode STRING,
  tactic STRING, lie_pattern STRING, outcome STRING, caught_at STRING, alias STRING);

CREATE TABLE IF NOT EXISTS workspace.nullspace.events (
  run_id STRING, task_id INT, floor INT, ai_correct BOOLEAN, lie_type STRING,
  tactic STRING, choice STRING, checked BOOLEAN, decision_ms INT, pressure_s INT,
  player_correct BOOLEAN, ts TIMESTAMP, timed_out BOOLEAN);

-- Where each player looked: one row per camera per slot of the night (six 20-minute slots, 0 to 5).
-- C.A.I.-0 reads this before a night starts and routes the units through the cameras people watch most.
CREATE TABLE IF NOT EXISTS workspace.nullspace.cam_views (
  run_id STRING, cam STRING, slot INT, view_ms INT, opens INT);
