
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

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { equals } from "effect/Equal";
import { SK, dual } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Order from "effect/Order";
import { pipeArguments, type Pipeable } from "effect/Pipeable";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import type * as Scope from "effect/Scope";
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

// Removed: MergedFunctions and RenameKey helpers
// Functions are now stored as union types, not Record types

// =============================================================================
// Type Helpers (must be defined before ConfectApiGroup)
// =============================================================================

/**
 * Convert a Functions union type to a handlers object type.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * type MyFunctions = GetUserFn | CreateUserFn
 * type Handlers = FunctionsToHandlers<MyFunctions>
 * // { getUser: (...) => Effect, createUser: (...) => Effect }
 */
export type FunctionsToHandlers<Functions extends Function.ConfectApiFunction> = {
  [K in Function.GetName<Functions>]: (
    args: Function.GetArgsType<Extract<Functions, { readonly name: K }>>
  ) => Effect.Effect<
    Function.GetReturnsType<Extract<Functions, { readonly name: K }>>,
    any,   // E is open
    never  // R must be never (handlers close over deps)
  >
}


// TagClass removed - groups are now Context.Tags directly
/**
 * API Group - collection of related functions.
 *
 * Groups are simple namespaced containers for functions.
 * They don't propagate E/R - that's handled at the function level.
 *
 * The group itself is a Context.Tag, so you can use it directly in Layers:
 * - yield* usersGroup to get the handlers
 * - Layer.effect(usersGroup, ...) to provide the handlers
 *
 * @category Types
 * @since 1.0.0
 */
export interface ConfectApiGroup<
  in out Name extends string,
  in out Functions extends Function.ConfectApiFunction = never,
> extends Context.Tag<Name, FunctionsToHandlers<Functions>> {
  readonly [GroupTypeId]: GroupTypeId;
  readonly name: Name;
  readonly functions: Record.ReadonlyRecord<string, Functions>;
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
): ConfectApiGroup<Name> => {
  // Create a Context.Tag first
  const tag = Context.GenericTag<Name, {}>(name);

  // Then enhance it with group-specific properties
  return Object.assign(tag, {
    [GroupTypeId]: GroupTypeId,
    name,
    functions: {},
  }) as any;
};

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
export const isGroup = (u: unknown): u is ConfectApiGroup<string, Function.ConfectApiFunction> =>
  Predicate.hasProperty(u, GroupTypeId);

// =============================================================================
// Type Extraction Utilities
// =============================================================================

/**
 * Extract group name
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").functions({ ... })
 * type Name = Group.GetName<typeof userGroup>  // "users"
 */
export type GetName<G extends ConfectApiGroup<any, any>> =
  G extends ConfectApiGroup<infer Name, any> ? Name : never;

/**
 * Extract functions record
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").functions(fns)
 * type Fns = Group.GetFunctions<typeof userGroup>  // typeof fns
 */
export type GetFunctions<G extends ConfectApiGroup<any, any>> =
  G extends ConfectApiGroup<any, infer Functions> ? Functions : never;

/**
 * Extract function names from the functions stored in the group's record
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").pipe(
 *   Group.add("getUser", ...),
 *   Group.add("createUser", ...)
 * )
 * type Names = Group.GetFunctionNames<typeof userGroup>
 * // "getUser" | "createUser"
 */
export type GetFunctionNames<G extends ConfectApiGroup<any, any>> =
  G extends ConfectApiGroup<any, infer Functions>
  ? Functions extends Function.ConfectApiFunction
  ? Function.GetName<Functions>
  : never
  : never;

/**
 * Extract a specific function from the union by name
 *
 * @category Type Utilities
 * @since 1.0.0
 */
export type GetFunction<
  G extends ConfectApiGroup<any, any>,
  Name extends string
> = G extends ConfectApiGroup<any, infer Functions>
  ? Extract<Functions, { readonly name: Name }>
  : never;

/**
 * Extract handler types for a group.
 *
 * @category Type Utilities
 * @since 1.0.0
 */
export type HandlersFor<G extends ConfectApiGroup<any, any>> =
  G extends ConfectApiGroup<any, infer Functions>
  ? FunctionsToHandlers<Functions>
  : never

// =============================================================================
// Pipeable Utilities
// =============================================================================

/**
 * Add a function to a group (pipeable).
 *
 * Returns a transformer function that adds the function to the group.
 * Does not mutate the original group.
 * Functions are stored as a union type.
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
) => <Name extends string, Functions extends Function.ConfectApiFunction>(
  group: ConfectApiGroup<Name, Functions>,
) => ConfectApiGroup<Name, Functions | Fn> =
  (name, fn) =>
    (group) => {
      const functions = Record.set(group.functions, name, fn);
      const tag = Context.GenericTag<typeof group.name, {}>(group.name);
      return Object.assign(tag, {
        [GroupTypeId]: GroupTypeId,
        name: group.name,
        functions
      }) as any;
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
  <Name extends string, Functions extends Function.ConfectApiFunction>(
    group: ConfectApiGroup<Name, Functions>,
  ): ConfectApiGroup<Name, Functions> => {
    const functions = Record.mapKeys(group.functions, (key) =>
      equals(key, oldKey) ? newKey : key,
    );
    const tag = Context.GenericTag<typeof group.name, {}>(group.name);
    return Object.assign(tag, {
      [GroupTypeId]: GroupTypeId,
      name: group.name,
      functions,
    }) as any;
  };

/**
 * Merge another group's functions into this group (pipeable).
 *
 * Returns a transformer function that merges functions from another group.
 * If there are duplicate function names, functions from the other group take precedence.
 * Functions are unioned at the type level.
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
  Functions2 extends Function.ConfectApiFunction,
>(
  other: ConfectApiGroup<Name2, Functions2>,
) => <Name extends string, Functions extends Function.ConfectApiFunction>(
  group: ConfectApiGroup<Name, Functions>,
) => ConfectApiGroup<Name, Functions | Functions2> =
  (other) =>
    (group) => {
      const functions = Record.union(group.functions, other.functions, SK);
      const tag = Context.GenericTag<typeof group.name, {}>(group.name);
      return Object.assign(tag, {
        [GroupTypeId]: GroupTypeId,
        name: group.name,
        functions
      }) as any;
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
  ConfectApiGroup<string, Function.ConfectApiFunction>
> = Order.mapInput(String.Order, (group: ConfectApiGroup<string, Function.ConfectApiFunction>) => group.name);

// =============================================================================
// Layer Building (Dependency Management)
// =============================================================================

/**
 * Groups are Context.Tags, so use Effect's Layer functions directly:
 *
 * ```typescript
 * const notesGroup = Group.group("notes").pipe(
 *   Group.add("list", listQuery),
 *   Group.add("create", createMutation)
 * )
 *
 * // Use the group directly as a tag!
 * const NotesLive = Layer.effect(notesGroup, Effect.gen(function*() {
 *   const db = yield* Database
 *   return {
 *     list: () => db.query("SELECT * FROM notes"),
 *     create: (args) => db.insert("notes", args)
 *   }
 * }))
 *
 * // Provide dependencies
 * const program = Effect.gen(function*() {
 *   const notes = yield* notesGroup  // Get the handlers
 *   yield* notes.list()
 * })
 * ```
 *
 * For scoped resources, use `Layer.scoped(group, effect)`.
 * For mocks, use `Layer.succeed(group, handlers)`.
 *
 * @category Layer Building
 * @since 1.0.0
 */

