import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { BudgetConfig, Diagnostic, Rule } from "../types.js";

function countMeshCreations(sourceFile: SourceFile): number {
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

  const newExprs = sourceFile
    .getDescendantsOfKind(SyntaxKind.NewExpression)
    .filter((expr) => {
      const name = expr.getExpression().getText();
      return name === "Mesh" || name === "MeshBuilder";
    }).length;

  return builderCalls + newExprs;
}

export const requireOctreeRule: Rule = {
  name: "require-octree",
  severity: "warning",
  check(sourceFile: SourceFile, budget: BudgetConfig): Diagnostic[] {
    const threshold = Math.floor(budget.maxActiveMeshes * 0.4);
    const meshCount = countMeshCreations(sourceFile);

    if (meshCount <= threshold) return [];

    // Check current file AND all other project files for octree setup.
    // Octree is typically set up once in a scene manager, not in every file.
    const allFiles = sourceFile.getProject().getSourceFiles();
    const hasOctree = allFiles.some((f) =>
      f.getFullText().includes("createOrUpdateSelectionOctree"),
    );
    if (hasOctree) return [];

    const severity = budget.octreeRequired ? "error" : "warning";
    const filePath = sourceFile.getFilePath();

    return [
      {
        rule: "require-octree",
        severity,
        message: `File creates ~${meshCount} meshes (threshold: ${threshold}) but has no Octree setup`,
        file: filePath,
        line: 1,
        suggestion: `Add after scene population:\n  scene.createOrUpdateSelectionOctree(32, 2);`,
      },
    ];
  },
};
