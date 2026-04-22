/**
 * Validator module barrel.
 */

export { validateBom, validateTypedBom } from './validate.js';
export type {
  BomValidationError,
  BomValidationResult,
} from './validate.js';
export { getAjv, getValidator, resetAjvCacheForTests } from './ajv.js';
