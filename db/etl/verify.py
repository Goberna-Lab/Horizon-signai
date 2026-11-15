"""Verify the 3D Moon map database against its sources and against independent numpy computations.

Usage:  python db/etl/verify.py [--html path/to/old/mapa-3d.html]

The reference HTML is the one that still embedded DATOS (default: `git show HEAD:apps/web/public/mapa-3d.html`).
"""
import base64
import json
import subprocess
import sys
import zlib
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dbconfig import REPO, connect  # noqa: E402

DATOS = REPO / "luna-recursos" / "datos"
R = 1737400.0
fails = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(("OK   " if ok else "FAIL ") + name + (f"  {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


def load_html_datos() -> dict:
    if "--html" in sys.argv:
        txt = Path(sys.argv[sys.argv.index("--html") + 1]).read_text(encoding="utf8")
    else:
        txt = subprocess.run(["git", "show", "HEAD:apps/web/public/mapa-3d.html"], cwd=REPO, check=True, capture_output=True).stdout.decode("utf8")
    i = txt.index("const DATOS = ") + len("const DATOS = ")
    obj, _ = json.JSONDecoder().raw_decode(txt[i:])
    return obj


def inflate_b64(s: str) -> bytes:
    return zlib.decompress(base64.b64decode(s))


def enu_angles(lat, lon_e, v):
    la, lo = np.radians(lat), np.radians(lon_e)
    e = np.array([-np.sin(lo), np.cos(lo), 0.0])
    n = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    u = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    v = v / np.linalg.norm(v)
    return float(np.degrees(np.arctan2(v @ e, v @ n)) % 360), float(np.degrees(np.arcsin(v @ u)))


def horizon_interp(prof, az):
    n = len(prof)
    k = az * n / 360.0
    i = int(np.floor(k))
    f = k - i
    return prof[i % n] * (1 - f) + prof[(i + 1) % n] * f


def main() -> None:
    d = load_html_datos()
    conn = connect()
    one = lambda sql, *a: conn.execute(sql, a).fetchone()[0]

    # ---- counts
    check("62 sites", one("SELECT count(*) FROM moon.site") == 62)
    check("8876 IAU features", one("SELECT count(*) FROM moon.iau_feature") == 8876)
    check("6 site categories", one("SELECT count(*) FROM ref.site_category") == 6)
    check("14609 ephemeris rows x 2 bodies", one("SELECT count(*) FROM eph.sample") == 14609 * 2
          and one("SELECT min(c) FROM (SELECT count(*) c FROM eph.sample GROUP BY body_id) q") == 14609)
    check("10 horizon profiles x 720", one("SELECT count(*) FROM moon.horizon_profile") == 10
          and one("SELECT min(cardinality(elevation_deg)) FROM moon.horizon_profile") == 720
          and one("SELECT count(*) FROM moon.v_horizon_sample") == 7200)
    check("site_illumination = sites x ephemeris rows", one("SELECT count(*) FROM moon.site_illumination") == 62 * 14609)
    check("raster tiles present", one("SELECT count(*) FROM terrain.raster_tile") == 18 + 18 + 16 + 49 + 9)
    check("every site has English text and a source", one("SELECT count(*) FROM moon.site WHERE description IS NULL OR source_id IS NULL") == 0)
    check("no Spanish region names left", one("SELECT count(*) FROM moon.site WHERE region_name ~* '(cara oculta|tierras altas|sombra permanente|Alto polar|Cerca de|borde norte)'") == 0)

    # ---- assets vs the DATOS of the HTML (decoded content; webp/jpeg raw bytes)
    def asset(key):
        return bytes(one("SELECT a.content FROM terrain.asset a JOIN ref.dataset s ON s.id=a.dataset_id WHERE s.key=%s", key))

    pairs = [("global_elevation", d["global"]["alt"]), ("global_albedo", d["global"]["alb"]), ("pole_elevation_663", d["polo"]["alt"]),
             ("pole_elevation_240", d["polo240"]["alt"]), ("ephemeris_de441", d["eph"]["d"])]
    for key, b64 in pairs:
        raw = base64.b64decode(b64)
        mine = asset(key)
        check(f"asset {key}: decoded content equal", zlib.decompress(mine) == zlib.decompress(raw))
        print(f"       {key}: {'byte-identical zlib stream' if mine == raw else 'zlib streams differ (content equal)'}; {len(mine)} bytes")
    check("asset gradient16: raw webp bytes", asset("gradient16") == base64.b64decode(d["g16"].split(",", 1)[1]))
    check("asset earth_texture: raw jpeg bytes", asset("earth_texture") == base64.b64decode(d["tierra"].split(",", 1)[1]))
    check("asset sha256/byte_size consistent", one("SELECT count(*) FROM terrain.asset WHERE byte_size <> octet_length(content)"
                                                  " OR sha256 <> encode(sha256(content),'hex')") == 0)

    # ---- sites/terrain/horizons/IAU vs the HTML
    sit = {s["id"]: s for s in d["sitios"]["sitios"]}
    rows = conn.execute("SELECT s.slug, t.elevation_m, t.slope_deg FROM moon.site_terrain t JOIN moon.site s ON s.id=t.site_id").fetchall()
    exp = {k for k, s in sit.items() if "h240" in s}
    check("site_terrain h240/pend240 equal the generator's", {r[0] for r in rows} == exp
          and all(r[1] == sit[r[0]]["h240"] and abs(r[2] - sit[r[0]]["pend240"]) < 1e-5 for r in rows))
    ok = True
    for slug, prof in d["horizontes"].items():
        arr = one("SELECT elevation_deg FROM moon.horizon_profile h JOIN moon.site s ON s.id=h.site_id WHERE s.slug=%s", slug)
        ok &= len(arr) == 720 and max(abs(a - b) for a, b in zip(arr, prof)) < 1e-4
    check("horizon profiles equal HTML horizontes", ok and len(d["horizontes"]) == 10)
    iau = {n[6]: n for n in d["iau"]}
    got = {r[0]: r for r in conn.execute("SELECT id, name, type_code, ST_Y(geom), lon_east FROM moon.iau_feature")}
    check("IAU features equal HTML", set(got) == set(iau) and all(
        got[i][1] == n[0] and got[i][2] == n[4] and abs(got[i][3] - n[1]) < 1e-9 and abs(got[i][4] - n[2]) < 1e-9 for i, n in iau.items()))
    got = {r[0]: r for r in conn.execute("SELECT slug, ST_Y(geom), lon_east, description, event_date::text, is_approximate FROM moon.site")}
    check("sites equal HTML (coords, English text, date, approx)", all(
        abs(got[k][1] - s["lat"]) < 1e-9 and abs(got[k][2] - s["lon"]) < 1e-9 and got[k][3] == s["en"] and got[k][4] == s["fecha"]
        and got[k][5] == bool(s.get("aprox")) for k, s in sit.items()))
    check("site links (English labels)", one("SELECT count(*) FROM moon.site_link") == sum(len(s.get("enlaces", [])) for s in sit.values()))
    check("lon_east 0..360 and geometry lon -180..180", one("SELECT min(ST_X(geom)) >= -180 AND max(ST_X(geom)) <= 180 AND min(lon_east) >= 0 AND max(lon_east) <= 360 FROM moon.iau_feature"))

    # ---- elevation_at vs source arrays (nearest pixel, same priority 240 -> 663 -> global)
    ldem = np.fromfile(DATOS / "luna-ldem4.f16", dtype="<f2").astype(np.float32).reshape(720, 1440)
    g_h = np.round(ldem * 1000).astype(np.int32)
    meta = json.loads((DATOS / "dem-polo.json").read_text(encoding="utf8"))
    mc = meta["cerca"]
    cerca = np.fromfile(DATOS / mc["archivo"], dtype="<i2").reshape(mc["n"], mc["n"])
    N, EXT = 1024, 339_000.0
    paso = 2 * EXT / (N - 1)
    p663 = np.array(d_polo := np.frombuffer(zlib.decompress(base64.b64decode(d["polo"]["alt"])), dtype="<i2").reshape(N, N).astype(np.int32).cumsum(axis=1))

    def expected(lat, lon_e):
        if lat < -70:
            rho = 2 * R * np.tan(np.radians(90 + lat) / 2)
            x, y = rho * np.sin(np.radians(lon_e)), rho * np.cos(np.radians(lon_e))
            c, r = int(np.floor((x - (mc["x0M"] - 120)) / 240)), int(np.floor((mc["y0M"] + 120 - y) / 240))
            if 0 <= c < mc["n"] and 0 <= r < mc["n"]:
                return float(cerca[r, c])
            c, r = int(np.floor((x - (-EXT - paso / 2)) / paso)), int(np.floor((EXT + paso / 2 - y) / paso))
            if 0 <= c < N and 0 <= r < N:
                return float(p663[r, c])
        return float(g_h[int(np.floor((90 - lat) / 0.25)), int(np.floor((lon_e % 360) / 0.25))])

    pts = [(s["lat"], s["lon"]) for k, s in sit.items() if k in ("apollo-11", "apollo-17", "cand-shackleton-rim", "cand-malapert", "cand-shoemaker", "luna-9")]
    pts += [(-79.0, 100.37), (-76.3, 250.1), (-60.2, 12.3), (45.13, 300.77), (-89.9, 33.3), (12.3, 180.5), (-81.1, 359.9)]
    bad = []
    for lat, lon_e in pts:
        got_v = one("SELECT terrain.elevation_at(%s,%s)", lat, lon_e)
        if got_v is None or abs(got_v - expected(lat, lon_e)) > 0.5:
            bad.append((lat, lon_e, got_v, expected(lat, lon_e)))
    check(f"terrain.elevation_at vs source arrays ({len(pts)} points)", not bad, str(bad))
    check("elevation_at accepts lon as -180..180 or 0..360", one("SELECT terrain.elevation_at(-60.2, -347.7)") == one("SELECT terrain.elevation_at(-60.2, 12.3)"))
    # site elevation figures from the 240 m grid agree with the 240 m raster to within bilinear vs nearest
    big = 0
    for slug, h240 in conn.execute("SELECT s.slug, t.elevation_m FROM moon.site_terrain t JOIN moon.site s ON s.id=t.site_id"):
        v = one("SELECT terrain.elevation_at(ST_Y(geom), lon_east) FROM moon.site WHERE slug=%s", slug)
        big = max(big, abs(v - h240))
    print(f"       max |elevation_at - h240 (bilinear)| at polar sites: {big:.1f} m")
    check("elevation_at close to bilinear h240 at polar sites (< 300 m)", big < 300)

    # ---- sun_at / earth_at vs numpy
    em = json.loads((DATOS / "efemerides-luna.json").read_text(encoding="utf8"))
    tabla = np.fromfile(DATOS / em["archivo"], dtype="<f4").reshape(em["filas"], 8).astype(np.float64)
    prof = {slug: np.array(d["horizontes"][slug]) for slug in d["horizontes"]}
    t0 = np.datetime64(em["inicioUTC"].replace("Z", ""))
    tests = [("apollo-11", 100, 0.5), ("apollo-17", 5000, 0.25), ("cand-shackleton-rim", 321, 0.5), ("cand-haworth", 9000, 0.0),
             ("cand-connecting-ridge", 14000, 0.9), ("cand-malapert", 777, 0.1), ("chang-e-4", 2468, 0.3)]
    ok_all, worst = True, 0.0
    for slug, i, f in tests:
        if slug not in sit:
            continue
        t = (t0 + np.timedelta64(i * 10800 * 1000 + int(f * 10800 * 1000), "ms")).astype("datetime64[ms]").astype(object)
        ts = t.strftime("%Y-%m-%d %H:%M:%S.%f+00")
        for body, cols, fn in (("sun", slice(0, 3), "sun_at"), ("earth", slice(4, 7), "earth_at")):
            v = tabla[i, cols] * (1 - f) + tabla[i + 1, cols] * f
            az, el = enu_angles(sit[slug]["lat"], sit[slug]["lon"], v)
            hz = horizon_interp(prof[slug], az) if slug in prof else 0.0
            r = conn.execute(f"SELECT azimuth_deg, elevation_deg, above_horizon FROM moon.{fn}(%s, %s)", (slug, ts)).fetchone()
            daz = abs((r[0] - az + 180) % 360 - 180)
            worst = max(worst, daz, abs(r[1] - el))
            ok_all &= daz < 1e-3 and abs(r[1] - el) < 1e-3 and (r[2] == (el > hz) or abs(el - hz) < 1e-3)
    check("moon.sun_at / earth_at vs numpy", ok_all, f"worst {worst}")
    print(f"       worst az/el difference vs numpy: {worst:.2e} deg")
    # precomputed table agrees with the functions at an exact sample
    i = 4321
    ts = (t0 + np.timedelta64(i * 10800, "s")).astype(object).strftime("%Y-%m-%d %H:%M:%S+00")
    ok_tab = True
    for slug in ("apollo-11", "cand-shackleton-rim", "cand-haworth"):
        a = conn.execute("SELECT i.sun_az, i.sun_el, i.sun_lit, i.earth_az, i.earth_el, i.earth_visible FROM moon.site_illumination i JOIN moon.site s ON s.id=i.site_id"
                         " WHERE s.slug=%s AND i.t=%s", (slug, ts)).fetchone()
        s_ = conn.execute("SELECT * FROM moon.sun_at(%s,%s)", (slug, ts)).fetchone()
        e_ = conn.execute("SELECT * FROM moon.earth_at(%s,%s)", (slug, ts)).fetchone()
        ok_tab &= abs(a[1] - s_[1]) < 1e-3 and a[2] == s_[2] and abs(a[4] - e_[1]) < 1e-3 and a[5] == e_[2]
    check("site_illumination matches sun_at/earth_at", ok_tab)
    check("site_illumination partitions 2026..2031", one("SELECT count(*) FROM pg_inherits WHERE inhparent='moon.site_illumination'::regclass") == 6)
    # ---- roles
    check("role map_api_ro: NOLOGIN, can SELECT and EXECUTE", one("SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='map_api_ro'")
          and one("SELECT has_table_privilege('map_api_ro','moon.site','SELECT') AND has_function_privilege('map_api_ro','moon.sun_at(text,timestamptz)','EXECUTE')"
                  " AND NOT has_table_privilege('map_api_ro','moon.site','INSERT')"))
    check("SRIDs 910001/910002 registered", one("SELECT count(*) FROM spatial_ref_sys WHERE srid IN (910001,910002)") == 2)

    print("\nALL CHECKS PASSED" if not fails else f"\n{len(fails)} CHECK(S) FAILED: {fails}")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
