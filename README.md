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
