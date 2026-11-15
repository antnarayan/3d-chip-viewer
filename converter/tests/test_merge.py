import numpy as np
import pytest

from gds2glb.extrude import signed_area
from gds2glb.layermap import Layer
from gds2glb.merge import build_layer_mesh, union_polygons

MET1 = Layer(name="met1", gds=(68, 20), kind="metal", z=1.3761, thickness=0.36, color="#0000ff")


def square(x0, y0, size=1.0):
    return np.array([[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size]], dtype=float)


def test_union_merges_overlapping_squares():
    (merged,) = union_polygons([square(0, 0, 2), square(1, 1, 2)])
    assert len(merged) == 8  # one outline with 8 corners, area 4 + 4 - 1
    assert abs(signed_area(merged)) == pytest.approx(7)


def test_union_merges_touching_but_keeps_separate_apart():
    assert len(union_polygons([square(0, 0), square(1, 0)])) == 1  # share an edge
    assert len(union_polygons([square(0, 0), square(5, 0)])) == 2


def test_union_keeps_holes_as_keyholes():
    bars = [
        np.array([[0, 0], [3, 0], [3, 1], [0, 1]], dtype=float),
        np.array([[0, 2], [3, 2], [3, 3], [0, 3]], dtype=float),
        np.array([[0, 0], [1, 0], [1, 3], [0, 3]], dtype=float),
        np.array([[2, 0], [3, 0], [3, 3], [2, 3]], dtype=float),
    ]
    merged = union_polygons(bars)
    area = sum(abs(signed_area(p)) for p in merged)
    assert area == pytest.approx(9 - 1)  # a 3×3 frame around a 1×1 hole


def test_single_square_welds_to_8_vertices():
    mesh = build_layer_mesh(MET1, [square(0, 0)])
    assert len(mesh.faces) == 12
    assert len(mesh.vertices) == 8  # the 24 per-face corners from extrude, welded


def test_z_gap_shaves_both_ends():
    mesh = build_layer_mesh(MET1, [square(0, 0)], z_gap=0.002)
    assert mesh.bounds[:, 2] == pytest.approx([1.3771, 1.7351])
    assert build_layer_mesh(MET1, [square(0, 0)], z_gap=0).bounds[:, 2] == pytest.approx([1.3761, 1.7361])


def test_z_gap_must_be_thinner_than_the_layer():
    with pytest.raises(ValueError, match="z_gap"):
        build_layer_mesh(MET1, [square(0, 0)], z_gap=0.36)


def test_overlap_volume_counted_once_with_union():
    polys = [square(0, 0, 2), square(1, 1, 2)]
    t = MET1.thickness
    unioned = build_layer_mesh(MET1, polys, z_gap=0)
    separate = build_layer_mesh(MET1, polys, union=False, z_gap=0)
    assert unioned.volume == pytest.approx(7 * t)
    assert separate.volume == pytest.approx(8 * t)
    assert unioned.is_watertight


def test_separate_solids_merge_into_one_mesh():
    mesh = build_layer_mesh(MET1, [square(0, 0), square(5, 0), square(10, 0)])
    assert len(mesh.faces) == 36
    assert len(mesh.vertices) == 24  # 3 × 8: nothing welded across separate squares
    assert sorted({round(x) for x in mesh.vertices[:, 0]}) == [0, 1, 5, 6, 10, 11]
