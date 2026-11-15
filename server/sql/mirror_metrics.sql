-- Cohort comparison for the Mirror Report (spec 6.2). Two statements, separated by the marker line below.
-- :run_id is excluded so a player is never compared with themselves.
-- A handoff is choice = 'accept' (accepted without doing or checking).

WITH per_run AS (
  SELECT e.run_id,
         MAX(r.alias) AS alias,
         AVG(CASE WHEN e.choice = 'accept' THEN 1.0 ELSE 0.0 END) AS handoff_rate
  FROM workspace.nullspace.events e
  LEFT JOIN workspace.nullspace.runs r ON r.run_id = e.run_id
  WHERE e.run_id <> :run_id
  GROUP BY e.run_id
)
SELECT COUNT(*) AS cohort_size,
       COALESCE(SUM(CASE WHEN alias = 'seed' THEN 1 ELSE 0 END), 0) AS synthetic_runs,
       AVG(CASE WHEN handoff_rate < :my_rate THEN 1.0 ELSE 0.0 END) AS percentile
FROM per_run

-- @@

SELECT tactic,
       COUNT(DISTINCT run_id) AS runs,
       AVG(CASE WHEN choice = 'accept' THEN 1.0 ELSE 0.0 END) AS handoff_rate,
       AVG(CASE WHEN checked THEN 1.0 ELSE 0.0 END) AS check_rate
FROM workspace.nullspace.events
WHERE run_id <> :run_id
GROUP BY tactic
