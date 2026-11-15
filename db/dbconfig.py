"""Connection settings shared by migrate.py and the ETL: read from the repo-root .env (never printed).

HORIZON_DB_PORT / HORIZON_DB_HOST override the port/host found in DATABASE_URL (useful when 5433 is taken).
"""
import os
from pathlib import Path
from urllib.parse import unquote, urlparse

REPO = Path(__file__).resolve().parent.parent


def load_env() -> dict:
    env = {}
    path = REPO / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    env.update({k: v for k, v in os.environ.items() if k in ("DATABASE_URL", "HORIZON_DB_PORT", "HORIZON_DB_HOST")})
    return env


def conninfo() -> dict:
    env = load_env()
    u = urlparse(env["DATABASE_URL"])
    return dict(
        host=env.get("HORIZON_DB_HOST") or ("127.0.0.1" if u.hostname in (None, "localhost") else u.hostname),
        port=int(env.get("HORIZON_DB_PORT") or u.port or 5433),
        user=unquote(u.username or ""),
        password=unquote(u.password or ""),
        dbname=(u.path or "/").lstrip("/"),
    )


def connect(**kw):
    import psycopg
    return psycopg.connect(**conninfo(), **kw)
