import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { validate } from "../src/validator.js";
import type { Rule } from "../src/types.js";

describe("validate", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "validator-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should run a mock rule against source files and collect errors", () => {
    writeFileSync(
      path.join(tmpDir, "scene.ts"),
      `const x = 1;\n`,
    );

    const mockRule: Rule = {
      name: "mock-error-rule",
      severity: "error",
      check(sourceFile) {
        return [
          {
            rule: "mock-error-rule",
            severity: "error",
            message: "mock error",
            file: sourceFile.getFilePath(),
            line: 1,
          },
        ];
      },
    };

    const result = validate(tmpDir, [mockRule], {
      maxNPCs: 30,
      maxShadowCasters: 10,
      maxGLBSizeMB: 5,
      maxTotalAssetTypes: 50,
      maxRenderDistance: 300,
      targetFPS: 30,
      maxDrawCalls: 200,
      maxActiveMeshes: 500,
    });

    expect(result.fileCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rule).toBe("mock-error-rule");
    expect(result.warnings).toHaveLength(0);
  });

  it("should collect warnings separately from errors", () => {
    writeFileSync(
      path.join(tmpDir, "scene.ts"),
      `const y = 2;\n`,
    );

    const mockWarningRule: Rule = {
      name: "mock-warning-rule",
      severity: "warning",
      check(sourceFile) {
        return [
          {
            rule: "mock-warning-rule",
            severity: "warning",
            message: "mock warning",
            file: sourceFile.getFilePath(),
            line: 1,
          },
        ];
      },
    };

    const result = validate(tmpDir, [mockWarningRule], {
      maxNPCs: 30,
      maxShadowCasters: 10,
      maxGLBSizeMB: 5,
      maxTotalAssetTypes: 50,
      maxRenderDistance: 300,
      targetFPS: 30,
      maxDrawCalls: 200,
      maxActiveMeshes: 500,
    });

    expect(result.fileCount).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].rule).toBe("mock-warning-rule");
    expect(result.errors).toHaveLength(0);
  });

  it("should report fileCount of 0 for an empty directory", () => {
    const result = validate(tmpDir, [], {
      maxNPCs: 30,
      maxShadowCasters: 10,
      maxGLBSizeMB: 5,
      maxTotalAssetTypes: 50,
      maxRenderDistance: 300,
      targetFPS: 30,
      maxDrawCalls: 200,
      maxActiveMeshes: 500,
    });

    expect(result.fileCount).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
