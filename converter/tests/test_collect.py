import numpy as np
import pytest

from conftest import LAYERMAP, SPM_GDS, needs_spm
from gds2glb.collect import collect_layers
from gds2glb.layermap import load_layermap
from gds2glb.load import FlatLayout, load_flat

SQUARE = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=float)


@pytest.fixture(scope="module")
def layermap():
    return load_layermap(LAYERMAP)


def flat_with(*keys) -> FlatLayout:
    return FlatLayout(top="TOP", polygons={key: [SQUARE + i for i in range(n)] for key, n in keys})


def test_groups_polygons_under_layer_names(layermap):
    layers = collect_layers(flat_with(((68, 20), 3), ((69, 20), 1)), layermap)
    assert {layer.name: len(polys) for layer, polys in layers.items()} == {"met1": 3, "met2": 1}


def test_drops_ignored_marker_layers(layermap):
    layers = collect_layers(flat_with(((68, 20), 1), ((68, 16), 5), ((81, 4), 2)), layermap)
    assert [layer.name for layer in layers] == ["met1"]


def test_unknown_gds_layer_is_an_error(layermap):
    with pytest.raises(ValueError, match=r"not in the layer map.*\(99, 0\)"):
        collect_layers(flat_with(((68, 20), 1), ((99, 0), 1)), layermap)


def test_layers_come_out_bottom_first(layermap):
    layers = collect_layers(flat_with(((72, 20), 1), ((66, 20), 1), ((68, 20), 1)), layermap)
    assert [layer.name for layer in layers] == ["poly", "met1", "met5"]


@needs_spm
def test_spm_collects_every_physical_layer(layermap, spm_klayout_counts):
    layers = collect_layers(load_flat(SPM_GDS), layermap)
    assert [layer.name for layer in layers] == [layer.name for layer in layermap.layers]
    assert {layer.gds: len(polys) for layer, polys in layers.items()} == {
        layer.gds: spm_klayout_counts[layer.gds] for layer in layermap.layers
    }
