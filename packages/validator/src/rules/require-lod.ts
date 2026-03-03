import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { BudgetConfig, Diagnostic, Rule } from "../types.js";

function countMeshCreations(sourceFile: SourceFile): number {
  // Count MeshBuilder.Create*() static method calls (CallExpression)
  const builderCalls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const expr = call.getExpression();
      if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
        const pae = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        return (
          pae.getExpression().getText() === "MeshBuilder" &&
          pae.getName().startsWith("Create")
        );
      }
      return false;
    }).length;

  // Count new Mesh() / new MeshBuilder() (NewExpression)
  const newExprs = sourceFile
    .getDescendantsOfKind(SyntaxKind.NewExpression)
    .filter((expr) => {
      const name = expr.getExpression().getText();
      return name === "Mesh" || name === "MeshBuilder";
    }).length;

  return builderCalls + newExprs;
}

export const requireLodRule: Rule = {
  name: "require-lod",
  severity: "warning",
  check(sourceFile: SourceFile, budget: BudgetConfig): Diagnostic[] {
    const threshold = Math.floor(budget.maxActiveMeshes * 0.2);
    const meshCount = countMeshCreations(sourceFile);

    if (meshCount <= threshold) return [];

    const fileText = sourceFile.getFullText();
    if (fileText.includes("addLODLevel")) return [];

    const severity = budget.lodRequired ? "error" : "warning";
    const filePath = sourceFile.getFilePath();

    return [
      {
        rule: "require-lod",
        severity,
        message: `File creates ~${meshCount} meshes (threshold: ${threshold}) but has no LOD levels`,
        file: filePath,
        line: 1,
        suggestion: `Add LOD levels to reduce draw calls at distance:\n  mesh.addLODLevel(${Math.floor(budget.maxRenderDistance * 0.5)}, lowDetailMesh);\n  mesh.addLODLevel(${budget.maxRenderDistance}, null);`,
      },
    ];
  },
};
