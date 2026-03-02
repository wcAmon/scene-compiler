import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";

export { PerformanceMonitor } from "./PerformanceMonitor.js";
export {
  AdaptiveQuality,
  type AdaptiveQualityCallbacks,
} from "./AdaptiveQuality.js";
export { RuntimeBudget, type BudgetViolation } from "./RuntimeBudget.js";
export type {
  FrameMetrics,
  RuntimeBudgetConfig,
  QualityLevel,
} from "./types.js";

import { PerformanceMonitor } from "./PerformanceMonitor.js";
import {
  AdaptiveQuality,
  type AdaptiveQualityCallbacks,
} from "./AdaptiveQuality.js";
import { RuntimeBudget } from "./RuntimeBudget.js";
import type { RuntimeBudgetConfig } from "./types.js";

export function initRuntime(options: {
  engine: Engine;
  scene: Scene;
  budget: RuntimeBudgetConfig;
  callbacks?: AdaptiveQualityCallbacks;
  baseRenderDistance?: number;
}): {
  monitor: PerformanceMonitor;
  adaptive: AdaptiveQuality;
  runtimeBudget: RuntimeBudget;
  dispose: () => void;
} {
  const monitor = new PerformanceMonitor(options.engine, options.scene);
  const adaptive = new AdaptiveQuality(
    monitor,
    options.callbacks ?? {},
    options.baseRenderDistance,
  );
  const runtimeBudget = new RuntimeBudget(monitor, options.budget);

  monitor.start();

  const tickInterval = setInterval(() => {
    adaptive.tick();
    runtimeBudget.check();
  }, 1000);

  const dispose = (): void => {
    clearInterval(tickInterval);
    monitor.dispose();
  };

  return { monitor, adaptive, runtimeBudget, dispose };
}
