# spm.gds: per-layer shape counts (KLayout reference)

Source: `designs/spm/spm.gds`, LibreLane v3.0.17 run `RUN_2026-11-13_19-40-53`
(sky130A, sky130_fd_sc_hd). Signoff: 0 DRC (Magic + KLayout), 0 LVS, 0 antenna,
no setup/hold violations. 1226 cell instances, die 96.6 × 107.32 µm, dbu 0.001 µm.

Counted with `klayout.db` 0.30.13, flattened (`begin_shapes_rec` from top cell `spm`).
"geom" = boxes + polygons + paths; text labels are listed separately.
Layer names are NOT verified yet. They get checked against SKY130 PDK docs in Phase 2.

| GDS layer | geom | boxes | polygons | paths | text |
|---|---:|---:|---:|---:|---:|
| 64/5   | 0     | 0     | 0    | 0    | 1136 |
| 64/16  | 1136  | 1136  | 0    | 0    | 0 |
| 64/20  | 1226  | 1226  | 0    | 0    | 0 |
| 64/59  | 0     | 0     | 0    | 0    | 1136 |
| 65/20  | 2735  | 2071  | 664  | 0    | 0 |
| 65/44  | 198   | 198   | 0    | 0    | 0 |
| 66/20  | 3413  | 290   | 3123 | 0    | 0 |
| 66/44  | 15949 | 15949 | 0    | 0    | 0 |
| 67/5   | 0     | 0     | 0    | 0    | 2237 |
| 67/16  | 2302  | 2302  | 0    | 0    | 0 |
| 67/20  | 7256  | 3294  | 3482 | 480  | 0 |
| 67/44  | 13213 | 13213 | 0    | 0    | 0 |
| 68/5   | 0     | 0     | 0    | 0    | 2454 |
| 68/16  | 2454  | 2454  | 0    | 0    | 0 |
| 68/20  | 4112  | 896   | 854  | 2362 | 0 |
| 68/44  | 1573  | 1573  | 0    | 0    | 0 |
| 69/5   | 0     | 0     | 0    | 0    | 33 |
| 69/16  | 33    | 33    | 0    | 0    | 0 |
| 69/20  | 527   | 96    | 431  | 0    | 0 |
| 69/44  | 489   | 489   | 0    | 0    | 0 |
| 70/5   | 0     | 0     | 0    | 0    | 3 |
| 70/16  | 3     | 3     | 0    | 0    | 0 |
| 70/20  | 105   | 96    | 9    | 0    | 0 |
| 70/44  | 486   | 486   | 0    | 0    | 0 |
| 71/5   | 0     | 0     | 0    | 0    | 6 |
| 71/16  | 6     | 6     | 0    | 0    | 0 |
| 71/20  | 9     | 6     | 3    | 0    | 0 |
| 71/44  | 18    | 18    | 0    | 0    | 0 |
| 72/5   | 0     | 0     | 0    | 0    | 6 |
| 72/16  | 6     | 6     | 0    | 0    | 0 |
| 72/20  | 6     | 6     | 0    | 0    | 0 |
| 78/44  | 1290  | 1290  | 0    | 0    | 0 |
| 81/4   | 1226  | 1226  | 0    | 0    | 0 |
| 83/44  | 0     | 0     | 0    | 0    | 1226 |
| 93/44  | 1325  | 1325  | 0    | 0    | 0 |
| 94/20  | 1325  | 1260  | 65   | 0    | 0 |
| 95/20  | 1016  | 325   | 691  | 0    | 0 |
| 122/16 | 1136  | 1136  | 0    | 0    | 0 |
| 235/4  | 1     | 1     | 0    | 0    | 0 |
| 236/0  | 951   | 951   | 0    | 0    | 0 |

Note: these are raw shape counts. The converter turns paths into polygons, and may
merge touching shapes, so its per-layer counts should be compared to the *unmerged*
numbers here.
