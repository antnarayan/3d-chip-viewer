"""Step 1 of the converter: read a GDS file into flat polygons in microns."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import gdstk
import numpy as np

MICRON = 1e-6  # metres

LayerKey = tuple[int, int]  # (GDS layer, datatype), e.g. (68, 20) = met1.drawing


@dataclass(frozen=True)
class FlatLayout:
    """Every polygon under one top cell, with the cell hierarchy expanded.

    polygons maps (layer, datatype) to a list of (N, 2) float arrays, one per
    polygon, with coordinates in microns. GDS polygons have no holes: a shape
    with a hole is stored as one outline that cuts in to the hole and back.
    """

    top: str
    polygons: dict[LayerKey, list[np.ndarray]]

    def counts(self) -> dict[LayerKey, int]:
        return {key: len(polys) for key, polys in self.polygons.items()}


def load_flat(path: str | Path, top: str | None = None) -> FlatLayout:
    """Load a GDS file and flatten its top cell into polygons in microns.

    Flattening means following every cell reference (and array of references)
    down to the leaf shapes and placing each copy at its final position. Paths
    are converted to their outline polygons here, so later steps only see
    polygons. Text labels are dropped: they have no area.

    If the file has more than one top-level cell, pass its name as `top`.
    """
    lib = gdstk.read_gds(str(path))
    cell = _pick_top(lib, top)

    # gdstk returns coordinates in the file's user unit (lib.unit, in metres).
    # This is the one place we convert to microns.
    scale = lib.unit / MICRON

    polygons: dict[LayerKey, list[np.ndarray]] = defaultdict(list)
    for poly in cell.get_polygons(apply_repetitions=True, include_paths=True, depth=None):
        polygons[(poly.layer, poly.datatype)].append(poly.points * scale)

    return FlatLayout(top=cell.name, polygons=dict(polygons))


def _pick_top(lib: gdstk.Library, name: str | None) -> gdstk.Cell:
    if name is not None:
        for cell in lib.cells:
            if cell.name == name:
                return cell
        raise ValueError(f"no cell named {name!r} in the library")

    tops = lib.top_level()
    if len(tops) != 1:
        names = sorted(c.name for c in tops)
        raise ValueError(f"expected one top-level cell, found {len(tops)}: {names}; pass top=")
    return tops[0]
