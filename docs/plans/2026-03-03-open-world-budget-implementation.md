# Open World Budget v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 將 scene-compiler 升級為支援開放世界的能力閘門系統：budget v2 schema、兩條新 validator 規則、修正一條既有規則誤報，並同步更新 SKILL.md 和 Midnight 記憶庫。

**Architecture:** 擴充 `BudgetConfig` 型別加入 `lodRequired`/`octreeRequired`/`warnThreshold`，新增 `parseBudget()` 函數處理 v1/v2 向後相容。兩條新規則用 mesh 建立數量比對 frame budget 觸發優化要求。`no-raw-mesh-in-loop` 新增 merge-after-loop 豁免邏輯。

**Tech Stack:** TypeScript, ts-morph (AST), vitest, Node.js ESM

---

## Task 1：擴充 BudgetConfig 型別 + parseBudget()

**Files:**
- Modify: `packages/validator/src/types.ts`
- Create: `packages/validator/src/parse-budget.ts`
- Test: `packages/validator/tests/parse-budget.test.ts`

**Step 1: 寫失敗測試**

建立 `packages/validator/tests/parse-budget.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { parseBudget } from "../src/parse-budget.js";

describe("parseBudget", () => {
  it("parses v1 flat format with defaults for new fields", () => {
    const raw = {
      maxNPCs: 30, maxShadowCasters: 10, maxGLBSizeMB: 5,
      maxTotalAssetTypes: 50, maxRenderDistance: 300,
      targetFPS: 30, maxDrawCalls: 200, maxActiveMeshes: 500,
    };
    const budget = parseBudget(raw);
    expect(budget.maxActiveMeshes).toBe(500);
    expect(budget.lodRequired).toBe(false);
    expect(budget.octreeRequired).toBe(false);
    expect(budget.warnThreshold).toBe(0.75);
  });

  it("parses v2 structured format", () => {
    const raw = {
      version: 2,
      frame: { maxDrawCalls: 150, maxActiveMeshes: 400, maxShadowCasters: 8,
               maxRenderDistance: 200, targetFPS: 60 },
      npcs: { maxTotal: 80, maxActive: 20, activationRadius: 60 },
      openWorld: { lodRequired: true, octreeRequired: true,
                   lodDistances: [50, 150, 300], streamingChunkSize: 100 },
      assets: { maxGLBSizeMB: 3, maxTextureSizePx: 2048 },
      thresholds: { warn: 0.8, error: 1.0 },
      world: { maxTotalMeshTypes: 40, chunkSize: 80 },
    };
    const budget = parseBudget(raw);
    expect(budget.maxActiveMeshes).toBe(400);
    expect(budget.maxDrawCalls).toBe(150);
    expect(budget.lodRequired).toBe(true);
    expect(budget.octreeRequired).toBe(true);
    expect(budget.warnThreshold).toBe(0.8);
    expect(budget.maxNPCs).toBe(20);      // npcs.maxActive
    expect(budget.maxGLBSizeMB).toBe(3);
    expect(budget.maxRenderDistance).toBe(200);
  });

  it("throws on invalid input", () => {
    expect(() => parseBudget(null)).toThrow();
    expect(() => parseBudget("string")).toThrow();
  });
});
```

**Step 2: 跑測試確認失敗**

```bash
cd /home/wake/scene-compiler && pnpm test -- --reporter=verbose 2>&1 | grep -A3 "parseBudget\|FAIL\|Cannot find"
```
Expected: FAIL — `parse-budget.js` not found

**Step 3: 修改 types.ts，新增欄位**

```typescript
export interface BudgetConfig {
  // v1 欄位（保持向後相容）
  maxNPCs: number;
  maxShadowCasters: number;
  maxGLBSizeMB: number;
  maxTotalAssetTypes: number;
  maxRenderDistance: number;
  targetFPS: number;
  maxDrawCalls: number;
  maxActiveMeshes: number;
  // v2 新增欄位（parseBudget 保證一定有值）
  lodRequired: boolean;
  octreeRequired: boolean;
  warnThreshold: number;
}
```

**Step 4: 建立 parse-budget.ts**

```typescript
import type { BudgetConfig } from "./types.js";

export function parseBudget(raw: unknown): BudgetConfig {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Budget config must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;

  if (obj["version"] === 2) {
    return parseV2(obj);
  }
  return parseV1(obj);
}

function parseV1(obj: Record<string, unknown>): BudgetConfig {
  return {
    maxNPCs: num(obj, "maxNPCs", 30),
    maxShadowCasters: num(obj, "maxShadowCasters", 10),
    maxGLBSizeMB: num(obj, "maxGLBSizeMB", 5),
    maxTotalAssetTypes: num(obj, "maxTotalAssetTypes", 50),
    maxRenderDistance: num(obj, "maxRenderDistance", 300),
    targetFPS: num(obj, "targetFPS", 30),
    maxDrawCalls: num(obj, "maxDrawCalls", 200),
    maxActiveMeshes: num(obj, "maxActiveMeshes", 500),
    lodRequired: false,
    octreeRequired: false,
    warnThreshold: 0.75,
  };
}

function parseV2(obj: Record<string, unknown>): BudgetConfig {
  const frame = (obj["frame"] ?? {}) as Record<string, unknown>;
  const npcs = (obj["npcs"] ?? {}) as Record<string, unknown>;
  const openWorld = (obj["openWorld"] ?? {}) as Record<string, unknown>;
  const assets = (obj["assets"] ?? {}) as Record<string, unknown>;
  const thresholds = (obj["thresholds"] ?? {}) as Record<string, unknown>;
  const world = (obj["world"] ?? {}) as Record<string, unknown>;

  return {
    maxDrawCalls: num(frame, "maxDrawCalls", 200),
    maxActiveMeshes: num(frame, "maxActiveMeshes", 500),
    maxShadowCasters: num(frame, "maxShadowCasters", 10),
    maxRenderDistance: num(frame, "maxRenderDistance", 300),
    targetFPS: num(frame, "targetFPS", 30),
    maxNPCs: num(npcs, "maxActive", 25),
    maxGLBSizeMB: num(assets, "maxGLBSizeMB", 5),
    maxTotalAssetTypes: num(world, "maxTotalMeshTypes", 50),
    lodRequired: bool(openWorld, "lodRequired", false),
    octreeRequired: bool(openWorld, "octreeRequired", false),
    warnThreshold: num(thresholds, "warn", 0.75),
  };
}

function num(obj: Record<string, unknown>, key: string, def: number): number {
  const v = obj[key];
  return typeof v === "number" ? v : def;
}

function bool(obj: Record<string, unknown>, key: string, def: boolean): boolean {
  const v = obj[key];
  return typeof v === "boolean" ? v : def;
}
```

**Step 5: 跑測試確認通過**

```bash
cd /home/wake/scene-compiler && pnpm test -- --reporter=verbose 2>&1 | grep -E "parseBudget|✓|✗|PASS|FAIL"
```
Expected: 3 tests pass

**Step 6: Commit**

```bash
cd /home/wake/scene-compiler
git add packages/validator/src/types.ts packages/validator/src/parse-budget.ts packages/validator/tests/parse-budget.test.ts
git commit -m "feat(validator): add BudgetConfig v2 fields and parseBudget()"
```

---

## Task 2：修正 no-raw-mesh-in-loop 誤報（merge-after-loop 豁免）

**Files:**
- Modify: `packages/validator/src/rules/no-raw-mesh-in-loop.ts`
- Modify: `packages/validator/tests/rules.test.ts`

**Step 1: 新增失敗測試**

在 `rules.test.ts` 的 `describe("no-raw-mesh-in-loop")` 區塊末尾加入：

```typescript
  it("should NOT error when loop meshes are merged via Mesh.MergeMeshes", () => {
    const sf = createSourceFile(`
      function buildLaneMarkings(): void {
        const dashes: Mesh[] = [];
        for (let x = 0; x < 500; x += 5) {
          const dash = MeshBuilder.CreateGround("dash", { width: 2, height: 0.15 }, scene);
          dashes.push(dash);
        }
        // Merge into single mesh for draw call optimization
        Mesh.MergeMeshes(dashes, true, true);
      }
    `);
    const diagnostics = noRawMeshInLoopRule.check(sf, defaultBudget);
    expect(diagnostics).toHaveLength(0);
  });

  it("should still error when loop meshes are NOT merged", () => {
    const sf = createSourceFile(`
      function buildBuildings(): void {
        for (let i = 0; i < 100; i++) {
          const box = MeshBuilder.CreateBox("box" + i, { size: 1 }, scene);
          box.position.x = i * 2;
        }
      }
    `);
    const diagnostics = noRawMeshInLoopRule.check(sf, defaultBudget);
    expect(diagnostics).toHaveLength(1);
  });
```

**Step 2: 跑測試確認第一個新測試失敗**

```bash
cd /home/wake/scene-compiler && pnpm test -- --reporter=verbose 2>&1 | grep -A2 "merge-after-loop\|NOT error when loop\|should NOT"
```
Expected: FAIL

**Step 3: 修改 no-raw-mesh-in-loop.ts，加入豁免邏輯**

在 `isInsideLoop` 函數後新增：

```typescript
import { SyntaxKind, type Node, type SourceFile } from "ts-morph";

function isInsideLoop(node: Node): boolean {
  let current = node.getParent();
  while (current) {
    const kind = current.getKind();
    if (
      kind === SyntaxKind.ForStatement ||
      kind === SyntaxKind.ForInStatement ||
      kind === SyntaxKind.ForOfStatement ||
      kind === SyntaxKind.WhileStatement ||
      kind === SyntaxKind.DoStatement
    ) {
      return true;
    }
    current = current.getParent();
  }
  return false;
}

function containingFunctionHasMergeMeshes(node: Node): boolean {
  let current = node.getParent();
  while (current) {
    const kind = current.getKind();
    if (
      kind === SyntaxKind.FunctionDeclaration ||
      kind === SyntaxKind.MethodDeclaration ||
      kind === SyntaxKind.ArrowFunction ||
      kind === SyntaxKind.FunctionExpression
    ) {
      return current.getText().includes("MergeMeshes");
    }
    current = current.getParent();
  }
  return false;
}
```

在 `check()` 的 `if (isInsideLoop(expr))` 區塊內新增豁免條件：

```typescript
        if (isInsideLoop(expr)) {
          // Exempt: loop creates meshes that are merged — valid optimization pattern
          if (containingFunctionHasMergeMeshes(expr)) continue;

          diagnostics.push({ ... });
        }
```

**Step 4: 跑測試確認全部通過**

```bash
cd /home/wake/scene-compiler && pnpm test -- --reporter=verbose 2>&1 | grep -E "no-raw-mesh|✓|✗"
```
Expected: 4 tests pass（包含 2 個新測試）

**Step 5: Commit**

```bash
cd /home/wake/scene-compiler
git add packages/validator/src/rules/no-raw-mesh-in-loop.ts packages/validator/tests/rules.test.ts
git commit -m "fix(validator): exempt merge-after-loop pattern from no-raw-mesh-in-loop"
```

---

## Task 3：新規則 require-lod

**Files:**
- Create: `packages/validator/src/rules/require-lod.ts`
- Modify: `packages/validator/tests/rules.test.ts`

**背景：** `MeshBuilder.CreateBox()` 是 CallExpression（靜態方法），不是 NewExpression。需要分別計數。

**Step 1: 新增失敗測試**

在 `rules.test.ts` 末尾新增：

```typescript
import { requireLodRule } from "../src/rules/require-lod.js";

const openWorldBudget: BudgetConfig = {
  ...defaultBudget,
  lodRequired: true,
  octreeRequired: false,
  warnThreshold: 0.75,
};

describe("require-lod", () => {
  it("should error when file has many mesh creations but no addLODLevel (lodRequired=true)", () => {
    // 建立 > maxActiveMeshes * 0.2 = 100 個 mesh 建立呼叫的程式碼
    const meshLines = Array.from({ length: 110 }, (_, i) =>
      `MeshBuilder.CreateBox("box${i}", { size: 1 }, scene);`
    ).join("\n");
    const sf = createSourceFile(meshLines);
    const diagnostics = requireLodRule.check(sf, openWorldBudget);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("LOD");
  });

  it("should pass when addLODLevel is present", () => {
    const meshLines = Array.from({ length: 110 }, (_, i) =>
      `MeshBuilder.CreateBox("box${i}", { size: 1 }, scene);`
    ).join("\n");
    const sf = createSourceFile(meshLines + `\nmesh.addLODLevel(150, lowMesh);`);
    const diagnostics = requireLodRule.check(sf, openWorldBudget);
    expect(diagnostics).toHaveLength(0);
  });

  it("should warn (not error) when lodRequired=false", () => {
    const meshLines = Array.from({ length: 110 }, (_, i) =>
      `MeshBuilder.CreateBox("box${i}", { size: 1 }, scene);`
    ).join("\n");
    const sf = createSourceFile(meshLines);
    const diagnostics = requireLodRule.check(sf, defaultBudget);  // lodRequired=false
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("warning");
  });

  it("should pass when mesh count is below threshold", () => {
    const sf = createSourceFile(`
      MeshBuilder.CreateBox("ground", { size: 100 }, scene);
      MeshBuilder.CreateBox("wall", { size: 5 }, scene);
    `);
    const diagnostics = requireLodRule.check(sf, openWorldBudget);
    expect(diagnostics).toHaveLength(0);
  });
});
```

**Step 2: 跑測試確認失敗**

```bash
cd /home/wake/scene-compiler && pnpm test -- --reporter=verbose 2>&1 | grep -E "require-lod|Cannot find"
```
Expected: FAIL — `require-lod.js` not found

**Step 3: 建立 require-lod.ts**

```typescript
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { BudgetConfig, Diagnostic, Rule } from "../types.js";

function countMeshCreations(sourceFile: SourceFile): number {
  // Count MeshBuilder.Create*() static calls
  const builderCalls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const expr = call.getExpression();
      if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
        const pae = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        return (
          pae.getExpression().getText() === "MeshBuilder" &&
          pae.getName().startsWith("Create")
        );
      }
      return false;
    }).length;

  // Count new Mesh() / new MeshBuilder()
  const newExprs = sourceFile
    .getDescendantsOfKind(SyntaxKind.NewExpression)
    .filter((expr) => {
      const name = expr.getExpression().getText();
      return name === "Mesh" || name === "MeshBuilder";
    }).length;

  return builderCalls + newExprs;
}

export const requireLodRule: Rule = {
  name: "require-lod",
  severity: "warning",
  check(sourceFile: SourceFile, budget: BudgetConfig): Diagnostic[] {
    const threshold = Math.floor(budget.maxActiveMeshes * 0.2);
    const meshCount = countMeshCreations(sourceFile);

    if (meshCount <= threshold) return [];

    const fileText = sourceFile.getFullText();
    if (fileText.includes("addLODLevel")) return [];

    const severity = budget.lodRequired ? "error" : "warning";
    const filePath = sourceFile.getFilePath();

    return [
      {
        rule: "require-lod",
        severity,
        message: `File creates ~${meshCount} meshes (threshold: ${threshold}) but has no LOD levels`,
        file: filePath,
        line: 1,
        suggestion: `Add LOD levels to reduce draw calls at distance:\n  mesh.addLODLevel(${budget.maxRenderDistance * 0.5}, lowDetailMesh);\n  mesh.addLODLevel(${budget.maxRenderDistance}, null);`,
      },
    ];
  },
};
```

**Step 4: 跑測試確認通過**

```bash
cd /home/wake/scene-compiler && pnpm test -- --reporter=verbose 2>&1 | grep -E "require-lod|✓|✗"
```
Expected: 4 tests pass

**Step 5: Commit**

```bash
cd /home/wake/scene-compiler
git add packages/validator/src/rules/require-lod.ts packages/validator/tests/rules.test.ts
git commit -m "feat(validator): add require-lod rule for open world scenes"
```

---

## Task 4：新規則 require-octree

**Files:**
- Create: `packages/validator/src/rules/require-octree.ts`
- Modify: `packages/validator/tests/rules.test.ts`

**Step 1: 新增失敗測試**

在 `rules.test.ts` 末尾新增（接在 require-lod 區塊後）：

```typescript
import { requireOctreeRule } from "../src/rules/require-octree.js";

const octreeBudget: BudgetConfig = {
  ...defaultBudget,
  lodRequired: false,
  octreeRequired: true,
  warnThreshold: 0.75,
};

describe("require-octree", () => {
  it("should error when file has many mesh creations but no octree (octreeRequired=true)", () => {
    // > maxActiveMeshes * 0.4 = 200 個 mesh
    const meshLines = Array.from({ length: 210 }, (_, i) =>
      `MeshBuilder.CreateBox("box${i}", { size: 1 }, scene);`
    ).join("\n");
    const sf = createSourceFile(meshLines);
    const diagnostics = requireOctreeRule.check(sf, octreeBudget);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("Octree");
  });

  it("should pass when createOrUpdateSelectionOctree is present", () => {
    const meshLines = Array.from({ length: 210 }, (_, i) =>
      `MeshBuilder.CreateBox("box${i}", { size: 1 }, scene);`
    ).join("\n");
    const sf = createSourceFile(
      meshLines + `\nscene.createOrUpdateSelectionOctree(32, 2);`
    );
    const diagnostics = requireOctreeRule.check(sf, octreeBudget);
    expect(diagnostics).toHaveLength(0);
  });

  it("should warn (not error) when octreeRequired=false", () => {
    const meshLines = Array.from({ length: 210 }, (_, i) =>
      `MeshBuilder.CreateBox("box${i}", { size: 1 }, scene);`
    ).join("\n");
    const sf = createSourceFile(meshLines);
    const diagnostics = requireOctreeRule.check(sf, defaultBudget); // octreeRequired=false
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("warning");
  });

  it("should pass when mesh count is below threshold", () => {
    const sf = createSourceFile(`
      MeshBuilder.CreateBox("a", {}, scene);
      MeshBuilder.CreateBox("b", {}, scene);
    `);
    const diagnostics = requireOctreeRule.check(sf, octreeBudget);
    expect(diagnostics).toHaveLength(0);
  });
});
```

**Step 2: 跑測試確認失敗**

```bash
cd /home/wake/scene-compiler && pnpm test -- --reporter=verbose 2>&1 | grep -E "require-octree|Cannot find"
```

**Step 3: 建立 require-octree.ts**

```typescript
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { BudgetConfig, Diagnostic, Rule } from "../types.js";

function countMeshCreations(sourceFile: SourceFile): number {
  const builderCalls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const expr = call.getExpression();
      if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
        const pae = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        return (
          pae.getExpression().getText() === "MeshBuilder" &&
          pae.getName().startsWith("Create")
        );
      }
      return false;
    }).length;

  const newExprs = sourceFile
    .getDescendantsOfKind(SyntaxKind.NewExpression)
    .filter((expr) => {
      const name = expr.getExpression().getText();
      return name === "Mesh" || name === "MeshBuilder";
    }).length;

  return builderCalls + newExprs;
}

export const requireOctreeRule: Rule = {
  name: "require-octree",
  severity: "warning",
  check(sourceFile: SourceFile, budget: BudgetConfig): Diagnostic[] {
    const threshold = Math.floor(budget.maxActiveMeshes * 0.4);
    const meshCount = countMeshCreations(sourceFile);

    if (meshCount <= threshold) return [];

    const fileText = sourceFile.getFullText();
    if (fileText.includes("createOrUpdateSelectionOctree")) return [];

    const severity = budget.octreeRequired ? "error" : "warning";
    const filePath = sourceFile.getFilePath();

    return [
      {
        rule: "require-octree",
        severity,
        message: `File creates ~${meshCount} meshes (threshold: ${threshold}) but has no Octree setup`,
        file: filePath,
        line: 1,
        suggestion: `Add after scene population:\n  scene.createOrUpdateSelectionOctree(32, 2);`,
      },
    ];
  },
};
```

**Step 4: 跑測試確認通過**

```bash
cd /home/wake/scene-compiler && pnpm test -- --reporter=verbose 2>&1 | grep -E "require-octree|✓|✗"
```
Expected: 4 tests pass

**Step 5: Commit**

```bash
cd /home/wake/scene-compiler
git add packages/validator/src/rules/require-octree.ts packages/validator/tests/rules.test.ts
git commit -m "feat(validator): add require-octree rule for open world scenes"
```

---

## Task 5：整合 — 註冊新規則 + 接入 parseBudget

**Files:**
- Modify: `packages/validator/src/rules/index.ts`
- Modify: `packages/validator/src/validator.ts`（export parseBudget）
- Modify: `packages/validator/src/index.ts`（若存在）
- Modify: `packages/cli/src/commands/validate.ts`

**Step 1: 更新 rules/index.ts**

```typescript
export { createGlbExistsRule } from "./glb-exists.js";
export { noRawMeshInLoopRule } from "./no-raw-mesh-in-loop.js";
export { shadowConfigRule } from "./shadow-config.js";
export { materialFreezeRule } from "./material-freeze.js";
export { budgetLimitsRule } from "./budget-limits.js";
export { requireLodRule } from "./require-lod.js";
export { requireOctreeRule } from "./require-octree.js";
```

**Step 2: 確認 @scene-compiler/validator 的 index 有 export parseBudget**

查看 `packages/validator/src/index.ts`（若不存在則建立），確保 export：
```typescript
export { parseBudget } from "./parse-budget.js";
```
若已有 `index.ts` 則在其中加這行。

**Step 3: 更新 validate.ts CLI 使用 parseBudget**

將：
```typescript
budget = JSON.parse(readFileSync(budgetPath, "utf-8"));
```
改為：
```typescript
const raw = JSON.parse(readFileSync(budgetPath, "utf-8"));
budget = parseBudget(raw);
```

並在 import 加入 `parseBudget`，同時在 rules 陣列加入新規則：
```typescript
import {
  validate,
  createGlbExistsRule,
  noRawMeshInLoopRule,
  shadowConfigRule,
  materialFreezeRule,
  budgetLimitsRule,
  requireLodRule,
  requireOctreeRule,
  parseBudget,
  type BudgetConfig,
} from "@scene-compiler/validator";

// ...

const rules = [
  createGlbExistsRule(publicDir),
  noRawMeshInLoopRule,
  shadowConfigRule,
  materialFreezeRule,
  budgetLimitsRule,
  requireLodRule,
  requireOctreeRule,
];
```

**Step 4: 跑完整測試套件確認無破壞**

```bash
cd /home/wake/scene-compiler && pnpm test 2>&1 | tail -20
```
Expected: all tests pass, 0 failures

**Step 5: 手動煙霧測試**

```bash
cd /home/wake/scene-compiler && node --import tsx packages/cli/src/index.ts validate /home/wake/old-babylon-game/src/
```
Expected: 執行不報 crash；應看到 require-lod 和/或 require-octree 的警告（OpenWorldBuilder 有數百個 mesh）

**Step 6: Commit**

```bash
cd /home/wake/scene-compiler
git add packages/validator/src/rules/index.ts packages/validator/src/validator.ts packages/cli/src/commands/validate.ts
git commit -m "feat(validator): register require-lod/octree rules and use parseBudget in CLI"
```

---

## Task 6：更新 game.budget.json 為 v2 格式

**Files:**
- Modify: `game.budget.json`（scene-compiler 預設模板）
- Modify: `/home/wake/runner-game/game.budget.json`（現有遊戲專案）

**Step 1: 更新 scene-compiler/game.budget.json**

```json
{
  "version": 2,
  "frame": {
    "maxDrawCalls": 200,
    "maxActiveMeshes": 500,
    "maxShadowCasters": 10,
    "maxRenderDistance": 300,
    "targetFPS": 30
  },
  "world": {
    "maxTotalMeshTypes": 50,
    "chunkSize": 100
  },
  "npcs": {
    "maxTotal": 100,
    "maxActive": 25,
    "activationRadius": 80
  },
  "openWorld": {
    "lodRequired": false,
    "lodDistances": [50, 150, 300],
    "octreeRequired": false,
    "streamingChunkSize": 100
  },
  "assets": {
    "maxGLBSizeMB": 5,
    "maxTextureSizePx": 2048
  },
  "thresholds": {
    "warn": 0.75,
    "error": 1.0
  }
}
```

注意：預設 `lodRequired: false` 和 `octreeRequired: false`，避免破壞現有小場景專案。開放世界專案需手動設為 true。

**Step 2: 更新 runner-game/game.budget.json**

```json
{
  "version": 2,
  "frame": {
    "maxDrawCalls": 200,
    "maxActiveMeshes": 500,
    "maxShadowCasters": 10,
    "maxRenderDistance": 300,
    "targetFPS": 30
  },
  "world": {
    "maxTotalMeshTypes": 50,
    "chunkSize": 100
  },
  "npcs": {
    "maxTotal": 100,
    "maxActive": 25,
    "activationRadius": 80
  },
  "openWorld": {
    "lodRequired": true,
    "lodDistances": [50, 150, 300],
    "octreeRequired": true,
    "streamingChunkSize": 100
  },
  "assets": {
    "maxGLBSizeMB": 5,
    "maxTextureSizePx": 2048
  },
  "thresholds": {
    "warn": 0.75,
    "error": 1.0
  }
}
```

runner-game 是開放世界專案，`lodRequired: true` 和 `octreeRequired: true`。

**Step 3: 驗證 runner-game build 正確讀取新格式**

```bash
cd /home/wake/runner-game && node --import tsx /home/wake/scene-compiler/packages/cli/src/index.ts validate src/ --public public/ 2>&1 | head -30
```
Expected: 執行正常，應看到 require-lod 和 require-octree 的 ERROR（因為 `lodRequired: true` 但 world builder 沒有 addLODLevel）

**Step 4: Commit**

```bash
cd /home/wake/scene-compiler
git add game.budget.json
git commit -m "feat: update game.budget.json to v2 capability gate schema"

cd /home/wake/runner-game
git add game.budget.json
git commit -m "feat: upgrade game.budget.json to v2 with openWorld.lodRequired=true"
```

---

## Task 7：更新 SKILL.md — 開放世界優化段落

**Files:**
- Modify: `/home/wake/scene-compiler/SKILL.md`

**Step 1: 在 SKILL.md 末尾新增段落**

在 `## New Project — Full Workflow` 區塊之後，檔案末尾附加：

```markdown
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
```

**Step 2: 確認 SKILL.md 可讀**

```bash
wc -l /home/wake/scene-compiler/SKILL.md
```

**Step 3: Commit**

```bash
cd /home/wake/scene-compiler
git add SKILL.md
git commit -m "docs: add open world optimization principles to SKILL.md"
```

---

## Task 8：更新 Midnight 記憶庫

**Files:**
- Modify: `/home/wake/voiceloader/memory/midnight.md`

**Step 1: 在「技術筆記」節的「重要規則」段落之後新增**

找到以下段落：
```
### 重要規則
- game-dev 子 agent 啟動時讀 /home/wake/scene-compiler/SKILL.md
```

在這個段落**之後**插入：

```markdown
### 開放世界效能原則（里程碑 4+ 世界擴展必讀）

**核心認知：Frame Budget ≠ World Budget**
- `frame.maxActiveMeshes: 500` = 任何一幀最多 500 個 mesh 渲染
- 世界可以有 10,000 個物件，由 LOD + Octree + Streaming 管理
- 看到預算限制不代表世界只能這麼小，而是要實作對應優化

**比例閘門：世界越大，必須實作越多優化**
- 檔案有 100+ mesh 建立 → 必須有 LOD（`addLODLevel`）
- 檔案有 200+ mesh 建立 → 必須有 Octree（`createOrUpdateSelectionOctree`）
- runner-game 已設 `openWorld.lodRequired: true`，build 會強制執行

**已知正確模式（不要移除）**
- NPC distance culling ✅（ACTIVATION_RADIUS = 80，CHECK_INTERVAL = 30）
- 車道標線 MergeMeshes ✅（迴圈後合併是正確做法，validator 已豁免）
- 靜態 mesh freezeWorldMatrix() ✅（OpenWorldBuilder 已實作）

**待加入優化（里程碑 4 世界擴展時）**
- 建築群 LOD：`building.addLODLevel(150, lowMesh); building.addLODLevel(300, null);`
- 場景 Octree：場景建立完畢後 `scene.createOrUpdateSelectionOctree(32, 2);`

**完整優化參考**：`/home/wake/scene-compiler/SKILL.md` 的「開放世界優化原則」段落
```

**Step 2: 確認格式正確**

```bash
head -170 /home/wake/voiceloader/memory/midnight.md | tail -40
```

**Step 3: Commit**（voiceloader 是獨立 repo）

```bash
cd /home/wake/voiceloader
git add memory/midnight.md
git commit -m "docs(midnight): add open world performance principles for milestone 4"
```

---

## 最終驗證

```bash
# 完整測試套件
cd /home/wake/scene-compiler && pnpm test

# 手動 validate old-babylon-game（應看到 LOD/Octree 警告）
node --import tsx /home/wake/scene-compiler/packages/cli/src/index.ts validate /home/wake/old-babylon-game/src/

# 手動 validate runner-game（應看到 LOD/Octree ERROR，因為 lodRequired=true）
cd /home/wake/runner-game && node --import tsx /home/wake/scene-compiler/packages/cli/src/index.ts validate src/ --public public/
```
