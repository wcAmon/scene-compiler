import { describe, it, expect } from "vitest";
import { autoFreezeMaterial } from "../src/transforms/auto-freeze-material.js";
import { autoDisposeGuard } from "../src/transforms/auto-dispose-guard.js";

// ---------------------------------------------------------------------------
// auto-freeze-material
// ---------------------------------------------------------------------------
describe("autoFreezeMaterial", () => {
  it("inserts .freeze() after the last material property assignment", () => {
    const input = [
      'const mat = new StandardMaterial("mat", scene);',
      "mat.diffuseColor = new Color3(1, 0, 0);",
      "mat.specularColor = new Color3(1, 1, 1);",
    ].join("\n");

    const result = autoFreezeMaterial(input);

    // freeze() should appear exactly once
    expect(result).toContain("mat.freeze();");
    // It should come after the last assignment (specularColor)
    const freezeIdx = result.indexOf("mat.freeze();");
    const lastAssignIdx = result.indexOf("mat.specularColor = ");
    expect(freezeIdx).toBeGreaterThan(lastAssignIdx);
  });

  it("does NOT double-freeze if .freeze() already present", () => {
    const input = [
      'const mat = new PBRMaterial("mat", scene);',
      "mat.albedoColor = new Color3(1, 1, 1);",
      "mat.freeze();",
    ].join("\n");

    const result = autoFreezeMaterial(input);

    // Count occurrences of freeze
    const count = (result.match(/mat\.freeze\(\)/g) || []).length;
    expect(count).toBe(1);
  });

  it("handles PBR*Material variants", () => {
    const input = [
      'const pbr = new PBRMetallicRoughnessMaterial("pbr", scene);',
      "pbr.baseColor = new Color3(0.5, 0.5, 0.5);",
    ].join("\n");

    const result = autoFreezeMaterial(input);
    expect(result).toContain("pbr.freeze();");
  });

  it("returns unchanged code when no materials are found", () => {
    const input = 'const mesh = new Mesh("box", scene);';
    const result = autoFreezeMaterial(input);
    expect(result).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// auto-dispose-guard
// ---------------------------------------------------------------------------
describe("autoDisposeGuard", () => {
  it("wraps bare .dispose() with null check", () => {
    const input = "mesh.dispose();";
    const result = autoDisposeGuard(input);
    expect(result).toBe("mesh && mesh.dispose();");
  });

  it("does NOT wrap already-guarded calls (&&)", () => {
    const input = "mesh && mesh.dispose();";
    const result = autoDisposeGuard(input);
    expect(result).toBe(input);
  });

  it("does NOT wrap calls inside an if-guard", () => {
    const input = "if (mesh) mesh.dispose();";
    const result = autoDisposeGuard(input);
    expect(result).toBe(input);
  });

  it("returns unchanged code when no dispose calls found", () => {
    const input = 'const x = "hello";';
    const result = autoDisposeGuard(input);
    expect(result).toBe(input);
  });

  it("wraps multiple bare dispose calls", () => {
    const input = ["mesh.dispose();", "light.dispose();"].join("\n");
    const result = autoDisposeGuard(input);
    expect(result).toContain("mesh && mesh.dispose();");
    expect(result).toContain("light && light.dispose();");
  });
});
