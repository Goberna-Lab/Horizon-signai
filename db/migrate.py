"""Apply db/migrations/*.sql in order. Applied versions are tracked in public.schema_migration.

Usage:  python db/migrate.py
Each file runs in its own transaction; a changed checksum of an already applied file is reported (not re-run).
"""
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dbconfig import connect  # noqa: E402

MIGRATIONS = Path(__file__).resolve().parent / "migrations"


def main() -> None:
    with connect(autocommit=True) as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS public.schema_migration ("
            " version text PRIMARY KEY, name text NOT NULL, checksum text NOT NULL,"
            " applied_at timestamptz NOT NULL DEFAULT now())")
        applied = {r[0]: r[1] for r in conn.execute("SELECT version, checksum FROM public.schema_migration")}
        for f in sorted(MIGRATIONS.glob("*.sql")):
            version = f.name.split("_", 1)[0]
            sql = f.read_text(encoding="utf8")
            checksum = hashlib.sha256(sql.encode("utf8")).hexdigest()
            if version in applied:
                if applied[version] != checksum:
                    print(f"WARNING {f.name}: changed since it was applied (not re-run)")
                continue
            with conn.transaction():
                conn.execute(sql)
                conn.execute("INSERT INTO public.schema_migration (version, name, checksum) VALUES (%s, %s, %s)",
                             (version, f.name, checksum))
            print(f"applied {f.name}")
    print("migrations up to date")


if __name__ == "__main__":
    main()
