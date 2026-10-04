"""Offline diagnostics, not an accuracy calibration or replacement artifact.

Usage: python compare-ticket10-boundaries.py GB_NORMALIZED SOI_NORMALIZED SOI_STATE_SHP OUTPUT_JSON
Requires pyshp 2.3.1, Shapely 2.0.7 and pyproj 3.6.1 (existing local inspection venv).
Outputs numerical diagnostics only; never modifies, repairs or exports source geometry.
"""
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

import shapefile
import shapely
import pyproj
from pyproj import CRS, Transformer
from shapely.geometry import LineString, Polygon, shape
from shapely.ops import transform


def pinned(path, expected):
    raw = Path(path).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == expected, f"Unexpected source: {path}"
    return raw


gb_hash = "71ed889b914ce89fb134533c8c9f209dfbbc46f403db10744cca530906f7667d"
soi_hash = "a806c513d628cc7643ad6259f69d142913931c94c5866c66d0c05d11017e269f"
gb_file, soi_file, shp_file, output = sys.argv[1:]
gb, soi = [shape(json.loads(pinned(p, h))) for p, h in [(gb_file, gb_hash), (soi_file, soi_hash)]]
assert gb.is_valid and soi.is_valid
assert len(gb.geoms) == 3 and len(soi.geoms) == 93
assert sum(len(p.interiors) for p in gb.geoms) == 0
assert sum(len(p.interiors) for p in soi.geoms) == 2
assert Polygon(soi.geoms[92].interiors[0]).contains(
    LineString([(74.2833, 15.80946), (74.2853, 15.80946)]))
crs = "+proj=laea +lat_0=19 +lon_0=77 +datum=WGS84 +units=m +no_defs"
forward = Transformer.from_crs("OGC:CRS84", crs, always_xy=True)
reverse = Transformer.from_crs(crs, "OGC:CRS84", always_xy=True)
gb_p, soi_p = [transform(forward.transform, g) for g in (gb, soi)]


def summary(polygon):
    point = polygon.representative_point()
    return {
        "areaM2": polygon.area,
        "boundsLonLat": list(transform(reverse.transform, polygon).bounds),
        "sampleLonLat": list(reverse.transform(point.x, point.y)),
        "gbContainsSample": gb_p.contains(point),
        "soiContainsSample": soi_p.contains(point),
        "gbEdgeDistanceMetresProjected": point.distance(gb_p.boundary),
        "soiEdgeDistanceMetresProjected": point.distance(soi_p.boundary),
    }


components = []
for index, polygon in enumerate(soi_p.geoms):
    overlap = polygon.intersection(gb_p).area / polygon.area
    status = "absent" if overlap == 0 else "covered" if overlap >= 1 - 1e-9 else "partial"
    components.append(dict(index=index, **summary(polygon), gbOverlapFraction=overlap, status=status))
holes = []
for index, polygon in enumerate(soi_p.geoms):
    for ring, interior in enumerate(polygon.interiors):
        hole = Polygon(interior)
        holes.append(dict(part=index, ring=ring, **summary(hole), gbOverlapFraction=hole.intersection(gb_p).area/hole.area))

# Verify the complete official layer before inspecting which state its own
# records assign to discrepancy samples. This is attribution, not adjudication.
base = Path(shp_file)
source_hashes = {
    ".shp": "602505cbaa149c3aef1701e8bc69cfbda7d8a73c2c2c4d891892bb67ba95b779",
    ".dbf": "e6afe169ff7055d02471a6ddae6536bed4c1dfb02c50765c0166ca2eb9a17ea0",
    ".shx": "c1edfa5638ec217291460d871db6ef0772b249c075ef6d4b06ae35f6bac127fc",
    ".prj": "4e0115a1711327038fc52f74a11a80ee1c399c8d84e8f0e5f54bf00b9fd20f16",
}
for suffix, digest in source_hashes.items():
    pinned(base.with_suffix(suffix), digest)
source_crs = CRS.from_wkt(base.with_suffix(".prj").read_text())
source_to_projected = Transformer.from_crs(source_crs, crs, always_xy=True)
selected = []
for record in shapefile.Reader(str(base)).iterShapeRecords():
    name = record.record.as_dict()["STATE"]
    if name in ("KARNATAKA", "DADRA & NAGAR HAVELI & DAMAN & DIU"):
        selected.append((name, transform(source_to_projected.transform, shape(record.shape.__geo_interface__))))
for item, polygon in [(holes[0], Polygon(soi_p.geoms[92].interiors[0])),
                      (holes[1], Polygon(soi_p.geoms[92].interiors[1]))]:
    item["soiOtherStateOverlapFractions"] = {name: polygon.intersection(g).area/polygon.area for name, g in selected}
gb_components = [dict(index=i, **summary(p), soiOtherStateOverlapFractions={name:p.intersection(g).area/p.area for name,g in selected})
                 for i,p in enumerate(gb_p.geoms)]
report = {
    "purpose": "Diagnostic dataset disagreement, not accuracy or legal determination",
    "versions": {"shapely": shapely.__version__, "pyproj": pyproj.__version__, "pyshp": shapefile.__version__},
    "sourceHashes": {"gbNormalized": gb_hash, "soiInspection": soi_hash, "soiLayer": source_hashes},
    "metricCrs": crs,
    "metricLimit": "Equal-area diagnostic projection. Distances are approximate, not geodesic accuracy bounds.",
    "gbAreaKm2": gb_p.area / 1e6, "soiAreaKm2": soi_p.area / 1e6,
    "soiComponentStatusCounts": dict(Counter(p["status"] for p in components)),
    "absentSoiComponentsAreaKm2": sum(p["areaM2"] for p in components if p["status"] == "absent") / 1e6,
    "soiComponents": components, "soiHoles": holes, "gbComponents": gb_components,
}
for key, difference in [("gbOnly", gb_p.difference(soi_p)), ("soiOnly", soi_p.difference(gb_p))]:
    polygons = [p for p in getattr(difference, "geoms", [difference]) if p.geom_type == "Polygon"]
    report[key] = {"areaKm2": difference.area / 1e6, "componentCount": len(polygons),
                   "largestTen": [summary(p) for p in sorted(polygons, key=lambda p: p.area, reverse=True)[:10]]}
assert report["soiComponentStatusCounts"] == {"absent": 81, "partial": 3, "covered": 9}
assert all(h["gbOverlapFraction"] > 0.999999 for h in holes)
assert all(h["soiOtherStateOverlapFractions"]["KARNATAKA"] > 0.999999 for h in holes)
assert gb_components[2]["soiOtherStateOverlapFractions"]["DADRA & NAGAR HAVELI & DAMAN & DIU"] > 0
# Do not infer full equivalence from the representative point: preserve the measured overlap.
Path(output).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({k: report[k] for k in ["soiComponentStatusCounts", "absentSoiComponentsAreaKm2"]}))
print("Pinned inputs, valid topology, exact feature counts, and cross-layer coverage assertions passed.")
