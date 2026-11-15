"""Thin client for the Databricks SQL Statement Execution API. The token never leaves this process."""
import os
import time

import httpx
from dotenv import load_dotenv

load_dotenv()


class DatabricksError(RuntimeError):
    pass


def _host() -> str:
    host = os.environ.get("DATABRICKS_HOST", "").strip().rstrip("/")
    if host and not host.startswith("http"):
        host = "https://" + host
    return host


def configured() -> bool:
    return all(os.environ.get(k, "").strip() for k in ("DATABRICKS_HOST", "DATABRICKS_WAREHOUSE_ID", "DATABRICKS_TOKEN"))


def param(name: str, value, type_: str = "STRING") -> dict:
    """One named parameter (:name in the SQL). None becomes SQL NULL."""
    p = {"name": name, "type": type_}
    if value is not None:
        p["value"] = str(value).lower() if isinstance(value, bool) else str(value)
    return p


def run_sql(statement: str, params: list[dict] | None = None, timeout_s: int = 90) -> list[dict]:
    """Run one statement on the SQL warehouse and return rows as dicts (values come back as strings)."""
    if not configured():
        raise DatabricksError("Missing DATABRICKS_HOST, DATABRICKS_WAREHOUSE_ID or DATABRICKS_TOKEN in server/.env")
    headers = {"Authorization": f"Bearer {os.environ['DATABRICKS_TOKEN'].strip()}"}
    body = {
        "warehouse_id": os.environ["DATABRICKS_WAREHOUSE_ID"].strip(),
        "statement": statement,
        "parameters": params or [],
        "wait_timeout": "30s",
        "on_wait_timeout": "CONTINUE",
    }
    base = f"{_host()}/api/2.0/sql/statements"
    with httpx.Client(timeout=60, headers=headers) as client:
        res = client.post(base, json=body)
        if res.status_code >= 400:
            raise DatabricksError(f"Databricks {res.status_code}: {res.text[:300]}")
        data = res.json()
        deadline = time.time() + timeout_s
        # A stopped warehouse can take about a minute to start, so keep polling.
        while data["status"]["state"] in ("PENDING", "RUNNING") and time.time() < deadline:
            time.sleep(1.5)
            data = client.get(f"{base}/{data['statement_id']}").json()
    state = data["status"]["state"]
    if state != "SUCCEEDED":
        message = data["status"].get("error", {}).get("message", "")
        raise DatabricksError(f"Statement {state}: {message[:300]}")
    columns = [c["name"] for c in data.get("manifest", {}).get("schema", {}).get("columns", [])]
    rows = data.get("result", {}).get("data_array") or []
    return [dict(zip(columns, row)) for row in rows]
