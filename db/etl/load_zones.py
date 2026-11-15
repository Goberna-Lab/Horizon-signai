"""Load the planner's candidate zones into the database (migration 0009).

Source: prototipos/lunar-map/data/zonas.js, the same file the planner reads (written by
prototipos/lunar-map/tools/zonas-candidatas.js), plus luna-recursos/datos/validacion-catalogo.json for the Mazarico
pixel and products. Also seeds the solar power-system presets (NASA VSAT) and their data sources.

Run after db/etl/load_map3d.py (zones point at moon.site rows).  Usage:  python db/etl/load_zones.py
Checks at the end that moon.horizon_at() returns the planner engine's horizon (perfil + horizonteEn) to 1e-4 deg.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dbconfig import REPO, connect  # noqa: E402

ZONAS = REPO / "prototipos" / "lunar-map" / "data" / "zonas.js"
VALIDACION = REPO / "luna-recursos" / "datos" / "validacion-catalogo.json"

SOURCES = [  # key, citation, url
    ("nasa_vsat", "NASA STMD Game Changing Development, Vertical Solar Array Technology (VSAT): vertical arrays on masts for the lunar south pole;"
     " key performance parameters: single-axis sun tracking (360 deg), mast height to the bottom of the array 5 m (threshold) and 10 m (goal)",
     "https://ntrs.nasa.gov/api/citations/20230012849/downloads/GCD%20Annual%20Review%20VSAT%20September%202023%20Final.pdf"),
    ("mazarico2011", "Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011). Illumination conditions of the lunar polar"
     " regions using LOLA topography. Icarus 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030 (AVGVISIB_85S_060M_201608 and _EARTH)",
     "http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/"),
    ("wakker_fa", "Wakker, K. F. Fundamentals of Astrodynamics. TU Delft, 2015 (solar constant 1361 W/m2 at 1 AU, ch. 20.4, p. 542)",
     None),
]

POWER_SYSTEMS = [  # code, name, orientation, tracking, bottom height (m), source key, notes
    ("lander_deck", "Panel on the lander deck", "vertical", "azimuth", 2.0, "nasa_vsat",
     "Default of the planner: a vertical panel on the lander, turning in azimuth to face the Sun."),
    ("vsat_threshold", "NASA VSAT, threshold mast height", "vertical", "azimuth", 5.0, "nasa_vsat",
     "VSAT KPP 2 threshold: 5 m from the surface to the bottom of the array; single-axis tracking, 360 deg."),
    ("vsat_goal", "NASA VSAT, goal mast height", "vertical", "azimuth", 10.0, "nasa_vsat",
     "VSAT KPP 2 goal: 10 m from the surface to the bottom of the array; single-axis tracking, 360 deg."),
]


def read_zonas() -> dict:
    t = ZONAS.read_text(encoding="utf8")
    i = t.index("{", t.index("LunarData.zonas"))
    return json.loads(t[i:t.rindex("}") + 1])


def engine_horizon(v: list, paso: float, az: float, h: float) -> float:
    """perfil() + horizonteEn() of prototipos/lunar-map/engine.js, in Python."""
    def elev(a):
        H = max(h, 0.01)
        return max(math.atan2(a[k + 1] - H, a[k]) for k in range(0, len(a), 2))
    n = len(v)
    x = (az % 360) / paso
    i = math.floor(x)
    f = x - i
    return math.degrees(elev(v[i % n]) * (1 - f) + elev(v[(i + 1) % n]) * f)


def main() -> None:
    zonas = read_zonas()
    val = {s["id"]: s for s in json.loads(VALIDACION.read_text(encoding="utf8"))["sitios"]}
    with connect() as conn, conn.cursor() as cur:
        for key, cit, url in SOURCES:
            cur.execute("INSERT INTO ref.data_source (key,citation,url) VALUES (%s,%s,%s) ON CONFLICT (key) DO UPDATE SET"
                        " citation=EXCLUDED.citation, url=EXCLUDED.url", (key, cit, url))
        src = dict(cur.execute("SELECT key, id FROM ref.data_source").fetchall())
        for code, name, orient, track, h, skey, notes in POWER_SYSTEMS:
            cur.execute("INSERT INTO ref.power_system (code,name,orientation,tracking,array_bottom_height_m,source_id,notes)"
                        " VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, orientation=EXCLUDED.orientation,"
                        " tracking=EXCLUDED.tracking, array_bottom_height_m=EXCLUDED.array_bottom_height_m, source_id=EXCLUDED.source_id,"
                        " notes=EXCLUDED.notes", (code, name, orient, track, h, src[skey], notes))
        sites = dict(cur.execute("SELECT slug, id FROM moon.site").fetchall())

        cur.execute("DELETE FROM moon.candidate_zone WHERE code <> ALL(%s)", (list(zonas),))
        for order, (code, z) in enumerate(zonas.items()):
            if z.get("sitio") and z["sitio"] not in sites:
                raise SystemExit(f"zone {code}: site {z['sitio']} is not in moon.site")
            approx = bool(z.get("aproximado"))
            zid = cur.execute(
                "INSERT INTO moon.candidate_zone (code,slug,name,kind,site_id,geom,horizon_quality,horizon_source_id,ground_height_m,sort_order)"
                " VALUES (%s,%s,%s,%s,%s, ST_SetSRID(ST_MakePoint(%s,%s),910001), %s,%s,%s,%s)"
                " ON CONFLICT (code) DO UPDATE SET slug=EXCLUDED.slug, name=EXCLUDED.name, kind=EXCLUDED.kind, site_id=EXCLUDED.site_id,"
                " geom=EXCLUDED.geom, horizon_quality=EXCLUDED.horizon_quality, horizon_source_id=EXCLUDED.horizon_source_id,"
                " ground_height_m=EXCLUDED.ground_height_m, sort_order=EXCLUDED.sort_order RETURNING id",
                (code, z["id"], z["nombre"], "roi" if "-roi-" in z["id"] else "site", sites.get(z.get("sitio")),
                 z["lon"] - 360 if z["lon"] > 180 else z["lon"], z["lat"],
                 "approximate" if approx else "detailed", src["lola_ldem75s" if approx else "pgda_5m_horizons"],
                 z.get("alturaM"), order)).fetchone()[0]
            cur.execute("DELETE FROM moon.horizon_envelope WHERE zone_id = %s", (zid,))
            with cur.copy("COPY moon.horizon_envelope (zone_id, az_index, az_step_deg, hull_m) FROM STDIN") as cp:
                for i, hull in enumerate(z["v"]):
                    cp.write_row((zid, i, float(z["paso"]), [float(x) for x in hull]))
            cur.execute("DELETE FROM ref.illumination_reference WHERE zone_id = %s", (zid,))
            v = val.get(z["id"])
            if v:
                ms, me = v["mazaricoSol"], v["mazaricoTierra"]
                cur.execute("INSERT INTO ref.illumination_reference (zone_id,source_id,sun_product,earth_product,pixel_row,pixel_col,sun_pct,earth_pct)"
                            " VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                            (zid, src["mazarico2011"], ms["producto"], me["producto"], ms.get("fila"), ms.get("columna"),
                             ms["valor"] * 100, me["valor"] * 100))   # sin redondear: el planificador redondea al mostrar

        # the database horizon must be the planner's: a few azimuths and heights per zone
        worst = 0.0
        for code, z in zonas.items():
            for az in (0.0, 37.25, 123.4, 271.9):
                for h in (0.0, 2.0, 10.0):
                    db = cur.execute("SELECT moon.horizon_at(%s, %s, %s)", (code, az, h)).fetchone()[0]
                    worst = max(worst, abs(db - engine_horizon(z["v"], z["paso"], az, h)))
        if worst > 1e-4:
            raise SystemExit(f"moon.horizon_at differs from the planner engine by {worst:.6f} deg")
        n_env = cur.execute("SELECT count(*) FROM moon.horizon_envelope").fetchone()[0]
        n_ref = cur.execute("SELECT count(*) FROM ref.illumination_reference").fetchone()[0]
        conn.commit()
    print(f"zones: {len(zonas)}, envelope rows: {n_env}, Mazarico references: {n_ref}, power systems: {len(POWER_SYSTEMS)};"
          f" horizon_at vs engine: max {worst:.2e} deg")


if __name__ == "__main__":
    main()
