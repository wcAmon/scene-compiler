import type { SourceFile, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { BudgetConfig, Diagnostic, Rule } from "../types.js";

function isInsideLoop(node: Node): boolean {
  let current = node.getParent();
  while (current) {
    const kind = current.getKind();
    if (
      kind === SyntaxKind.ForStatement ||
      kind === SyntaxKind.ForInStatement ||
      kind === SyntaxKind.ForOfStatement ||
      kind === SyntaxKind.WhileStatement ||
      kind === SyntaxKind.DoStatement
    ) {
      return true;
    }
    current = current.getParent();
  }
  return false;
}

export const noRawMeshInLoopRule: Rule = {
  name: "no-raw-mesh-in-loop",
  severity: "error",
  check(sourceFile: SourceFile, _budget: BudgetConfig): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const filePath = sourceFile.getFilePath();

    const newExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.NewExpression,
    );

    for (const expr of newExpressions) {
      const exprText = expr.getExpression().getText();
      if (exprText === "Mesh" || exprText === "MeshBuilder") {
        if (isInsideLoop(expr)) {
          diagnostics.push({
            rule: "no-raw-mesh-in-loop",
            severity: "error",
            message: `new ${exprText}() inside a loop degrades performance`,
            file: filePath,
            line: expr.getStartLineNumber(),
            suggestion: "Use thin instances instead of creating meshes in a loop",
          });
        }
      }
    }

    return diagnostics;
  },
};
