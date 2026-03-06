import type { SourceFile, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { BudgetConfig, Diagnostic, Rule } from "../types.js";

/** Array methods that behave like loops. */
const LOOP_LIKE_METHODS = new Set([
  "forEach",
  "map",
  "flatMap",
  "reduce",
  "reduceRight",
]);

function isInsideLoop(node: Node): boolean {
  let current = node.getParent();
  while (current) {
    const kind = current.getKind();

    // Traditional loop statements
    if (
      kind === SyntaxKind.ForStatement ||
      kind === SyntaxKind.ForInStatement ||
      kind === SyntaxKind.ForOfStatement ||
      kind === SyntaxKind.WhileStatement ||
      kind === SyntaxKind.DoStatement
    ) {
      return true;
    }

    // Array iterator methods: arr.forEach((...) => { new Mesh() })
    // The node is inside a callback (arrow/function) whose parent is a
    // CallExpression like `something.forEach(...)`.
    if (
      kind === SyntaxKind.ArrowFunction ||
      kind === SyntaxKind.FunctionExpression
    ) {
      const callExpr = current.getParent();
      if (callExpr?.getKind() === SyntaxKind.CallExpression) {
        const expr = callExpr
          .asKindOrThrow(SyntaxKind.CallExpression)
          .getExpression();
        if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
          const methodName = expr
            .asKindOrThrow(SyntaxKind.PropertyAccessExpression)
            .getName();
          if (LOOP_LIKE_METHODS.has(methodName)) {
            return true;
          }
        }
      }
    }

    current = current.getParent();
  }
  return false;
}

/**
 * Check if the containing function uses a valid batching pattern that
 * justifies creating meshes in a loop.
 *
 * Recognised patterns:
 * - MergeMeshes  — merge-after-loop (existing)
 * - thinInstanceAdd / thinInstanceSetBuffer — thin instance templates
 */
function hasBatchingKeyword(text: string): boolean {
  return (
    text.includes("MergeMeshes") ||
    text.includes("thinInstanceAdd") ||
    text.includes("thinInstanceSetBuffer")
  );
}

/** Returns true if a function node is a callback of a loop-like array method. */
function isLoopCallback(fn: Node): boolean {
  const callExpr = fn.getParent();
  if (callExpr?.getKind() !== SyntaxKind.CallExpression) return false;
  const expr = callExpr
    .asKindOrThrow(SyntaxKind.CallExpression)
    .getExpression();
  if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return false;
  const methodName = expr
    .asKindOrThrow(SyntaxKind.PropertyAccessExpression)
    .getName();
  return LOOP_LIKE_METHODS.has(methodName);
}

function containingFunctionHasBatchingPattern(node: Node): boolean {
  let current = node.getParent();
  while (current) {
    const kind = current.getKind();
    if (
      kind === SyntaxKind.FunctionDeclaration ||
      kind === SyntaxKind.MethodDeclaration ||
      kind === SyntaxKind.ArrowFunction ||
      kind === SyntaxKind.FunctionExpression
    ) {
      // Check this function scope for batching keywords
      if (hasBatchingKeyword(current.getText())) return true;
      // If this is a loop-like callback (.forEach/.map), keep walking up
      // to check the outer function too.
      if (!isLoopCallback(current)) return false;
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

    // Detect: new Mesh() or new MeshBuilder() inside a loop
    const newExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.NewExpression,
    );

    for (const expr of newExpressions) {
      const exprText = expr.getExpression().getText();
      if (exprText === "Mesh" || exprText === "MeshBuilder") {
        if (isInsideLoop(expr)) {
          // Exempt: loop creates meshes that are merged — valid optimization pattern
          if (containingFunctionHasBatchingPattern(expr)) continue;

          diagnostics.push({
            rule: "no-raw-mesh-in-loop",
            severity: "error",
            message: `new ${exprText}() inside a loop degrades performance`,
            file: filePath,
            line: expr.getStartLineNumber(),
            suggestion:
              "Use thin instances, clones, or MergeMeshes instead of creating meshes in a loop",
          });
        }
      }
    }

    // Detect: MeshBuilder.Create*() call expressions inside a loop
    const callExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    );

    for (const expr of callExpressions) {
      const exprText = expr.getExpression().getText();
      if (/^MeshBuilder\.Create/.test(exprText)) {
        if (isInsideLoop(expr)) {
          // Exempt: batching patterns (merge / thin instances)
          if (containingFunctionHasBatchingPattern(expr)) continue;

          diagnostics.push({
            rule: "no-raw-mesh-in-loop",
            severity: "error",
            message: `${exprText}() inside a loop degrades performance`,
            file: filePath,
            line: expr.getStartLineNumber(),
            suggestion:
              "Use thin instances, clones, or MergeMeshes instead of creating meshes in a loop",
          });
        }
      }
    }

    return diagnostics;
  },
};
