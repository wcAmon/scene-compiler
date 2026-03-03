export { validate } from "./validator.js";
export { parseBudget } from "./parse-budget.js";
export {
  createGlbExistsRule,
  noRawMeshInLoopRule,
  shadowConfigRule,
  materialFreezeRule,
  budgetLimitsRule,
} from "./rules/index.js";
export type {
  BudgetConfig,
  Diagnostic,
  Rule,
  ValidateResult,
} from "./types.js";
