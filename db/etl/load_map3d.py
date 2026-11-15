"""Load the 3D Moon map data into PostgreSQL/PostGIS (idempotent: safe to re-run).

Reads the SAME source files as apps/web/scripts/mapa-3d/construir-mapa.py and reuses its encoding helpers, so the
terrain.asset bytes decode to exactly what the viewer embeds today. English content only (Spanish `es` fields dropped).

Usage:  python db/etl/load_map3d.py
"""
import hashlib
import json
import struct
import sys
import time
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from dbconfig import REPO, connect  # noqa: E402

SCRIPTS = REPO / "apps" / "web" / "scripts" / "mapa-3d"
DATOS = REPO / "luna-recursos" / "datos"
R = 1737400.0
TILE = 256

class gen:  # noqa: N801  -- encoding helpers copied verbatim from construir-mapa.py (as of the commit that embedded DATOS)
    @staticmethod
    def delta_filas(a: np.ndarray) -> np.ndarray:
        """Row-wise differences (int16): smooth relief compresses far better."""
        a = a.astype(np.int32)
        d = np.empty_like(a)
        d[:, 0] = a[:, 0]
        d[:, 1:] = a[:, 1:] - a[:, :-1]
        assert d.min() >= -32768 and d.max() <= 32767
        return d.astype("<i2")

    @staticmethod
    def box(a: np.ndarray, k: int) -> np.ndarray:
        """k x k moving average (k odd) with cumulative sums; edges replicated."""
        p = k // 2
        b = np.pad(a.astype(np.float64), p, mode="edge")
        c = b.cumsum(0).cumsum(1)
        c = np.pad(c, ((1, 0), (1, 0)))
        s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
        return s / (k * k)

    @staticmethod
    def bilineal(g: np.ndarray, paso: float, x0: float, y0: float, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        n = g.shape[0]
        c = np.clip((x - x0) / paso, 0, n - 1.000001)
        f = np.clip((y0 - y) / paso, 0, n - 1.000001)
        c0 = np.floor(c).astype(int)
        f0 = np.floor(f).astype(int)
        tc = c - c0
        tf = f - f0
        return (g[f0, c0] * (1 - tc) + g[f0, c0 + 1] * tc) * (1 - tf) + (g[f0 + 1, c0] * (1 - tc) + g[f0 + 1, c0 + 1] * tc) * tf


HZ = {"cand-connecting-ridge": "connecting-ridge", "cand-shackleton-rim": "shackleton-rim", "cand-peak-shackleton": "peak-near-shackleton",
      "cand-de-gerlache": "de-gerlache-rim", "cand-haworth": "haworth", "cand-malapert": "malapert-massif", "cand-nobile-1": "nobile-rim-1",
      "cand-nobile-2": "nobile-rim-2", "cand-leibnitz-beta": "leibnitz-beta", "cand-shoemaker": "shoemaker"}

COUNTRIES = {"US": "United States", "EU": "European Union", "SU": "Soviet Union", "CN": "China", "IN": "India",
             "JP": "Japan", "RU": "Russia", "IL": "Israel"}
AGENCY_NAME = {"URSS": "USSR"}
CATEGORY_LABELS = {  # code: (label, singular, sort_order) -- English labels of the viewer
    "tripulada": ("Crewed", "Crewed landing", 0), "robotica": ("Robotic", "Robotic landing", 1),
    "muestras": ("Sample return", "Sample return", 2), "rover": ("Rovers", "Rover (final position)", 3),
    "candidata": ("South-pole candidates", "Candidate site (south pole)", 4), "impacto": ("Impacts & failed", "Impact or failed attempt", 5)}
# English category codes are used in the database.
CATEGORY_CODE = {"tripulada": "crewed", "robotica": "robotic", "muestras": "sample_return", "rover": "rover",
                 "candidata": "candidate", "impacto": "impact"}
FEATURE_TYPES = {"AA": "Crater", "SF": "Satellite feature (lettered crater)", "MO": "Mons / Montes", "LC": "Lacus",
                 "LF": "Astronaut-named feature", "ME": "Mare", "PA": "Palus", "OC": "Oceanus", "SI": "Sinus"}
REGION_EN = {  # the only Spanish region names in sitios.json
    "Alto polar sur": "South polar highlands", "Alto polar sur (Manzinus–Simpelius)": "South polar highlands (Manzinus–Simpelius)",
    "Apollonius (tierras altas)": "Apollonius (highlands)", "Cabeus (sombra permanente)": "Cabeus (permanent shadow)",
    "Cerca de Shoemaker": "Near Shoemaker", "Cuenca Apollo (cara oculta)": "Apollo Basin (far side)",
    "Sundman V (cara oculta)": "Sundman V (far side)", "Von Kármán (cara oculta)": "Von Kármán (far side)",
    "Tycho (borde norte)": "Tycho (north rim)"}
SOURCES = [  # key, citation, url
    ("lola_ldem4", "LRO LOLA LDEM_4 global elevation (4 px/deg), NASA PDS Geosciences Node", "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/"),
    ("lola_ldam4", "LRO LOLA LDAM_4 global albedo at 1064 nm (4 px/deg), NASA PDS Geosciences Node", "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/"),
    ("lola_ldem16", "LRO LOLA LDEM_16 (16 px/deg, 1.9 km) slopes used to shade the globe, NASA PDS Geosciences Node", "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/"),
    ("lola_ldem75s", "LRO LOLA LDEM_75S_240M south polar elevation (240 m, and 960 m block averages), NASA PDS Geosciences Node",
     "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/float_img/ldem_75s_240m_float.img"),
    ("pgda_5m_horizons", "PGDA 5 m LOLA DTMs up to 4 km + LDEM_75S up to 150 km; Barker et al. (2021), Planet. Space Sci. 203, 105119", "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/"),
    ("jpl_horizons_de441", "NASA/JPL Horizons On-Line Ephemeris System (J. D. Giorgini and the JPL Solar System Dynamics Group), DE441", "https://ssd.jpl.nasa.gov/api/horizons.api"),
    ("nssdca_landings", "NASA NSSDCA, \"Lunar Artifact Impacts and Landings\" (D. R. Williams)", "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html"),
    ("pgda_barker2021", "PGDA, High-Resolution LOLA Topography for Lunar South Pole Sites (Barker et al. 2021)", "https://pgda.gsfc.nasa.gov/products/78"),
    ("lroc_nac", "LROC NAC mosaics (region centres of Artemis III candidates)", "https://data.lroc.im-ldi.com"),
    ("iau_gazetteer", "IAU/USGS Gazetteer of Planetary Nomenclature, Moon nomenclature center points", "https://planetarynames.wr.usgs.gov/"),
    ("nasa_blue_marble", "NASA Blue Marble (SVS 2915), reduced to 1024 x 512", "https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png"),
]
PROVENANCE = {
    "sites.main": "NASA NSSDCA, \"Lunar Artifact Impacts and Landings\" (D. R. Williams), https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html, updated 2025-08-13, retrieved 2026-11-14. Coordinates in the DE421 frame, east longitude positive (0-360). Dates in UTC.",
    "sites.polar": "PGDA, High-Resolution LOLA Topography for Lunar South Pole Sites (Barker et al. 2021, Planet. Space Sci. 203, 105119): centres of the 5 m DTM mosaics, via catalogo-polo.json (retrieved 2026-11-07).",
    "sites.artemis": "NASA, 9 candidate regions for Artemis III (announced 2024-10-28). NASA does not publish a centre per region: the centre of the region's LROC NAC mosaic (data.lroc.im-ldi.com) or of the PGDA DTM is used, and flagged as approximate.",
    "sites.status_2026": "No lunar landings in 2026 as of 2026-11-14: Chang'e 7 was postponed in August 2026 on the launch pad; Blue Moon MK1 and IM-3 moved to 2027 (press reports, see References).",
    "pole_dem.method": "Heights in whole metres above the 1737.4 km sphere. 'near': the 240 m pixels as they are; 'far': 4 x 4 block averages (960 m). South polar stereographic with scale 1 at the pole: x = rho*sin(lon), y = rho*cos(lon), rho = 2R*tan(c/2). Source: LOLA LDEM_75S_240M_FLOAT (LRO LOLA GDR polar, PDS Geosciences Node), retrieved 2026-11-07.",
    "iau.filter": "IAU/USGS Gazetteer of Planetary Nomenclature, Moon nomenclature center points (shapefile), retrieved 2026-11-14. Only approved (Adopted by IAU) names of type AA (crater), SF (satellite crater), LF (astronaut-named), ME, OC, LC, SI, PA and MO. East longitude 0-360. Origin truncated to 180 characters.",
    "eph.notes": "Target: the Moon (301). Observer: the Sun centre (500@10) for the subsolar point and the Earth centre (500@399) for the sub-Earth point. Quantity 14: apparent sub-observer longitude and latitude in MOON_ME (east positive); quantity 20: range; quantity 21: light time. Each row was taken at t minus the light time (the Moon at the instant its light arrives) and resampled every 3 h. Retrieved 2026-11-07.",
    "horizon.method": "Great-circle ray marching every 0.5 deg of azimuth (5 m steps up to 4000 m, 240 m steps up to 30 km, 960 m steps up to 150 km), exact sphere R = 1737.4 km, upper convex envelope per azimuth; elevation of the skyline at ground level. Barker et al. (2021), retrieved 2026-11-07.",
}


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def image_size(path: Path):
    from PIL import Image
    with Image.open(path) as im:
        return im.size


def fuentes_en() -> list:
    """The English data-sources list FUENTES.en from mapa.src.html (parsed, not retyped)."""
    txt = (SCRIPTS / "mapa.src.html").read_text(encoding="utf8")
    block = txt[txt.index("const FUENTES"):]
    block = block[block.index("en: ["):]
    block = block[len("en: ["):block.index("\n  ],")]
    out = []
    for line in block.splitlines():
        line = line.strip().rstrip(",")
        if line:
            out.append(line[1:-1].replace("\\'", "'"))
    return out


# ---------------------------------------------------------------- raster WKB
PIXTYPE = {"int16": (5, "<i2"), "float32": (10, "<f4")}


def raster_wkb(arr: np.ndarray, kind: str, ulx: float, uly: float, sx: float, sy: float, srid: int, nodata) -> bytes:
    code, dt = PIXTYPE[kind]
    h, w = arr.shape
    head = struct.pack("<BHHddddddiHH", 1, 0, 1, sx, sy, ulx, uly, 0.0, 0.0, srid, w, h)
    band = struct.pack("<B", code | 0x40) + np.array([nodata], dtype=dt).tobytes() + np.ascontiguousarray(arr, dtype=dt).tobytes()
    return head + band


def tiles(arr: np.ndarray, kind: str, ulx: float, uly: float, sx: float, sy: float, srid: int, nodata):
    """sy is negative (north-up). Tiles are up to 256 x 256 (edge tiles are smaller, not padded)."""
    for r0 in range(0, arr.shape[0], TILE):
        for c0 in range(0, arr.shape[1], TILE):
            part = arr[r0:r0 + TILE, c0:c0 + TILE]
            yield raster_wkb(part, kind, ulx + c0 * sx, uly + r0 * sy, sx, sy, srid, nodata)


def main() -> None:
    t0 = time.time()
    # ------------------------------------------------ source data (same reads/encodings as construir-mapa.py)
    ldem = np.fromfile(DATOS / "luna-ldem4.f16", dtype="<f2").astype(np.float32).reshape(720, 1440)
    ldam = np.fromfile(DATOS / "luna-ldam4.f16", dtype="<f2").astype(np.float32).reshape(720, 1440)
    g_h = np.round(ldem * 1000).astype(np.int32)
    g_a = np.clip(np.round((ldam - 0.10) / 0.50 * 255), 0, 255).astype(np.uint8)
    assert g_h.min() >= -32768 and g_h.max() <= 32767

    meta = json.loads((DATOS / "dem-polo.json").read_text(encoding="utf8"))
    mc, ml = meta["cerca"], meta["lejos"]
    cerca_i16 = np.fromfile(DATOS / mc["archivo"], dtype="<i2").reshape(mc["n"], mc["n"])
    lejos_i16 = np.fromfile(DATOS / ml["archivo"], dtype="<i2").reshape(ml["n"], ml["n"])
    cerca, lejos = cerca_i16.astype(np.float64), lejos_i16.astype(np.float64)
    N, EXT = 1024, 339_000.0
    paso = 2 * EXT / (N - 1)
    xs = -EXT + np.arange(N) * paso
    ys = EXT - np.arange(N) * paso
    X, Y = np.meshgrid(xs, ys)
    h_cerca = gen.bilineal(gen.box(cerca, 3), mc["pasoM"], mc["x0M"], mc["y0M"], X, Y)
    h_lejos = gen.bilineal(lejos, ml["pasoM"], ml["x0M"], ml["y0M"], X, Y)
    borde = mc["pasoM"] * (mc["n"] - 1) / 2
    w = np.clip((borde - np.maximum(np.abs(X), np.abs(Y))) / 8000.0, 0, 1)
    p_h = np.round(h_cerca * w + h_lejos * (1 - w)).astype(np.int32)

    em = json.loads((DATOS / "efemerides-luna.json").read_text(encoding="utf8"))
    tabla = np.fromfile(DATOS / em["archivo"], dtype="<f4").reshape(em["filas"], 8)
    q = np.round(tabla[:, [0, 1, 2, 4, 5, 6]] * 32767).astype(np.int16)
    eph_q = np.empty_like(q, dtype=np.int32)
    eph_q[0] = q[0]
    eph_q[1:] = q[1:].astype(np.int32) - q[:-1].astype(np.int32)

    sitios = json.loads((SCRIPTS / "sitios.json").read_text(encoding="utf8"))
    horizons = {}
    for sid, arch in HZ.items():
        h = json.loads((DATOS / f"horizonte-catalogo-{arch}.json").read_text(encoding="utf8"))
        assert h["pasoAzimutGrados"] == 0.5 and len(h["elevacionGrados"]) == 720, arch
        horizons[sid] = (arch, h, [round(v, 2) for v in h["elevacionGrados"]])

    # polar sites: elevation and slope from the original 240 m grid (identical computation to the generator)
    for st in sitios["sitios"]:
        rho = 2 * R * np.tan(np.radians(90 + st["lat"]) / 2)
        if st["lat"] > -75 or rho > borde - 1000:
            continue
        x, y = rho * np.sin(np.radians(st["lon"])), rho * np.cos(np.radians(st["lon"]))
        k = 1 / np.cos(np.arctan(rho / (2 * R))) ** 2
        b = lambda xx, yy: float(gen.bilineal(cerca, mc["pasoM"], mc["x0M"], mc["y0M"], np.array(xx), np.array(yy)))
        d = mc["pasoM"]
        gx = (b(x + d, y) - b(x - d, y)) / (2 * d / k)
        gy = (b(x, y + d) - b(x, y - d)) / (2 * d / k)
        st["h240"] = round(b(x, y))
        st["pend240"] = round(float(np.degrees(np.arctan(np.hypot(gx, gy)))), 1)

    iau = json.loads((SCRIPTS / "iau-nombres.json").read_text(encoding="utf8"))["nombres"]
    print(f"sources read in {time.time() - t0:.1f}s", flush=True)

    # ------------------------------------------------ assets (byte-exact viewer encodings)
    g16_bytes = (SCRIPTS / "gradiente16.webp").read_bytes()
    earth_bytes = (SCRIPTS / "tierra-bluemarble.jpg").read_bytes()
    assets = {  # dataset key -> (format, encoding, bytes)
        "global_elevation": ("zlib", "zlib level 9 of int16-LE row-delta, metres above R=1737.4 km; 1440x720, row 0 = 90N, col 0 = 0E",
                             zlib.compress(gen.delta_filas(g_h).tobytes(), 9)),
        "global_albedo": ("zlib", "zlib level 9 of uint8; reflectance = 0.10 + v/255*0.50; 1440x720",
                          zlib.compress(g_a.tobytes(), 9)),
        "pole_elevation_663": ("zlib", "zlib level 9 of int16-LE row-delta, metres; 1024x1024 south polar stereographic, +-339 km",
                               zlib.compress(gen.delta_filas(p_h).tobytes(), 9)),
        "pole_elevation_240": ("zlib", "zlib level 9 of int16-LE row-delta, metres; 1626x1626, 240 m, x0=-195000 y0=195000",
                               zlib.compress(gen.delta_filas(cerca.astype(np.int32)).tobytes(), 9)),
        "ephemeris_de441": ("zlib", "zlib level 9 of int16-LE time-delta (round(v*32767)); columns sunX,sunY,sunZ,earthX,earthY,earthZ; 14609 rows",
                            zlib.compress(eph_q.astype("<i2").tobytes(), 9)),
        "gradient16": ("webp", "raw WebP image (LOLA LDEM_16 gradient)", g16_bytes),
        "earth_texture": ("jpeg", "raw JPEG image (Blue Marble 1024x512)", earth_bytes),
    }

    g16_w, g16_h = image_size(SCRIPTS / "gradiente16.webp")
    e_w, e_h = image_size(SCRIPTS / "tierra-bluemarble.jpg")
    deg_m = 2 * np.pi * R / 360.0
    datasets = [  # key, source, description, resolution_m, srid, width, height, meta
        ("global_elevation", "lola_ldem4", "Global elevation, int16 metres above the 1737.4 km sphere", deg_m / 4, 910001, 1440, 720,
         {"registration": "pixel-is-area", "ul_lon": -180, "ul_lat": 90, "pixel_deg": 0.25, "unit": "m"}),
        ("global_albedo", "lola_ldam4", "Global albedo at 1064 nm (reflectance, float32)", deg_m / 4, 910001, 1440, 720,
         {"registration": "pixel-is-area", "ul_lon": -180, "ul_lat": 90, "pixel_deg": 0.25, "unit": "reflectance",
          "viewer_uint8": {"min": 0.10, "range": 0.50}}),
        ("pole_elevation_663", "lola_ldem75s", "South pole elevation, 240 m + 960 m blended and resampled to ~663 m (int16 metres)", paso, 910002, N, N,
         {"extent_m": EXT, "pixel_m": paso, "grid_point": "pixel centre", "first_centre_xy": [-EXT, EXT], "unit": "m"}),
        ("pole_elevation_240", "lola_ldem75s", "South pole elevation at 240 m, original grid (int16 metres)", float(mc["pasoM"]), 910002, mc["n"], mc["n"],
         {"pixel_m": mc["pasoM"], "grid_point": "pixel centre", "first_centre_xy": [mc["x0M"], mc["y0M"]], "unit": "m"}),
        ("pole_elevation_960", "lola_ldem75s", "South pole elevation at 960 m (4x4 block averages, int16 metres)", float(ml["pasoM"]), 910002, ml["n"], ml["n"],
         {"pixel_m": ml["pasoM"], "grid_point": "pixel centre", "first_centre_xy": [ml["x0M"], ml["y0M"]], "unit": "m"}),
        ("gradient16", "lola_ldem16", "Slope gradient image from LOLA LDEM_16 (1.9 km) used to shade the globe", 1900.0, None, g16_w, g16_h, {}),
        ("earth_texture", "nasa_blue_marble", "Blue Marble Earth texture", None, None, e_w, e_h, {}),
        ("ephemeris_de441", "jpl_horizons_de441", "Sun and Earth unit vectors in MOON_ME every 3 h, 2026-2030", None, None, None, None,
         {"frame": "MOON_ME", "step_s": em["pasoS"], "rows": em["filas"], "start_utc": em["inicioUTC"], "end_utc": em["finUTC"]}),
    ]
    for sid, (arch, h, _prof) in horizons.items():
        datasets.append((f"horizon_{arch.replace('-', '_')}", "pgda_5m_horizons",
                         f"Terrain horizon profile for {arch}, 0.5 deg azimuth step, at ground level", None, None, 720, None,
                         {"az_step_deg": 0.5, "site_slug": sid, "reference": h["procedencia"].get("referencia"),
                          "retrieved_utc": h["procedencia"].get("consultadoUTC"), "ground_elevation_m": h["procedencia"].get("alturaCentroM"),
                          "source_product": h["procedencia"].get("producto")}))

    # ------------------------------------------------ database
    with connect() as conn:
        cur = conn.cursor()
        # reference tables
        for code, name in COUNTRIES.items():
            cur.execute("INSERT INTO ref.country VALUES (%s,%s) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name", (code, name))
        for code, (lab, sing, order) in CATEGORY_LABELS.items():
            cur.execute("INSERT INTO ref.site_category VALUES (%s,%s,%s,%s) ON CONFLICT (code) DO UPDATE SET label=EXCLUDED.label,"
                        " label_singular=EXCLUDED.label_singular, sort_order=EXCLUDED.sort_order", (CATEGORY_CODE[code], lab, sing, order))
        for code, name in FEATURE_TYPES.items():
            cur.execute("INSERT INTO ref.feature_type VALUES (%s,%s) ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name", (code, name))
        for key, cit, url in SOURCES:
            cur.execute("INSERT INTO ref.data_source (key,citation,url) VALUES (%s,%s,%s) ON CONFLICT (key) DO UPDATE SET"
                        " citation=EXCLUDED.citation, url=EXCLUDED.url", (key, cit, url))
        src_id = {k: i for k, i in cur.execute("SELECT key,id FROM ref.data_source")}
        notes = dict(PROVENANCE)
        for i, body in enumerate(fuentes_en(), 1):
            notes[f"sources.{i}"] = body
        for k, body in notes.items():
            cur.execute("INSERT INTO ref.provenance_note VALUES (%s,%s) ON CONFLICT (key) DO UPDATE SET body=EXCLUDED.body", (k, body))
        for key, src, desc, res, srid, wd, ht, mt in datasets:
            cur.execute("INSERT INTO ref.dataset (key,source_id,description,resolution_m,srid,width,height,meta)"
                        " VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (key) DO UPDATE SET source_id=EXCLUDED.source_id,"
                        " description=EXCLUDED.description, resolution_m=EXCLUDED.resolution_m, srid=EXCLUDED.srid,"
                        " width=EXCLUDED.width, height=EXCLUDED.height, meta=EXCLUDED.meta",
                        (key, src_id[src], desc, res, srid, wd, ht, json.dumps(mt)))
        ds_id = {k: i for k, i in cur.execute("SELECT key,id FROM ref.dataset")}

        # IAU features
        rows = []
        for nombre, lat, lon_e, diam, code, origen, gid, anio in iau:
            lon = lon_e - 360 if lon_e > 180 else lon_e
            rows.append((gid, nombre, code, diam, origen, int(anio) if str(anio).isdigit() else None, lon, lat))
        cur.executemany(
            "INSERT INTO moon.iau_feature (id,name,type_code,diameter_km,origin,approval_year,geom)"
            " VALUES (%s,%s,%s,%s,%s,%s, ST_SetSRID(ST_MakePoint(%s,%s),910001))"
            " ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, type_code=EXCLUDED.type_code, diameter_km=EXCLUDED.diameter_km,"
            " origin=EXCLUDED.origin, approval_year=EXCLUDED.approval_year, geom=EXCLUDED.geom", rows)
        print(f"iau features: {len(rows)}", flush=True)

        # agencies, sites, links
        for st in sitios["sitios"]:
            ag = AGENCY_NAME.get(st["agencia"], st["agencia"])
            cur.execute("INSERT INTO ref.agency (name,country_code) VALUES (%s,%s) ON CONFLICT (name) DO UPDATE SET"
                        " country_code=EXCLUDED.country_code", (ag, st["pais"]))
        agency_id = {n: i for n, i in cur.execute("SELECT name,id FROM ref.agency")}
        for st in sitios["sitios"]:
            src = st["src"]
            skey = "nssdca_landings" if src.startswith("NSSDCA") else "pgda_barker2021" if src.startswith("PGDA") else "lroc_nac"
            region = REGION_EN.get(st["region"], st["region"])
            lon = st["lon"] - 360 if st["lon"] > 180 else st["lon"]
            cur.execute(
                "INSERT INTO moon.site (slug,name,category_code,agency_id,event_date,geom,region_name,region_feature_id,source_id,"
                " description,is_approximate,is_artemis_candidate)"
                " VALUES (%s,%s,%s,%s,%s, ST_SetSRID(ST_MakePoint(%s,%s),910001), %s,"
                " (SELECT CASE WHEN count(*)=1 THEN min(id) END FROM moon.iau_feature WHERE name=%s), %s,%s,%s,%s)"
                " ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, category_code=EXCLUDED.category_code,"
                " agency_id=EXCLUDED.agency_id, event_date=EXCLUDED.event_date, geom=EXCLUDED.geom, region_name=EXCLUDED.region_name,"
                " region_feature_id=EXCLUDED.region_feature_id, source_id=EXCLUDED.source_id, description=EXCLUDED.description,"
                " is_approximate=EXCLUDED.is_approximate, is_artemis_candidate=EXCLUDED.is_artemis_candidate",
                (st["id"], st["nombre"], CATEGORY_CODE[st["cat"]], agency_id[AGENCY_NAME.get(st["agencia"], st["agencia"])], st["fecha"],
                 lon, st["lat"], region, region, src_id[skey], st["en"], bool(st.get("aprox")), bool(st.get("artemis"))))
        site_id = {s: i for s, i in cur.execute("SELECT slug,id FROM moon.site")}
        for st in sitios["sitios"]:
            sid = site_id[st["id"]]
            cur.execute("DELETE FROM moon.site_link WHERE site_id=%s", (sid,))
            for n, e in enumerate(st.get("enlaces", [])):
                cur.execute("INSERT INTO moon.site_link (site_id,label,url,sort_order) VALUES (%s,%s,%s,%s)", (sid, e["en"], e["url"], n))
        print(f"sites: {len(site_id)}", flush=True)

        # site terrain (240 m)
        d240 = ds_id["pole_elevation_240"]
        cur.execute("DELETE FROM moon.site_terrain WHERE dataset_id=%s", (d240,))
        n_terr = 0
        for st in sitios["sitios"]:
            if "h240" in st:
                cur.execute("INSERT INTO moon.site_terrain VALUES (%s,%s,%s,%s)", (site_id[st["id"]], d240, st["h240"], st["pend240"]))
                n_terr += 1
        print(f"site_terrain: {n_terr}", flush=True)

        # horizon profiles
        for sid, (arch, h, prof) in horizons.items():
            cur.execute("INSERT INTO moon.horizon_profile (site_id,dataset_id,az_step_deg,elevation_deg) VALUES (%s,%s,%s,%s)"
                        " ON CONFLICT (site_id,dataset_id) DO UPDATE SET az_step_deg=EXCLUDED.az_step_deg, elevation_deg=EXCLUDED.elevation_deg",
                        (site_id[sid], ds_id[f"horizon_{arch.replace('-', '_')}"], 0.5, [float(v) for v in prof]))

        # ephemeris
        for bid, name in ((1, "sun"), (2, "earth")):
            cur.execute("INSERT INTO eph.body VALUES (%s,%s) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name", (bid, name))
        start = datetime.fromisoformat(em["inicioUTC"].replace("Z", "+00:00")).astimezone(timezone.utc)
        cur.execute("SELECT id FROM eph.series WHERE frame='MOON_ME' AND start_utc=%s", (start,))
        r = cur.fetchone()
        if r:
            sid_e = r[0]
            cur.execute("UPDATE eph.series SET step_s=%s,row_count=%s,source_id=%s WHERE id=%s",
                        (em["pasoS"], em["filas"], src_id["jpl_horizons_de441"], sid_e))
            cur.execute("DELETE FROM eph.sample WHERE series_id=%s", (sid_e,))
        else:
            cur.execute("INSERT INTO eph.series (source_id,frame,step_s,start_utc,row_count) VALUES (%s,'MOON_ME',%s,%s,%s) RETURNING id",
                        (src_id["jpl_horizons_de441"], em["pasoS"], start, em["filas"]))
            sid_e = cur.fetchone()[0]
        step = timedelta(seconds=em["pasoS"])
        with cur.copy("COPY eph.sample (series_id, body_id, t, x, y, z, dist_km) FROM STDIN") as cp:
            for bid, cols, dcol in ((1, (0, 1, 2), 3), (2, (4, 5, 6), 7)):
                for i in range(em["filas"]):
                    row = tabla[i]
                    cp.write_row((sid_e, bid, start + i * step, float(row[cols[0]]), float(row[cols[1]]), float(row[cols[2]]), float(row[dcol])))
        print(f"ephemeris: {em['filas']} x 2 (series {sid_e})", flush=True)

        # rasters (tiled 256x256)
        # Global grids: columns rolled by 720 so the raster spans lon -180..180 (column 0 = 0E becomes column 720).
        glob_h = np.roll(g_h.astype(np.int16), 720, axis=1)
        glob_a = np.roll(ldam, 720, axis=1)
        raster_sets = [
            ("global_elevation", glob_h, "int16", -180.0, 90.0, 0.25, -0.25, 910001, -32768),
            ("global_albedo", glob_a, "float32", -180.0, 90.0, 0.25, -0.25, 910001, -9999.0),
            ("pole_elevation_663", p_h.astype(np.int16), "int16", -EXT - paso / 2, EXT + paso / 2, paso, -paso, 910002, -32768),
            ("pole_elevation_240", cerca_i16, "int16", mc["x0M"] - mc["pasoM"] / 2, mc["y0M"] + mc["pasoM"] / 2, float(mc["pasoM"]), -float(mc["pasoM"]), 910002, -32768),
            ("pole_elevation_960", lejos_i16, "int16", ml["x0M"] - ml["pasoM"] / 2, ml["y0M"] + ml["pasoM"] / 2, float(ml["pasoM"]), -float(ml["pasoM"]), 910002, -32768),
        ]
        t1 = time.time()
        for key, arr, kind, ulx, uly, sx, sy, srid, nodata in raster_sets:
            cur.execute("DELETE FROM terrain.raster_tile WHERE dataset_id=%s", (ds_id[key],))
            n = 0
            for wkb in tiles(arr, kind, ulx, uly, sx, sy, srid, nodata):
                cur.execute("INSERT INTO terrain.raster_tile (dataset_id, rast) VALUES (%s, ST_RastFromWKB(%s))", (ds_id[key], wkb))
                n += 1
            print(f"raster {key}: {n} tiles", flush=True)
        print(f"rasters loaded in {time.time() - t1:.1f}s", flush=True)

        # assets
        for key, (fmt, enc, content) in assets.items():
            cur.execute(
                "INSERT INTO terrain.asset (dataset_id,format,encoding,content,sha256,byte_size) VALUES (%s,%s,%s,%s,%s,%s)"
                " ON CONFLICT (dataset_id,format) DO UPDATE SET encoding=EXCLUDED.encoding, content=EXCLUDED.content,"
                " sha256=EXCLUDED.sha256, byte_size=EXCLUDED.byte_size, created_at=now()",
                (ds_id[key], fmt, enc, content, sha(content), len(content)))
        print(f"assets: {len(assets)}", flush=True)
        conn.commit()
        cur.execute("ANALYZE")
        conn.commit()
    print(f"load finished in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
