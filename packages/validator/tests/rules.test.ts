import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Project } from "ts-morph";
import { createGlbExistsRule } from "../src/rules/glb-exists.js";
import { noRawMeshInLoopRule } from "../src/rules/no-raw-mesh-in-loop.js";
import type { BudgetConfig } from "../src/types.js";

const defaultBudget: BudgetConfig = {
  maxNPCs: 30,
  maxShadowCasters: 10,
  maxGLBSizeMB: 5,
  maxTotalAssetTypes: 50,
  maxRenderDistance: 300,
  targetFPS: 30,
  maxDrawCalls: 200,
  maxActiveMeshes: 500,
  lodRequired: false,
  octreeRequired: false,
  warnThreshold: 0.75,
};

function createSourceFile(code: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("test.ts", code);
}

describe("glb-exists", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "glb-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should error when a referenced .glb file does not exist", () => {
    const rule = createGlbExistsRule(tmpDir);
    const sf = createSourceFile(`const model = "assets/hero.glb";\n`);
    const diagnostics = rule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("hero.glb");
  });

  it("should pass when a referenced .glb file exists", () => {
    mkdirSync(path.join(tmpDir, "assets"), { recursive: true });
    writeFileSync(path.join(tmpDir, "assets", "hero.glb"), "");

    const rule = createGlbExistsRule(tmpDir);
    const sf = createSourceFile(`const model = "assets/hero.glb";\n`);
    const diagnostics = rule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(0);
  });
});

describe("no-raw-mesh-in-loop", () => {
  it("should error when new Mesh() is inside a for loop", () => {
    const sf = createSourceFile(`
      for (let i = 0; i < 10; i++) {
        const m = new Mesh("m", scene);
      }
    `);
    const diagnostics = noRawMeshInLoopRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("Mesh");
    expect(diagnostics[0].suggestion).toContain("thin instances");
  });

  it("should pass when new Mesh() is outside a loop", () => {
    const sf = createSourceFile(`
      const m = new Mesh("m", scene);
    `);
    const diagnostics = noRawMeshInLoopRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(0);
  });

  it("should error when new MeshBuilder() is inside a while loop", () => {
    const sf = createSourceFile(`
      while (true) {
        const m = new MeshBuilder();
      }
    `);
    const diagnostics = noRawMeshInLoopRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("MeshBuilder");
  });

  it("should NOT error when loop meshes are merged via Mesh.MergeMeshes", () => {
    const sf = createSourceFile(`
      function buildLaneMarkings(): void {
        const dashes: Mesh[] = [];
        for (let x = 0; x < 500; x += 5) {
          const dash = MeshBuilder.CreateGround("dash", { width: 2, height: 0.15 }, scene);
          dashes.push(dash);
        }
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
});
