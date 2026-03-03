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
    expect(budget.maxNPCs).toBe(20);
    expect(budget.maxGLBSizeMB).toBe(3);
    expect(budget.maxRenderDistance).toBe(200);
  });

  it("throws on invalid input", () => {
    expect(() => parseBudget(null)).toThrow();
    expect(() => parseBudget("string")).toThrow();
  });
});
