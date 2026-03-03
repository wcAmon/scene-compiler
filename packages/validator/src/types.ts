import type { SourceFile } from "ts-morph";

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
