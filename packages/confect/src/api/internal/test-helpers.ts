/**
 * Test utilities for API module tests
 * @module internal/test-helpers
 */

/**
 * Type utility to check if two types are equivalent.
 *
 * Uses tuple distributivity to check bidirectional assignability.
 *
 * @category Test Utilities
 *
 * @example
 * type Result = TypesAreEquivalent<string, string> // true
 * type Result2 = TypesAreEquivalent<string, number> // false
 */
export type TypesAreEquivalent<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
