"""Step 5 of the converter: write the layer meshes to a .glb file."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh
from trimesh.visual import TextureVisuals
from trimesh.visual.material import PBRMaterial

from gds2glb.collect import collect_layers
from gds2glb.layermap import Layer, load_layermap
from gds2glb.load import load_flat
from gds2glb.merge import DEFAULT_Z_GAP, build_layer_mesh, union_polygons

# Chip coordinates have z up; glTF has y up. Rotate -90° about x:
# (x, y, z) -> (x, z, -y). A rotation, not a mirror, so triangle winding
# (and with it which side faces out) is unchanged.
Z_UP_TO_Y_UP = np.array([
    [1, 0, 0, 0],
    [0, 0, 1, 0],
    [0, -1, 0, 0],
    [0, 0, 0, 1],
], dtype=float)


@dataclass(frozen=True)
class LayerStats:
    name: str
    polygons_in: int
    polygons_merged: int
    triangles: int
    vertices: int


def hex_to_rgba(color: str) -> list[int]:
    return [int(color[i:i + 2], 16) for i in (1, 3, 5)] + [255]


def export_glb(meshes: dict[Layer, trimesh.Trimesh], path: str | Path, extras: dict | None = None) -> int:
    """Write one named mesh per layer, bottom layer first. Returns the file size in bytes.

    Each mesh carries its layer's true height data in glTF "extras" (z and
    thickness from layermap.json, before the z-gap), so the viewer can show
    real numbers.
    """
    scene = trimesh.Scene()
    for layer, mesh in meshes.items():
        m = mesh.copy()
        m.apply_transform(Z_UP_TO_Y_UP)
        m.visual = TextureVisuals(material=PBRMaterial(
            name=layer.name,
            baseColorFactor=hex_to_rgba(layer.color),
            metallicFactor=0.0,
            roughnessFactor=0.7,
        ))
        m.metadata = {
            "layer": layer.name,
            "gds": list(layer.gds),
            "kind": layer.kind,
            "z_um": layer.z,
            "thickness_um": layer.thickness,
            **(extras or {}).get(layer.name, {}),
        }
        scene.add_geometry(m, geom_name=layer.name, node_name=layer.name)

    data = scene.export(file_type="glb", include_normals=False)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)  # e.g. viewer/public/models/ on a fresh clone
    path.write_bytes(data)
    return len(data)


def convert(
    gds_path: str | Path,
    layermap_path: str | Path,
    out_path: str | Path,
    top: str | None = None,
    union: bool = True,
    z_gap: float = DEFAULT_Z_GAP,
) -> tuple[list[LayerStats], int]:
    """The whole pipeline: GDS -> flat polygons -> layers -> meshes -> .glb."""
    layers = collect_layers(load_flat(gds_path, top=top), load_layermap(layermap_path))

    meshes, stats, extras = {}, [], {}
    for layer, polygons in layers.items():
        merged = union_polygons(polygons) if union else polygons
        mesh = build_layer_mesh(layer, merged, union=False, z_gap=z_gap)
        meshes[layer] = mesh
        stats.append(LayerStats(layer.name, len(polygons), len(merged), len(mesh.faces), len(mesh.vertices)))
        extras[layer.name] = {"polygons": len(polygons)}

    size = export_glb(meshes, out_path, extras)
    return stats, size
