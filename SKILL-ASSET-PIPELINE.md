# 3D Asset Pipeline — Agent Skill Reference

> Enforcing a structured asset pipeline is the single biggest factor in scene fidelity.
> The fidelity gap between games without a pipeline (pure procedural MeshBuilder) and games with one is orders of magnitude.

---

## Why Enforce an Asset Pipeline

Agents naturally tend to use `MeshBuilder.CreateBox()` to quickly assemble scenes — this works at the prototype stage but leads to:
- All objects look like geometric primitives, lacking distinctiveness
- Assets cannot be reused (rebuilt every time)
- No QA step, quality is uncontrolled
- Scenes lack depth (everything is homogeneous primitives)

**After enforcing the GLB asset pipeline:**
- Every object goes through a proposal → modeling → review → integration workflow
- Blender can produce details that MeshBuilder cannot (curved surfaces, UV textures, skeletal animations)
- The review step forces the agent to compare against reference images, establishing a quality baseline
- Assets can be reused across projects

---

## Asset Lifecycle (6 Stages)

```
queued → reference_generated → in_progress → review → completed → integrated
  ↑                                            |
  └────── feedback (human or agent rejection) ─┘
```

### Stage 1: Proposal

The orchestrator agent calls `propose_asset_tool()`:

```
name:          snake_case identifier (e.g. taiwan_arcade_apartment)
category:      vehicle | prop | character | environment | building | furniture | destructible
description:   visual style description (for Gemini and blender-dev to read)
dimensions_m:  JSON {"x": 4.5, "y": 1.8, "z": 2.0} (real-world scale, 1 unit = 1 meter)
purpose:       intended use in the game
world_position: placement location
priority:      critical | high | medium | low
reusable:      true (generic objects like street trees) | false (unique objects like a specific building)
```

**Proposal rules:**
- Before proposing, you **must** search existing assets (`list_assets_tool()`) to avoid duplicates
- Maximum 3 proposals per awakening
- Proposals cannot be deleted, only put on hold (`set_asset_on_hold_tool()`)
- Reusable assets cannot be proposed again

### Stage 2: Reference Image Generation

AI image generation (e.g. Gemini) produces reference images:

```
Input:  asset description + style hints
Output: {name}_ref_v{N}.png
Location: public/assets/references/
```

The purpose of reference images is to **give blender-dev a visual target**, and to serve as the comparison baseline for QA review.

### Stage 3: Blender Modeling (Production)

Executed by the blender-dev sub-agent running headless Blender scripts:

**Input:**
- Reference image path
- Target dimensions (meters)
- Face count budget (see table below)

**Output (all must be produced):**
- `{name}.glb` — 3D model
- `{name}_preview_front.png` — front view preview
- `{name}_preview_side.png` — side view preview
- `{name}_preview_34.png` — 3/4 angle preview
- stdout prints `BBOX: x=1.23 y=4.56 z=7.89` and `Faces: 1234`

**Face count budget table:**

| Type | Face Count Range | Notes |
|------|---------|------|
| Small props (barrels, crates) | 200–500 | Simple geometry |
| Medium props (motorcycles, stalls) | 500–2,000 | Recognizable silhouette |
| Characters | 3,000–8,000 | Requires expressions and poses |
| Buildings | 2,000–5,000 | Front needs detail, back can be simplified |
| Large environments | 5,000–10,000 | Multi-part assemblies |

### Stage 4: QA Review

**Strict 6-step process:**

1. **Read 3 preview images** — missing image = automatic FAIL
2. **Structured visual analysis** — describe visible parts, missing elements, and proportions in each image
3. **Compare against reference image** — shape, proportion, and style deviations
4. **Dimension check** — whether bbox is within expected range
5. **Pass/Fail decision** — all checks must pass for PASS; FAIL must include specific revision instructions
6. **Record iteration** — `record_iteration_tool()` records the results of this round

**PASS conditions (all must be met):**
- All 3 previews are complete and clear
- Reasonably matches the reference image
- No major missing parts
- If there was prior feedback, corrections are visibly applied
- bbox is within expected range

**After FAIL:** Re-spawn blender-dev with **specific revision instructions** (not "make it better", but "left-side windows are missing, the reference image shows 3 windows"). Maximum 3 retries.

### Stage 5: Completion

The asset has:
- ✓ GLB file
- ✓ 3 preview images
- ✓ Face count, vertex count, bbox metrics
- ✓ Iteration history records
- ✓ status = completed, integrated = 0

### Stage 6: Game Integration

The orchestrator agent loads the GLB into game code:

```typescript
// Single use
const result = await SceneLoader.ImportMeshAsync("", "/assets/models/", "name.glb", scene);

// Multiple instances
const container = await SceneLoader.LoadAssetContainerAsync("/assets/models/", "name.glb", scene);
const instance = container.instantiateModelsToScene();
```

After integration, call `mark_asset_integrated_tool(asset_id)`.

---

## Feedback Iteration Loop

Humans or agents can provide feedback on assets at any stage:

```
Human feedback → asset_feedback table → agent reads on next awakening
  ↓
Agent acts on feedback:
  1. Regenerate reference image (modify_existing=true)
  2. Re-spawn blender-dev with revision instructions
  3. Re-run QA review
  4. record_iteration_tool() records the new round
```

Iteration count is tracked via the `asset_rounds` table; each round has an independent summary and preview_paths.

---

## Blender Script Template

Every Blender script must follow this structure (see the Blender section in SKILL.md for details):

```python
#!/usr/bin/env python3
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

# 1. Clear the scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# 2. Set output path
OUTPUT_DIR = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp"
MODEL_NAME = "my_model"

# 3. Modeling (bmesh / bpy.ops)
# ...

# 4. PBR materials (Principled BSDF)
# ...

# 5. Apply transforms (required before export)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# 6. Export GLB
bpy.ops.export_scene.gltf(filepath=os.path.join(OUTPUT_DIR, f"{MODEL_NAME}.glb"),
    export_format='GLB', use_selection=True, export_yup=True,
    export_apply=True, export_materials='EXPORT')

# 7. Print bbox + face count
dims = obj.dimensions
print(f"BBOX: x={dims.x:.2f} y={dims.y:.2f} z={dims.z:.2f}")
print(f"Faces: {len(obj.data.polygons)}")

# 8. Render 3-angle previews
# ... (front, side, 3/4)
```

**Execution:** `blender --background --python script.py -- /output/directory/`

---

## Key Rules

1. **1 GLB = 1 material** (multiple materials = multiple draw calls)
2. **1 Blender unit = 1 meter** (real-world scale)
3. **Cylinders use 8-12 segments** (not the default 32)
4. **Subdivision Surface modifier is prohibited** (face count explosion)
5. **Characters/vehicles face +Y** (Blender coordinates; after export = glTF +Z)
6. **Apply Transforms before export** (location + rotation + scale)
7. **Every model must produce 3 previews + bbox** (no previews = QA cannot review)
8. **Texture resolution cap: 1024x1024** (browser memory constraint)
