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

The game's display orientation (portrait or landscape) determines how the canvas and camera are configured. **This must be decided early in development.**

#### Portrait Games (vertical, e.g. mobile shooters, runners)

```typescript
import { Camera } from "@babylonjs/core";

// Vertical FOV fixed — ensures top and bottom are always fully visible
camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;

// Canvas maintains 9:16 ratio, pillarboxed (black bars on sides) on desktop
const TARGET_RATIO = 9 / 16;

function resizeCanvas() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const windowRatio = vw / vh;

  let w: number, h: number;
  if (windowRatio > TARGET_RATIO) {
    // Window is wider than canvas — pillarbox (height-based)
    h = vh;
    w = Math.floor(vh * TARGET_RATIO);
  } else {
    // Window is narrower than canvas — letterbox (width-based)
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

#### Landscape Games (horizontal, e.g. TPS, open world)

```typescript
// Horizontal FOV fixed (default behavior) — ensures left and right are always fully visible
camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;

// Canvas fills the viewport
window.addEventListener("resize", () => engine.resize());
```

**Rules:**
- Portrait games **must NOT** use `FOVMODE_HORIZONTAL_FIXED` (causes top/bottom clipping on desktop)
- Landscape games **must NOT** use `FOVMODE_VERTICAL_FIXED` (causes left/right clipping on mobile)
- Once the orientation is decided, set `background: #000` on the body style in index.html so black bars blend naturally

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

// Requires both engine and scene parameters
const screenshots = new ScreenshotService(engine, scene);
await screenshots.capture(camera, { label: "spawn-point", width: 1280, height: 720 });

// Enable postMessage API (external tools can trigger screenshots via window.postMessage)
const captureAPI = new CaptureAPI(screenshots, () => camera);
captureAPI.listen();
```

---

## Known Babylon.js Gotchas

### 1. `instantiateModelsToScene is not a function`

`ImportMeshAsync` returns `{ meshes, ... }` — you cannot call `.instantiateModelsToScene()` on it.
This method only exists on `AssetContainer` (returned by `LoadAssetContainerAsync`).
See the "GLB Loading" section above.

### 2. `addObjectRenderer is not a function` (Babylon.js 7.54.x)

`Tools.CreateScreenshotUsingRenderTarget()` internally creates a `RenderTargetTexture`,
whose constructor calls `scene.addObjectRenderer()` — but this method does not exist in 7.54.x.
**Fix**: Use `Tools.CreateScreenshot()` (canvas-based, no RTT needed).
scene-compiler's `ScreenshotService` already uses this approach.

### 3. `ScreenshotTools needs to be imported before`

Babylon.js v7 tree-shaking removes the `screenshotTools` module.
A side-effect import is required: `import "@babylonjs/core/Misc/screenshotTools";`
scene-compiler's `ScreenshotService` already includes this import.

### 4. Ground raycast hitting the character's own mesh — character flies upward

If `scene.pickWithRay`'s predicate only excludes the collision root (collisionRoot),
the character GLB model's visible child meshes (feet, body) will still be hit by the ray.
The raycast treats the character's own mesh as "ground" — pushes position.y up — next frame even higher — infinite ascent.

```typescript
// BAD — only excludes collisionRoot, GLB meshes still get hit by raycast
const hit = scene.pickWithRay(ray, (mesh) => {
  return mesh !== this.collisionRoot && mesh.isPickable && mesh.isVisible;
});

// GOOD — excludes all of the character's own meshes
const hit = scene.pickWithRay(ray, (mesh) => {
  return mesh !== this.collisionRoot && !this.meshes.includes(mesh)
    && mesh.isPickable && mesh.isVisible;
});
```

**Applies to all raycast scenarios**: ground detection, interaction detection, shooting — always exclude the ray emitter's own meshes.

### 5. ReferenceError in render observables silently freezes the game

In `scene.onBeforeRenderObservable` or `onAfterRenderObservable` callbacks,
if an uncaught `ReferenceError` is thrown (e.g. referencing a variable not in scope),
**the error will not crash the game**, but it will interrupt all subsequent callbacks in the observable chain.

The symptom is "the game appears to be running and rendering, but certain logic has completely stopped" —
for example, a countdown stuck at 3, state machine not advancing, AI not acting.

**Key principles:**
- Standalone functions (not closures inside `main()`) cannot directly reference `main()`'s local variables — use DOM queries or pass parameters instead
- For any new render observable callback, verify that all referenced variables are in scope
- When debugging, check console errors first — even if the error appears only once, if it's in the render loop it means it throws every frame

```typescript
// BAD — _createHUD is a standalone function, cannot see lobby from main()
function _createHUD(scene: Scene, player: PlayerController): void {
  scene.onAfterRenderObservable.add(() => {
    hudEl.style.display = lobby.isVisible ? "none" : "block"; // ReferenceError!
  });
}

// GOOD — use DOM query instead of direct reference
function _createHUD(scene: Scene, player: PlayerController): void {
  scene.onAfterRenderObservable.add(() => {
    const lobbyEl = document.getElementById("lobby-overlay");
    hudEl.style.display = (lobbyEl && lobbyEl.style.display !== "none") ? "none" : "block";
  });
}
```

### 6. requestPointerLock failure triggers pause — freezes the game

`canvas.requestPointerLock()` is asynchronous. If the browser rejects it (user has not interacted, mobile does not support it),
it triggers a `pointerlockchange` event with `pointerLockElement === null`.
If your pause logic is "detect pointer lock release — pause", this will **immediately pause** at game start.

**Fix**: Do not call `requestPointerLock()` during the countdown. Wait until player control is actually needed (wave start) before locking.

```typescript
// BAD — locks pointer before countdown ends, failure — immediate pause
combatHUD.onDifficultySelected = (difficulty) => {
  waveSystem.start(difficulty);
  canvas.requestPointerLock(); // may fail — triggers pause
};

// GOOD — wait until countdown ends and wave starts before locking
waveSystem.onWaveStarted = (wave) => {
  if (!document.pointerLockElement) {
    canvas.requestPointerLock();
  }
};
```

### 7. After freezeWorldMatrix, use setEnabled() to toggle visibility — not scaling

`freezeWorldMatrix()` tells the engine to stop recalculating the world matrix. If you then use `mesh.scaling = Vector3.Zero()` to "hide" the mesh,
the engine will not update the matrix, and the mesh will not visually disappear (or behave inconsistently).

```typescript
// BAD — scaling has no effect on a frozen mesh
mesh.freezeWorldMatrix();
mesh.scaling = Vector3.Zero(); // No effect! Matrix is frozen

// GOOD — setEnabled removes from the render list directly, no matrix update needed
mesh.freezeWorldMatrix();
mesh.setEnabled(false); // Correctly hides
mesh.setEnabled(true);  // Correctly shows
```

### 8. Multi-level / multi-wave: return early, do not removeCallback

In update loops inside `scene.onBeforeRenderObservable`, **do not remove the callback** when a level ends.
Removing and re-registering easily causes duplicate registrations or missed registrations. Use state checks to return early instead.

```typescript
// BAD — removing and re-adding is error-prone
scene.onBeforeRenderObservable.removeCallback(updateFn);
// ... next level starts ...
scene.onBeforeRenderObservable.add(updateFn); // may add duplicates

// GOOD — always keep the callback, use state checks to skip
scene.onBeforeRenderObservable.add(() => {
  if (gameState === "level_complete" || gameState === "paused") return;
  updateEnemies(dt);
  updatePlayer(dt);
});
```

### 9. Level transitions: deactivateAll, do not dispose

When switching levels, deactivate all objects in the pool (reset position + `setEnabled(false)`) instead of calling `dispose()`.
After dispose, meshes and materials need to be recreated, which is costly and error-prone.

```typescript
// BAD — after dispose, all meshes must be rebuilt for the next level
enemies.forEach(e => e.mesh.dispose());
bullets.forEach(b => b.mesh.dispose());

// GOOD — deactivate and reset, reactivate directly for the next level
function deactivateAll(pool: { mesh: AbstractMesh; active: boolean }[]) {
  for (const item of pool) {
    item.active = false;
    item.mesh.setEnabled(false);
    item.mesh.position.set(0, -100, 0); // move off-screen
  }
}

// At next level start, just activate the needed quantity
```

### 10. Multiplayer: Host re-broadcast + sender self-filtering

In a WebSocket multiplayer architecture, the host re-broadcasts received messages to all players (including the sender).
The sender must filter out its own messages when received, otherwise they will be processed twice.

```typescript
// Host side: receive message — broadcast to everyone
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  // Re-broadcast to all connected clients
  for (const client of clients) {
    client.send(msg.data);
  }
  // Host processes it too
  handleGameMessage(data);
};

// Client side: filter out own messages
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  if (data.senderId === myPlayerId) return; // Key: skip own messages
  handleGameMessage(data);
};
```

### 11. Multiplayer interpolation: frame-rate-independent smooth tracking

In network synchronization, use `1 - Math.pow(base, dt)` for interpolation to ensure consistent smoothness across different frame rates.
Smaller `base` values mean faster tracking (0.001 = nearly instant, 0.1 = slow and smooth).

```typescript
// BAD — frame-rate dependent, smoothing differs between 60fps and 30fps
mesh.position = Vector3.Lerp(mesh.position, targetPos, 0.1);

// GOOD — frame-rate independent, consistent behavior at any fps
const dt = engine.getDeltaTime() / 1000; // seconds
const alpha = 1 - Math.pow(0.001, dt); // 0.001 = tracking speed (smaller = faster)
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

## Open World Optimization Principles

> Required reading when `game.budget.json` has `openWorld.lodRequired = true` or `octreeRequired = true`.
> scene-compiler's `require-lod` and `require-octree` rules enforce these principles.

### Core Concept: Frame Budget ≠ World Budget

```
frame.maxActiveMeshes: 500  →  At most 500 meshes rendered in any single frame
Total world mesh count: unlimited  →  The gap is managed by LOD + Octree + Streaming
```

**Wrong assumption**: Seeing `maxActiveMeshes: 500` and thinking the entire world can only have 500 objects.
**Correct understanding**: The world can have 10,000 objects, as long as no more than 500 are rendered simultaneously.

### Threshold Gates — World Scale vs Required Optimizations

| Mesh creation count in file | Required optimization | scene-compiler behavior |
|---------------------|---------|-------------------|
| < 100 (maxActiveMeshes x 0.2) | None | Silent |
| >= 100 | LOD | WARNING / ERROR (depends on lodRequired) |
| >= 200 (maxActiveMeshes x 0.4) | Octree | WARNING / ERROR (depends on octreeRequired) |

### LOD Implementation Pattern

```typescript
// Set up LOD for a mesh: high detail up close, low detail far away, hidden at extreme distance
const highMesh = MeshBuilder.CreateBox("building", { ... }, scene);
const lowMesh = MeshBuilder.CreateBox("building_low", { ... }, scene);

highMesh.addLODLevel(150, lowMesh);   // Switch to low detail beyond 150 units
highMesh.addLODLevel(300, null);      // Stop rendering beyond 300 units
```

### Octree Implementation Pattern

```typescript
// Call once after all static meshes have been created
// Reduces CPU culling from O(n) to O(log n)
scene.createOrUpdateSelectionOctree(32, 2);
// 32 = max capacity per node, 2 = max depth
```

### NPC Distance Culling (already correctly implemented in NPCManager)

```typescript
// Check distance only every CHECK_INTERVAL frames (throttled)
if (this.frameCounter % CHECK_INTERVAL === 0) {
  for (const npc of this.npcs) {
    const dist = Vector3.Distance(npc.root.position, playerPos);
    npc.active = dist < ACTIVATION_RADIUS;  // Deactivate if out of range
    npc.meshes.forEach(m => m.setEnabled(npc.active));
  }
}
```

### Exempt Pattern: merge-after-loop (does not trigger no-raw-mesh-in-loop)

```typescript
// Correct pattern: create meshes in a loop, then merge into a single draw call
function buildLaneMarkings(): void {
  const dashes: Mesh[] = [];
  for (let x = -250; x < 250; x += 5) {
    const dash = MeshBuilder.CreateGround(`dash_${x}`, { width: 2, height: 0.15 }, scene);
    dashes.push(dash);
  }
  // After merging, only 1 draw call
  Mesh.MergeMeshes(dashes, true, true);
}
// Does not trigger no-raw-mesh-in-loop (validator detects MergeMeshes and exempts)
```

### Alternatives When Thin Instances Are Not Applicable

When each mesh has different dimensions (e.g. procedurally generated buildings) and thin instances cannot be used, use:
1. **Merge** (static meshes) — combine same-material meshes into a single draw call
2. **LOD** (dynamic distance) — swap to lower detail or hide at distance
3. **freezeWorldMatrix()** (static position) — tell the GPU not to recalculate the world matrix every frame

```typescript
// Freeze all static world objects
for (const mesh of worldMeshes) {
  mesh.freezeWorldMatrix();  // Required for buildings/terrain
}
```

---

## Multiplayer Architecture (Express + Socket.IO)

> For games using the `multiplayer` template. Server runs Express + Socket.IO,
> client connects via `socket.io-client`. Vite dev server proxies WebSocket to the game server.

### Project Structure

```
my-game/
├── src/index.ts           ← Babylon.js client (connects to Socket.IO)
├── server/index.ts        ← Express + Socket.IO server
├── public/assets/models/  ← GLB 3D assets
├── dist/                  ← Vite build output
├── vite.config.ts         ← proxy /socket.io → localhost:3000
└── package.json           ← includes express, socket.io, socket.io-client
```

### Development

```bash
pnpm dev           # Runs both client (:3001) and server (:3000) concurrently
pnpm dev:client    # Client only (Vite HMR on :3001)
pnpm dev:server    # Server only (Express+Socket.IO on :3000, tsx watch)
```

### Production

```bash
pnpm build         # Validate + Vite build → dist/
pnpm start         # Express serves dist/ + Socket.IO on :3000
```

### Server Pattern — Authoritative State Broadcast

The server owns the game state. Clients send inputs, server updates state, broadcasts at fixed rate.

```typescript
// server/index.ts — Core pattern
const players = new Map<string, PlayerState>();

io.on("connection", (socket) => {
  players.set(socket.id, { x: 0, z: 0 });

  socket.on("move", (data: { x: number; z: number }) => {
    const state = players.get(socket.id);
    if (state) { state.x = data.x; state.z = data.z; }
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("leave", socket.id);
  });
});

// Broadcast at 20Hz (50ms) — use volatile to drop stale packets
setInterval(() => {
  if (players.size > 0) {
    io.volatile.emit("state", Object.fromEntries(players));
  }
}, 50);
```

### Client Pattern — Interpolated Remote Players

```typescript
// Receive state updates, interpolate remote player positions
socket.on("state", (players: Record<string, { x: number; z: number }>) => {
  for (const [id, pos] of Object.entries(players)) {
    if (id === myId) continue;
    const mesh = getOrCreateRemote(id);
    // Frame-rate independent interpolation (see Gotcha #11)
    const dt = engine.getDeltaTime() / 1000;
    const alpha = 1 - Math.pow(0.001, dt);
    mesh.position.x += (pos.x - mesh.position.x) * alpha;
    mesh.position.z += (pos.z - mesh.position.z) * alpha;
  }
});

// Send position at ~20Hz using volatile (drops if congested)
socket.volatile.emit("move", { x: player.position.x, z: player.position.z });
```

### Key Rules

1. **Server is authoritative** — clients send inputs, server validates and broadcasts
2. **Broadcast at fixed rate** (20Hz) — don't emit on every frame
3. **Use `volatile.emit`** — drops stale packets instead of queueing
4. **Interpolate remote players** — use frame-rate-independent lerp (Gotcha #11)
5. **Clean up on disconnect** — remove meshes when `"leave"` event fires
6. **Validate inputs server-side** — clamp positions, rate-limit actions

### Vite Proxy Config

During development, Vite dev server (:3001) proxies WebSocket traffic to the game server (:3000):

```typescript
// vite.config.ts
server: {
  port: 3001,
  proxy: {
    "/socket.io": { target: "http://localhost:3000", ws: true },
  },
},
```

### Create Multiplayer Project

```bash
node --import tsx /home/wake/scene-compiler/packages/cli/src/index.ts create my-game --template multiplayer
```

---

## Blender Headless 3D Asset Pipeline

> For the blender-dev sub-agent. Read this section + `memory/references/blender-modeling.md` (advanced reference) before modeling.

### Basic Setup — Headless Script Template

Every Blender script must follow this structure:

```python
#!/usr/bin/env python3
"""[Object Name] — Blender headless modeling script"""
import bpy
import bmesh
import math
import sys
import os
from mathutils import Vector, Matrix

# -- 1. Clear scene --
bpy.ops.wm.read_factory_settings(use_empty=True)

# -- 2. Output path (from command line or hardcoded) --
OUTPUT_DIR = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp"
MODEL_NAME = "my_model"

# -- 3. Modeling (see patterns below) --
# ... bmesh / bpy.ops modeling ...

# -- 4. Material (PBR — Principled BSDF) --
mat = bpy.data.materials.new(name=f"{MODEL_NAME}_mat")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.8, 0.6, 0.3, 1.0)
bsdf.inputs["Roughness"].default_value = 0.7
bsdf.inputs["Metallic"].default_value = 0.0
obj.data.materials.append(mat)

# -- 5. Apply transforms (required before export) --
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# -- 6. Export GLB --
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
print(f"Exported: {glb_path}")

# -- 7. Bounding box (lets the producer know the dimensions) --
bbox = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
dims = obj.dimensions
print(f"Dimensions: {dims.x:.2f} x {dims.y:.2f} x {dims.z:.2f} m")
print(f"Faces: {len(obj.data.polygons)}")

# -- 8. Preview renders (3 angles) --
cam_data = bpy.data.cameras.new("QA_Cam")
cam_obj = bpy.data.objects.new("QA_Cam", cam_data)
bpy.context.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# Simple light source
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
    print(f"Rendered: {MODEL_NAME}_{label}.png")
```

**Run command:**
```bash
blender --background --python script.py -- /home/wake/games/{slug}/public/assets/models/
```

### Image-to-Blender Modeling Workflow — Image-to-Blender Pipeline

Standard workflow after the agent receives a reference image (design mockup, screenshot, Gemini-generated image):

```
Reference image → Analyze shapes → Decompose into primitives → bmesh assembly → Material matching → Export GLB
```

#### Step 1: Analyze the reference image (performed by producer or blender-dev)

When viewing a reference image, extract the following information before starting to model:

| Analysis item | Output | Example |
|----------|------|------|
| **Silhouette decomposition** | List of primitives | Body=cylinder, head=sphere, arms=thin cylinders |
| **Proportion estimation** | Relative sizes of parts | Head:body = 1:2.5, arm length = body 0.8x |
| **Color extraction** | List of hex color codes | Primary #D70F64, secondary #333333, accent #FFFFFF |
| **Face count budget** | Based on object type | Character 5K-8K, prop 500-2K (see blender-modeling.md) |
| **Symmetry** | Whether mirror can be used | Character: left-right symmetric, building: asymmetric |

#### Step 2: Geometry decomposition strategy

```
Simple objects (lamp post, barrel)     → 2-3 primitive combinations
Medium objects (motorcycle, stall)     → 5-10 primitives + extrude
Complex objects (building, character)  → bmesh procedural + modifier
Organic objects (trees, rocks)         → ico sphere + displacement or manual vertices
```

**Principle: Start from the largest shapes, add detail progressively, stop when the face count budget is reached.**

#### Step 3: Color matching

After extracting colors from the reference image, convert to Blender linear color space:

```python
# sRGB hex → Blender linear (approximate conversion)
def hex_to_linear(hex_str):
    """Convert hex color to Blender linear RGB tuple."""
    hex_str = hex_str.lstrip('#')
    r, g, b = [int(hex_str[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    # sRGB to linear approximation
    return tuple(c ** 2.2 for c in (r, g, b))

# Usage
color = hex_to_linear("#D70F64")
bsdf.inputs["Base Color"].default_value = (*color, 1.0)
```

#### Step 4: Material decision — vertex color vs texture

| Surface type | Method | When to use |
|-------------|--------|-------------|
| Metals, solid colors, small props (< 2K faces) | **Vertex Color** | Pure color is sufficient, zero extra files |
| Building walls, roads, sidewalks, large repeating patterns | **Gemini Texture** | Needs visible pattern detail (brick, tile, concrete) |
| Mixed model (building = wall + railing) | **Both** | Texture for walls, vertex color for metal trim |

#### Step 4a: Vertex Color workflow (simple)

```python
color_layer = bm.loops.layers.color.new("Col")
for face in bm.faces:
    for loop in face.loops:
        loop[color_layer] = (0.85, 0.75, 0.65, 1.0)  # warm wall color
```

#### Step 4b: Gemini Texture workflow (detailed surfaces)

```python
# ── Step 1: Generate texture via MCP tool (before writing Blender script) ──
# Call the generate_texture_image tool (NOT generate_reference_image):
#   material_name="brick_wall"
#   prompt="aged red brick wall with white mortar lines, Taiwanese style"
#   size=512
# → Returns absolute path: /home/wake/runner-game/public/assets/textures/brick_wall_tex_v1.png

# ── Step 2: UV unwrap in Blender script ──
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')

# ── Step 3: Create PBR material with texture ──
mat = bpy.data.materials.new(name="BrickWall")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
bsdf = nodes["Principled BSDF"]

tex_node = nodes.new("ShaderNodeTexImage")
tex_node.image = bpy.data.images.load("/path/to/brick_wall_tex_v1.png")  # path from tool
links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.75  # 0.5-0.8 buildings, 0.9 roads
obj.data.materials.append(mat)

# ── Step 4: Export GLB ──
# export_materials='EXPORT' packs textures into GLB binary automatically
# No extra image files needed at runtime — Babylon.js loads them from the GLB
```

**Texture resolution rules:**
- Small props: 256x256
- Medium objects / stalls / vehicles: 512x512
- Large buildings / ground: 512x512 ~ 1024x1024
- **Never exceed 1024x1024** (browser memory constraint)

**Important:** Use `generate_texture_image` tool (NOT `generate_reference_image`).
Reference images are isometric design mockups for the producer to review.
Textures are flat, seamless, tileable diffuse maps for Blender PBR materials.

### Common Blender Pitfalls

| Pitfall | Symptom | Fix |
|------|------|------|
| Missing `read_factory_settings(use_empty=True)` | Export includes default cube | Clear scene at script start |
| Forgetting Apply Transforms | Incorrect size/rotation in GLB | Call `transform_apply()` before export |
| Using sRGB values in Principled BSDF | Colors appear too bright | Convert with `** 2.2` to linear |
| Exceeding face count | Game stutters | Monitor with `print(len(obj.data.polygons))` during modeling |
| `bpy.ops` depends on context | Errors in headless mode | Use bmesh where possible, or ensure `view_layer.objects.active` is set correctly |
| Multiple materials = multiple draw calls | GPU bottleneck | Use vertex colors or merge materials |
| No preview renders | Producer cannot QA | Render 3 angles with every export |

### Advanced Reference

Full bmesh operations, face count budget tables, animation rigs, procedural building templates:
→ `memory/references/blender-modeling.md`

Reusable patterns from successful modeling (layered memory index):
→ The "Blender Success Patterns Index" section in Dusk memory
