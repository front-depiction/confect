
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
import { SK } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Order from "effect/Order";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import type * as Function from "./Function";
import * as Pipeable from "effect/Pipeable";
import type { MutationExclusiveServices, MutationServices, QueryServices } from "./Services";
import * as Types from "effect/Types";

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
export type FunctionsToHandlers<Functions extends Function.ConfectApiFunction> = Types.Simplify<{
  [K in Function.GetName<Functions>]: (
    args: Function.GetArgsType<Extract<Functions, { readonly name: K }>>
  ) => Effect.Effect<
    Function.GetReturnsType<Extract<Functions, { readonly name: K }>>,
    any,   // E is open
    never  // R must be never (handlers close over deps)
  >
}>
const ConfectServiceSymbol: unique symbol = Symbol.for("@confect/ConfectService");
type ConfectServiceSymbol = typeof ConfectServiceSymbol;
export interface Id<Name, Kind> {
  [ConfectServiceSymbol]: {
    name: Name
    kind: Kind
  };
}
type QueryGroup<Name> = Id<Name, "Query">
type MutationGroup<Name> = Id<Name, "Mutation">
type ActionGroup<Name> = Id<Name, "Action">

export type Identifier<G extends ConfectApiGroup.AnyGroup> = GetKind<G> extends "Query"
  ? QueryGroup<GetName<G>>
  : GetKind<G> extends "Mutation"
  ? MutationGroup<GetName<G>>
  : GetKind<G> extends "Action"
  ? ActionGroup<GetName<G>>
  : never

export type Tag<G extends ConfectApiGroup.AnyGroup> = Context.Tag<Identifier<G>, HandlersFor<G>>
export const Tag = <G extends ConfectApiGroup.AnyGroup>(group: G): Tag<G> => Context.GenericTag(group.name)

// TagClass removed - groups are now Context.Tags directly
/**
 * API Group - collection of related functions.
 *
 * Groups enforce CQRS (Command Query Responsibility Segregation) at the type level:
 * - Query groups contain only query functions
 * - Mutation groups contain only mutation functions
 * - Action groups contain only action functions
 *
 * This prevents accidentally mixing function types and ensures handlers can safely
 * access the appropriate services (QueryServices for queries, MutationServices for mutations).
 *
 * The group itself is a Context.Tag, so you can use it directly in Layers:
 * - yield* usersGroup to get the handlers
 * - Layer.effect() to provide the handlers
 *
 * @category Types
 * @since 1.0.0
 */
export interface ConfectApiGroup<
  out Name extends string,
  out Functions extends Function.ConfectApiFunction = never,
  out Kind extends Function.Kind = never,
> extends Pipeable.Pipeable {
  readonly [GroupTypeId]: GroupTypeId;
  readonly name: Name;
  readonly functions: Record.ReadonlyRecord<string, Functions>;
  readonly kind: Kind;
}

export declare namespace ConfectApiGroup {
  /**
 * Type alias for any ConfectApiGroup.
 *
 * @category Type Aliases
 * @since 1.0.0
 */
  export type AnyGroup = ConfectApiGroup<string, Function.ConfectApiFunction, Function.Kind>;
}



// =============================================================================
// Constructors
// =============================================================================

/**
 * Internal: Create an empty group with the given name and kind.
 *
 * @internal
 */
const group = <Name extends string, Kind extends Function.Kind>(
  name: Name,
  kind: Kind,
): ConfectApiGroup<Name, never, Kind> => {
  return Object.assign({}, Pipeable.Prototype, {
    [GroupTypeId]: GroupTypeId,
    name,
    functions: {},
    kind,
  }) as any;
};

/**
 * Create an empty query group.
 *
 * Query groups can only contain query functions.
 * Use `.pipe()` with `Group.add()` to add query functions.
 *
 * @param name - Group name (preserved as literal type)
 * @returns Empty query group ready for piping
 *
 * @category Constructors
 * @since 1.0.0
 *
 * @example
 * import * as Group from "./internal/Group"
 * import * as Function from "./internal/Function"
 *
 * const queryGroup = Group.query("users").pipe(
 *   Group.add(Function.query("getUser")...),
 *   Group.add(Function.query("listUsers")...)
 * )
 */
export const query = <Name extends string>(
  name: Name,
): ConfectApiGroup<Name, never, "Query"> => group(name, "Query")

/**
 * Create an empty mutation group.
 *
 * Mutation groups can only contain mutation functions.
 * Use `.pipe()` with `Group.add()` to add mutation functions.
 *
 * @param name - Group name (preserved as literal type)
 * @returns Empty mutation group ready for piping
 *
 * @category Constructors
 * @since 1.0.0
 *
 * @example
 * import * as Group from "./internal/Group"
 * import * as Function from "./internal/Function"
 *
 * const mutationGroup = Group.mutation("tasks").pipe(
 *   Group.add(Function.mutation("createTask")...),
 *   Group.add(Function.mutation("updateTask")...)
 * )
 */
export const mutation = <Name extends string>(
  name: Name,
): ConfectApiGroup<Name, never, "Mutation"> => group(name, "Mutation")

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
 * const userGroup = Group.group("users").pipe(Group.add(...))
 * type Name = Group.GetName<typeof userGroup>  // "users"
 */
export type GetName<G> =
  G extends ConfectApiGroup<infer Name, any, any> ? Name : never;


/**
 * Extract functions
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").pipe(Group.add(...))
 * type Fns = Group.GetFunctions<typeof userGroup>
 */
export type GetFunctions<G extends ConfectApiGroup<any, any, any>> =
  G extends ConfectApiGroup<any, infer Functions, any> ? Functions : never;

/**
 * Extract group kind
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const queryGroup = Group.group("queries").pipe(Group.add(Function.query(...)))
 * type Kind = Group.GetKind<typeof queryGroup>  // "Query"
 */
export type GetKind<G extends ConfectApiGroup<any, any, any>> =
  G extends ConfectApiGroup<any, any, infer Kind> ? Kind : never;

/**
 * Extract the allowed services for a group based on its kind.
 *
 * @category Type Utilities
 * @since 1.0.0
 */
export type AllowedServicesForGroup<G extends ConfectApiGroup<any, any, any>> =
  GetKind<G> extends "Query" ? QueryServices
  : GetKind<G> extends "Mutation" ? MutationServices
  : GetKind<G> extends "Action" ? never // TODO: ActionServices
  : never;

/**
 * Extract function names from the functions stored in the group's record
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const userGroup = Group.group("users").pipe(
 *   Group.add(Function.query("getUser")...),
 *   Group.add(Function.query("listUsers")...)
 * )
 * type Names = Group.GetFunctionNames<typeof userGroup>
 * // "getUser" | "listUsers"
 */
export type GetFunctionNames<G> =
  G extends ConfectApiGroup<any, infer Functions, any>
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
  G extends ConfectApiGroup<any, any, any>,
  Name extends string
> = G extends ConfectApiGroup<any, infer Functions, any>
  ? Extract<Functions, { readonly name: Name }>
  : never;

/**
 * Extract handler types for a group.
 *
 * @category Type Utilities
 * @since 1.0.0
 */
export type HandlersFor<G extends ConfectApiGroup<any, any, any>> = FunctionsToHandlers<GetFunctions<G>>


// =============================================================================
// Layer Construction
// =============================================================================

/**
 * Type-safe wrapper around Layer.effect for group handler construction.
 *
 * Validates that the Effect's requirements (R) are compatible with the group's kind:
 * - Query groups cannot use MutationServices (MutationDB, ConfectMutationCtx, etc.)
 * - Mutation groups can use both QueryServices and MutationServices
 * - Action groups can use ActionServices
 *
 * ## Why This Matters
 *
 * Groups enforce CQRS at the type level. Query handlers are constructed in query contexts
 * which don't have access to mutation-only services like MutationDB. This function prevents
 * compile-time errors by catching service misuse at the type level.
 *
 * @param group - The group to build handlers for
 * @param effect - Effect that provides the handlers
 * @returns Layer providing the group's handlers or a type error
 *
 * @category Constructors
 * @since 1.0.0
 *
 */
export const build: {
  <E, R, G extends ConfectApiGroup<any, any, "Query">, T extends Tag<G>>(
    group: G,
    effect: Effect.Effect<Context.Tag.Service<T>, E, Exclude<R, MutationExclusiveServices | MutationGroup<string> | ActionGroup<string>>>
  ): Layer.Layer<Context.Tag.Identifier<T>, E, R>

  <E, R, G extends ConfectApiGroup<any, any, "Mutation">, T extends Tag<G>>(
    group: G,
    effect: Effect.Effect<Context.Tag.Service<T>, E, R>
  ): Layer.Layer<Context.Tag.Identifier<T>, E, R>

  <E, R, G extends ConfectApiGroup<any, any, "Action">, T extends Tag<G>>(
    group: G,
    effect: Effect.Effect<Context.Tag.Service<T>, E, R>
  ): Layer.Layer<Context.Tag.Identifier<T>, E, R>
} = ((group: any, effect: any) => Layer.effect(Tag(group), effect)) as any;

// =============================================================================
// Pipeable Utilities
// =============================================================================

/**
 * Add a function to a group (pipeable).
 *
 * Enforces CQRS at the type level - all functions in a group must be the same kind.
 * Groups are created with `Group.query()` or `Group.mutation()`, so the kind is fixed.
 * You can only add functions that match the group's kind.
 *
 * Does not mutate the original group.
 * Functions are stored as a union type.
 *
 * @param fn - Function to add
 * @returns Transformer function that adds the function to a group or a type error
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * import * as Group from "./internal/Group"
 * import * as Function from "./internal/Function"
 *
 * // ✅ OK - all queries
 * const queryGroup = Group.query("users").pipe(
 *   Group.add(Function.query("getUser")...),
 *   Group.add(Function.query("listUsers")...)
 * )
 *
 * // ✅ OK - all mutations
 * const mutationGroup = Group.mutation("tasks").pipe(
 *   Group.add(Function.mutation("createTask")...),
 *   Group.add(Function.mutation("updateTask")...)
 * )
 *
 * // ❌ Type Error - cannot mix
 * const invalid = Group.query("mixed").pipe(
 *   Group.add(Function.query("get")...),
 *   Group.add(Function.mutation("create")...)  // Type error!
 * )
 */
export const add: <Fn extends Function.ConfectApiFunction>(
  fn: Fn,
) => <Name extends string, Functions extends Function.ConfectApiFunction, Kind extends Function.Kind>(
  group: Fn["functionType"] extends Kind
    ? ConfectApiGroup<Name, Functions, Kind>
    : never
) => ConfectApiGroup<Name, Functions | Fn, Kind> =
  (fn) =>
    (group: any) => {
      const functions = Record.set(group.functions, fn.name, fn);
      return Object.assign({}, Pipeable.Prototype, {
        [GroupTypeId]: GroupTypeId,
        name: group.name,
        functions,
        kind: group.kind,
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
 *   Group.add(Function.query("getUser")...),
 *   Group.rename("getUser", "fetchUser")
 * )
 * // userGroup has fetchUser instead of getUser
 */
export const rename = <OldKey extends string, NewKey extends string>(
  oldKey: OldKey,
  newKey: NewKey,
) =>
  <Name extends string, Functions extends Function.ConfectApiFunction, Kind extends Function.Kind>(
    group: ConfectApiGroup<Name, Functions, Kind>,
  ): ConfectApiGroup<Name, Functions, Kind> => {
    const functions = Record.mapKeys(group.functions, (key) =>
      equals(key, oldKey) ? newKey : key,
    );
    return Object.assign({}, Pipeable.Prototype, {
      [GroupTypeId]: GroupTypeId,
      name: group.name,
      functions,
      kind: group.kind,
    }) as any;
  };

/**
 * Merge another group's functions into this group (pipeable).
 *
 * Returns a transformer function that merges functions from another group.
 * BOTH GROUPS MUST HAVE THE SAME KIND - you cannot merge query and mutation groups.
 * If there are duplicate function names, functions from the other group take precedence.
 * Functions are unioned at the type level.
 * Does not mutate either group.
 *
 * @param other - Group whose functions to merge (must have same kind)
 * @returns Transformer function that merges the groups or a type error
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * import * as Group from "./internal/Group"
 *
 * // ✅ OK - Both are query groups
 * const group1 = Group.query("api").pipe(Group.add(Function.query("getUser")...))
 * const group2 = Group.query("more").pipe(Group.add(Function.query("listUsers")...))
 * const merged = group1.pipe(Group.merge(group2))
 * // merged has both getUser and listUsers
 *
 * // ❌ Type Error - Cannot merge different kinds
 * const queryGroup = Group.query("queries").pipe(Group.add(Function.query(...)...))
 * const mutationGroup = Group.mutation("mutations").pipe(Group.add(Function.mutation(...)...))
 * const invalid = queryGroup.pipe(Group.merge(mutationGroup))  // Type error!
 */
export const merge: <
  Name2 extends string,
  Functions2 extends Function.ConfectApiFunction,
  Kind2 extends Function.Kind,
>(
  other: ConfectApiGroup<Name2, Functions2, Kind2>,
) => <Name extends string, Functions extends Function.ConfectApiFunction, Kind extends Function.Kind>(
  group: Kind extends Kind2
    ? ConfectApiGroup<Name, Functions, Kind>
    : never
) => ConfectApiGroup<Name, Functions | Functions2, Kind> =
  (other) =>
    (group: any) => {
      const functions = Record.union(group.functions, other.functions, SK);
      return Object.assign({}, Pipeable.Prototype, {
        [GroupTypeId]: GroupTypeId,
        name: group.name,
        functions,
        kind: group.kind,
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
export const byName = Order.mapInput(Order.string, (group: { name: string }) => group.name);


