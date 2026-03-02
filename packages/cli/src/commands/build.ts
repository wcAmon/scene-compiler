import { execFileSync } from "node:child_process";
import { runValidate } from "./validate.js";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

export function runBuild(dir: string, opts: { budget?: string }): number {
  console.log(`${BOLD}Step 1: Validating...${RESET}\n`);

  const validateExitCode = runValidate(dir, opts);

  if (validateExitCode !== 0) {
    console.error(
      `\n${RED}Validation failed. Fix errors before building.${RESET}`,
    );
    return 1;
  }

  console.log(`\n${BOLD}Step 2: Building with Vite...${RESET}\n`);

  try {
    execFileSync("npx", ["vite", "build"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
  } catch (e) {
    console.error(`\n${RED}Vite build failed.${RESET}`);
    return 1;
  }

  console.log(`\n${GREEN}Build complete.${RESET}`);
  return 0;
}
