import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { BudgetConfig, Diagnostic, Rule } from "../types.js";

const SHADOW_CONFIG_PROPERTIES = [
  "useBlurExponentialShadowMap",
  "useExponentialShadowMap",
  "useBlurCloseExponentialShadowMap",
  "useCloseExponentialShadowMap",
  "blurKernel",
  "blurScale",
  "useKernelBlur",
];

export const shadowConfigRule: Rule = {
  name: "shadow-config",
  severity: "warning",
  check(sourceFile: SourceFile, _budget: BudgetConfig): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const filePath = sourceFile.getFilePath();
    const fileText = sourceFile.getFullText();

    const newExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.NewExpression,
    );

    for (const expr of newExpressions) {
      const exprText = expr.getExpression().getText();
      if (exprText === "ShadowGenerator") {
        const hasConfig = SHADOW_CONFIG_PROPERTIES.some((prop) =>
          fileText.includes(prop),
        );
        if (!hasConfig) {
          diagnostics.push({
            rule: "shadow-config",
            severity: "warning",
            message: "ShadowGenerator created without blur/exponential shadow configuration",
            file: filePath,
            line: expr.getStartLineNumber(),
            suggestion:
              "Configure blur or exponential shadow maps for better visual quality (e.g. useBlurExponentialShadowMap = true)",
          });
        }
      }
    }

    return diagnostics;
  },
};
