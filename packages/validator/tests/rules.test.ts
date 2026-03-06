import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Project } from "ts-morph";
import { createGlbExistsRule } from "../src/rules/glb-exists.js";
import { noRawMeshInLoopRule } from "../src/rules/no-raw-mesh-in-loop.js";
import { requireLodRule } from "../src/rules/require-lod.js";
import { requireOctreeRule } from "../src/rules/require-octree.js";
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

  it("should NOT error when loop creates thin instance templates", () => {
    const sf = createSourceFile(`
      function buildForest(): void {
        for (const config of treeConfigs) {
          const template = MeshBuilder.CreateCylinder(config.name, config.opts, scene);
          template.isVisible = false;
          for (const pos of config.positions) {
            template.thinInstanceAdd(Matrix.Translation(pos.x, pos.y, pos.z));
          }
        }
      }
    `);
    const diagnostics = noRawMeshInLoopRule.check(sf, defaultBudget);
    expect(diagnostics).toHaveLength(0);
  });

  it("should NOT error when function uses thinInstanceSetBuffer", () => {
    const sf = createSourceFile(`
      function buildGrass(): void {
        for (const type of grassTypes) {
          const blade = MeshBuilder.CreatePlane(type.name, {}, scene);
          blade.thinInstanceSetBuffer("matrix", type.matrices);
        }
      }
    `);
    const diagnostics = noRawMeshInLoopRule.check(sf, defaultBudget);
    expect(diagnostics).toHaveLength(0);
  });

  it("should error when MeshBuilder.CreateBox is inside .forEach()", () => {
    const sf = createSourceFile(`
      positions.forEach(pos => {
        const mesh = MeshBuilder.CreateBox("box", { size: 1 }, scene);
        mesh.position = pos;
      });
    `);
    const diagnostics = noRawMeshInLoopRule.check(sf, defaultBudget);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("loop");
  });

  it("should error when new Mesh() is inside .map()", () => {
    const sf = createSourceFile(`
      const meshes = positions.map(pos => {
        return new Mesh("m", scene);
      });
    `);
    const diagnostics = noRawMeshInLoopRule.check(sf, defaultBudget);
    expect(diagnostics).toHaveLength(1);
  });

  it("should NOT error when .forEach() uses MergeMeshes", () => {
    const sf = createSourceFile(`
      function buildWall(): void {
        const parts: Mesh[] = [];
        segments.forEach(seg => {
          parts.push(MeshBuilder.CreateBox("w", {}, scene));
        });
        Mesh.MergeMeshes(parts, true, true);
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

const openWorldBudget: BudgetConfig = {
  maxNPCs: 30,
  maxShadowCasters: 10,
  maxGLBSizeMB: 5,
  maxTotalAssetTypes: 50,
  maxRenderDistance: 300,
  targetFPS: 30,
  maxDrawCalls: 200,
  maxActiveMeshes: 500,
  lodRequired: true,
  octreeRequired: false,
  warnThreshold: 0.75,
};

describe("require-lod", () => {
  it("should error when file has many mesh creations but no addLODLevel (lodRequired=true)", () => {
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
    const diagnostics = requireLodRule.check(sf, defaultBudget);
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

  it("should pass when addLODLevel is in a DIFFERENT file in the same project", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const meshLines = Array.from({ length: 110 }, (_, i) =>
      `MeshBuilder.CreateBox("box${i}", { size: 1 }, scene);`
    ).join("\n");
    const worldFile = project.createSourceFile("world.ts", meshLines);
    project.createSourceFile("scene-manager.ts", `mesh.addLODLevel(150, lowMesh);`);

    const diagnostics = requireLodRule.check(worldFile, openWorldBudget);
    expect(diagnostics).toHaveLength(0);
  });
});

const octreeBudget: BudgetConfig = {
  maxNPCs: 30,
  maxShadowCasters: 10,
  maxGLBSizeMB: 5,
  maxTotalAssetTypes: 50,
  maxRenderDistance: 300,
  targetFPS: 30,
  maxDrawCalls: 200,
  maxActiveMeshes: 500,
  lodRequired: false,
  octreeRequired: true,
  warnThreshold: 0.75,
};

describe("require-octree", () => {
  it("should error when file has many mesh creations but no octree (octreeRequired=true)", () => {
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
    const diagnostics = requireOctreeRule.check(sf, defaultBudget);
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

  it("should pass when octree is set up in a DIFFERENT file in the same project", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const meshLines = Array.from({ length: 210 }, (_, i) =>
      `MeshBuilder.CreateBox("box${i}", { size: 1 }, scene);`
    ).join("\n");
    const worldFile = project.createSourceFile("world.ts", meshLines);
    project.createSourceFile("scene-manager.ts", `scene.createOrUpdateSelectionOctree(64, 2);`);

    const diagnostics = requireOctreeRule.check(worldFile, octreeBudget);
    expect(diagnostics).toHaveLength(0);
  });
});
