"""Store the planner engine's 2026-2030 figures per candidate zone in moon.zone_stats (migration 0010).

Runs prototipos/lunar-map/tools/zone-stats.js with Node (the planner's own engine.js on the planner's own data files)
for the panel heights of ref.power_system, and replaces the table rows. Run after db/etl/load_zones.py.
Usage:  python db/etl/load_zone_stats.py      (needs `node` on PATH; about 40 s)
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dbconfig import REPO, connect  # noqa: E402

TOOL = REPO / "prototipos" / "lunar-map" / "tools" / "zone-stats.js"


def main() -> None:
    node = shutil.which("node")
    if not node:
        raise SystemExit("node is not on PATH (needed to run the planner engine)")
    with connect() as conn, conn.cursor() as cur:
        heights = [float(h) for (h,) in cur.execute("SELECT DISTINCT array_bottom_height_m FROM ref.power_system ORDER BY 1").fetchall()]
        if not heights:
            raise SystemExit("ref.power_system is empty: run db/etl/load_zones.py first")
        out = subprocess.run([node, str(TOOL), *[f"{h:g}" for h in heights]], cwd=REPO, check=True, capture_output=True, text=True).stdout
        data = json.loads(out)
        zones = dict(cur.execute("SELECT code, id FROM moon.candidate_zone").fetchall())
        missing = {r["zone"] for r in data["rows"]} - set(zones)
        if missing:
            raise SystemExit(f"zones not in moon.candidate_zone: {sorted(missing)}")
        cur.execute("DELETE FROM moon.zone_stats")
        cols = ("zone_id", "panel_height_m", "antenna_height_m", "step_s", "period_start", "period_end", "samples", "sun_pct", "earth_pct",
                "both_pct", "longest_night_h", "longest_silence_h", "mean_panel_w_m2", "engine_sha256")
        with cur.copy(f"COPY moon.zone_stats ({', '.join(cols)}) FROM STDIN") as cp:
            for r in data["rows"]:
                cp.write_row((zones[r["zone"]], r["panel_height_m"], r["antenna_height_m"], r["step_s"], r["period_start"], r["period_end"],
                              r["samples"], r["sun_pct"], r["earth_pct"], r["both_pct"], r["longest_night_h"], r["longest_silence_h"],
                              r["mean_panel_w_m2"], data["engine_sha256"]))
        conn.commit()
    print(f"zone stats: {len(data['rows'])} rows ({len(zones)} zones x heights {heights} x 2 steps), engine {data['engine_sha256'][:12]}")


if __name__ == "__main__":
    main()
