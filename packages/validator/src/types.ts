import type { SourceFile } from "ts-morph";

export interface BudgetConfig {
  maxNPCs: number;
  maxShadowCasters: number;
  maxGLBSizeMB: number;
  maxTotalAssetTypes: number;
  maxRenderDistance: number;
  targetFPS: number;
  maxDrawCalls: number;
  maxActiveMeshes: number;
}

export interface Diagnostic {
  rule: string;
  severity: "error" | "warning";
  message: string;
  file: string;
  line: number;
  suggestion?: string;
}

export interface Rule {
  name: string;
  severity: "error" | "warning";
  check(sourceFile: SourceFile, budget: BudgetConfig): Diagnostic[];
}

export interface ValidateResult {
  errors: Diagnostic[];
  warnings: Diagnostic[];
  fileCount: number;
}
