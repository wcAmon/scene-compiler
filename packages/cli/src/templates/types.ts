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
  /** Server entry point for multiplayer templates */
  serverTs?: () => string;
  budgetOverrides?: Partial<GameBudget>;
}
