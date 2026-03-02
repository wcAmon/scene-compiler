import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { BudgetConfig, Diagnostic, Rule } from "../types.js";

const MATERIAL_CLASSES = [
  "StandardMaterial",
  "PBRMaterial",
  "PBRMetallicRoughnessMaterial",
  "PBRSpecularGlossinessMaterial",
];

export const materialFreezeRule: Rule = {
  name: "material-freeze",
  severity: "warning",
  check(sourceFile: SourceFile, _budget: BudgetConfig): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const filePath = sourceFile.getFilePath();
    const fileText = sourceFile.getFullText();
    const hasFreezeCall = fileText.includes(".freeze()");

    const newExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.NewExpression,
    );

    for (const expr of newExpressions) {
      const exprText = expr.getExpression().getText();
      if (MATERIAL_CLASSES.includes(exprText)) {
        if (!hasFreezeCall) {
          diagnostics.push({
            rule: "material-freeze",
            severity: "warning",
            message: `${exprText} created without calling .freeze() in the same file`,
            file: filePath,
            line: expr.getStartLineNumber(),
            suggestion:
              "Call .freeze() on materials after configuration to improve rendering performance",
          });
        }
      }
    }

    return diagnostics;
  },
};
