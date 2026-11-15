import numpy as np
import pytest
import trimesh

from conftest import LAYERMAP, SPM_GDS, needs_spm
from gds2glb.collect import collect_layers
from gds2glb.extrude import clean_ring, extrude_polygon, signed_area
from gds2glb.layermap import load_layermap
from gds2glb.load import load_flat

SQUARE = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=float)
L_SHAPE = np.array([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], dtype=float)  # concave, area 3
# A 3×3 square with a 1×1 hole, stored GDS-style: one outline that cuts in to the hole and back.
KEYHOLE = np.array(
    [[0, 0], [3, 0], [3, 3], [0, 3], [0, 1], [1, 1], [1, 2], [2, 2], [2, 1], [0, 1]], dtype=float
)


def mesh(points, z=1.3761, t=0.36) -> trimesh.Trimesh:
    vertices, faces = extrude_polygon(points, z, t)
    return trimesh.Trimesh(vertices, faces, process=False)


def closed(m: trimesh.Trimesh) -> trimesh.Trimesh:
    """Weld duplicate corners so trimesh can check that the surface is closed."""
    welded = m.copy()
    welded.merge_vertices()
    return welded


def test_unit_square_gives_12_triangles():
    vertices, faces = extrude_polygon(SQUARE, 1.3761, 0.36)
    # 2 bottom + 2 top + 4 walls × 2 = 12 triangles; 4 + 4 cap corners + 4 walls × 4 = 24 vertices
    assert faces.shape == (12, 3)
    assert vertices.shape == (24, 3)


def test_square_bounds_and_volume():
    m = mesh(SQUARE)
    assert m.bounds.ravel() == pytest.approx([0, 0, 1.3761, 1, 1, 1.7361])
    assert closed(m).is_watertight
    assert m.volume == pytest.approx(0.36)  # positive volume means every face points outward


def test_normals_point_out_of_each_face():
    m = mesh(SQUARE, z=0, t=1)
    normals = {tuple(np.round(n, 6)) for n in m.face_normals}
    assert normals == {(0, 0, -1), (0, 0, 1), (1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)}
    centre = np.array([0.5, 0.5, 0.5])
    assert np.all(np.einsum("ij,ij->i", m.triangles_center - centre, m.face_normals) > 0)


def test_clockwise_input_is_handled():
    m = mesh(SQUARE[::-1])
    assert m.volume == pytest.approx(0.36)
    assert closed(m).is_watertight


def test_concave_polygon():
    m = mesh(L_SHAPE, t=0.5)
    assert len(m.faces) == 4 + 4 + 6 * 2  # 6 corners → 4 triangles per cap, 6 walls
    assert closed(m).is_watertight
    assert m.volume == pytest.approx(3 * 0.5)


def test_polygon_with_hole_stored_as_keyhole():
    m = mesh(KEYHOLE, t=1.0)
    # The two walls along the cut sit back to back and cancel, so volume is the ring's area.
    assert m.volume == pytest.approx((9 - 1) * 1.0)
    assert m.bounds.ravel() == pytest.approx([0, 0, 1.3761, 3, 3, 2.3761])


def test_collinear_points_are_fine():
    square_with_midpoints = np.array([[0, 0], [0.5, 0], [1, 0], [1, 1], [0.5, 1], [0, 1]], dtype=float)
    m = mesh(square_with_midpoints)
    assert m.volume == pytest.approx(0.36)
    assert closed(m).is_watertight


def test_repeated_points_are_removed():
    closed_ring = np.vstack([SQUARE, SQUARE[:1]])
    doubled = np.repeat(SQUARE, 2, axis=0)
    assert len(clean_ring(closed_ring)) == 4
    assert len(clean_ring(doubled)) == 4
    assert extrude_polygon(closed_ring, 0, 1)[1].shape == (12, 3)


def test_signed_area_sign_follows_direction():
    assert signed_area(SQUARE) == pytest.approx(1)
    assert signed_area(SQUARE[::-1]) == pytest.approx(-1)


@pytest.mark.parametrize(
    "points, message",
    [
        (np.array([[0, 0], [1, 0]], dtype=float), "at least 3"),
        (np.array([[0, 0], [1, 0], [2, 0]], dtype=float), "zero area"),
    ],
)
def test_degenerate_polygons_raise(points, message):
    with pytest.raises(ValueError, match=message):
        extrude_polygon(points, 0, 1)


def test_self_crossing_polygon_raises():
    bowtie = np.array([[0, 0], [2, 2], [2, 0], [0, 2]], dtype=float)  # crosses itself; area cancels to 0
    lopsided = np.array([[0, 0], [3, 3], [3, 0], [0, 1]], dtype=float)  # crosses itself, nonzero area
    with pytest.raises(ValueError):
        extrude_polygon(bowtie, 0, 1)
    with pytest.raises(ValueError, match="triangulation covers"):
        extrude_polygon(lopsided, 0, 1)


def solid_volume(vertices: np.ndarray, faces: np.ndarray) -> float:
    """Volume of a closed, outward-wound mesh (divergence theorem), without building a Trimesh."""
    a, b, c = vertices[faces[:, 0]], vertices[faces[:, 1]], vertices[faces[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6)


@needs_spm
def test_every_spm_polygon_extrudes_to_area_times_thickness():
    layers = collect_layers(load_flat(SPM_GDS), load_layermap(LAYERMAP))
    for layer, polys in layers.items():
        for points in polys:
            vertices, faces = extrude_polygon(points, layer.z, layer.thickness)
            expected = abs(signed_area(points)) * layer.thickness
            assert solid_volume(vertices, faces) == pytest.approx(expected, rel=1e-6), layer.name
