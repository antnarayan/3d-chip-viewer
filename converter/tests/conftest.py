from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SPM_GDS = REPO / "designs" / "spm" / "spm.gds"
LAYERMAP = REPO / "layermap.json"

needs_spm = pytest.mark.skipif(not SPM_GDS.exists(), reason="designs/spm/spm.gds not present")


@pytest.fixture(scope="session")
def spm_klayout_counts() -> dict[tuple[int, int], int]:
    """Flattened boxes + polygons + paths per layer in spm.gds, as KLayout counts them."""
    import klayout.db as db

    layout = db.Layout()
    layout.read(str(SPM_GDS))
    counts = {}
    for index in layout.layer_indexes():
        info = layout.get_info(index)
        n = 0
        it = layout.top_cell().begin_shapes_rec(index)
        while not it.at_end():
            shape = it.shape()
            n += shape.is_box() or shape.is_polygon() or shape.is_path()
            it.next()
        if n:
            counts[(info.layer, info.datatype)] = n
    return counts
