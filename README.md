[繁體中文](#scene-compiler) | [English](#scene-compiler-1)

# Scene Compiler

Babylon.js 遊戲場景的建置時約束與執行時自動降級。

## Agent 技能檔案

將 scene-compiler 連接到您的 AI agent，即可存取經過實戰驗證的遊戲開發知識：

| 檔案 | 目標受眾 | 內容 |
|------|----------|------|
| `SKILL.md` | Agent (game-dev) | Babylon.js 程式撰寫規則、驗證模式、已知陷阱 |
| `SKILL-ASSET-PIPELINE.md` | Agent (orchestrator + blender-dev) | 3D 素材生命週期：提案 → Blender → QA → 整合 |
| `SKILL-SCENE-DESIGN.md` | Agent (orchestrator + game-dev) | 場景打磨模式：光照、霧效、輝光、環境細節 |
| `SKILL-AGENT-SETUP.md` | 人類 | 如何設計用於遊戲開發的 agent 系統 |

## 遊戲開發的 Agent 架構

Scene-compiler 不僅僅是一個建置工具——它被設計為 **AI agent 遊戲開發流水線**的基礎。技能檔案和範例編碼了來自數百次自主 agent 喚醒的實戰經驗，這些喚醒產出了可遊玩的瀏覽器遊戲。

### 三 Agent 模式

建議的設置使用三個專門化的 agent：

```
┌─────────────────────────────────────────────────────┐
│  Game Director (orchestrator)                       │
│  Reads memory → picks ONE task → delegates →        │
│  reviews → reports                                  │
│  Tools: Read, Bash, Glob, Grep (NO Write/Edit)     │
│                                                     │
│  Sub-agents:                                        │
│    ├── game-dev    (Babylon.js/TypeScript)           │
│    ├── blender-dev (headless 3D modeling)            │
│    └── fullstack-dev (backend/infra, optional)      │
├─────────────────────────────────────────────────────┤
│  Dev Reporter (content writer)                      │
│  Reads awakening reports → writes blog posts        │
│  Translates "what happened" into "why it matters"   │
│  Helps humans think about what's meaningful         │
├─────────────────────────────────────────────────────┤
│  Supervisor (scheduler)                             │
│  systemd timer / cron → awakens agents on schedule  │
│  Idle protection: skips if nothing to do            │
└─────────────────────────────────────────────────────┘
```

### Prompt 導向 vs 記憶導向

Director agent 可根據專案規模配置為兩種模式：

| 模式 | 北極星所在位置 | 最適合 | 取捨 |
|------|---------------|--------|------|
| **Prompt 導向** | 系統提示詞（不可變） | 大型、長期專案（5 個以上階段） | 方向穩定，但難以轉向 |
| **記憶導向** | Agent 記憶（可變） | 小型、探索性專案 | 靈活，但方向可能漂移 |

**關鍵洞見：** Prompt 導向的 agent 會跨階段累積成果，因為技術約束（攝影機架構、素材流水線、QA 流程）永遠不會改變。記憶導向的 agent 更靈活，但在長期開發週期中可能失去一致性。

詳見 `SKILL-AGENT-SETUP.md` 的完整分析。

### 範例配置

完整的提示詞模板與 supervisor 模式：

| 範例 | 檔案 | 描述 |
|------|------|------|
| Game Director | [`examples/agents/game-director.md`](examples/agents/game-director.md) | 適用於大型專案的 prompt 導向 orchestrator |
| Game Factory | [`examples/agents/game-factory.md`](examples/agents/game-factory.md) | 適用於靈活/小型專案的記憶導向 orchestrator |
| Dev Reporter | [`examples/agents/dev-reporter.md`](examples/agents/dev-reporter.md) | 將報告轉化為敘事的部落格撰寫者 |

---

## 問題所在

AI agent 撰寫的 Babylon.js 程式碼可以完美編譯和通過型別檢查——但在執行時爆炸：

- **在迴圈中 `new Mesh()`** 在 for 迴圈內生成 200 個 NPC。200 次繪製呼叫。4 FPS。
- **從不呼叫 `.freeze()`** 在材質上。GPU 每幀重新上傳。
- **引用不存在的 GLB 檔案。** 靜默 404，模型不可見。
- **對 null 執行裸 `.dispose()`。** 執行時崩潰，場景消失。
- **沒有陰影配置。** 預設陰影看起來壞掉，吃效能。
- **硬編碼 500 個活動 mesh** 但預算只允許 200 個。

這些不是型別錯誤。TypeScript 無法捕捉它們。場景編譯通過、CI 通過，然後遊戲帶著問題上線。

## 為何需要此工具

Scene Compiler 增加了**三層防禦**，在玩家發現問題之前就攔截它們：

```
┌─────────────────────────────────────────────┐
│  Layer 1: Static Validation (buildtime)     │
│  ts-morph AST analysis — 6 rules            │
│  Catches: loop meshes, missing GLB, budget  │
├─────────────────────────────────────────────┤
│  Layer 2: Code Rewriting (vite plugin)      │
│  Auto-inject .freeze() + dispose guards     │
│  Catches: material perf, null dispose       │
├─────────────────────────────────────────────┤
│  Layer 3: Runtime Monitor (in-game)         │
│  FPS tracking, adaptive quality, budget     │
│  Catches: runtime perf degradation          │
└─────────────────────────────────────────────┘
```

這**不是** Babylon.js 的封裝。Agent 已經熟悉 Babylon API。Scene Compiler 強制執行約束——如同遊戲引擎的建置流水線，但專為 web 場景設計。

## 快速開始

```bash
# Create a new project (generates everything you need)
scene create my-game
cd my-game

# Develop
pnpm dev

# Validate + build
pnpm build
```

就這樣。`pnpm build` 會先執行驗證——如果您的場景違反規則，建置就會失敗。

### 加入現有專案

```bash
cd your-project
scene init            # creates game.budget.json
scene validate src/   # check your code
scene build src/      # validate + vite build
```

## CLI 參考

### `scene create <name>`

建立一個完整的 Babylon.js 專案，並預先配置好 scene-compiler。

```bash
scene create runner-game          # relative path
scene create /home/user/my-game   # absolute path
```

生成：`package.json`、`tsconfig.json`、`vite.config.ts`、`game.budget.json`、`index.html`、`src/index.ts` 和 `public/assets/models/`。自動執行 `pnpm install`。

### `scene validate [dir]`

對場景原始碼執行靜態分析。

```bash
scene validate src/
scene validate src/ --budget custom-budget.json
scene validate src/ --public assets/
```

| 選項 | 描述 |
|------|------|
| `-b, --budget <path>` | 預算配置路徑（預設：`./game.budget.json`） |
| `-p, --public <dir>` | GLB 查詢用的公開素材目錄（預設：`<dir>/../public`） |

### `scene init`

在當前目錄建立預設的 `game.budget.json`。

### `scene build [dir]`

先驗證，然後執行 `vite build`。如果驗證發現錯誤則失敗。

選項與 `validate` 相同。

## 驗證規則

| 規則 | 嚴重度 | 攔截內容 |
|------|--------|----------|
| `no-raw-mesh-in-loop` | 錯誤 | 在 for/while/do 迴圈中使用 `new Mesh()` 或 `new MeshBuilder()`。應改用 thin instances。 |
| `glb-exists` | 錯誤 | 引用的 `.glb` 檔案字串在公開目錄中不存在。 |
| `budget-limits` | 錯誤 | 數值常數（NPC 數量、渲染距離、繪製呼叫等）超出預算限制。 |
| `material-freeze` | 警告 | 建立的材質在檔案中沒有任何 `.freeze()` 呼叫。 |
| `shadow-config` | 警告 | 建立 `ShadowGenerator` 時未配置模糊/指數設定。 |

### 預算模式比對

`budget-limits` 規則將變數名稱與預算欄位進行比對：

| 變數模式 | 預算欄位 | 範例 |
|----------|----------|------|
| `*npc*` | `maxNPCs` | `const npcCount = 50` |
| `*shadow*cast*` | `maxShadowCasters` | `let shadowCasters = 20` |
| `*active*mesh*` | `maxActiveMeshes` | `const activeMeshLimit = 600` |
| `*render*dist*` | `maxRenderDistance` | `let renderDistance = 500` |
| `*draw*call*` | `maxDrawCalls` | `const maxDrawCalls = 300` |

## Vite 外掛 — sceneRewriter

Rewriter 外掛在建置時執行，自動轉換您的程式碼：

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { sceneRewriter } from "/home/wake/scene-compiler/packages/rewriter/src/plugin.js";

export default defineConfig({
  plugins: [sceneRewriter()],
});
```

### 功能說明

**自動凍結材質** — 在對任何 `StandardMaterial`、`PBRMaterial` 或 PBR 變體的最後一個屬性賦值之後插入 `.freeze()`：

```typescript
// Your code:
const mat = new StandardMaterial("mat", scene);
mat.diffuseColor = new Color3(1, 0, 0);

// After rewrite:
const mat = new StandardMaterial("mat", scene);
mat.diffuseColor = new Color3(1, 0, 0);
mat.freeze();
```

**自動 dispose 防護** — 為裸 `.dispose()` 呼叫包裹 null 檢查：

```typescript
// Your code:
mesh.dispose();

// After rewrite:
mesh && mesh.dispose();
```

### 選項

```typescript
sceneRewriter({
  freeze: true,        // auto-freeze materials (default: true)
  disposeGuard: true,  // dispose null-check (default: true)
})
```

## 執行時整合

執行時套件提供遊戲內效能監控與自適應品質降級。

```typescript
import { initRuntime } from "/home/wake/scene-compiler/packages/runtime/src/index.js";

const { monitor, adaptive, runtimeBudget, dispose } = initRuntime({
  engine,
  scene,
  budget: { maxDrawCalls: 200, maxActiveMeshes: 500, targetFPS: 30 },
  baseRenderDistance: 300,
  callbacks: {
    onShadowToggle: (enabled) => {
      shadowGenerator.setEnabled(enabled);
    },
    onNPCLimit: (maxCount) => {
      // Cull NPCs beyond maxCount
    },
    onRenderDistance: (distance) => {
      camera.maxZ = distance;
    },
    onParticlesToggle: (enabled) => {
      particleSystem.stop();
    },
  },
});

// Later: cleanup
dispose();
```

### 自適應品質等級

| 等級 | 觸發條件 | 動作 |
|------|----------|------|
| L0 | — | 完整品質 |
| L1 | FPS < 30 持續 3 秒 | 關閉陰影 |
| L2 | FPS < 25 持續 3 秒 | 將 NPC 減少至 10 |
| L3 | FPS < 20 持續 3 秒 | 渲染距離降至 50% |
| L4 | FPS < 15 持續 3 秒 | 關閉粒子與後期處理 |

升級需要 FPS 持續高於閾值 + 5 FPS 的額外餘量，維持 5 秒。

## 預算配置

`game.budget.json` 定義場景的約束條件：

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

| 欄位 | 描述 | 建議範圍 |
|------|------|----------|
| `maxNPCs` | 最大 NPC/agent 數量 | 10–50 |
| `maxShadowCasters` | 投射陰影的 mesh 數量 | 5–15 |
| `maxGLBSizeMB` | 單一 GLB 檔案最大大小 | 2–10 |
| `maxTotalAssetTypes` | 不同素材類型總數 | 20–100 |
| `maxRenderDistance` | 攝影機遠裁面 | 100–500 |
| `targetFPS` | 最低可接受 FPS | 30–60 |
| `maxDrawCalls` | 每幀繪製呼叫次數 | 100–300 |
| `maxActiveMeshes` | 每幀可見 mesh 數量 | 200–800 |

## 專案結構

```
scene-compiler/
├── packages/
│   ├── cli/           # CLI commands (create, validate, init, build)
│   ├── validator/     # ts-morph AST rules engine
│   ├── rewriter/      # Vite plugin (auto-freeze, dispose-guard)
│   ├── runtime/       # PerformanceMonitor, AdaptiveQuality, RuntimeBudget
│   └── capture/       # ScreenshotService, QAReporter, CaptureAPI
├── examples/
│   └── agents/        # Agent prompt templates and supervisor patterns
│       ├── game-director.md   # Prompt-guided orchestrator
│       ├── game-factory.md    # Memory-guided orchestrator
│       └── dev-reporter.md    # Blog writer agent
├── game.budget.json           # Default budget config
├── SKILL.md                   # Babylon.js coding reference (for game-dev agent)
├── SKILL-ASSET-PIPELINE.md    # 3D asset lifecycle (for orchestrator + blender-dev)
├── SKILL-SCENE-DESIGN.md      # Scene polish patterns (for orchestrator + game-dev)
└── SKILL-AGENT-SETUP.md       # Agent architecture guide (for humans)
```

## 執行測試

```bash
cd /home/wake/scene-compiler
pnpm test
```

測試涵蓋：轉換邏輯、全部 5 條驗證規則、驗證器核心、AST 分析及檔案系統操作。

---

# Scene Compiler

Buildtime constraints + runtime auto-degrade for Babylon.js game scenes.

## Agent Skill Files

Connect scene-compiler to your AI agent and it gets access to battle-tested game development knowledge:

| File | Audience | Content |
|------|----------|---------|
| `SKILL.md` | Agent (game-dev) | Babylon.js coding rules, validation patterns, known gotchas |
| `SKILL-ASSET-PIPELINE.md` | Agent (orchestrator + blender-dev) | 3D asset lifecycle: proposal → Blender → QA → integration |
| `SKILL-SCENE-DESIGN.md` | Agent (orchestrator + game-dev) | Scene polish patterns: lighting, fog, glow, environmental detail |
| `SKILL-AGENT-SETUP.md` | Human | How to design agent systems for game development |

## Agent Architecture for Game Development

Scene-compiler isn't just a build tool — it's designed to be the foundation of an **AI agent game development pipeline**. The skill files and examples encode battle-tested patterns from hundreds of autonomous agent awakenings that produced playable browser games.

### Three-Agent Pattern

The recommended setup uses three specialized agents:

```
┌─────────────────────────────────────────────────────┐
│  Game Director (orchestrator)                       │
│  Reads memory → picks ONE task → delegates →        │
│  reviews → reports                                  │
│  Tools: Read, Bash, Glob, Grep (NO Write/Edit)     │
│                                                     │
│  Sub-agents:                                        │
│    ├── game-dev    (Babylon.js/TypeScript)           │
│    ├── blender-dev (headless 3D modeling)            │
│    └── fullstack-dev (backend/infra, optional)      │
├─────────────────────────────────────────────────────┤
│  Dev Reporter (content writer)                      │
│  Reads awakening reports → writes blog posts        │
│  Translates "what happened" into "why it matters"   │
│  Helps humans think about what's meaningful         │
├─────────────────────────────────────────────────────┤
│  Supervisor (scheduler)                             │
│  systemd timer / cron → awakens agents on schedule  │
│  Idle protection: skips if nothing to do            │
└─────────────────────────────────────────────────────┘
```

### Prompt-guided vs Memory-guided

The director agent can be configured in two modes depending on project scale:

| Mode | North Star lives in | Best for | Trade-off |
|------|-------------------|----------|-----------|
| **Prompt-guided** | System prompt (immutable) | Large, long-term projects (5+ phases) | Stable direction, but hard to pivot |
| **Memory-guided** | Agent memory (mutable) | Small, exploratory projects | Flexible, but direction may drift |

**Key insight:** Prompt-guided agents accumulate results across phases because the technical constraints (camera architecture, asset pipeline, QA process) never change. Memory-guided agents are more flexible but may lose consistency over long development cycles.

See `SKILL-AGENT-SETUP.md` for the full analysis.

### Example Configurations

Complete prompt templates and supervisor patterns:

| Example | File | Description |
|---------|------|-------------|
| Game Director | [`examples/agents/game-director.md`](examples/agents/game-director.md) | Prompt-guided orchestrator for large projects |
| Game Factory | [`examples/agents/game-factory.md`](examples/agents/game-factory.md) | Memory-guided orchestrator for flexible/small projects |
| Dev Reporter | [`examples/agents/dev-reporter.md`](examples/agents/dev-reporter.md) | Blog writer that translates reports into narratives |

---

## The Problem

AI agents write Babylon.js code that compiles and type-checks perfectly — but explodes at runtime:

- **Loop `new Mesh()`** inside a for-loop to spawn 200 NPCs. 200 draw calls. 4 FPS.
- **Never call `.freeze()`** on materials. GPU re-uploads every frame.
- **Reference GLB files that don't exist.** Silent 404, invisible models.
- **Bare `.dispose()` on nulls.** Runtime crash, scene gone.
- **No shadow configuration.** Default shadows look broken, eat performance.
- **Hardcode 500 active meshes** when the budget says 200.

These aren't type errors. TypeScript can't catch them. The scene compiles, the CI passes, and the game ships broken.

## Why This Tool

Scene Compiler adds **three layers of defense** that catch these problems before players do:

```
┌─────────────────────────────────────────────┐
│  Layer 1: Static Validation (buildtime)     │
│  ts-morph AST analysis — 6 rules            │
│  Catches: loop meshes, missing GLB, budget  │
├─────────────────────────────────────────────┤
│  Layer 2: Code Rewriting (vite plugin)      │
│  Auto-inject .freeze() + dispose guards     │
│  Catches: material perf, null dispose       │
├─────────────────────────────────────────────┤
│  Layer 3: Runtime Monitor (in-game)         │
│  FPS tracking, adaptive quality, budget     │
│  Catches: runtime perf degradation          │
└─────────────────────────────────────────────┘
```

This is **not** a Babylon.js wrapper. Agents already know the Babylon API. Scene Compiler enforces constraints — like a game engine's build pipeline, but for web scenes.

## Quick Start

```bash
# Create a new project (generates everything you need)
scene create my-game
cd my-game

# Develop
pnpm dev

# Validate + build
pnpm build
```

That's it. `pnpm build` runs validation first — if your scene breaks the rules, the build fails.

### Add to an existing project

```bash
cd your-project
scene init            # creates game.budget.json
scene validate src/   # check your code
scene build src/      # validate + vite build
```

## CLI Reference

### `scene create <name>`

Scaffold a complete Babylon.js project with scene-compiler pre-configured.

```bash
scene create runner-game          # relative path
scene create /home/user/my-game   # absolute path
```

Generates: `package.json`, `tsconfig.json`, `vite.config.ts`, `game.budget.json`, `index.html`, `src/index.ts`, and `public/assets/models/`. Runs `pnpm install` automatically.

### `scene validate [dir]`

Run static analysis on scene source files.

```bash
scene validate src/
scene validate src/ --budget custom-budget.json
scene validate src/ --public assets/
```

| Option | Description |
|--------|-------------|
| `-b, --budget <path>` | Path to budget config (default: `./game.budget.json`) |
| `-p, --public <dir>` | Public assets directory for GLB lookup (default: `<dir>/../public`) |

### `scene init`

Create a default `game.budget.json` in the current directory.

### `scene build [dir]`

Validate, then run `vite build`. Fails if validation finds errors.

Same options as `validate`.

## Validation Rules

| Rule | Severity | What it catches |
|------|----------|----------------|
| `no-raw-mesh-in-loop` | Error | `new Mesh()` or `new MeshBuilder()` inside for/while/do loops. Use thin instances instead. |
| `glb-exists` | Error | String literals referencing `.glb` files that don't exist in the public directory. |
| `budget-limits` | Error | Numeric constants (NPC count, render distance, draw calls, etc.) exceeding budget limits. |
| `material-freeze` | Warning | Materials created without a `.freeze()` call anywhere in the file. |
| `shadow-config` | Warning | `ShadowGenerator` created without blur/exponential configuration. |

### Budget Pattern Matching

The `budget-limits` rule matches variable names to budget fields:

| Variable pattern | Budget field | Example |
|-----------------|-------------|---------|
| `*npc*` | `maxNPCs` | `const npcCount = 50` |
| `*shadow*cast*` | `maxShadowCasters` | `let shadowCasters = 20` |
| `*active*mesh*` | `maxActiveMeshes` | `const activeMeshLimit = 600` |
| `*render*dist*` | `maxRenderDistance` | `let renderDistance = 500` |
| `*draw*call*` | `maxDrawCalls` | `const maxDrawCalls = 300` |

## Vite Plugin — sceneRewriter

The rewriter plugin runs at build time, automatically transforming your code:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { sceneRewriter } from "/home/wake/scene-compiler/packages/rewriter/src/plugin.js";

export default defineConfig({
  plugins: [sceneRewriter()],
});
```

### What it does

**Auto-freeze materials** — Inserts `.freeze()` after the last property assignment to any `StandardMaterial`, `PBRMaterial`, or PBR variant:

```typescript
// Your code:
const mat = new StandardMaterial("mat", scene);
mat.diffuseColor = new Color3(1, 0, 0);

// After rewrite:
const mat = new StandardMaterial("mat", scene);
mat.diffuseColor = new Color3(1, 0, 0);
mat.freeze();
```

**Auto-dispose guard** — Wraps bare `.dispose()` calls with null checks:

```typescript
// Your code:
mesh.dispose();

// After rewrite:
mesh && mesh.dispose();
```

### Options

```typescript
sceneRewriter({
  freeze: true,        // auto-freeze materials (default: true)
  disposeGuard: true,  // dispose null-check (default: true)
})
```

## Runtime Integration

The runtime package provides in-game performance monitoring and adaptive quality degradation.

```typescript
import { initRuntime } from "/home/wake/scene-compiler/packages/runtime/src/index.js";

const { monitor, adaptive, runtimeBudget, dispose } = initRuntime({
  engine,
  scene,
  budget: { maxDrawCalls: 200, maxActiveMeshes: 500, targetFPS: 30 },
  baseRenderDistance: 300,
  callbacks: {
    onShadowToggle: (enabled) => {
      shadowGenerator.setEnabled(enabled);
    },
    onNPCLimit: (maxCount) => {
      // Cull NPCs beyond maxCount
    },
    onRenderDistance: (distance) => {
      camera.maxZ = distance;
    },
    onParticlesToggle: (enabled) => {
      particleSystem.stop();
    },
  },
});

// Later: cleanup
dispose();
```

### Adaptive Quality Levels

| Level | Trigger | Action |
|-------|---------|--------|
| L0 | — | Full quality |
| L1 | FPS < 30 for 3s | Shadows off |
| L2 | FPS < 25 for 3s | Reduce NPCs to 10 |
| L3 | FPS < 20 for 3s | Render distance 50% |
| L4 | FPS < 15 for 3s | Particles + post-processing off |

Upgrade requires sustained FPS above threshold + 5 FPS bonus for 5 seconds.

## Budget Config

`game.budget.json` defines the constraints for your scene:

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

| Field | Description | Recommended range |
|-------|-------------|-------------------|
| `maxNPCs` | Maximum NPC/agent count | 10–50 |
| `maxShadowCasters` | Meshes casting shadows | 5–15 |
| `maxGLBSizeMB` | Max single GLB file size | 2–10 |
| `maxTotalAssetTypes` | Total distinct asset types | 20–100 |
| `maxRenderDistance` | Camera far plane | 100–500 |
| `targetFPS` | Minimum acceptable FPS | 30–60 |
| `maxDrawCalls` | Draw calls per frame | 100–300 |
| `maxActiveMeshes` | Visible meshes per frame | 200–800 |

## Project Structure

```
scene-compiler/
├── packages/
│   ├── cli/           # CLI commands (create, validate, init, build)
│   ├── validator/     # ts-morph AST rules engine
│   ├── rewriter/      # Vite plugin (auto-freeze, dispose-guard)
│   ├── runtime/       # PerformanceMonitor, AdaptiveQuality, RuntimeBudget
│   └── capture/       # ScreenshotService, QAReporter, CaptureAPI
├── examples/
│   └── agents/        # Agent prompt templates and supervisor patterns
│       ├── game-director.md   # Prompt-guided orchestrator
│       ├── game-factory.md    # Memory-guided orchestrator
│       └── dev-reporter.md    # Blog writer agent
├── game.budget.json           # Default budget config
├── SKILL.md                   # Babylon.js coding reference (for game-dev agent)
├── SKILL-ASSET-PIPELINE.md    # 3D asset lifecycle (for orchestrator + blender-dev)
├── SKILL-SCENE-DESIGN.md      # Scene polish patterns (for orchestrator + game-dev)
└── SKILL-AGENT-SETUP.md       # Agent architecture guide (for humans)
```

## Running Tests

```bash
cd /home/wake/scene-compiler
pnpm test
```

Tests cover: transform logic, all 5 validation rules, validator core, AST analysis, and file system operations.
