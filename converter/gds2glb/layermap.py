"""Read and check layermap.json: which GDS layers to build, at what height."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from gds2glb.load import LayerKey

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


@dataclass(frozen=True)
class Layer:
    """One physical layer to extrude. z and thickness are in microns."""

    name: str
    gds: LayerKey
    kind: str
    z: float
    thickness: float
    color: str

    @property
    def top(self) -> float:
        return self.z + self.thickness


@dataclass(frozen=True)
class LayerMap:
    """Physical layers in stack order, plus the GDS layers we deliberately skip."""

    layers: tuple[Layer, ...]
    ignored: frozenset[LayerKey]

    def by_gds(self) -> dict[LayerKey, Layer]:
        return {layer.gds: layer for layer in self.layers}


def load_layermap(path: str | Path) -> LayerMap:
    """Load layermap.json and reject anything that would build a wrong model.

    Raises ValueError on duplicate names or GDS keys, a key that is both
    mapped and ignored, a non-positive thickness or a malformed color.
    """
    data = json.loads(Path(path).read_text())

    layers = tuple(
        Layer(
            name=entry["name"],
            gds=(entry["gds"][0], entry["gds"][1]),
            kind=entry["kind"],
            z=float(entry["z"]),
            thickness=float(entry["thickness"]),
            color=entry["color"],
        )
        for entry in data["layers"]
    )
    ignored_list = [(entry["gds"][0], entry["gds"][1]) for entry in data.get("ignore", [])]
    ignored = frozenset(ignored_list)

    _check_unique("layer name", [layer.name for layer in layers])
    _check_unique("GDS layer", [layer.gds for layer in layers] + ignored_list)
    for layer in layers:
        if layer.thickness <= 0:
            raise ValueError(f"{layer.name}: thickness must be positive, got {layer.thickness}")
        if not HEX_COLOR.match(layer.color):
            raise ValueError(f"{layer.name}: color must look like #rrggbb, got {layer.color!r}")

    return LayerMap(layers=layers, ignored=ignored)


def _check_unique(what: str, values: list) -> None:
    seen, dupes = set(), set()
    for value in values:
        (dupes if value in seen else seen).add(value)
    if dupes:
        raise ValueError(f"duplicate {what}: {sorted(dupes)}")
