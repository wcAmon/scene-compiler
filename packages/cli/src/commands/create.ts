import { resolve, basename, isAbsolute } from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import select from "@inquirer/select";
import { templates, DEFAULT_TEMPLATE } from "../templates/index.js";
import type { GameTemplate } from "../templates/index.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const SCENE_COMPILER_ROOT = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
);

function packageJson(name: string, isMultiplayer = false): string {
  const pkg: Record<string, unknown> = {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: isMultiplayer
      ? {
          dev: "concurrently \"vite dev\" \"tsx watch server/index.ts\"",
          "dev:client": "vite dev",
          "dev:server": "tsx watch server/index.ts",
          prebuild: `node --import tsx ${SCENE_COMPILER_ROOT}/packages/cli/src/index.ts validate src/ --public public/`,
          build: "vite build",
          start: "node --import tsx server/index.ts",
        }
      : {
          dev: "vite dev",
          prebuild: `node --import tsx ${SCENE_COMPILER_ROOT}/packages/cli/src/index.ts validate src/ --public public/`,
          build: "vite build",
        },
    dependencies: {
      "@babylonjs/core": "^7.40.0",
      "@babylonjs/loaders": "^7.40.0",
      ...(isMultiplayer
        ? {
            express: "^5.1.0",
            "socket.io": "^4.8.0",
            "socket.io-client": "^4.8.0",
          }
        : {}),
    },
    devDependencies: {
      typescript: "^5.7.0",
      vite: "^6.0.0",
      tsx: "^4.21.0",
      ...(isMultiplayer ? { concurrently: "^9.1.0" } : {}),
    },
    pnpm: {
      onlyBuiltDependencies: ["esbuild"],
    },
  };
  return JSON.stringify(pkg, null, 2);
}

function tsconfigJson(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "preserve",
      },
      include: ["src"],
    },
    null,
    2,
  );
}

function viteConfig(isMultiplayer = false): string {
  if (isMultiplayer) {
    return `import { defineConfig } from "vite";
import { sceneRewriter } from "${SCENE_COMPILER_ROOT}/packages/rewriter/src/plugin.js";

export default defineConfig({
  plugins: [sceneRewriter()],
  build: { outDir: "dist", target: "es2022" },
  server: {
    port: 3001,
    proxy: {
      "/socket.io": { target: "http://localhost:3000", ws: true },
    },
  },
});
`;
  }
  return `import { defineConfig } from "vite";
import { sceneRewriter } from "${SCENE_COMPILER_ROOT}/packages/rewriter/src/plugin.js";

export default defineConfig({
  plugins: [sceneRewriter()],
  build: { outDir: "dist", target: "es2022" },
  server: { port: 3001 },
});
`;
}

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

function gameBudget(template: GameTemplate): string {
  const budget = { ...DEFAULT_BUDGET, ...template.budgetOverrides };
  return JSON.stringify(budget, null, 2);
}

function indexHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>html,body{margin:0;padding:0;overflow:hidden;width:100%;height:100%}#game-canvas{width:100%;height:100%;touch-action:none}</style>
</head>
<body>
  <canvas id="game-canvas"></canvas>
  <script type="module" src="/src/index.ts"></script>
</body>
</html>
`;
}

export function listTemplates(): number {
  console.log(`\n${BOLD}Available templates:${RESET}\n`);
  for (const t of Object.values(templates)) {
    const tag = t.name === DEFAULT_TEMPLATE ? ` ${DIM}(default)${RESET}` : "";
    console.log(`  ${GREEN}${t.name}${RESET}${tag}`);
    console.log(`  ${DIM}${t.description}${RESET}\n`);
  }
  return 0;
}

async function pickTemplate(): Promise<GameTemplate> {
  const answer = await select({
    message: "Select a game template:",
    choices: Object.values(templates).map((t) => ({
      name: `${t.name}  ${DIM}— ${t.description}${RESET}`,
      value: t.name,
    })),
    default: DEFAULT_TEMPLATE,
  });
  return templates[answer];
}

export async function runCreate(
  name: string,
  templateName?: string,
): Promise<number> {
  const targetDir = isAbsolute(name) ? name : resolve(process.cwd(), name);
  const projectName = basename(targetDir);

  if (existsSync(targetDir)) {
    console.error(`${RED}Error: Directory already exists: ${targetDir}${RESET}`);
    return 1;
  }

  // Resolve template
  let template: GameTemplate;
  if (templateName) {
    if (!(templateName in templates)) {
      console.error(
        `${RED}Error: Unknown template "${templateName}". Use --template list to see available templates.${RESET}`,
      );
      return 1;
    }
    template = templates[templateName];
  } else {
    template = await pickTemplate();
  }

  console.log(
    `\n${BOLD}Creating Babylon.js project: ${projectName}${RESET} ${DIM}(template: ${template.name})${RESET}`,
  );
  console.log(`${DIM}${targetDir}${RESET}\n`);

  const isMultiplayer = !!template.serverTs;

  // Create directory structure
  mkdirSync(resolve(targetDir, "src"), { recursive: true });
  mkdirSync(resolve(targetDir, "public", "assets", "models"), {
    recursive: true,
  });
  if (isMultiplayer) {
    mkdirSync(resolve(targetDir, "server"), { recursive: true });
  }

  // Write files
  const files: [string, string][] = [
    ["package.json", packageJson(projectName, isMultiplayer)],
    ["tsconfig.json", tsconfigJson()],
    ["vite.config.ts", viteConfig(isMultiplayer)],
    ["game.budget.json", gameBudget(template)],
    ["index.html", indexHtml(projectName)],
    ["src/index.ts", template.indexTs()],
  ];
  if (isMultiplayer && template.serverTs) {
    files.push(["server/index.ts", template.serverTs()]);
  }

  for (const [relPath, content] of files) {
    const fullPath = resolve(targetDir, relPath);
    writeFileSync(fullPath, content);
    console.log(`  ${GREEN}+${RESET} ${relPath}`);
  }
  console.log(`  ${GREEN}+${RESET} public/assets/models/`);

  // Install dependencies
  console.log(`\n${BOLD}Installing dependencies...${RESET}\n`);
  try {
    execFileSync("pnpm", ["install"], {
      cwd: targetDir,
      stdio: "inherit",
    });
  } catch {
    console.error(
      `\n${RED}pnpm install failed. Run it manually in ${targetDir}${RESET}`,
    );
    return 1;
  }

  if (isMultiplayer) {
    console.log(`
${GREEN}Done!${RESET} Created ${BOLD}${projectName}${RESET} ${DIM}(${template.name})${RESET} at ${targetDir}

  cd ${projectName}
  pnpm dev          ${DIM}# start client + server (concurrent)${RESET}
  pnpm dev:client   ${DIM}# client only (Vite on :3001)${RESET}
  pnpm dev:server   ${DIM}# server only (Express+Socket.IO on :3000)${RESET}
  pnpm build        ${DIM}# validate + build client${RESET}
  pnpm start        ${DIM}# production server (serves dist/ + WebSocket)${RESET}
`);
  } else {
    console.log(`
${GREEN}Done!${RESET} Created ${BOLD}${projectName}${RESET} ${DIM}(${template.name})${RESET} at ${targetDir}

  cd ${projectName}
  pnpm dev          ${DIM}# start dev server${RESET}
  pnpm build        ${DIM}# validate + build${RESET}
`);
  }

  return 0;
}
