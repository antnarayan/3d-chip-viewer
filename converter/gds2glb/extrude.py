"""Step 3 of the converter: turn one 2D polygon into a closed 3D prism."""

from __future__ import annotations

import mapbox_earcut as earcut
import numpy as np


def signed_area(points: np.ndarray) -> float:
    """Shoelace formula. Positive when the points run counter-clockwise."""
    x, y = points[:, 0], points[:, 1]
    return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(np.roll(x, -1), y))


def clean_ring(points: np.ndarray) -> np.ndarray:
    """Drop repeated consecutive points (including a closing copy of the first)."""
    keep = np.any(points != np.roll(points, 1, axis=0), axis=1)
    return points[keep]


def extrude_polygon(points: np.ndarray, z: float, thickness: float) -> tuple[np.ndarray, np.ndarray]:
    """Extrude a polygon from z to z + thickness.

    Returns (vertices, faces): vertices is (V, 3) float, faces is (F, 3) int,
    with every triangle wound counter-clockwise seen from outside, so normals
    point out of the solid.

    The top and bottom caps come from earcut, which splits any simple polygon
    (convex or not) into at most n - 2 triangles. GDS stores a shape with a hole as one
    outline that cuts in to the hole and back out along the same line; earcut
    handles that too. Each side wall is a quad (two triangles) per edge.

    Every wall quad gets its own four vertices instead of sharing corners with
    its neighbours and the caps. That costs more vertices, but it keeps each
    face's normal its own, so edges render sharp instead of smoothed over.
    """
    ring = clean_ring(np.asarray(points, dtype=np.float64))
    if len(ring) < 3:
        raise ValueError(f"polygon needs at least 3 distinct points, got {len(ring)}")
    area = signed_area(ring)
    if area == 0:
        raise ValueError("polygon has zero area")
    if area < 0:
        ring = ring[::-1]  # make it counter-clockwise so 'outside' is to the right of each edge

    n = len(ring)
    z0, z1 = z, z + thickness

    cap = earcut.triangulate_float64(ring, np.array([n], dtype=np.uint32)).reshape(-1, 3)
    a, b, c = ring[cap[:, 0]], ring[cap[:, 1]], ring[cap[:, 2]]
    tri_area = 0.5 * ((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0]))
    cap[tri_area < 0] = cap[tri_area < 0][:, ::-1]  # earcut doesn't promise a winding; make all CCW
    # Earcut can fail quietly on a bad polygon (e.g. self-crossing) and cover only part of it.
    if not np.isclose(np.abs(tri_area).sum(), area if area > 0 else -area, rtol=1e-9, atol=1e-12):
        raise ValueError(f"triangulation covers {np.abs(tri_area).sum()} of area {abs(area)}")

    bottom = np.column_stack([ring, np.full(n, z0)])
    top = np.column_stack([ring, np.full(n, z1)])

    # Walls: for edge i -> i+1 the quad corners are b_i, b_i+1, t_i+1, t_i.
    nxt = np.roll(np.arange(n), -1)
    quads = np.stack([bottom, bottom[nxt], top[nxt], top], axis=1).reshape(-1, 3)

    vertices = np.concatenate([bottom, top, quads])
    base = 2 * n + 4 * np.arange(n)[:, None]
    walls = np.concatenate([base + [0, 1, 2], base + [0, 2, 3]])
    faces = np.concatenate([
        cap[:, ::-1],  # bottom cap faces down: reverse the winding
        cap + n,       # top cap faces up
        walls,
    ])
    return vertices, faces.astype(np.int64)
