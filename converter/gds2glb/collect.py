"""Step 2 of the converter: sort flat polygons into named physical layers."""

from __future__ import annotations

import numpy as np

from gds2glb.layermap import Layer, LayerMap
from gds2glb.load import FlatLayout


def collect_layers(flat: FlatLayout, layermap: LayerMap) -> dict[Layer, list[np.ndarray]]:
    """Group polygons by physical layer, in stack order (bottom first).

    Marker layers listed under "ignore" in the layer map are dropped. A GDS
    layer the map doesn't mention is an error, not a silent skip: it means the
    map is incomplete and the 3D model would be missing material. Layers with
    no polygons in this design are left out.
    """
    unknown = sorted(set(flat.polygons) - set(layermap.by_gds()) - layermap.ignored)
    if unknown:
        raise ValueError(f"GDS layers not in the layer map (add them to layers or ignore): {unknown}")

    return {
        layer: flat.polygons[layer.gds]
        for layer in layermap.layers
        if layer.gds in flat.polygons
    }
