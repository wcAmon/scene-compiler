import type { Plugin } from "vite";
import { autoFreezeMaterial } from "./transforms/auto-freeze-material.js";
import { autoDisposeGuard } from "./transforms/auto-dispose-guard.js";

export interface SceneRewriterOptions {
  /** Enable auto-freeze for Babylon.js materials. Default: true */
  freeze?: boolean;
  /** Enable dispose-guard wrapping. Default: true */
  disposeGuard?: boolean;
}

export function sceneRewriter(options?: SceneRewriterOptions): Plugin {
  const freeze = options?.freeze ?? true;
  const disposeGuard = options?.disposeGuard ?? true;

  return {
    name: "scene-compiler-rewriter",
    enforce: "pre",

    transform(code: string, id: string) {
      // Only process .ts / .tsx files, skip node_modules
      if (!/\.tsx?$/.test(id) || id.includes("node_modules")) {
        return null;
      }

      let result = code;

      if (freeze) {
        result = autoFreezeMaterial(result);
      }

      if (disposeGuard) {
        result = autoDisposeGuard(result);
      }

      // Return null when nothing changed so Vite can skip source-map work.
      if (result === code) {
        return null;
      }

      return { code: result, map: null };
    },
  };
}
