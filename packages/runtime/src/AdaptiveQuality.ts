import type { QualityLevel } from "./types.js";
import type { PerformanceMonitor } from "./PerformanceMonitor.js";

export interface AdaptiveQualityCallbacks {
  onShadowToggle?: (enabled: boolean) => void;
  onNPCLimit?: (maxCount: number) => void;
  onRenderDistance?: (distance: number) => void;
  onParticlesToggle?: (enabled: boolean) => void;
}

interface LevelThreshold {
  downgradeFPS: number;
  downgradeDuration: number;
}

const LEVEL_THRESHOLDS: LevelThreshold[] = [
  // L0 -> L1: FPS < 30 for 3s
  { downgradeFPS: 30, downgradeDuration: 3 },
  // L1 -> L2: FPS < 25 for 3s
  { downgradeFPS: 25, downgradeDuration: 3 },
  // L2 -> L3: FPS < 20 for 3s
  { downgradeFPS: 20, downgradeDuration: 3 },
  // L3 -> L4: FPS < 15 for 3s
  { downgradeFPS: 15, downgradeDuration: 3 },
];

const UPGRADE_HOLD_DURATION = 5;
const UPGRADE_FPS_BONUS = 5;

export class AdaptiveQuality {
  private currentLevel: QualityLevel = 0;
  private monitor: PerformanceMonitor;
  private callbacks: AdaptiveQualityCallbacks;
  private baseRenderDistance: number;

  private downgradeCounter = 0;
  private upgradeCounter = 0;

  constructor(
    monitor: PerformanceMonitor,
    callbacks: AdaptiveQualityCallbacks,
    baseRenderDistance = 100,
  ) {
    this.monitor = monitor;
    this.callbacks = callbacks;
    this.baseRenderDistance = baseRenderDistance;
  }

  get level(): QualityLevel {
    return this.currentLevel;
  }

  tick(): void {
    const avgFPS = this.monitor.getAvgFPS(1);

    // Check for downgrade
    if (this.currentLevel < 4) {
      const threshold = LEVEL_THRESHOLDS[this.currentLevel];
      if (avgFPS < threshold.downgradeFPS) {
        this.downgradeCounter++;
        this.upgradeCounter = 0;

        if (this.downgradeCounter >= threshold.downgradeDuration) {
          this.downgradeCounter = 0;
          this.setLevel((this.currentLevel + 1) as QualityLevel);
        }
        return;
      }
    }

    // Check for upgrade
    if (this.currentLevel > 0) {
      const prevThreshold = LEVEL_THRESHOLDS[this.currentLevel - 1];
      const upgradeThreshold = prevThreshold.downgradeFPS + UPGRADE_FPS_BONUS;

      if (avgFPS > upgradeThreshold) {
        this.upgradeCounter++;
        this.downgradeCounter = 0;

        if (this.upgradeCounter >= UPGRADE_HOLD_DURATION) {
          this.upgradeCounter = 0;
          this.setLevel((this.currentLevel - 1) as QualityLevel);
        }
        return;
      }
    }

    // FPS is in a neutral zone — reset counters
    this.downgradeCounter = 0;
    this.upgradeCounter = 0;
  }

  private setLevel(newLevel: QualityLevel): void {
    const oldLevel = this.currentLevel;
    this.currentLevel = newLevel;

    console.warn(
      `[AdaptiveQuality] Level changed: ${oldLevel} -> ${newLevel}`,
    );

    this.applyLevel(newLevel);
  }

  private applyLevel(level: QualityLevel): void {
    // L0: Full quality
    // L1: Shadows off
    // L2: Reduce NPCs to 10
    // L3: Reduce render distance 50%
    // L4: Particles + post-processing off

    // Shadows: off at L1+
    this.callbacks.onShadowToggle?.(level < 1);

    // NPCs: limited at L2+
    this.callbacks.onNPCLimit?.(level >= 2 ? 10 : Infinity);

    // Render distance: halved at L3+
    this.callbacks.onRenderDistance?.(
      level >= 3 ? this.baseRenderDistance * 0.5 : this.baseRenderDistance,
    );

    // Particles: off at L4
    this.callbacks.onParticlesToggle?.(level < 4);
  }
}
