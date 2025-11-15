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
 * Tag class for a group's handler implementations.
 *
 * The Tag class extends Context.Tag and stores the group definition.
 * This ensures single Tag identity while maintaining access to the group.
 *
 * @category Layer Building
 * @since 1.0.0
 */
export interface TagClass<Self, Id extends string, G extends ConfectApiGroup<string, any>>
  extends Context.Tag<Self, HandlersFor<G>> {
  new(_: never): Context.TagClassShape<Id, HandlersFor<G>>
  readonly group: G
  readonly key: Id
}

/**
 * Create a Tag class for a group.
 *
 * The returned class:
 * - Extends Context.Tag with the group name as key
 * - Stores the group definition on `.group` property
 * - Provides HandlersFor<G> as the service type
 * - Ensures single Tag identity (one class definition = one tag)
 *
 * @category Layer Building
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const notesGroup = Group.group("notes").pipe(
 *   Group.add("list", listQuery),
 *   Group.add("create", createMutation)
 * )
 *
 * export class Notes extends Group.Tag(notesGroup)<Notes>() {}
 *
 * // Notes is now a Context.Tag with:
 * // - key: "notes"
 * // - service: { list: (...) => Effect, create: (...) => Effect }
 * // - Notes.group === notesGroup
 * ```
 */
export const Tag = <G extends ConfectApiGroup<string, {}>>(group: G) => <Self>(): TagClass<Self, GetName<G>, G> => {
  const limit = Error.stackTraceLimit
  Error.stackTraceLimit = 2
  const creationError = new Error()
  Error.stackTraceLimit = limit

  function TagClass() { }
  const TagClass_ = TagClass as any

  // Extend Context.Tag prototype
  Object.setPrototypeOf(TagClass, Object.getPrototypeOf(Context.GenericTag<Self, any>(group.name)))

  // Set the key for Context lookup
  TagClass_.key = group.name

  // Store the group definition
  TagClass_.group = group

  // Stack trace for debugging
  Object.defineProperty(TagClass_, "stack", {
    get() {
      return creationError.stack
    }
  })

  return TagClass_ as any
}
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
  Functions extends Record<string, Function.ConfectApiFunction>,
> extends Pipeable {
  readonly [GroupTypeId]: GroupTypeId;
  readonly name: Name;
  readonly functions: Functions;
}

const makeConfectApiGroupProto = <Name extends string>(name: Name) => ({
  [GroupTypeId]: GroupTypeId,
  name,
  functions: {},
  pipe() {
    return pipeArguments(this, arguments);
  },
})



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
): ConfectApiGroup<Name, {}> =>
  Object.assign(
    makeConfectApiGroupProto(name),
  ) as any;

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
 * Extract function names (keys)
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
export type GetFunctionNames<G extends ConfectApiGroup<any, any>> =
  keyof GetFunctions<G>;



export type HandlersFromRecord<Functions extends Record<string, Function.ConfectApiFunction>> = {
  [K in keyof Functions]: Function.GetHandler<Functions[K]>
}


export type HandlersFor<G extends ConfectApiGroup<any, any>> = {
  [K in GetFunctionNames<G>]: (
    args: Function.GetArgsType<GetFunctions<G>[K]>
  ) => Effect.Effect<
    Function.GetReturnsType<GetFunctions<G>[K]>,
    any,   // E is open
    never  // R must be never (handlers close over deps)
  >
}

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
      const functions = Record.set(group.functions, key, fn);
      return Object.assign(
        makeConfectApiGroupProto(group.name),
        { functions }
      ) as any;
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
    const functions = Record.mapKeys(group.functions, (key) =>
      equals(key, oldKey) ? newKey : key,
    );
    return Object.assign(
      makeConfectApiGroupProto(group.name),
      { functions },
    ) as any;
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
      const functions = Record.union(group.functions, other.functions, SK);
      return Object.assign(
        makeConfectApiGroupProto(group.name),
        { functions }
      ) as any;
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
// Layer Building (Dependency Management)
// =============================================================================

/**
 * @deprecated Use `Layer.effect(TagClass, effect)` directly instead.
 *
 * The Group.build helpers have been removed in favor of using Effect's
 * Layer functions directly with Tag classes.
 *
 * Migration:
 * ```typescript
 * // Before
 * const NotesLive = Group.build(notesGroup, Effect.gen(...))
 *
 * // After
 * export class Notes extends Group.Tag(notesGroup)<Notes>() {}
 * const NotesLive = Layer.effect(Notes, Effect.gen(...))
 * ```
 *
 * For scoped resources, use `Layer.scoped(TagClass, effect)`.
 * For mocks, use `Layer.succeed(TagClass, handlers)` or `Layer.succeedContext`.
 *
 * @category Layer Building
 * @since 1.0.0
 */

