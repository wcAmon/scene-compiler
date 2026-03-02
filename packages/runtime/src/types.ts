export interface FrameMetrics {
  fps: number;
  drawCalls: number;
  activeMeshes: number;
  totalVertices: number;
  textureMemoryMB: number;
  gpuFrameTimeMs: number;
  timestamp: number;
}

export interface RuntimeBudgetConfig {
  maxDrawCalls: number;
  maxActiveMeshes: number;
  targetFPS: number;
}

export type QualityLevel = 0 | 1 | 2 | 3 | 4;
