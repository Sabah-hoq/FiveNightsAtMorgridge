CREATE SCHEMA IF NOT EXISTS workspace.nullspace;

CREATE TABLE IF NOT EXISTS workspace.nullspace.runs (
  run_id STRING, started_at TIMESTAMP, ended_at TIMESTAMP, mode STRING,
  tactic STRING, lie_pattern STRING, outcome STRING, caught_at STRING, alias STRING);

CREATE TABLE IF NOT EXISTS workspace.nullspace.events (
  run_id STRING, task_id INT, floor INT, ai_correct BOOLEAN, lie_type STRING,
  tactic STRING, choice STRING, checked BOOLEAN, decision_ms INT, pressure_s INT,
  player_correct BOOLEAN, ts TIMESTAMP, timed_out BOOLEAN);
