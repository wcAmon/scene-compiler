/**
 * Wraps bare `.dispose()` calls with a null-check guard to prevent
 * runtime errors on already-disposed or nullish references.
 *
 * `someVar.dispose()` becomes `someVar && someVar.dispose()`
 *
 * Calls that are already guarded (preceded by `&&`, or inside an
 * `if (...)` block) are left untouched.
 */
export function autoDisposeGuard(code: string): string {
  // Match `identifier.dispose()` that is NOT preceded by `&& ` or `&& `.
  // We use a two-pass approach:
  //   1. Find all `<word>.dispose()` occurrences.
  //   2. Check whether the match is already guarded.
  const disposeRegex = /\b(\w+)\.dispose\s*\(\s*\)/g;

  let changed = false;
  const result = code.replace(disposeRegex, (fullMatch, varName, offset) => {
    // Look at the text preceding this match to decide if it is already guarded.
    const before = code.slice(Math.max(0, offset - 60), offset);

    // Already guarded: preceded by `&&`
    if (/&&\s*$/.test(before)) {
      return fullMatch;
    }

    // Already guarded: inside an `if (varName)` or `if (varName != null)` style guard.
    // A simple heuristic: the line starts with `if` and contains the variable name.
    const lineStart = code.lastIndexOf("\n", offset);
    const linePrefix = code.slice(lineStart + 1, offset).trim();
    if (/^if\s*\(/.test(linePrefix)) {
      return fullMatch;
    }

    changed = true;
    return `${varName} && ${varName}.dispose()`;
  });

  return changed ? result : code;
}
