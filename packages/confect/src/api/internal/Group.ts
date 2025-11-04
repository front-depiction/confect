/* eslint-disable prefer-rest-params */
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
 * 1. **Pipeable API** - All operations are pipeable transformations
 * 2. **Effect Variance Pattern** - Namespace + Variance interface
 * 3. **Phantom Types** - Stored under symbol to avoid namespace pollution
 * 4. **Variance Annotations** - Using Effect's Types module for correct variance
 * 5. **Literal Preservation** - Literal types preserved through pipeline
 * 6. **Brand Pattern** - Prevents mixing with plain objects
 *
 * @example
 * import * as Group from "./internal/Group"
 * import * as Function from "./internal/Function"
 *
 * const userGroup = Group.group("users").pipe(
 *   Group.add("getUser", Function.query("getUser").args(...).returns(...)),
 *   Group.add("createUser", Function.mutation("createUser").args(...).returns(...))
 * )
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
import { pipeArguments, type Pipeable } from "effect/Pipeable";
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
 * Helper type to ensure MergeRight result satisfies Record constraint.
 * TypeScript cannot prove that MergeRight<A, B> extends Record<string, T>
 * even when A and B both extend Record<string, T>, so we use this helper.
 *
 * @internal
 */
type MergedFunctions<
  A extends Record<string, Function.ConfectApiFunction>,
  B extends Record<string, Function.ConfectApiFunction>,
> = Types.MergeRight<A, B> extends Record<string, Function.ConfectApiFunction> ? Types.MergeRight<A, B> : never;

/**
 * Helper type to rename a key of a Function record.
 * @internal
 */
type RenameKey<
  A extends Record<string, Function.ConfectApiFunction>,
  K1 extends keyof A,
  K2 extends string,
> = MergedFunctions<Omit<A, K1>, Record<K2, A[K1]>>



/**
 * API Group - collection of related functions.
 *
 * Groups are simple namespaced containers for functions.
 * They don't propagate E/R - that's handled at the function level.
 *
 * @category Types
 * @since 1.0.0
 */
export interface ConfectApiGroup<
  out Name extends string,
  out Functions extends Record<string, Function.ConfectApiFunction>,
> extends Pipeable {
  readonly [GroupTypeId]: GroupTypeId;
  readonly name: Name;
  readonly functions: Functions;
}

// =============================================================================
// Constructors
// =============================================================================

/**
 * Create an empty group with the given name.
 *
 * Groups are simple namespaced containers for functions.
 * Use `.pipe()` with `Group.add()` to add functions.
 *
 * @param name - Group name (preserved as literal type)
 * @returns Empty group ready for piping
 *
 * @category Constructors
 * @since 1.0.0
 *
 * @example
 * import * as Group from "./internal/Group"
 * import * as Function from "./internal/Function"
 * import * as Schema from "effect/Schema"
 *
 * const userGroup = Group.group("users").pipe(
 *   Group.add("getUser", Function.query("getUser")
 *     .args(Schema.Struct({ id: Schema.String }))
 *     .returns(Schema.Struct({
 *       id: Schema.String,
 *       name: Schema.String,
 *       email: Schema.String
 *     }))),
 *   Group.add("createUser", Function.mutation("createUser")
 *     .args(Schema.Struct({
 *       name: Schema.String,
 *       email: Schema.String
 *     }))
 *     .returns(Schema.Struct({
 *       id: Schema.String,
 *       name: Schema.String,
 *       email: Schema.String
 *     })))
 * )
 *
 * // ✅ Literal types preserved!
 * const groupName: "users" = userGroup.name
 * const functionNames: ("getUser" | "createUser")[] = Object.keys(userGroup.functions)
 */
export const group = <Name extends string>(
  name: Name,
): ConfectApiGroup<Name, {}> => ({
  [GroupTypeId]: GroupTypeId,
  name,
  functions: {},
  pipe() {
    return pipeArguments(this, arguments);
  },
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
export const isGroup = (u: unknown): u is ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>> =>
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
// Pipeable Utilities
// =============================================================================

/**
 * Add a function to a group (pipeable).
 *
 * Returns a transformer function that adds the function to the group.
 * Does not mutate the original group.
 *
 * @param key - Function name (key)
 * @param fn - Function to add
 * @returns Transformer function that adds the function to a group
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * import * as Group from "./internal/Group"
 * import * as Function from "./internal/Function"
 *
 * const userGroup = Group.group("users").pipe(
 *   Group.add("getUser", getUserFn),
 *   Group.add("createUser", createUserFn)
 * )
 */
export const add: <K extends string, Fn extends Function.ConfectApiFunction>(
  key: K,
  fn: Fn,
) => <Name extends string, Functions extends Record<string, Function.ConfectApiFunction>>(
  group: ConfectApiGroup<Name, Functions>,
) => ConfectApiGroup<Name, MergedFunctions<Functions, Record<K, Fn>>> =
  (key, fn) =>
    (group) => {
      const newFunctions = Record.set(group.functions, key, fn);
      return {
        [GroupTypeId]: GroupTypeId,
        name: group.name,
        functions: newFunctions as MergedFunctions<
          typeof group.functions,
          Record<typeof key, typeof fn>
        >,
        pipe() {
          return pipeArguments(this, arguments);
        },
      } as any;
    };

/**
 * Rename a function in a group (pipeable).
 *
 * Returns a transformer function that renames a function in the group.
 * Does not mutate the original group.
 *
 * @param oldKey - Current function name
 * @param newKey - New function name
 * @returns Transformer function that renames the function
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * import * as Group from "./internal/Group"
 *
 * const userGroup = Group.group("users").pipe(
 *   Group.add("getUser", getUserFn),
 *   Group.rename("getUser", "fetchUser")
 * )
 * // userGroup has fetchUser instead of getUser
 */
export const rename = <Functions extends Record<string, Function.ConfectApiFunction>, OldKey extends keyof Functions, NewKey extends string>(
  oldKey: OldKey,
  newKey: NewKey,
) =>
  <Name extends string>(
    group: ConfectApiGroup<Name, Functions>,
  ): ConfectApiGroup<Name, RenameKey<Functions, Extract<OldKey, keyof Functions>, NewKey>> => {
    const newFunctions = Record.mapKeys(group.functions, (key) =>
      equals(key, oldKey) ? newKey : key,
    );
    return {
      [GroupTypeId]: GroupTypeId,
      name: group.name,
      functions: newFunctions as never,
      pipe() {
        return pipeArguments(this, arguments);
      },
    };
  };

/**
 * Merge another group's functions into this group (pipeable).
 *
 * Returns a transformer function that merges functions from another group.
 * If there are duplicate function names, functions from the other group take precedence.
 * The error and context types are unioned.
 * Does not mutate either group.
 *
 * @param other - Group whose functions to merge
 * @returns Transformer function that merges the groups
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * import * as Group from "./internal/Group"
 *
 * const group1 = Group.group("api").pipe(Group.add("getUser", getUserFn))
 * const group2 = Group.group("api").pipe(Group.add("createUser", createUserFn))
 * const merged = group1.pipe(Group.merge(group2))
 * // merged has both getUser and createUser
 */
export const merge: <
  Name2 extends string,
  Functions2 extends Record<string, Function.ConfectApiFunction>,
>(
  other: ConfectApiGroup<Name2, Functions2>,
) => <Name extends string, Functions extends Record<string, Function.ConfectApiFunction>>(
  group: ConfectApiGroup<Name, Functions>,
) => ConfectApiGroup<Name, MergedFunctions<Functions, Functions2>> =
  (other) =>
    (group) => {
      const newFunctions = Record.union(group.functions, other.functions, SK);
      return {
        [GroupTypeId]: GroupTypeId,
        name: group.name,
        functions: newFunctions as MergedFunctions<
          typeof group.functions,
          typeof other.functions
        >,
        pipe() {
          return pipeArguments(this, arguments);
        },
      } as any;
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
