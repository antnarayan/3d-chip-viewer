"""Step 4 of the converter: build one merged mesh per layer."""

from __future__ import annotations

import gdstk
import numpy as np
import trimesh

from gds2glb.extrude import extrude_polygon
from gds2glb.layermap import Layer

# Each layer is drawn this much thinner, half off the bottom and half off the
# top (µm). Stacked layers share faces (a via's top is the metal's bottom), and
# two faces at the same depth flicker in the renderer ("z-fighting"). A 1 nm
# gap separates them; the thinnest layer, li1 at 100 nm, loses 1%.
DEFAULT_Z_GAP = 0.001

# Grid for the union, in µm. 1 nm matches the GDS database unit.
UNION_PRECISION = 1e-3


def union_polygons(polygons: list[np.ndarray]) -> list[np.ndarray]:
    """Merge overlapping and touching polygons on one layer into their outline.

    Routed wires overlap their via landing pads and each other. Left as is,
    their top faces overlap at the same height and flicker, and their inside
    walls are wasted triangles. On a design that passed DRC, shapes that touch
    on one layer are the same electrical net, so merging them is physically
    right. Holes come back GDS-style, as outlines cut in to the hole.
    """
    merged = gdstk.boolean([gdstk.Polygon(p) for p in polygons], [], "or", precision=UNION_PRECISION)
    return [p.points for p in merged]


def build_layer_mesh(
    layer: Layer,
    polygons: list[np.ndarray],
    union: bool = True,
    z_gap: float = DEFAULT_Z_GAP,
) -> trimesh.Trimesh:
    """Extrude every polygon on a layer and merge them into one mesh.

    Corners shared between triangles are welded into single vertices. That
    leaves no per-vertex normal to describe a sharp edge, so the exporter
    writes no normals at all: glTF viewers must then shade each triangle flat,
    which is exactly the look we want and keeps the file small.
    """
    if z_gap >= layer.thickness:
        raise ValueError(f"{layer.name}: z_gap {z_gap} must be smaller than thickness {layer.thickness}")
    if union:
        polygons = union_polygons(polygons)

    z, thickness = layer.z + z_gap / 2, layer.thickness - z_gap
    parts = [extrude_polygon(p, z, thickness) for p in polygons]

    # Concatenate in one go: each part's face indices shift by the number of
    # vertices that come before it.
    sizes = np.array([len(vertices) for vertices, _ in parts])
    offsets = np.concatenate([[0], np.cumsum(sizes)[:-1]])
    vertices = np.concatenate([v for v, _ in parts])
    faces = np.concatenate([f + offset for (_, f), offset in zip(parts, offsets)])

    mesh = trimesh.Trimesh(vertices, faces, process=False)  # process=True would reorder and drop faces
    mesh.merge_vertices()
    return mesh
