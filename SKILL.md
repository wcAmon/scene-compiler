# Scene Compiler — Agent Skill Reference

> LLM-optimized reference for Babylon.js game development with scene-compiler.
> Read this before writing any game scene code.

---

## Golden Rules

1. **NEVER create meshes inside loops** — unless the same function uses a batching pattern (MergeMeshes / thinInstanceAdd / thinInstanceSetBuffer). Use `MeshBuilder` outside the loop, then thin instances or clones inside. Creating template meshes for thin instances in a loop is allowed.
2. **ALWAYS call `.freeze()` on materials** after setting all properties. The rewriter does this automatically, but explicit is better.
3. **ALWAYS verify GLB paths exist** under `public/`. The validator will error on missing `.glb` references.
4. **ALWAYS guard `.dispose()` calls** with null checks: `mesh && mesh.dispose()`. The rewriter adds these, but write them yourself.
5. **NEVER exceed budget limits.** Check `game.budget.json` before hardcoding NPC counts, render distances, or draw call limits.

---

## Validation Rules — Quick Reference

### Rule 1: `no-raw-mesh-in-loop` (ERROR)

**Triggers when:** `new Mesh()` or `new MeshBuilder()` appears inside loops (`for`, `while`, `do`, `for...in`, `for...of`) **or** array iterator methods (`.forEach()`, `.map()`, `.flatMap()`, `.reduce()`).

**Exempt when:** The containing function uses a batching pattern: `MergeMeshes`, `thinInstanceAdd`, or `thinInstanceSetBuffer`.

```typescript
// BAD — creates 100 draw calls
for (let i = 0; i < 100; i++) {
  const box = MeshBuilder.CreateBox(`box${i}`, { size: 1 }, scene);
  box.position.x = i * 2;
}

// BAD — .forEach() is also caught
positions.forEach(pos => {
  MeshBuilder.CreateBox("box", { size: 1 }, scene);
});

// GOOD — one mesh, 100 thin instances
const box = MeshBuilder.CreateBox("box", { size: 1 }, scene);
const matrix = Matrix.Identity();
for (let i = 0; i < 100; i++) {
  matrix.setTranslation(new Vector3(i * 2, 0, 0));
  box.thinInstanceAdd(matrix);
}

// GOOD — loop creates thin instance templates (exempt: thinInstanceAdd in function)
for (const config of meshConfigs) {
  const template = MeshBuilder.CreateBox(config.name, config.size, scene);
  template.isVisible = false;
  for (const pos of config.positions) {
    template.thinInstanceAdd(Matrix.Translation(pos.x, pos.y, pos.z));
  }
}
```

### Rule 2: `glb-exists` (ERROR)

**Triggers when:** A string literal ending in `.glb` references a file not found under the public directory.

```typescript
// BAD — file doesn't exist at public/assets/models/hero.glb
SceneLoader.ImportMeshAsync("", "/assets/models/", "hero.glb", scene);

// GOOD — file exists at public/assets/models/hero.glb
// (Verify: ls public/assets/models/hero.glb)
SceneLoader.ImportMeshAsync("", "/assets/models/", "hero.glb", scene);
```

**Fix:** Place the `.glb` file in the correct public directory path before building.

### Rule 3: `budget-limits` (ERROR)

**Triggers when:** A numeric variable whose name matches a budget pattern exceeds the budget limit.

| Variable pattern | Budget field | Default limit |
|-----------------|-------------|---------------|
| `*npc*` | `maxNPCs` | 30 |
| `*shadow*cast*` | `maxShadowCasters` | 10 |
| `*active*mesh*` | `maxActiveMeshes` | 500 |
| `*render*dist*` | `maxRenderDistance` | 300 |
| `*draw*call*` | `maxDrawCalls` | 200 |

```typescript
// BAD — exceeds maxNPCs (30)
const npcCount = 50;

// GOOD — within budget
const npcCount = 25;
```

### Rule 4: `material-freeze` (WARNING)

**Triggers when:** A `StandardMaterial`, `PBRMaterial`, or PBR variant is created but no `.freeze()` call exists in the file.

```typescript
// WARNING — no freeze
const mat = new StandardMaterial("mat", scene);
mat.diffuseColor = new Color3(1, 0, 0);

// GOOD — frozen after configuration
const mat = new StandardMaterial("mat", scene);
mat.diffuseColor = new Color3(1, 0, 0);
mat.freeze();
```

### Rule 5: `shadow-config` (WARNING)

**Triggers when:** `new ShadowGenerator()` exists but no shadow quality property is set.

```typescript
// WARNING — default shadows (broken look, bad perf)
const shadowGen = new ShadowGenerator(1024, light);

// GOOD — configured shadow quality
const shadowGen = new ShadowGenerator(1024, light);
shadowGen.useBlurExponentialShadowMap = true;
shadowGen.blurKernel = 32;
```

**Accepted properties:** `useBlurExponentialShadowMap`, `useExponentialShadowMap`, `useBlurCloseExponentialShadowMap`, `useCloseExponentialShadowMap`, `blurKernel`, `blurScale`, `useKernelBlur`.

---

## Babylon.js Best Practice Patterns

### Scene Setup

```typescript
import { Engine, Scene, FreeCamera, HemisphericLight, Vector3, Color4 } from "@babylonjs/core";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.53, 0.81, 0.92, 1);

// Camera
const camera = new FreeCamera("camera", new Vector3(0, 5, -10), scene);
camera.setTarget(Vector3.Zero());
camera.attachControl(canvas, true);

// Light
new HemisphericLight("light", new Vector3(0, 1, 0), scene);

// Render loop
engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
```

### Material — Always Freeze

```typescript
import { StandardMaterial, Color3 } from "@babylonjs/core";

const mat = new StandardMaterial("ground-mat", scene);
mat.diffuseColor = new Color3(0.4, 0.6, 0.3);
mat.specularColor = Color3.Black();
mat.freeze(); // REQUIRED — prevents GPU re-upload every frame
```

### PBR Material

```typescript
import { PBRMetallicRoughnessMaterial, Color3 } from "@babylonjs/core";

const pbr = new PBRMetallicRoughnessMaterial("metal", scene);
pbr.baseColor = new Color3(0.8, 0.8, 0.8);
pbr.metallic = 0.9;
pbr.roughness = 0.3;
pbr.freeze();
```

### GLB Loading

Two APIs — choose the right one:

```typescript
import "@babylonjs/loaders/glTF";
import { SceneLoader } from "@babylonjs/core";

// Option A: ImportMeshAsync — loads meshes directly into scene (one-off use)
const result = await SceneLoader.ImportMeshAsync(
  "", "/assets/models/", "character.glb", scene
);
const root = result.meshes[0]; // AbstractMesh — NO instantiateModelsToScene()

// Option B: LoadAssetContainerAsync — loads into container (for instancing)
const container = await SceneLoader.LoadAssetContainerAsync(
  "/assets/models/", "building.glb", scene
);
const instance = container.instantiateModelsToScene(); // ✅ creates instance
instance.rootNodes[0].position = new Vector3(10, 0, 0);
```

**CRITICAL**: `instantiateModelsToScene()` only exists on `AssetContainer` (Option B).
Calling it on `ImportMeshAsync` result will throw `TypeError: instantiateModelsToScene is not a function`.

| Need | Use |
|------|-----|
| Load once, use as-is | `ImportMeshAsync` |
| Load once, create multiple instances | `LoadAssetContainerAsync` + `instantiateModelsToScene()` |

### Instancing — Replacing Loop Meshes

```typescript
import { MeshBuilder, Matrix, Vector3 } from "@babylonjs/core";

// Create template mesh ONCE
const tree = MeshBuilder.CreateCylinder("tree", { height: 3, diameter: 0.5 }, scene);

// Add thin instances (NOT new meshes in loop)
for (let i = 0; i < 200; i++) {
  const matrix = Matrix.Translation(
    Math.random() * 100 - 50,
    1.5,
    Math.random() * 100 - 50
  );
  tree.thinInstanceAdd(matrix);
}
```

### Shadow Setup

```typescript
import { DirectionalLight, ShadowGenerator, Vector3 } from "@babylonjs/core";

const dirLight = new DirectionalLight("dir", new Vector3(-1, -2, 1), scene);
const shadowGen = new ShadowGenerator(1024, dirLight);
shadowGen.useBlurExponentialShadowMap = true;
shadowGen.blurKernel = 32;

// Add shadow casters (respect maxShadowCasters budget)
shadowGen.addShadowCaster(playerMesh);
ground.receiveShadows = true;
```

### Dispose — Always Guard

```typescript
// GOOD
if (mesh) {
  mesh.dispose();
  mesh = null;
}

// ALSO GOOD
mesh && mesh.dispose();

// BAD — will crash if mesh is null/undefined
mesh.dispose();
```

### Distance Culling

```typescript
// Set camera far plane within budget
camera.maxZ = 300; // must not exceed maxRenderDistance

// Per-mesh visibility distance
mesh.visibility = 1;
scene.onBeforeRenderObservable.add(() => {
  const dist = Vector3.Distance(mesh.position, camera.position);
  mesh.setEnabled(dist < 200);
});
```

---

## Scene-Compiler Integration

### vite.config.ts

```typescript
import { defineConfig } from "vite";
import { sceneRewriter } from "/home/wake/scene-compiler/packages/rewriter/src/plugin.js";

export default defineConfig({
  plugins: [sceneRewriter()],
  build: { outDir: "dist", target: "es2022" },
  server: { port: 3001 },
});
```

The `sceneRewriter` plugin auto-injects:
- `.freeze()` on materials after last property assignment
- Null guards on `.dispose()` calls

Options: `sceneRewriter({ freeze: true, disposeGuard: true })`

### package.json Scripts

```json
{
  "scripts": {
    "dev": "vite dev",
    "prebuild": "node --import tsx /home/wake/scene-compiler/packages/cli/src/index.ts validate src/ --public public/",
    "build": "vite build"
  }
}
```

The `prebuild` script runs validation automatically before every `vite build`.

### Runtime Init

```typescript
import { initRuntime } from "/home/wake/scene-compiler/packages/runtime/src/index.js";

const runtime = initRuntime({
  engine,
  scene,
  budget: { maxDrawCalls: 200, maxActiveMeshes: 500, targetFPS: 30 },
  baseRenderDistance: 300,
  callbacks: {
    onShadowToggle(enabled) { shadowGen.setEnabled(enabled); },
    onNPCLimit(max) { cullNPCsBeyond(max); },
    onRenderDistance(dist) { camera.maxZ = dist; },
    onParticlesToggle(on) { particles.setEnabled(on); },
  },
});

// Check current quality level
console.log(runtime.adaptive.getLevel()); // 0-4

// Cleanup on scene dispose
runtime.dispose();
```

### Capture — QA Screenshots

```typescript
import { ScreenshotService, CaptureAPI } from "@scene-compiler/capture";

// 需要 engine + scene 兩個參數
const screenshots = new ScreenshotService(engine, scene);
await screenshots.capture(camera, { label: "spawn-point", width: 1280, height: 720 });

// 啟用 postMessage API（外部工具可透過 window.postMessage 觸發截圖）
const captureAPI = new CaptureAPI(screenshots, () => camera);
captureAPI.listen();
```

---

## Known Babylon.js Gotchas

### 1. `instantiateModelsToScene is not a function`

`ImportMeshAsync` 返回 `{ meshes, ... }` — 不能呼叫 `.instantiateModelsToScene()`。
該方法只存在於 `AssetContainer`（由 `LoadAssetContainerAsync` 返回）。
詳見上方「GLB Loading」。

### 2. `addObjectRenderer is not a function` (Babylon.js 7.54.x)

`Tools.CreateScreenshotUsingRenderTarget()` 內部建立 `RenderTargetTexture`，
其 constructor 呼叫 `scene.addObjectRenderer()` — 但此方法在 7.54.x 不存在。
**解法**：使用 `Tools.CreateScreenshot()`（canvas-based，不需 RTT）。
scene-compiler 的 `ScreenshotService` 已使用此方案。

### 3. `ScreenshotTools needs to be imported before`

Babylon.js v7 tree-shaking 會移除 `screenshotTools` 模組。
需要 side-effect import：`import "@babylonjs/core/Misc/screenshotTools";`
scene-compiler 的 `ScreenshotService` 已包含此 import。

### 4. Ground Raycast 打到角色自己的 mesh → 人物飛天

`scene.pickWithRay` 的 predicate 如果只排除碰撞體（collisionRoot），
角色 GLB 模型的可見子 mesh（腳、身體）仍會被射線命中。
Raycast 把角色自己的 mesh 當成「地面」→ 把 position.y 推高 → 下一幀又更高 → 無限上升。

```typescript
// BAD — 只排除 collisionRoot，GLB mesh 仍會被 raycast 擊中
const hit = scene.pickWithRay(ray, (mesh) => {
  return mesh !== this.collisionRoot && mesh.isPickable && mesh.isVisible;
});

// GOOD — 排除所有角色自身的 mesh
const hit = scene.pickWithRay(ray, (mesh) => {
  return mesh !== this.collisionRoot && !this.meshes.includes(mesh)
    && mesh.isPickable && mesh.isVisible;
});
```

**適用所有 raycast 場景**：地面偵測、互動偵測、射擊 — 都必須排除 ray 發射者自身的 mesh。

---

## game.budget.json Fields

```json
{
  "maxNPCs": 30,
  "maxShadowCasters": 10,
  "maxGLBSizeMB": 5,
  "maxTotalAssetTypes": 50,
  "maxRenderDistance": 300,
  "targetFPS": 30,
  "maxDrawCalls": 200,
  "maxActiveMeshes": 500
}
```

| Field | Meaning | Suggested range |
|-------|---------|-----------------|
| `maxNPCs` | Max NPC/agent entities | 10–50 |
| `maxShadowCasters` | Meshes added to ShadowGenerator | 5–15 |
| `maxGLBSizeMB` | Max size per GLB file | 2–10 |
| `maxTotalAssetTypes` | Distinct asset types loaded | 20–100 |
| `maxRenderDistance` | Camera far plane (units) | 100–500 |
| `targetFPS` | Minimum target FPS | 30–60 |
| `maxDrawCalls` | Draw calls per frame | 100–300 |
| `maxActiveMeshes` | Visible meshes per frame | 200–800 |

---

## New Project — Full Workflow

```bash
# 1. Create project
cd /home/wake
node --import tsx /home/wake/scene-compiler/packages/cli/src/index.ts create my-game

# 2. Develop
cd my-game
pnpm dev          # Vite dev server on port 3001

# 3. Add models
# Place .glb files in public/assets/models/

# 4. Validate
node --import tsx /home/wake/scene-compiler/packages/cli/src/index.ts validate src/ --public public/

# 5. Build (validation runs automatically via prebuild)
pnpm build

# 6. Preview production build
npx vite preview
```

### CLI Direct Usage

```bash
# Validate
node --import tsx /home/wake/scene-compiler/packages/cli/src/index.ts validate src/

# Initialize budget
node --import tsx /home/wake/scene-compiler/packages/cli/src/index.ts init

# Build
node --import tsx /home/wake/scene-compiler/packages/cli/src/index.ts build src/

# Create new project
node --import tsx /home/wake/scene-compiler/packages/cli/src/index.ts create <name>
```

---

## 開放世界優化原則

> 當 `game.budget.json` 的 `openWorld.lodRequired = true` 或 `octreeRequired = true` 時必讀。
> scene-compiler 的 `require-lod` 和 `require-octree` 規則會強制執行這些原則。

### 核心概念：Frame Budget ≠ World Budget

```
frame.maxActiveMeshes: 500  →  任何一幀最多 500 個 mesh 渲染
世界總 mesh 數：無上限        →  由 LOD + Octree + Streaming 管理差距
```

**錯誤認知**：看到 `maxActiveMeshes: 500` 就認為整個世界只能有 500 個物件。
**正確認知**：世界可以有 10,000 個物件，但只要同時渲染不超過 500 個就合規。

### 比例閘門 — 世界規模 vs 必要優化

| 檔案內 mesh 建立數量 | 必要優化 | scene-compiler 行為 |
|---------------------|---------|-------------------|
| < 100（maxActiveMeshes × 0.2） | 無 | 靜默 |
| ≥ 100 | LOD | WARNING / ERROR（依 lodRequired） |
| ≥ 200（maxActiveMeshes × 0.4） | Octree | WARNING / ERROR（依 octreeRequired） |

### LOD 實作模式

```typescript
// 一個 mesh 設定 LOD：近距離高細節，遠距離低細節，極遠消失
const highMesh = MeshBuilder.CreateBox("building", { ... }, scene);
const lowMesh = MeshBuilder.CreateBox("building_low", { ... }, scene);

highMesh.addLODLevel(150, lowMesh);   // 超過 150 單位換低細節
highMesh.addLODLevel(300, null);      // 超過 300 單位不渲染
```

### Octree 實作模式

```typescript
// 在場景所有靜態 mesh 建立完畢後呼叫一次
// 將 CPU culling 從 O(n) 降為 O(log n)
scene.createOrUpdateSelectionOctree(32, 2);
// 32 = 最大每節點容量, 2 = 最大深度
```

### NPC Distance Culling（已在 NPCManager 正確實作）

```typescript
// 每 CHECK_INTERVAL 幀才做一次距離判斷（節流）
if (this.frameCounter % CHECK_INTERVAL === 0) {
  for (const npc of this.npcs) {
    const dist = Vector3.Distance(npc.root.position, playerPos);
    npc.active = dist < ACTIVATION_RADIUS;  // 超出範圍停用
    npc.meshes.forEach(m => m.setEnabled(npc.active));
  }
}
```

### 豁免模式：merge-after-loop（不觸發 no-raw-mesh-in-loop）

```typescript
// 正確模式：在迴圈內建立 mesh，最後合併為一個 draw call
function buildLaneMarkings(): void {
  const dashes: Mesh[] = [];
  for (let x = -250; x < 250; x += 5) {
    const dash = MeshBuilder.CreateGround(`dash_${x}`, { width: 2, height: 0.15 }, scene);
    dashes.push(dash);
  }
  // 合併後只有 1 個 draw call
  Mesh.MergeMeshes(dashes, true, true);
}
// ✅ 不觸發 no-raw-mesh-in-loop（validator 偵測到 MergeMeshes 會豁免）
```

### 不可用 Thin Instance 時的替代方案

當每個 mesh 有不同尺寸（如程序生成建築）無法 thin instance，改用：
1. **Merge**（靜態 mesh）— 同材質合併為一個 draw call
2. **LOD**（動態距離）— 遠處換低細節或隱藏
3. **freezeWorldMatrix()**（靜態位置）— 告知 GPU 不需每幀重算世界矩陣

```typescript
// 靜態世界物件全部 freeze
for (const mesh of worldMeshes) {
  mesh.freezeWorldMatrix();  // ✅ 建築/地形必做
}
```
