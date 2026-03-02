import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import {
  validate,
  createGlbExistsRule,
  noRawMeshInLoopRule,
  shadowConfigRule,
  materialFreezeRule,
  budgetLimitsRule,
  type BudgetConfig,
} from "@scene-compiler/validator";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

export function runValidate(dir: string, opts: { budget?: string; public?: string }): number {
  const sourceDir = resolve(dir);

  // Load budget config
  const budgetPath = opts.budget
    ? resolve(opts.budget)
    : resolve(process.cwd(), "game.budget.json");

  if (!existsSync(budgetPath)) {
    console.error(
      `${RED}Error: Budget config not found at ${budgetPath}${RESET}`,
    );
    console.error(`Run ${BOLD}scene init${RESET} to create one.`);
    return 1;
  }

  let budget: BudgetConfig;
  try {
    budget = JSON.parse(readFileSync(budgetPath, "utf-8"));
  } catch (e) {
    console.error(
      `${RED}Error: Failed to parse budget config at ${budgetPath}${RESET}`,
    );
    console.error((e as Error).message);
    return 1;
  }

  // Resolve public directory for GLB asset lookup
  const publicDir = opts.public
    ? resolve(opts.public)
    : resolve(sourceDir, "..", "public");

  // Assemble all rules
  const rules = [
    createGlbExistsRule(publicDir),
    noRawMeshInLoopRule,
    shadowConfigRule,
    materialFreezeRule,
    budgetLimitsRule,
  ];

  console.log(`Validating ${BOLD}${sourceDir}${RESET}...\n`);

  const result = validate(sourceDir, rules, budget);

  console.log(`Scanned ${BOLD}${result.fileCount}${RESET} file(s).\n`);

  // Print errors
  for (const diag of result.errors) {
    console.log(
      `${RED}ERROR${RESET} [${diag.rule}] ${diag.file}:${diag.line}`,
    );
    console.log(`  ${diag.message}`);
    if (diag.suggestion) {
      console.log(`  ${YELLOW}Suggestion: ${diag.suggestion}${RESET}`);
    }
  }

  // Print warnings
  for (const diag of result.warnings) {
    console.log(
      `${YELLOW}WARN${RESET}  [${diag.rule}] ${diag.file}:${diag.line}`,
    );
    console.log(`  ${diag.message}`);
    if (diag.suggestion) {
      console.log(`  ${YELLOW}Suggestion: ${diag.suggestion}${RESET}`);
    }
  }

  // Summary
  if (result.errors.length === 0 && result.warnings.length === 0) {
    console.log(`${GREEN}No issues found.${RESET}`);
  } else {
    console.log();
    if (result.errors.length > 0) {
      console.log(`${RED}${result.errors.length} error(s)${RESET}`);
    }
    if (result.warnings.length > 0) {
      console.log(`${YELLOW}${result.warnings.length} warning(s)${RESET}`);
    }
  }

  return result.errors.length > 0 ? 1 : 0;
}
