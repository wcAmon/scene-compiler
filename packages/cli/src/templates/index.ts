import type { GameTemplate } from "./types.js";
import { minimal } from "./minimal.js";
import { tps } from "./tps.js";
import { waveShooter } from "./wave-shooter.js";

export type { GameTemplate } from "./types.js";

export const templates: Record<string, GameTemplate> = {
  minimal,
  tps,
  "wave-shooter": waveShooter,
};

export const DEFAULT_TEMPLATE = "minimal";
