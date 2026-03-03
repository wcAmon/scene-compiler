import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { shadowConfigRule } from "../src/rules/shadow-config.js";
import { materialFreezeRule } from "../src/rules/material-freeze.js";
import { budgetLimitsRule } from "../src/rules/budget-limits.js";
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

describe("shadow-config", () => {
  it("should warn when ShadowGenerator is created without blur/exponential config", () => {
    const sf = createSourceFile(`
      const sg = new ShadowGenerator(1024, light);
    `);
    const diagnostics = shadowConfigRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("warning");
    expect(diagnostics[0].message).toContain("ShadowGenerator");
  });

  it("should pass when ShadowGenerator has blur config in same file", () => {
    const sf = createSourceFile(`
      const sg = new ShadowGenerator(1024, light);
      sg.useBlurExponentialShadowMap = true;
    `);
    const diagnostics = shadowConfigRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(0);
  });

  it("should pass when ShadowGenerator has blurKernel config", () => {
    const sf = createSourceFile(`
      const sg = new ShadowGenerator(1024, light);
      sg.blurKernel = 64;
    `);
    const diagnostics = shadowConfigRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(0);
  });
});

describe("material-freeze", () => {
  it("should warn when StandardMaterial is created without .freeze()", () => {
    const sf = createSourceFile(`
      const mat = new StandardMaterial("mat", scene);
      mat.diffuseColor = new Color3(1, 0, 0);
    `);
    const diagnostics = materialFreezeRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("warning");
    expect(diagnostics[0].message).toContain("StandardMaterial");
    expect(diagnostics[0].message).toContain("freeze");
  });

  it("should pass when material has .freeze() in the same file", () => {
    const sf = createSourceFile(`
      const mat = new StandardMaterial("mat", scene);
      mat.diffuseColor = new Color3(1, 0, 0);
      mat.freeze();
    `);
    const diagnostics = materialFreezeRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(0);
  });

  it("should warn for PBRMaterial without freeze", () => {
    const sf = createSourceFile(`
      const mat = new PBRMaterial("pbr", scene);
    `);
    const diagnostics = materialFreezeRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("PBRMaterial");
  });

  it("should warn for PBRMetallicRoughnessMaterial without freeze", () => {
    const sf = createSourceFile(`
      const mat = new PBRMetallicRoughnessMaterial("pbr", scene);
    `);
    const diagnostics = materialFreezeRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("PBRMetallicRoughnessMaterial");
  });
});

describe("budget-limits", () => {
  it("should error when NPC count exceeds budget", () => {
    const sf = createSourceFile(`
      const maxNpcCount = 50;
    `);
    const diagnostics = budgetLimitsRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("50");
    expect(diagnostics[0].message).toContain("30");
  });

  it("should pass when NPC count is within budget", () => {
    const sf = createSourceFile(`
      const maxNpcCount = 20;
    `);
    const diagnostics = budgetLimitsRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(0);
  });

  it("should error when render distance exceeds budget", () => {
    const sf = createSourceFile(`
      const renderDistance = 500;
    `);
    const diagnostics = budgetLimitsRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("500");
    expect(diagnostics[0].message).toContain("300");
  });

  it("should error when draw call count exceeds budget", () => {
    const sf = createSourceFile(`
      const drawCallLimit = 999;
    `);
    const diagnostics = budgetLimitsRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("999");
    expect(diagnostics[0].message).toContain("200");
  });

  it("should not error for unrelated variable names", () => {
    const sf = createSourceFile(`
      const playerHealth = 999;
    `);
    const diagnostics = budgetLimitsRule.check(sf, defaultBudget);

    expect(diagnostics).toHaveLength(0);
  });
});
