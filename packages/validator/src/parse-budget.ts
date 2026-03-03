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
