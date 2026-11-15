"""GDSII → glTF converter for chip layouts."""

from gds2glb.collect import collect_layers
from gds2glb.export import convert, export_glb
from gds2glb.extrude import extrude_polygon
from gds2glb.layermap import Layer, LayerMap, load_layermap
from gds2glb.load import FlatLayout, load_flat
from gds2glb.merge import build_layer_mesh, union_polygons

__all__ = [
    "FlatLayout", "Layer", "LayerMap", "build_layer_mesh", "collect_layers", "convert",
    "export_glb", "extrude_polygon", "load_flat", "load_layermap", "union_polygons",
]
