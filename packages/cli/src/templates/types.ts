export interface GameBudget {
  maxNPCs: number;
  maxShadowCasters: number;
  maxGLBSizeMB: number;
  maxTotalAssetTypes: number;
  maxRenderDistance: number;
  targetFPS: number;
  maxDrawCalls: number;
  maxActiveMeshes: number;
}

export interface GameTemplate {
  name: string;
  description: string;
  indexTs: () => string;
  budgetOverrides?: Partial<GameBudget>;
}
