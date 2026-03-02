import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { BudgetConfig, Diagnostic, Rule } from "../types.js";

/** Build a set of all GLB filenames found recursively under a directory. */
function indexGlbFiles(dir: string): Set<string> {
  const found = new Set<string>();
  if (!existsSync(dir)) return found;

  function walk(d: string): void {
    for (const entry of readdirSync(d)) {
      const full = path.join(d, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".glb")) {
        found.add(entry);
      }
    }
  }
  walk(dir);
  return found;
}

export function createGlbExistsRule(publicDir: string): Rule {
  // Index once per validate run, not per file
  const knownGlbs = indexGlbFiles(publicDir);

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
          const basename = path.basename(value);
          if (!knownGlbs.has(basename)) {
            diagnostics.push({
              rule: "glb-exists",
              severity: "error",
              message: `GLB file not found: ${basename}`,
              file: filePath,
              line: literal.getStartLineNumber(),
              suggestion: `Ensure ${basename} exists somewhere under ${publicDir}`,
            });
          }
        }
      }

      return diagnostics;
    },
  };
}
