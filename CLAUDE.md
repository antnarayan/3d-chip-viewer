# CLAUDE.md

## Response rule
- Always begin every response with "Antonio" as the very first word.

## Project
A web-based 3D viewer for chip layouts (GDSII). It loads a real SKY130 design and renders the
process stack in 3D (diffusion, poly, li1, met1–met5, vias) with layer toggles and an
exploded-view slider. Later goals: DEF net highlighting and IR-drop / congestion overlays.

## Stack
- **Layouts:** LibreLane (formerly OpenLane 2) RTL→GDS flow, SkyWater SKY130 PDK
- **Reference viewer:** KLayout (ground truth for checking geometry)
- **Converter (Python 3.10+):** gdstk, numpy, mapbox_earcut, trimesh → exports `.glb`
- **Viewer:** Node.js, Vite, Three.js (GLTFLoader, OrbitControls)

## Repo layout
```
converter/   Python GDS → glTF converter + tests
viewer/      Vite + Three.js web app
designs/     Input GDS/DEF files (keep small test designs here)
docs/        Notes, layer stack references, screenshots
layermap.json  GDS layer/datatype → name, z, thickness, color
```

## Conventions
- All geometry is in **microns (µm)**. Convert from GDS database units (usually 1 nm) once, at load time.
- Layer heights and thicknesses come from `layermap.json` only. Never hard-code them.
  Values must be checked against SKY130 PDK documentation, not guessed.
- Export **one merged mesh per layer**, named after the layer.
- Convert GDS paths to polygons before extruding. Handle polygons with holes.
- Add a tiny z-offset between coplanar layers to avoid z-fighting.
- Start with small designs (e.g. LibreLane's `spm` example). Don't flatten large designs.
  Instancing comes later (Phase 5).

## Roadmap
0. Setup: repo, toolchain (LibreLane, KLayout), run the `spm` example end to end
1. Inspect the layout in KLayout and learn the SKY130 layers
2. Build and check `layermap.json`
3. Converter: load → flatten → collect polygons per layer → triangulate + extrude → merge → `.glb`
4. Viewer: load `.glb`, orbit controls, layer panel, exploded-view slider, z-exaggeration, click-to-identify
   - Exploded view on staggered springs: one spring per layer, ~35 ms apart, top layer leaves first,
     closes in reverse; on a mid-way reversal reschedule only layers still moving. Slider sets the target.
   - Selection tones: hovered/selected layer is the one lit accent, all others step down a tone.
   - Framed card: title, hint, live readout (e.g. `met1 · 4,112 shapes · z 1.376 µm · 0.36 µm`) read from
     `layermap.json` + converter metadata; readout reports where parts are, not where they're headed.
   - Calm time-based motion: clamp dt to 1/30 s, exponential follow / critically damped settle for
     camera presets and z-exaggeration. Render on demand: stop the loop when settled or offscreen.
   - Keyboard + a11y: arrows walk the layer stack, Space explodes/closes, Esc clears selection,
     `aria-live` announces phase changes only. Respect `prefers-reduced-motion`.
   - Light and dark themes from color tokens. Isometric orthographic preset (45° az, 30° el) with
     edge outlines. True-scale µm ruler on the die edge and a scale bar.
5. Scale: InstancedMesh for standard cells, windowing/tiling, LOD, Web Workers
   - Half-rate rendering when frames exceed ~14 ms, motion stays time-based.
6. Extras: DEF net highlighting, IR-drop / congestion overlays, clock tree view
   - Clock tree: a pulse travels the real DEF routes from root to flip-flops, timed from the SDF.
   - Overlays in world space at the true layer z; no popping (envelopes with attack/decay,
     crossfades), every field fades to zero before any edge.
   - Net click: burst envelope flash that settles into the highlight.
   - Idle tour: after ~1.4 s idle, orbit → explode → walk met1–met5 → nets; pause on input,
     resume ~3.6 s after. Doubles as the demo/GIF.
7. Ship: GitHub Pages demo, README with GIF
   - Printable A4 sheets: poster with numbered layers, cross-section drawing with the stack table.
   - Headless-Chrome visual checks: screenshots at fixed poses, slowed contact sheets of the
     explode to catch popping and z-fighting.

Motion, UI and overlay ideas above come from Anatomy (github.com/wheresryan22/anatomy, MIT).
Take ideas and small helpers (spring/settle/burst) with attribution, not its SVG kit or 3D engine:
Three.js's depth buffer replaces its painter's order at our shape counts.

## How to work with me
- Do one well-scoped step at a time. Confirm with me before installing anything or making big structural changes.
- Every converter function gets a unit test (e.g. a 1×1 µm square extrudes to the expected triangle count).
- Check geometry against KLayout: per-layer polygon counts should match.
- Explain non-obvious code briefly. I need to understand it well enough to discuss it in interviews.
