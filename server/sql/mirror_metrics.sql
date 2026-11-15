-- The room's mirror: what everyone who played did, grouped by AI voice and task.
-- Returns counts, not rates. The backend adds the run that just ended and rolls the counts up.
-- :run_id is excluded to avoid double counting.
SELECT tactic,
       task_id,
       COUNT(*)                                                        AS n,
       COUNT(DISTINCT run_id)                                          AS runs,
       SUM(CASE WHEN choice = 'accept' THEN 1 ELSE 0 END)              AS handoffs,
       SUM(CASE WHEN checked THEN 1 ELSE 0 END)                        AS checks,
       SUM(CASE WHEN NOT ai_correct THEN 1 ELSE 0 END)                 AS lies,
       SUM(CASE WHEN NOT ai_correct AND choice IN ('accept', 'check_then_accept') THEN 1 ELSE 0 END) AS lies_accepted,
       SUM(CASE WHEN pressure_s IS NOT NULL THEN 1 ELSE 0 END)         AS timed
FROM workspace.nullspace.events
WHERE run_id <> :run_id
GROUP BY tactic, task_id