"""Command line: python -m gds2glb designs/spm/spm.gds designs/spm/spm.glb"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

from gds2glb.export import convert
from gds2glb.merge import DEFAULT_Z_GAP

REPO = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser(prog="gds2glb", description="Convert a GDS layout to a per-layer .glb")
    parser.add_argument("gds", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--layermap", type=Path, default=REPO / "layermap.json")
    parser.add_argument("--top", help="top cell name, if the file has more than one")
    parser.add_argument("--no-union", action="store_true", help="keep overlapping polygons separate")
    parser.add_argument("--z-gap", type=float, default=DEFAULT_Z_GAP, help="µm shaved off each layer")
    args = parser.parse_args()

    start = time.perf_counter()
    stats, size = convert(args.gds, args.layermap, args.out, top=args.top,
                          union=not args.no_union, z_gap=args.z_gap)
    seconds = time.perf_counter() - start

    print(f"{'layer':8} {'polygons':>9} {'merged':>8} {'triangles':>10} {'vertices':>9}")
    for s in stats:
        print(f"{s.name:8} {s.polygons_in:9} {s.polygons_merged:8} {s.triangles:10} {s.vertices:9}")
    print(f"{'total':8} {sum(s.polygons_in for s in stats):9} {sum(s.polygons_merged for s in stats):8} "
          f"{sum(s.triangles for s in stats):10} {sum(s.vertices for s in stats):9}")
    print(f"wrote {args.out} ({size / 1e6:.1f} MB) in {seconds:.1f} s")


if __name__ == "__main__":
    main()
