from math import pi
from pathlib import Path

import gdstk
import numpy as np
import pytest

from conftest import SPM_GDS, needs_spm
from gds2glb.load import load_flat

MET1 = (68, 20)
MET2 = (69, 20)


def bbox(points: np.ndarray) -> tuple[float, float, float, float]:
    (x0, y0), (x1, y1) = points.min(axis=0), points.max(axis=0)
    return float(x0), float(y0), float(x1), float(y1)


def write(tmp_path: Path, lib: gdstk.Library) -> Path:
    path = tmp_path / "test.gds"
    lib.write_gds(str(path))
    return path


@pytest.fixture
def hierarchy_gds(tmp_path: Path) -> Path:
    """A 1×1 µm met1 square in a child cell, placed 1 + 1 + 6 times, plus a met2 path and a label."""
    lib = gdstk.Library(unit=1e-6, precision=1e-9)
    square = lib.new_cell("SQUARE")
    square.add(gdstk.rectangle((0, 0), (1, 1), layer=68, datatype=20))

    top = lib.new_cell("TOP")
    top.add(gdstk.Reference(square, origin=(0, 0)))
    top.add(gdstk.Reference(square, origin=(10, 0), rotation=pi / 2))
    top.add(gdstk.Reference(square, origin=(20, 0), columns=3, rows=2, spacing=(2, 2)))
    top.add(gdstk.FlexPath([(0, 5), (5, 5)], 0.2, layer=69, datatype=20))
    top.add(gdstk.Label("VDD", (0.5, 0.5), layer=68, texttype=5))
    return write(tmp_path, lib)


def test_flattens_references_and_arrays(hierarchy_gds: Path):
    flat = load_flat(hierarchy_gds)
    assert flat.top == "TOP"
    # 1 plain reference + 1 rotated reference + a 3×2 array = 8 squares
    assert flat.counts()[MET1] == 8


def test_places_each_copy_at_its_final_position(hierarchy_gds: Path):
    boxes = sorted(bbox(p) for p in load_flat(hierarchy_gds).polygons[MET1])
    # Rotating the square 90° about its origin puts it at x ∈ [-1, 0], then it moves to x = 10.
    assert boxes[0] == pytest.approx((0, 0, 1, 1))
    assert boxes[-1] == pytest.approx((24, 2, 25, 3))  # last array element: column 2, row 1
    assert (9, 0, 10, 1) in [tuple(round(v, 6) for v in b) for b in boxes]


def test_paths_become_polygons(hierarchy_gds: Path):
    (path_poly,) = load_flat(hierarchy_gds).polygons[MET2]
    # A 0.2 µm wide path from (0, 5) to (5, 5) with flush ends is a 5 × 0.2 rectangle.
    assert bbox(path_poly) == pytest.approx((0, 4.9, 5, 5.1))


def test_labels_are_dropped(hierarchy_gds: Path):
    assert (68, 5) not in load_flat(hierarchy_gds).polygons


def test_converts_database_units_to_microns(tmp_path: Path):
    lib = gdstk.Library(unit=1e-9, precision=1e-9)  # user unit = 1 nm
    lib.new_cell("TOP").add(gdstk.rectangle((0, 0), (1000, 1000), layer=68, datatype=20))
    (square,) = load_flat(write(tmp_path, lib)).polygons[MET1]
    assert bbox(square) == pytest.approx((0, 0, 1, 1))


def test_multiple_top_cells_need_a_name(tmp_path: Path):
    lib = gdstk.Library()
    lib.new_cell("A").add(gdstk.rectangle((0, 0), (1, 1), layer=68, datatype=20))
    lib.new_cell("B").add(gdstk.rectangle((0, 0), (2, 2), layer=68, datatype=20))
    path = write(tmp_path, lib)

    with pytest.raises(ValueError, match="expected one top-level cell"):
        load_flat(path)
    assert load_flat(path, top="B").top == "B"
    with pytest.raises(ValueError, match="no cell named"):
        load_flat(path, top="C")


@needs_spm
def test_spm_matches_klayout(spm_klayout_counts):
    flat = load_flat(SPM_GDS)
    assert flat.top == "spm"
    assert flat.counts() == spm_klayout_counts

    allpoints = np.concatenate([p for polys in flat.polygons.values() for p in polys])
    assert bbox(allpoints) == pytest.approx((0, 0, 96.6, 107.32))  # die size from LibreLane
