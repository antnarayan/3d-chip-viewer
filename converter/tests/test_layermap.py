import json
from pathlib import Path

import pytest

from conftest import LAYERMAP
from gds2glb.layermap import load_layermap


def minimal(**overrides) -> dict:
    layer = {"name": "met1", "gds": [68, 20], "kind": "metal", "z": 1.3761, "thickness": 0.36, "color": "#0000ff"}
    layer.update(overrides)
    return {"layers": [layer], "ignore": [{"gds": [68, 5], "name": "met1.label"}]}


def write(tmp_path: Path, data: dict) -> Path:
    path = tmp_path / "layermap.json"
    path.write_text(json.dumps(data))
    return path


def test_repo_layermap_loads_in_stack_order():
    lm = load_layermap(LAYERMAP)
    names = [layer.name for layer in lm.layers]
    assert len(names) == 16 and len(lm.ignored) == 24
    assert names[0] == "nwell" and names[-1] == "met5"
    met1 = lm.by_gds()[(68, 20)]
    assert (met1.name, met1.z, met1.thickness) == ("met1", 1.3761, 0.36)
    assert met1.top == pytest.approx(1.7361)


def test_repo_layermap_metals_rise_through_the_stack():
    lm = load_layermap(LAYERMAP)
    metals = [layer for layer in lm.layers if layer.kind == "metal"]
    assert [m.name for m in metals] == ["li1", "met1", "met2", "met3", "met4", "met5"]
    assert all(lower.top <= upper.z for lower, upper in zip(metals, metals[1:]))


def test_minimal_layermap(tmp_path: Path):
    lm = load_layermap(write(tmp_path, minimal()))
    assert [layer.name for layer in lm.layers] == ["met1"]
    assert lm.ignored == {(68, 5)}


@pytest.mark.parametrize(
    "overrides, message",
    [
        ({"thickness": 0}, "thickness must be positive"),
        ({"thickness": -0.1}, "thickness must be positive"),
        ({"color": "blue"}, "color must look like"),
        ({"color": "#00f"}, "color must look like"),
    ],
)
def test_rejects_bad_values(tmp_path: Path, overrides: dict, message: str):
    with pytest.raises(ValueError, match=message):
        load_layermap(write(tmp_path, minimal(**overrides)))


def test_rejects_duplicate_names(tmp_path: Path):
    data = minimal()
    data["layers"].append({**data["layers"][0], "gds": [69, 20]})
    with pytest.raises(ValueError, match="duplicate layer name"):
        load_layermap(write(tmp_path, data))


def test_rejects_duplicate_gds(tmp_path: Path):
    data = minimal()
    data["layers"].append({**data["layers"][0], "name": "met1_copy"})
    with pytest.raises(ValueError, match="duplicate GDS layer"):
        load_layermap(write(tmp_path, data))


def test_rejects_layer_both_mapped_and_ignored(tmp_path: Path):
    data = minimal()
    data["ignore"].append({"gds": [68, 20], "name": "oops"})
    with pytest.raises(ValueError, match="duplicate GDS layer"):
        load_layermap(write(tmp_path, data))


def test_repo_layermap_colors_are_distinct():
    colors = [layer.color.lower() for layer in load_layermap(LAYERMAP).layers]
    assert len(set(colors)) == len(colors)
