import { resolve } from "node:path";
import { writeFileSync, existsSync } from "node:fs";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const DEFAULT_BUDGET = {
  maxNPCs: 30,
  maxShadowCasters: 10,
  maxGLBSizeMB: 5,
  maxTotalAssetTypes: 50,
  maxRenderDistance: 300,
  targetFPS: 30,
  maxDrawCalls: 200,
  maxActiveMeshes: 500,
};

export function runInit(): number {
  const budgetPath = resolve(process.cwd(), "game.budget.json");

  if (existsSync(budgetPath)) {
    console.log(
      `${YELLOW}game.budget.json already exists — skipping creation.${RESET}`,
    );
  } else {
    writeFileSync(budgetPath, JSON.stringify(DEFAULT_BUDGET, null, 2) + "\n");
    console.log(`${GREEN}Created game.budget.json${RESET}`);
  }

  console.log(`
${BOLD}Next steps:${RESET}

1. Add the rewriter plugin to your ${BOLD}vite.config.ts${RESET}:

   import { sceneRewriter } from "@scene-compiler/rewriter";

   export default defineConfig({
     plugins: [sceneRewriter()],
   });

2. Add scripts to your ${BOLD}package.json${RESET}:

   "scripts": {
     "validate": "scene validate src/",
     "build": "scene build src/"
   }

3. Edit ${BOLD}game.budget.json${RESET} to match your project's budget limits.

4. Run ${BOLD}scene validate src/${RESET} to check your scene files.
`);

  return 0;
}
