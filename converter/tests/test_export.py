import json
import struct
from pathlib import Path

import gdstk
import numpy as np
import pytest
import trimesh

from conftest import LAYERMAP, SPM_GDS, needs_spm
from gds2glb.export import Z_UP_TO_Y_UP, convert, hex_to_rgba
from gds2glb.layermap import load_layermap


def gltf_json(path: Path) -> dict:
    """The JSON chunk of a .glb: 12-byte header, then chunk length, chunk type, JSON."""
    data = path.read_bytes()
    assert data[:4] == b"glTF"
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length])


@pytest.fixture
def small_gds(tmp_path: Path) -> Path:
    """Two overlapping met1 squares, a met2 bar, and a pin marker to ignore."""
    lib = gdstk.Library()
    top = lib.new_cell("TOP")
    top.add(gdstk.rectangle((0, 0), (2, 2), layer=68, datatype=20))
    top.add(gdstk.rectangle((1, 1), (3, 3), layer=68, datatype=20))
    top.add(gdstk.rectangle((0, 0), (5, 1), layer=69, datatype=20))
    top.add(gdstk.rectangle((0, 0), (1, 1), layer=68, datatype=16))
    path = tmp_path / "small.gds"
    lib.write_gds(str(path))
    return path


def test_hex_to_rgba():
    assert hex_to_rgba("#0000ff") == [0, 0, 255, 255]
    assert hex_to_rgba("#ffe6bf") == [255, 230, 191, 255]


def test_z_up_becomes_y_up():
    up = Z_UP_TO_Y_UP @ np.array([0, 0, 1, 1])
    north = Z_UP_TO_Y_UP @ np.array([0, 1, 0, 1])
    assert up[:3] == pytest.approx([0, 1, 0])     # chip "up" is glTF "up"
    assert north[:3] == pytest.approx([0, 0, -1])  # chip +y points into the screen
    assert np.linalg.det(Z_UP_TO_Y_UP[:3, :3]) == pytest.approx(1)  # rotation, not mirror


def test_small_layout_round_trip(small_gds: Path, tmp_path: Path):
    out = tmp_path / "small.glb"
    stats, size = convert(small_gds, LAYERMAP, out)
    assert size == out.stat().st_size

    assert [(s.name, s.polygons_in, s.polygons_merged) for s in stats] == [("met1", 2, 1), ("met2", 1, 1)]

    doc = gltf_json(out)
    assert [node["name"] for node in doc["nodes"]] == ["met1", "met2"]
    met1 = doc["meshes"][0]
    assert list(met1["primitives"][0]["attributes"]) == ["POSITION"]  # no normals: viewer shades flat
    assert met1["extras"] == {"layer": "met1", "gds": [68, 20], "kind": "metal",
                              "z_um": 1.3761, "thickness_um": 0.36, "polygons": 2}
    assert doc["materials"][0]["pbrMetallicRoughness"]["baseColorFactor"] == pytest.approx([0, 0, 1, 1])

    scene = trimesh.load(out)
    m = scene.geometry["met1"]
    # y (glTF up) spans the layer's height minus the 1 nm gap; chip y became -z.
    assert m.bounds[:, 1] == pytest.approx([1.3766, 1.7356])
    assert m.bounds[:, 2] == pytest.approx([-3, 0])
    assert m.volume == pytest.approx(7 * (0.36 - 0.001), rel=1e-5)


def test_convert_creates_missing_output_folder(small_gds: Path, tmp_path: Path):
    out = tmp_path / "new" / "folder" / "small.glb"
    convert(small_gds, LAYERMAP, out)
    assert out.is_file()


@needs_spm
def test_spm_converts_to_16_layer_glb(tmp_path: Path):
    out = tmp_path / "spm.glb"
    stats, size = convert(SPM_GDS, LAYERMAP, out)
    names = [layer.name for layer in load_layermap(LAYERMAP).layers]

    doc = gltf_json(out)
    assert [node["name"] for node in doc["nodes"]] == names
    assert [s.name for s in stats] == names
    assert sum(s.polygons_in for s in stats) == 51315

    scene = trimesh.load(out)
    die = np.vstack([g.bounds for g in scene.geometry.values()])
    # Die is 96.6 × 107.32 µm; chip y runs along -z in glTF. Stack tops out at met5's top.
    assert die[:, 0].min() == pytest.approx(0) and die[:, 0].max() == pytest.approx(96.6)
    assert die[:, 2].min() == pytest.approx(-107.32) and die[:, 2].max() == pytest.approx(0)
    assert die[:, 1].max() == pytest.approx(5.3711 + 1.26 - 0.0005)
