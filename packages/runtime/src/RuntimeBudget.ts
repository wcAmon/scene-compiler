import type { RuntimeBudgetConfig } from "./types.js";
import type { PerformanceMonitor } from "./PerformanceMonitor.js";

export interface BudgetViolation {
  metric: string;
  actual: number;
  limit: number;
  timestamp: number;
}

export class RuntimeBudget {
  private monitor: PerformanceMonitor;
  private config: RuntimeBudgetConfig;
  private violations: BudgetViolation[] = [];

  constructor(monitor: PerformanceMonitor, config: RuntimeBudgetConfig) {
    this.monitor = monitor;
    this.config = config;
  }

  check(): BudgetViolation[] {
    const latest = this.monitor.getLatest();
    if (!latest) {
      return [];
    }

    const newViolations: BudgetViolation[] = [];
    const now = Date.now();

    if (latest.drawCalls > this.config.maxDrawCalls) {
      newViolations.push({
        metric: "drawCalls",
        actual: latest.drawCalls,
        limit: this.config.maxDrawCalls,
        timestamp: now,
      });
    }

    if (latest.activeMeshes > this.config.maxActiveMeshes) {
      newViolations.push({
        metric: "activeMeshes",
        actual: latest.activeMeshes,
        limit: this.config.maxActiveMeshes,
        timestamp: now,
      });
    }

    if (latest.fps < this.config.targetFPS) {
      newViolations.push({
        metric: "fps",
        actual: latest.fps,
        limit: this.config.targetFPS,
        timestamp: now,
      });
    }

    for (const violation of newViolations) {
      console.warn(
        `[RuntimeBudget] Violation: ${violation.metric} = ${violation.actual} (limit: ${violation.limit})`,
      );
    }

    this.violations.push(...newViolations);

    return newViolations;
  }

  getViolations(): BudgetViolation[] {
    return [...this.violations];
  }

  clearViolations(): void {
    this.violations = [];
  }
}
