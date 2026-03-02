import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { BudgetConfig, Diagnostic, Rule } from "../types.js";

interface BudgetPattern {
  pattern: RegExp;
  budgetKey: keyof BudgetConfig;
  label: string;
}

const BUDGET_PATTERNS: BudgetPattern[] = [
  { pattern: /npc/i, budgetKey: "maxNPCs", label: "NPC count" },
  {
    pattern: /shadow.*cast|caster/i,
    budgetKey: "maxShadowCasters",
    label: "shadow caster count",
  },
  {
    pattern: /active.*mesh|mesh.*count|mesh.*limit/i,
    budgetKey: "maxActiveMeshes",
    label: "active mesh count",
  },
  {
    pattern: /render.*dist|view.*dist|draw.*dist/i,
    budgetKey: "maxRenderDistance",
    label: "render distance",
  },
  {
    pattern: /draw.*call/i,
    budgetKey: "maxDrawCalls",
    label: "draw call count",
  },
];

export const budgetLimitsRule: Rule = {
  name: "budget-limits",
  severity: "error",
  check(sourceFile: SourceFile, budget: BudgetConfig): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const filePath = sourceFile.getFilePath();

    const variableDeclarations = sourceFile.getDescendantsOfKind(
      SyntaxKind.VariableDeclaration,
    );

    for (const decl of variableDeclarations) {
      const name = decl.getName();
      const initializer = decl.getInitializer();

      if (!initializer) continue;

      if (initializer.getKind() !== SyntaxKind.NumericLiteral) continue;

      const value = Number(initializer.getText());

      for (const bp of BUDGET_PATTERNS) {
        if (bp.pattern.test(name)) {
          const limit = budget[bp.budgetKey];
          if (value > limit) {
            diagnostics.push({
              rule: "budget-limits",
              severity: "error",
              message: `${bp.label} "${name}" is ${value}, exceeds budget limit of ${limit}`,
              file: filePath,
              line: decl.getStartLineNumber(),
              suggestion: `Reduce ${name} to at most ${limit}`,
            });
          }
        }
      }
    }

    return diagnostics;
  },
};
