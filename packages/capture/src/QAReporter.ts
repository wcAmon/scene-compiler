/**
 * Minimal metrics-provider interface — compatible with the runtime
 * PerformanceMonitor without creating a hard package dependency.
 */
export interface MetricsProvider {
  getHistory(): readonly {
    fps: number;
    drawCalls: number;
    activeMeshes: number;
    totalVertices: number;
    timestamp: number;
  }[];
}

export interface QATestResult {
  name: string;
  pass: boolean;
  error?: string;
  screenshot?: string;
}

export interface QAReport {
  timestamp: string;
  duration_sec: number;
  budget: Record<string, { limit: number; actual: number; pass: boolean }>;
  metrics: {
    avg_fps: number;
    min_fps: number;
    max_draw_calls: number;
    memory_mb: number;
  };
  tests: QATestResult[];
  quality_level: number;
  warnings: string[];
}

export class QAReporter {
  private readonly metricsProvider: MetricsProvider;
  private tests: QATestResult[] = [];
  private warnings: string[] = [];
  private startTime = 0;

  constructor(metricsProvider: MetricsProvider) {
    this.metricsProvider = metricsProvider;
  }

  /**
   * Reset internal state and begin a new QA run.
   */
  start(): void {
    this.tests = [];
    this.warnings = [];
    this.startTime = Date.now();
  }

  /**
   * Record the result of a single QA test.
   */
  addTest(result: QATestResult): void {
    this.tests.push(result);
  }

  /**
   * Record a warning that will appear in the final report.
   */
  addWarning(warning: string): void {
    this.warnings.push(warning);
  }

  /**
   * Finalize the QA run and produce the report.
   *
   * @param budgetConfig - key/value pairs where the value is the budget limit
   *                       for a named metric (e.g. `{ drawCalls: 500 }`).
   * @param qualityLevel - integer quality tier the scene was running at.
   */
  finish(
    budgetConfig: Record<string, number>,
    qualityLevel: number,
  ): QAReport {
    const endTime = Date.now();
    const durationSec = (endTime - this.startTime) / 1000;

    const history = this.metricsProvider.getHistory();

    // -- Aggregate metrics from history --------------------------------
    let totalFps = 0;
    let minFps = Number.POSITIVE_INFINITY;
    let maxDrawCalls = 0;

    for (const entry of history) {
      totalFps += entry.fps;
      if (entry.fps < minFps) minFps = entry.fps;
      if (entry.drawCalls > maxDrawCalls) maxDrawCalls = entry.drawCalls;
    }

    const avgFps = history.length > 0 ? totalFps / history.length : 0;
    if (history.length === 0) minFps = 0;

    // Memory — use Performance API when available, default to 0.
    let memoryMb = 0;
    if (
      typeof performance !== "undefined" &&
      "memory" in performance
    ) {
      const mem = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory;
      memoryMb = Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 100) / 100;
    }

    // -- Budget evaluation ---------------------------------------------
    const metricAccessors: Record<string, number> = {
      drawCalls: maxDrawCalls,
      fps: avgFps,
      memory_mb: memoryMb,
    };

    // Also include the last sample's raw values so custom budget keys work.
    if (history.length > 0) {
      const last = history[history.length - 1];
      metricAccessors["activeMeshes"] = last.activeMeshes;
      metricAccessors["totalVertices"] = last.totalVertices;
    }

    const budget: QAReport["budget"] = {};
    for (const [key, limit] of Object.entries(budgetConfig)) {
      const actual = metricAccessors[key] ?? 0;
      budget[key] = { limit, actual, pass: actual <= limit };
    }

    return {
      timestamp: new Date().toISOString(),
      duration_sec: durationSec,
      budget,
      metrics: {
        avg_fps: Math.round(avgFps * 100) / 100,
        min_fps: Math.round(minFps * 100) / 100,
        max_draw_calls: maxDrawCalls,
        memory_mb: memoryMb,
      },
      tests: [...this.tests],
      quality_level: qualityLevel,
      warnings: [...this.warnings],
    };
  }
}
