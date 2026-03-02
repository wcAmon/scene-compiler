import { Project } from "ts-morph";
import type { BudgetConfig, Rule, ValidateResult } from "./types.js";

export function validate(
  sourceDir: string,
  rules: Rule[],
  budget: BudgetConfig,
): ValidateResult {
  const project = new Project({
    tsConfigFilePath: undefined,
    skipAddingFilesFromTsConfig: true,
  });

  project.addSourceFilesAtPaths(`${sourceDir}/**/*.ts`);

  const sourceFiles = project.getSourceFiles();
  const result: ValidateResult = {
    errors: [],
    warnings: [],
    fileCount: sourceFiles.length,
  };

  for (const sourceFile of sourceFiles) {
    for (const rule of rules) {
      const diagnostics = rule.check(sourceFile, budget);
      for (const diag of diagnostics) {
        if (diag.severity === "error") {
          result.errors.push(diag);
        } else {
          result.warnings.push(diag);
        }
      }
    }
  }

  return result;
}
