/**
 * @module internal/Group
 *
 * Group types for organizing API functions.
 *
 * This module defines groups that contain collections of API functions
 * using phantom types for maximum type-level tracking and Effect patterns for composability.
 *
 * ## Design Principles
 *
 * 1. **Effect Variance Pattern** - Namespace + Variance interface
 * 2. **Phantom Types** - Stored under symbol to avoid namespace pollution
 * 3. **Variance Annotations** - Using Effect's Types module for correct variance
 * 4. **Literal Preservation** - Using `satisfies` to keep literal types
 * 5. **Brand Pattern** - Prevents mixing with plain objects
 *
 * @example
 * import * as Group from "./internal/Group"
 * import * as Function from "./internal/Function"
 *
 * const userFunctions = Group.group("users").functions({
 *   getUser: Function.query("getUser").args(...).returns(...),
 *   createUser: Function.mutation("createUser").args(...).returns(...)
 * })
 *
 * if (Group.isGroup(value)) {
 *   // value is ConfectApiGroup
 * }
 *
 * @since 1.0.0
 */

import type {
  DefaultFunctionArgs,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import { equals } from "effect/Equal";
import { SK } from "effect/Function";
import * as Order from "effect/Order";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as String from "effect/String";
import * as Types from "effect/Types";
import type * as Function from "./Function";

// =============================================================================
// Symbols and Type IDs
// =============================================================================

/**
 * @category Symbols
 * @since 1.0.0
 */
export const GroupTypeId: unique symbol = Symbol.for("@confect/Group");

/**
 * @category Symbols
 * @since 1.0.0
 */
export type GroupTypeId = typeof GroupTypeId;

// =============================================================================
// Group Types
// =============================================================================

/**
 * @category Models
 * @since 1.0.0
 */
export declare namespace ConfectApiGroup {
  /**
   * @category Models
   * @since 1.0.0
   */
  export interface Variance<Name, Functions> {
    readonly _name: Types.Covariant<Name>;
    readonly _functions: Types.Covariant<Functions>;
  }
}

/**
 * API Group - collection of related functions.
 *
 * Groups organize API functions into logical namespaces.
 * They provide a way to structure large APIs and generate organized Convex exports.
 *
 * @category Types
 * @since 1.0.0
 */
export interface ConfectApiGroup<
  out Name extends string,
  out Functions extends Record<string, Function.ConfectApiFunction>,
> {
  readonly [GroupTypeId]: ConfectApiGroup.Variance<Name, Functions>;
  readonly name: Name;
  readonly functions: Functions;
}

// =============================================================================
// Constructors (using satisfies pattern)
// =============================================================================

/**
 * Create a group using a fluent builder pattern.
 *
 * The builder preserves literal types using the `satisfies` pattern,
 * ensuring that group names and function names are not widened to `string`.
 *
 * @param name - Group name (preserved as literal type)
 * @returns Builder for specifying functions
 *
 * @category Constructors
 * @since 1.0.0
 *
 * @example
 * import * as Group from "./internal/Group"
 * import * as Function from "./internal/Function"
 * import * as Schema from "effect/Schema"
 *
 * const userGroup = Group.group("users").functions({
 *   getUser: Function.query("getUser")
 *     .args(Schema.Struct({ id: Schema.String }))
 *     .returns(Schema.Struct({
 *       id: Schema.String,
 *       name: Schema.String,
 *       email: Schema.String
 *     })),
 *   createUser: Function.mutation("createUser")
 *     .args(Schema.Struct({
 *       name: Schema.String,
 *       email: Schema.String
 *     }))
 *     .returns(Schema.Struct({
 *       id: Schema.String,
 *       name: Schema.String,
 *       email: Schema.String
 *     }))
 * })
 *
 * // ✅ Literal types preserved!
 * const groupName: "users" = userGroup.name
 * const functionNames: ("getUser" | "createUser")[] = Object.keys(userGroup.functions)
 */
export const group = <Name extends string>(name: Name) => ({
  functions: <Functions extends Record<string, Function.ConfectApiFunction>>(
    functions: Functions,
  ) => ({
    [GroupTypeId]: {
      _name: () => name,
      _functions: () => functions,
    },
    name,
    functions,
  } satisfies ConfectApiGroup<Name, Functions>)
});

// =============================================================================
// Predicates (using Predicate.hasProperty)
// =============================================================================

/**
 * Check if a value is a Confect API group.
 *
 * Uses `Predicate.hasProperty` to check for the presence of the GroupTypeId symbol.
 *
 * @param u - Unknown value to check
 * @returns Type guard narrowing to ConfectApiGroup
 *
 * @category Refinements
 * @since 1.0.0
 *
 * @example
 * if (Group.isGroup(value)) {
 *   // value is ConfectApiGroup
 *   console.log(value.name)
 *   console.log(Object.keys(value.functions))
 * }
 */
export const isGroup = (
  u: unknown,
): u is ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>> =>
  Predicate.hasProperty(u, GroupTypeId);

// =============================================================================
// Type Extraction Utilities
// =============================================================================

/**
 * Extract the group name as a literal type.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").functions({ ... })
 * type Name = Group.GetName<typeof userGroup>  // "users"
 */
export type GetName<G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>> =
  G["name"];

/**
 * Extract the functions record.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").functions(fns)
 * type Fns = Group.GetFunctions<typeof userGroup>  // typeof fns
 */
export type GetFunctions<G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>> =
  G["functions"];

/**
 * Extract function names as a union of literal types.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").functions({
 *   getUser: ...,
 *   createUser: ...
 * })
 * type Names = Group.GetFunctionNames<typeof userGroup>
 * // "getUser" | "createUser"
 */
export type GetFunctionNames<G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>> =
  keyof GetFunctions<G>;

// =============================================================================
// Functional Utilities
// =============================================================================

/**
 * Add a function to a group.
 *
 * Returns a new group with the function added. Does not mutate the original.
 *
 * @param group - Group to add function to
 * @param name - Function name (key)
 * @param fn - Function to add
 * @returns New group with function added
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").functions({ getUser: ... })
 * const withCreate = Group.addFunction(userGroup, "createUser", createUserFn)
 * // withCreate has both getUser and createUser
 */
export const addFunction = <
  Name extends string,
  Functions extends Record<string, Function.ConfectApiFunction>,
  Key extends string,
  Fn extends Function.ConfectApiFunction,
>(
  group: ConfectApiGroup<Name, Functions>,
  name: Key,
  fn: Fn,
) => {
  const newFunctions = Record.set(group.functions, name, fn);
  return {
    [GroupTypeId]: {
      _name: () => group.name,
      _functions: () => newFunctions,
    },
    name: group.name,
    functions: newFunctions,
  } satisfies ConfectApiGroup<Name, Record<string, Function.ConfectApiFunction>>;
};

/**
 * Rename a function in a group.
 *
 * Returns a new group with the function renamed. Does not mutate the original.
 *
 * @param group - Group containing the function
 * @param oldName - Current function name
 * @param newName - New function name
 * @returns New group with function renamed
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").functions({ getUser: ... })
 * const renamed = Group.renameFunction(userGroup, "getUser", "fetchUser")
 * // renamed has fetchUser instead of getUser
 */
export const renameFunction = <
  Name extends string,
  Key extends string,
  Functions extends Record<Key, Function.ConfectApiFunction>,
  OldKey extends string,
  NewKey extends string,
>(
  group: ConfectApiGroup<Name, Functions>,
  oldName: OldKey,
  newName: NewKey,
) => {
  const newFunctions = Record.mapKeys(group.functions, (key) => equals(key, oldName) ? newName : key);
  return {
    [GroupTypeId]: {
      _name: () => group.name,
      _functions: () => newFunctions
    },
    name: group.name,
    functions: newFunctions,
  } satisfies ConfectApiGroup<Name, Record<string, Function.ConfectApiFunction>>;
};

/**
 * Merge two groups.
 *
 * Returns a new group with functions from both groups.
 * If there are duplicate function names, functions from the second group take precedence.
 *
 * @param group1 - First group
 * @param group2 - Second group
 * @returns New group with merged functions
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * const group1 = Group.group("api").functions({ getUser: ... })
 * const group2 = Group.group("api").functions({ createUser: ... })
 * const merged = Group.mergeFunctions(group1, group2)
 * // merged has both getUser and createUser
 */
export const mergeFunctions = <
  Name extends string,
  K1 extends string,
  K2 extends string,
  Functions1 extends Record<K1, Function.ConfectApiFunction>,
  Functions2 extends Record<K2, Function.ConfectApiFunction>,
>(
  group1: ConfectApiGroup<Name, Functions1>,
  group2: ConfectApiGroup<Name, Functions2>,
) => {
  const newFunctions = Record.union(group1.functions, group2.functions, SK)
  return {
    [GroupTypeId]: {
      _name: () => group1.name,
      _functions: () => newFunctions
    },
    name: group1.name,
    functions: newFunctions,
  } satisfies ConfectApiGroup<Name, Record<string, Function.ConfectApiFunction>>;
};

// =============================================================================
// Order Utilities
// =============================================================================

/**
 * Order groups by name (alphabetically).
 *
 * @category Ordering
 * @since 1.0.0
 *
 * @example
 * import * as Array from "effect/Array"
 *
 * const groups = [userGroup, adminGroup, publicGroup]
 * const sorted = Array.sort(groups, Group.byName)
 * // [adminGroup, publicGroup, userGroup]
 */
export const byName: Order.Order<
  ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
> = Order.mapInput(String.Order, (group: ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>) => group.name);

// =============================================================================
// Convex Integration
// =============================================================================

/**
 * Convert a Confect API group to Convex registered functions.
 *
 * This is the bridge between our type system and Convex's runtime.
 * The function compiles all function schemas to Convex validators and returns
 * a record of RegisteredQuery, RegisteredMutation, or RegisteredAction.
 *
 * @param group - Confect API group to convert
 * @param compileSchema - Schema compiler function (from schema_to_validator)
 * @returns Record of Convex registered functions
 *
 * @category Convex Integration
 * @since 1.0.0
 *
 * @example
 * import { compileSchema } from "../schema_to_validator"
 * import * as Function from "./internal/Function"
 *
 * const userGroup = Group.group("users").functions({
 *   getUser: Function.query("getUser")
 *     .args(Schema.Struct({ id: Schema.String }))
 *     .returns(UserSchema),
 *   createUser: Function.mutation("createUser")
 *     .args(Schema.Struct({ name: Schema.String, email: Schema.String }))
 *     .returns(UserSchema)
 * })
 *
 * const convexFunctions = Group.toConvexGroup(userGroup, compileSchema)
 * // {
 * //   getUser: RegisteredQuery<...>,
 * //   createUser: RegisteredMutation<...>
 * // }
 */
export const toConvexGroup = <
  G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>,
  Args extends DefaultFunctionArgs,
  Returns
>(
  group: G,
): Record<
  string,
  | RegisteredQuery<"public", Args, Returns>
  | RegisteredMutation<"public", Args, Returns>
  | RegisteredAction<"public", Args, Returns>
> => {
  return Record.map(
    group.functions as Record<string, Function.ConfectApiFunction>,
    () => {
      // TODO: Switch to real convex function conversion
      return {} as never;
    },
  )
};
