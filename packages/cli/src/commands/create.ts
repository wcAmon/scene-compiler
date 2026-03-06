import { resolve, basename, isAbsolute } from "node:path";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

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

function packageJson(name: string): string {
  return JSON.stringify(
    {
      name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite dev",
        prebuild: `node --import tsx ${SCENE_COMPILER_ROOT}/packages/cli/src/index.ts validate src/ --public public/`,
        build: "vite build",
      },
      dependencies: {
        "@babylonjs/core": "^7.40.0",
        "@babylonjs/loaders": "^7.40.0",
      },
      devDependencies: {
        typescript: "^5.7.0",
        vite: "^6.0.0",
        tsx: "^4.21.0",
      },
      pnpm: {
        onlyBuiltDependencies: ["esbuild"],
      },
    },
    null,
    2,
  );
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

function viteConfig(): string {
  return `import { defineConfig } from "vite";
import { sceneRewriter } from "${SCENE_COMPILER_ROOT}/packages/rewriter/src/plugin.js";

export default defineConfig({
  plugins: [sceneRewriter()],
  build: { outDir: "dist", target: "es2022" },
  server: { port: 3001 },
});
`;
}

function gameBudget(): string {
  return JSON.stringify(
    {
      maxNPCs: 30,
      maxShadowCasters: 10,
      maxGLBSizeMB: 5,
      maxTotalAssetTypes: 50,
      maxRenderDistance: 300,
      targetFPS: 30,
      maxDrawCalls: 200,
      maxActiveMeshes: 500,
    },
    null,
    2,
  );
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

function indexTs(): string {
  return `import "@babylonjs/loaders/glTF";
import { Engine, Scene, FreeCamera, HemisphericLight, MeshBuilder, Vector3, Color4 } from "@babylonjs/core";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

scene.clearColor = new Color4(0.53, 0.81, 0.92, 1);

const camera = new FreeCamera("camera", new Vector3(0, 5, -10), scene);
camera.setTarget(Vector3.Zero());
camera.attachControl(canvas, true);

new HemisphericLight("light", new Vector3(0, 1, 0), scene);

const ground = MeshBuilder.CreateGround("ground", { width: 20, height: 20 }, scene);
const box = MeshBuilder.CreateBox("box", { size: 1 }, scene);
box.position.y = 0.5;

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
`;
}

export function runCreate(name: string): number {
  const targetDir = isAbsolute(name) ? name : resolve(process.cwd(), name);
  const projectName = basename(targetDir);

  if (existsSync(targetDir)) {
    console.error(`${RED}Error: Directory already exists: ${targetDir}${RESET}`);
    return 1;
  }

  console.log(
    `${BOLD}Creating Babylon.js project: ${projectName}${RESET}`,
  );
  console.log(`${DIM}${targetDir}${RESET}\n`);

  // Create directory structure
  mkdirSync(resolve(targetDir, "src"), { recursive: true });
  mkdirSync(resolve(targetDir, "public", "assets", "models"), {
    recursive: true,
  });

  // Write files
  const files: [string, string][] = [
    ["package.json", packageJson(projectName)],
    ["tsconfig.json", tsconfigJson()],
    ["vite.config.ts", viteConfig()],
    ["game.budget.json", gameBudget()],
    ["index.html", indexHtml(projectName)],
    ["src/index.ts", indexTs()],
  ];

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

  console.log(`
${GREEN}Done!${RESET} Created ${BOLD}${projectName}${RESET} at ${targetDir}

  cd ${projectName}
  pnpm dev          ${DIM}# start dev server${RESET}
  pnpm build        ${DIM}# validate + build${RESET}
`);

  return 0;
}
