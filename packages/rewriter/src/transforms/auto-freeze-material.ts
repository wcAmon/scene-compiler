/**
 * Automatically inserts `.freeze()` calls after Babylon.js material
 * property assignments to improve rendering performance.
 *
 * Finds `new StandardMaterial/PBRMaterial/PBR*Material()` variable declarations,
 * locates the last property assignment for each variable, and inserts
 * `varName.freeze()` after it — unless `.freeze()` already exists.
 */
export function autoFreezeMaterial(code: string): string {
  // Match variable declarations that instantiate a Babylon.js material.
  // Supports: const/let/var mat = new StandardMaterial(...), new PBRMaterial(...),
  //           new PBRMetallicRoughnessMaterial(...), etc.
  const declRegex =
    /\b(?:const|let|var)\s+(\w+)\s*=\s*new\s+(?:Standard|PBR\w*)Material\s*\(/g;

  let match: RegExpExecArray | null;
  const variables: string[] = [];

  while ((match = declRegex.exec(code)) !== null) {
    variables.push(match[1]);
  }

  if (variables.length === 0) {
    return code;
  }

  let result = code;

  for (const varName of variables) {
    // If a `.freeze()` call already exists for this variable, skip it.
    const freezeRegex = new RegExp(`\\b${varName}\\.freeze\\s*\\(`);
    if (freezeRegex.test(result)) {
      continue;
    }

    // Find all property assignments for this variable: `varName.prop = ...;`
    const assignRegex = new RegExp(
      `\\b${varName}\\.[a-zA-Z_]\\w*\\s*=[^=][^;]*;`,
      "g",
    );

    let lastMatch: RegExpExecArray | null = null;
    let assignMatch: RegExpExecArray | null;
    while ((assignMatch = assignRegex.exec(result)) !== null) {
      lastMatch = assignMatch;
    }

    if (lastMatch) {
      const insertPos = lastMatch.index + lastMatch[0].length;
      result =
        result.slice(0, insertPos) +
        `\n${varName}.freeze();` +
        result.slice(insertPos);
    }
  }

  return result;
}
