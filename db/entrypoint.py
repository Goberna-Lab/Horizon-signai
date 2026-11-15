"""Loader entrypoint: wait for db -> migrate -> (load + refresh if sources changed) -> ensure API login role.

Env: DATABASE_URL (owner role), MAP_API_PASSWORD. Exit 0 on success, non-zero on failure.
Set FORCE_RELOAD=1 to ignore the stored fingerprint.
"""
import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))
from dbconfig import connect  # noqa: E402

FINGERPRINT_DIRS = ["db", "luna-recursos", "apps/web/scripts/mapa-3d", "prototipos/lunar-map/data/zonas.js",
                    "prototipos/lunar-map/data/efemerides-luna.js", "prototipos/lunar-map/engine.js",
                    "prototipos/lunar-map/tools/zone-stats.js"]
SKIP_NAMES = {"__pycache__", "docker-compose.yml", "Dockerfile", "Dockerfile.dockerignore", "README.md"}


def fingerprint() -> str:
    h = hashlib.sha256()
    for d in FINGERPRINT_DIRS:
        base = REPO / d
        files = [base] if base.is_file() else sorted(p for p in base.rglob("*") if p.is_file())
        for f in files:
            if SKIP_NAMES & set(f.parts) or f.suffix == ".pyc":
                continue
            h.update(f.relative_to(REPO).as_posix().encode())
            with open(f, "rb") as fh:
                for chunk in iter(lambda: fh.read(1 << 20), b""):
                    h.update(chunk)
    return h.hexdigest()


def wait_for_db(timeout=120):
    end = time.time() + timeout
    while True:
        try:
            connect(connect_timeout=5).close()
            return
        except Exception as e:  # noqa: BLE001
            if time.time() > end:
                raise SystemExit(f"database not reachable: {type(e).__name__}")
            time.sleep(2)


def run(*args):
    r = subprocess.run([sys.executable, "-I", *args], cwd=REPO)
    if r.returncode:
        raise SystemExit(f"{args[0]} failed ({r.returncode})")


def ensure_api_role(conn):
    from psycopg import sql
    pw = os.environ.get("MAP_API_PASSWORD", "")
    if not pw:
        raise SystemExit("MAP_API_PASSWORD is not set")
    exists = conn.execute("SELECT 1 FROM pg_roles WHERE rolname='map_api'").fetchone()
    verb = "ALTER" if exists else "CREATE"
    conn.execute(sql.SQL(verb + " ROLE map_api LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD {}").format(sql.Literal(pw)))
    conn.execute("GRANT map_api_ro TO map_api")
    dbname = conn.execute("SELECT current_database()").fetchone()[0]
    conn.execute(sql.SQL("GRANT CONNECT ON DATABASE {} TO map_api").format(sql.Identifier(dbname)))
    print("role map_api ready")


def main():
    t0 = time.time()
    wait_for_db()
    run("db/migrate.py")
    fp = fingerprint()
    with connect(autocommit=True) as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS public.etl_run (fingerprint text NOT NULL,"
                     " loaded_at timestamptz NOT NULL DEFAULT now(), duration_s numeric NOT NULL)")
        last = conn.execute("SELECT fingerprint FROM public.etl_run ORDER BY loaded_at DESC LIMIT 1").fetchone()
        if last and last[0] == fp and os.environ.get("FORCE_RELOAD") != "1":
            print(f"sources unchanged (fingerprint {fp[:12]}): skipping load")
        else:
            print(f"loading (fingerprint {fp[:12]})")
            t1 = time.time()
            run("db/etl/load_map3d.py")
            run("db/etl/load_zones.py")
            run("db/etl/load_zone_stats.py")
            conn.execute("CALL moon.refresh_site_illumination()")
            conn.execute("INSERT INTO public.etl_run (fingerprint, duration_s) VALUES (%s, %s)",
                         (fp, round(time.time() - t1, 1)))
            print(f"load done in {time.time() - t1:.0f}s")
        ensure_api_role(conn)
    print(f"loader finished in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
