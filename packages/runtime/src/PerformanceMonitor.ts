import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { FrameMetrics } from "./types.js";

const RING_BUFFER_SIZE = 60;

export class PerformanceMonitor {
  private engine: Engine;
  private scene: Scene;
  private instrumentation: SceneInstrumentation;
  private buffer: FrameMetrics[] = [];
  private writeIndex = 0;
  private count = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(engine: Engine, scene: Scene) {
    this.engine = engine;
    this.scene = scene;
    this.instrumentation = new SceneInstrumentation(scene);
    this.instrumentation.captureFrameTime = true;
    this.instrumentation.captureRenderTime = true;
    this.buffer = new Array<FrameMetrics>(RING_BUFFER_SIZE);
  }

  start(): void {
    if (this.intervalId !== null) {
      return;
    }
    this.intervalId = setInterval(() => {
      this.sample();
    }, 1000);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  sample(): FrameMetrics {
    const metrics: FrameMetrics = {
      fps: this.engine.getFps(),
      drawCalls: this.instrumentation.drawCallsCounter.current,
      activeMeshes: this.scene.getActiveMeshes().length,
      totalVertices: this.scene.getTotalVertices(),
      textureMemoryMB: 0, // Not directly available; placeholder
      gpuFrameTimeMs: this.instrumentation.frameTimeCounter.lastSecAverage,
      timestamp: Date.now(),
    };

    this.buffer[this.writeIndex] = metrics;
    this.writeIndex = (this.writeIndex + 1) % RING_BUFFER_SIZE;
    if (this.count < RING_BUFFER_SIZE) {
      this.count++;
    }

    return metrics;
  }

  getLatest(): FrameMetrics | undefined {
    if (this.count === 0) {
      return undefined;
    }
    const index =
      (this.writeIndex - 1 + RING_BUFFER_SIZE) % RING_BUFFER_SIZE;
    return this.buffer[index];
  }

  getHistory(): FrameMetrics[] {
    if (this.count === 0) {
      return [];
    }

    const result: FrameMetrics[] = [];
    const start =
      this.count < RING_BUFFER_SIZE
        ? 0
        : this.writeIndex;

    for (let i = 0; i < this.count; i++) {
      const index = (start + i) % RING_BUFFER_SIZE;
      result.push(this.buffer[index]);
    }

    return result;
  }

  getAvgFPS(seconds: number): number {
    if (this.count === 0) {
      return 0;
    }

    const samplesToUse = Math.min(seconds, this.count);
    let sum = 0;

    for (let i = 0; i < samplesToUse; i++) {
      const index =
        (this.writeIndex - 1 - i + RING_BUFFER_SIZE * 2) % RING_BUFFER_SIZE;
      sum += this.buffer[index].fps;
    }

    return sum / samplesToUse;
  }

  dispose(): void {
    this.stop();
    this.instrumentation.dispose();
  }
}
