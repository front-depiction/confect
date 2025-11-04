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
 * @category Models
 * @since 1.0.0
 */
export declare namespace ConfectApiGroup {
  /**
   * @category Models
   * @since 1.0.0
   */
  export interface Variance<Name, Functions, E, R> {
    readonly _name: Types.Covariant<Name>;
    readonly _functions: Types.Covariant<Functions>;
    readonly _e: Types.Invariant<E>;
    readonly _r: Types.Covariant<R>;
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
  in out E = never,
  out R = never,
> extends Pipeable {
  readonly [GroupTypeId]: ConfectApiGroup.Variance<Name, Functions, E, R>;
  readonly name: Name;
  readonly functions: Functions;
}

// =============================================================================
// Constructors (using satisfies pattern)
// =============================================================================

/**
 * Variance marker object for runtime representation (zero runtime cost).
 *
 * @internal
 */
const groupVariance: any = {
  _name: (_: never) => _,
  _functions: (_: never) => _,
  _e: (_: never) => _,
  _r: (_: never) => _,
};

/**
 * Create an empty group with the given name.
 *
 * Groups organize API functions into logical namespaces.
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
): ConfectApiGroup<Name, {}, never, never> => ({
  [GroupTypeId]: groupVariance,
  name,
  functions: {},
  pipe(this: ConfectApiGroup<Name, {}, never, never>) {
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
export const isGroup = (
  u: unknown,
): u is ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>, never, never> =>
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
export type GetName<G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>, never, never>> =
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
export type GetFunctions<G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>, never, never>> =
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
export type GetFunctionNames<G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>, never, never>> =
  keyof GetFunctions<G>;

/**
 * Extract the error type from a group.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").functions({ ... })
 * type Errors = Group.GetError<typeof userGroup>  // never (by default)
 */
export type GetError<G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>, any, never>> =
  G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>, infer E, never> ? E : never;

/**
 * Extract the context requirements from a group.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").functions({ ... })
 * type Context = Group.GetContext<typeof userGroup>  // never (by default)
 */
export type GetContext<G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>, never, any>> =
  G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>, never, infer R> ? R : never;

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
export const add = <
  K extends string,
  Fn extends Function.ConfectApiFunction,
>(
  key: K,
  fn: Fn,
) =>
<
  Name extends string,
  Functions extends Record<string, Function.ConfectApiFunction>,
  E,
  R,
>(
  group: ConfectApiGroup<Name, Functions, E, R>,
): ConfectApiGroup<Name, Functions & Record<K, Fn>, E, R> => {
  const newFunctions = Record.set(group.functions, key, fn);
  return {
    [GroupTypeId]: groupVariance,
    name: group.name,
    functions: newFunctions as Functions & Record<K, Fn>,
    pipe(this: ConfectApiGroup<Name, Functions & Record<K, Fn>, E, R>) {
      return pipeArguments(this, arguments);
    },
  };
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
export const rename = <OldKey extends string, NewKey extends string>(
  oldKey: OldKey,
  newKey: NewKey,
) =>
<
  Name extends string,
  Functions extends Record<string, Function.ConfectApiFunction>,
  E,
  R,
>(
  group: ConfectApiGroup<Name, Functions, E, R>,
): ConfectApiGroup<Name, Record<string, Function.ConfectApiFunction>, E, R> => {
  const newFunctions = Record.mapKeys(group.functions, (key) =>
    equals(key, oldKey) ? newKey : key,
  );
  return {
    [GroupTypeId]: groupVariance,
    name: group.name,
    functions: newFunctions,
    pipe(this: ConfectApiGroup<Name, Record<string, Function.ConfectApiFunction>, E, R>) {
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
export const merge = <
  Name2 extends string,
  Functions2 extends Record<string, Function.ConfectApiFunction>,
  E2,
  R2,
>(
  other: ConfectApiGroup<Name2, Functions2, E2, R2>,
) =>
<
  Name extends string,
  Functions extends Record<string, Function.ConfectApiFunction>,
  E,
  R,
>(
  group: ConfectApiGroup<Name, Functions, E, R>,
): ConfectApiGroup<
  Name,
  Functions & Functions2,
  E | E2,
  R | R2
> => {
  const newFunctions = Record.union(group.functions, other.functions, SK);
  return {
    [GroupTypeId]: groupVariance,
    name: group.name,
    functions: newFunctions as Functions & Functions2,
    pipe(
      this: ConfectApiGroup<Name, Functions & Functions2, E | E2, R | R2>,
    ) {
      return pipeArguments(this, arguments);
    },
  };
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
  ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>, never, never>
> = Order.mapInput(String.Order, (group: ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>, never, never>) => group.name);

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
  G extends ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>, never, never>,
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
