import { existsSync } from "node:fs";
import path from "node:path";
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { BudgetConfig, Diagnostic, Rule } from "../types.js";

export function createGlbExistsRule(publicDir: string): Rule {
  return {
    name: "glb-exists",
    severity: "error",
    check(sourceFile: SourceFile, _budget: BudgetConfig): Diagnostic[] {
      const diagnostics: Diagnostic[] = [];
      const filePath = sourceFile.getFilePath();

      const stringLiterals = sourceFile.getDescendantsOfKind(
        SyntaxKind.StringLiteral,
      );

      for (const literal of stringLiterals) {
        const value = literal.getLiteralValue();
        if (value.endsWith(".glb")) {
          const fullPath = path.join(publicDir, value);
          if (!existsSync(fullPath)) {
            diagnostics.push({
              rule: "glb-exists",
              severity: "error",
              message: `GLB file not found: ${value}`,
              file: filePath,
              line: literal.getStartLineNumber(),
              suggestion: `Ensure the file exists at ${fullPath}`,
            });
          }
        }
      }

      return diagnostics;
    },
  };
}
