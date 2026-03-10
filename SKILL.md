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

### Viewport Aspect Ratio — Portrait vs Landscape

遊戲的畫面方向（portrait 或 landscape）決定 canvas 和 camera 的設定方式。**必須在開發初期決定**。

#### Portrait 遊戲（直向，如手機射擊、跑酷）

```typescript
import { Camera } from "@babylonjs/core";

// 垂直 FOV 固定 — 確保上下永遠完整顯示
camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;

// Canvas 維持 9:16 比例，桌面端 pillarbox（兩側黑邊）
const TARGET_RATIO = 9 / 16;

function resizeCanvas() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const windowRatio = vw / vh;

  let w: number, h: number;
  if (windowRatio > TARGET_RATIO) {
    // 視窗比 canvas 寬 → pillarbox（以高度為基準）
    h = vh;
    w = Math.floor(vh * TARGET_RATIO);
  } else {
    // 視窗比 canvas 窄 → letterbox（以寬度為基準）
    w = vw;
    h = Math.floor(vw / TARGET_RATIO);
  }

  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.style.position = "absolute";
  canvas.style.left = ((vw - w) / 2) + "px";
  canvas.style.top = ((vh - h) / 2) + "px";
  engine.resize();
}

resizeCanvas();
window.addEventListener("resize", resizeCanvas);
```

#### Landscape 遊戲（橫向，如 TPS、開放世界）

```typescript
// 水平 FOV 固定（預設行為）— 確保左右永遠完整
camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;

// Canvas 填滿視窗即可
window.addEventListener("resize", () => engine.resize());
```

**規則：**
- Portrait 遊戲 **禁止** 用 `FOVMODE_HORIZONTAL_FIXED`（會導致桌面上下被切）
- Landscape 遊戲 **禁止** 用 `FOVMODE_VERTICAL_FIXED`（會導致手機左右被切）
- 確定方向後，index.html 的 body style 設 `background: #000` 讓黑邊自然融入

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

### 5. Render Observable 裡的 ReferenceError 會靜默凍結遊戲

在 `scene.onBeforeRenderObservable` 或 `onAfterRenderObservable` 的 callback 裡，
如果拋出未捕捉的 `ReferenceError`（例如引用了不在作用域的變數），
**錯誤不會讓遊戲 crash**，但會中斷整個 observable 鏈的後續 callback。

這導致的症狀是「遊戲看似在跑、畫面有渲染，但某些邏輯完全停擺」，
例如 countdown 永遠卡在 3、狀態機不推進、AI 不行動。

**關鍵原則**：
- 獨立函數（非 `main()` 內的閉包）不能直接引用 `main()` 的局部變數，改用 DOM 查詢或傳參
- 任何新增的 render observable callback，都要確認所有引用的變數在作用域內
- Debug 時優先檢查 console error — 即使只出現一次，若在 render loop 裡就代表每幀都拋

```typescript
// BAD — _createHUD 是獨立函數，看不到 main() 裡的 lobby
function _createHUD(scene: Scene, player: PlayerController): void {
  scene.onAfterRenderObservable.add(() => {
    hudEl.style.display = lobby.isVisible ? "none" : "block"; // ReferenceError!
  });
}

// GOOD — 透過 DOM 查詢取代直接引用
function _createHUD(scene: Scene, player: PlayerController): void {
  scene.onAfterRenderObservable.add(() => {
    const lobbyEl = document.getElementById("lobby-overlay");
    hudEl.style.display = (lobbyEl && lobbyEl.style.display !== "none") ? "none" : "block";
  });
}
```

### 6. requestPointerLock 失敗會觸發暫停 → 凍結遊戲

`canvas.requestPointerLock()` 是非同步的。如果瀏覽器拒絕（使用者未互動、手機不支援），
會觸發 `pointerlockchange` 事件且 `pointerLockElement === null`。
若你的暫停邏輯是「偵測 pointer lock 釋放 → 暫停」，這會在遊戲開始時**立刻暫停**。

**解法**：不要在 countdown 期間呼叫 `requestPointerLock()`，等到實際需要玩家操控時（波次開始）才鎖。

```typescript
// BAD — countdown 還沒結束就鎖指標，失敗 → 立刻暫停
combatHUD.onDifficultySelected = (difficulty) => {
  waveSystem.start(difficulty);
  canvas.requestPointerLock(); // 可能失敗 → 觸發 pause
};

// GOOD — 等 countdown 結束、波次開始才鎖
waveSystem.onWaveStarted = (wave) => {
  if (!document.pointerLockElement) {
    canvas.requestPointerLock();
  }
};
```

### 7. freezeWorldMatrix 後切換可見性用 setEnabled()，不用 scaling

`freezeWorldMatrix()` 告訴引擎不再重算世界矩陣。之後如果用 `mesh.scaling = Vector3.Zero()` 來「隱藏」mesh，
引擎不會更新矩陣，mesh 看起來不會消失（或行為不一致）。

```typescript
// BAD — frozen mesh 的 scaling 不會生效
mesh.freezeWorldMatrix();
mesh.scaling = Vector3.Zero(); // 無效！矩陣已凍結

// GOOD — setEnabled 直接從渲染列表移除，不需要矩陣更新
mesh.freezeWorldMatrix();
mesh.setEnabled(false); // ✅ 正確隱藏
mesh.setEnabled(true);  // ✅ 正確顯示
```

### 8. 多關卡 / 多波次：return early，不 removeCallback

在 `scene.onBeforeRenderObservable` 裡的 update loop，關卡結束時**不要移除 callback**。
移除後重新註冊容易造成重複註冊或忘記註冊。改用狀態判斷 return early。

```typescript
// BAD — 移除再重新加，容易出 bug
scene.onBeforeRenderObservable.removeCallback(updateFn);
// ... 下一關開始 ...
scene.onBeforeRenderObservable.add(updateFn); // 可能重複加

// GOOD — 永遠保留 callback，狀態判斷 skip
scene.onBeforeRenderObservable.add(() => {
  if (gameState === "level_complete" || gameState === "paused") return;
  updateEnemies(dt);
  updatePlayer(dt);
});
```

### 9. 關卡切換：deactivateAll，不 dispose

切關卡時把物件池裡的東西全部停用（歸位 + `setEnabled(false)`），不要 `dispose()`。
Dispose 後需要重建 mesh 和材質，成本高且容易漏。

```typescript
// BAD — dispose 後下一關要重建所有 mesh
enemies.forEach(e => e.mesh.dispose());
bullets.forEach(b => b.mesh.dispose());

// GOOD — 停用歸位，下一關直接重新啟用
function deactivateAll(pool: { mesh: AbstractMesh; active: boolean }[]) {
  for (const item of pool) {
    item.active = false;
    item.mesh.setEnabled(false);
    item.mesh.position.set(0, -100, 0); // 移到場外
  }
}

// 下一關開始時，只需 activate 需要的數量
```

### 10. 多人連線：Host re-broadcast + sender 自我過濾

在 WebSocket 多人架構中，Host 收到訊息後 re-broadcast 給所有玩家（包括發送者）。
發送者收到自己的訊息時必須過濾掉，否則會重複處理。

```typescript
// Host 端：收到訊息 → broadcast 給所有人
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  // Re-broadcast to all connected clients
  for (const client of clients) {
    client.send(msg.data);
  }
  // Host 自己也處理
  handleGameMessage(data);
};

// Client 端：過濾自己發的訊息
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  if (data.senderId === myPlayerId) return; // ← 關鍵：跳過自己
  handleGameMessage(data);
};
```

### 11. 多人插值：幀率無關的平滑追蹤

網路同步中，用 `1 - Math.pow(base, dt)` 做插值可確保不同幀率的機器看到一致的平滑度。
`base` 越小，追蹤越快（0.001 = 幾乎瞬間，0.1 = 緩慢平滑）。

```typescript
// BAD — 幀率依賴，60fps 和 30fps 的平滑感不同
mesh.position = Vector3.Lerp(mesh.position, targetPos, 0.1);

// GOOD — 幀率無關，任何 fps 下表現一致
const dt = engine.getDeltaTime() / 1000; // 秒
const alpha = 1 - Math.pow(0.001, dt); // 0.001 = 追蹤速度（越小越快）
mesh.position = Vector3.Lerp(mesh.position, targetPos, alpha);
```

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

---

## Blender Headless 3D 資產產線

> blender-dev 子 agent 專用。建模前必讀本節 + `memory/references/blender-modeling.md`（進階參考）。

### 基礎設定 — Headless Script 模板

每個 Blender 腳本都必須遵循這個結構：

```python
#!/usr/bin/env python3
"""[物件名稱] — Blender headless 建模腳本"""
import bpy
import bmesh
import math
import sys
import os
from mathutils import Vector, Matrix

# ── 1. 清空場景 ──
bpy.ops.wm.read_factory_settings(use_empty=True)

# ── 2. 輸出路徑（從命令列或硬編碼） ──
OUTPUT_DIR = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp"
MODEL_NAME = "my_model"

# ── 3. 建模（見下方模式） ──
# ... bmesh / bpy.ops 建模 ...

# ── 4. 材質（PBR — Principled BSDF） ──
mat = bpy.data.materials.new(name=f"{MODEL_NAME}_mat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.8, 0.6, 0.3, 1.0)
bsdf.inputs["Roughness"].default_value = 0.7
bsdf.inputs["Metallic"].default_value = 0.0
obj.data.materials.append(mat)

# ── 5. Apply transforms（匯出前必做） ──
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ── 6. 匯出 GLB ──
glb_path = os.path.join(OUTPUT_DIR, f"{MODEL_NAME}.glb")
bpy.ops.export_scene.gltf(
    filepath=glb_path,
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_materials='EXPORT',
    export_colors=True,
    check_existing=False,
)
print(f"✅ Exported: {glb_path}")

# ── 7. Bounding box（讓 producer 知道尺寸） ──
bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
dims = obj.dimensions
print(f"📐 Dimensions: {dims.x:.2f} x {dims.y:.2f} x {dims.z:.2f} m")
print(f"📊 Faces: {len(obj.data.polygons)}")

# ── 8. 預覽渲染（3 角度） ──
cam_data = bpy.data.cameras.new("QA_Cam")
cam_obj = bpy.data.objects.new("QA_Cam", cam_data)
bpy.context.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# 簡易光源
bpy.ops.object.light_add(type='SUN', location=(5, -5, 10))
bpy.context.object.data.energy = 3.0

bpy.context.scene.render.engine = 'BLENDER_EEVEE_NEXT'
bpy.context.scene.render.resolution_x = 512
bpy.context.scene.render.resolution_y = 512
bpy.context.scene.render.film_transparent = True

angles = [
    ("front", (0, -dims.y * 2.5, dims.z * 0.6), (math.radians(80), 0, 0)),
    ("side",  (dims.x * 2.5, 0, dims.z * 0.6), (math.radians(80), 0, math.radians(90))),
    ("top",   (0, 0, max(dims.x, dims.y) * 2.5), (0, 0, 0)),
]

for label, loc, rot in angles:
    cam_obj.location = loc
    cam_obj.rotation_euler = rot
    bpy.context.scene.render.filepath = os.path.join(OUTPUT_DIR, f"{MODEL_NAME}_{label}.png")
    bpy.ops.render.render(write_still=True)
    print(f"📸 Rendered: {MODEL_NAME}_{label}.png")
```

**執行指令：**
```bash
blender --background --python script.py -- /home/wake/dusk-games/{slug}/public/assets/models/
```

### 看圖建模工作流程 — Image-to-Blender Pipeline

Agent 拿到參考圖（設計稿、截圖、Gemini 生成圖）後的標準流程：

```
參考圖 → 分析形狀 → 分解為基本幾何體 → bmesh 組裝 → 材質匹配 → 匯出 GLB
```

#### 第 1 步：分析參考圖（由 producer 或 blender-dev 執行）

看到參考圖時，必須提取以下資訊再開始建模：

| 分析項目 | 輸出 | 範例 |
|----------|------|------|
| **輪廓分解** | 基本幾何體清單 | 身體=圓柱、頭=球、手臂=細圓柱 |
| **比例估算** | 各部件相對尺寸 | 頭:身體 = 1:2.5，手臂長度 = 身體 0.8x |
| **色彩萃取** | hex 色碼清單 | 主色 #D70F64, 次色 #333333, 亮色 #FFFFFF |
| **面數預算** | 根據物件類型決定 | 角色 5K-8K, 道具 500-2K（見 blender-modeling.md） |
| **對稱性** | 是否可用 mirror | 角色：左右對稱，建築：不對稱 |

#### 第 2 步：幾何體分解策略

```
簡單物件（路燈、桶子）     → 2-3 個 primitive 組合
中型物件（機車、攤位）     → 5-10 個 primitive + extrude
複雜物件（建築、角色）     → bmesh 程序化 + modifier
有機物件（樹木、岩石）     → ico sphere + displacement 或手動頂點
```

**原則：從最大的形狀開始，逐步加細節，達到面數預算就停。**

#### 第 3 步：色彩匹配

從參考圖萃取色彩後，轉為 Blender 線性色彩空間：

```python
# sRGB hex → Blender 線性（近似轉換）
def hex_to_linear(hex_str):
    """Convert hex color to Blender linear RGB tuple."""
    hex_str = hex_str.lstrip('#')
    r, g, b = [int(hex_str[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    # sRGB to linear approximation
    return tuple(c ** 2.2 for c in (r, g, b))

# 用法
color = hex_to_linear("#D70F64")
bsdf.inputs["Base Color"].default_value = (*color, 1.0)
```

#### 第 4 步：Texture 材質（需要更多細節時）

當純色不夠時，使用 Gemini 生成 tileable texture：

```python
# Producer 先用 MCP tool 生成材質圖
# generate_reference_image("tileable brick wall texture, seamless, 512x512")
# → 存入 memory/references/brick_wall.png

# Blender 腳本中載入 texture
img = bpy.data.images.load("/path/to/brick_wall.png")
tex_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
tex_node.image = img

# UV 展開（簡單物件用 Smart UV Project）
bpy.context.view_layer.objects.active = obj
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')

# 連接 texture → Base Color
mat.node_tree.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
```

**Texture 解析度規則：**
- 小道具：256x256
- 中型物件：512x512
- 大型建築/地面：1024x1024
- 永遠不超過 1024x1024（瀏覽器記憶體限制）

### Blender 常見陷阱

| 陷阱 | 症狀 | 解法 |
|------|------|------|
| 沒有 `read_factory_settings(use_empty=True)` | 匯出包含預設方塊 | 腳本開頭清場 |
| 忘記 Apply Transforms | GLB 中物件大小/旋轉錯誤 | 匯出前 `transform_apply()` |
| Principled BSDF 用 sRGB 值 | 顏色偏亮 | 用 `** 2.2` 轉線性 |
| 面數超標 | 遊戲卡頓 | 建模時持續 `print(len(obj.data.polygons))` 監控 |
| `bpy.ops` 依賴 context | headless 模式報錯 | 盡量用 bmesh，或確保 `view_layer.objects.active` 正確 |
| 多材質 = 多 draw call | GPU 瓶頸 | 用頂點色或合併材質 |
| 沒渲染預覽 | producer 無法 QA | 每次匯出都渲染 3 個角度 |

### 進階參考

完整的 bmesh 操作、面數預算表、動畫骨架、程序化建築模板：
→ `memory/references/blender-modeling.md`

成功建模的可重用模式（分層記憶索引）：
→ Dusk 記憶中的「Blender 成功模式索引」區段
