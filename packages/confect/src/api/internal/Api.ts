/* eslint-disable prefer-rest-params */
/**
 * @module internal/Api
 *
 * Top-level API types for organizing groups and functions.
 *
 * This module defines the complete API structure that contains multiple groups,
 * each containing multiple functions. It uses phantom types for maximum type-level
 * tracking and Effect patterns for composability.
 *
 * ## Design Principles
 *
 * 1. **Effect Variance Pattern** - Namespace + Variance interface
 * 2. **Phantom Types** - Stored under symbol to avoid namespace pollution
 * 3. **Variance Annotations** - Using Effect's Types module for correct variance
 * 4. **Literal Preservation** - Using `satisfies` to keep literal types
 * 5. **Brand Pattern** - Prevents mixing with plain objects
 * 6. **Composition** - Builds on Group and Function modules
 *
 * @example
 * import * as Api from "./internal/Api"
 * import * as Group from "./internal/Group"
 * import * as Function from "./internal/Function"
 *
 * const usersGroup = Group.group("users").pipe(
 *   Group.add("getUser", Function.query("getUser").args(...).returns(...)),
 *   Group.add("createUser", Function.mutation("createUser").args(...).returns(...))
 * )
 *
 * const postsGroup = Group.group("posts").pipe(
 *   Group.add("getPost", Function.query("getPost").args(...).returns(...))
 * )
 *
 * const myApi = Api.api("myApi").pipe(
 *   Api.add(usersGroup),
 *   Api.add(postsGroup)
 * )
 *
 * if (Api.isApi(value)) {
 *   // value is ConfectApi
 * }
 *
 * @since 1.0.0
 */

import { SK } from "effect/Function";
import * as Order from "effect/Order";
import { pipeArguments, type Pipeable } from "effect/Pipeable";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as String from "effect/String";
import * as Types from "effect/Types";
import * as Function from "./Function";
import * as Group from "./Group";

// =============================================================================
// Symbols and Type IDs
// =============================================================================

/**
 * @category Symbols
 * @since 1.0.0
 */
export const ApiTypeId: unique symbol = Symbol.for("@confect/Api");

/**
 * @category Symbols
 * @since 1.0.0
 */
export type ApiTypeId = typeof ApiTypeId;

// =============================================================================
// Api Types
// =============================================================================

/**
 * Type alias for any ConfectApiGroup.
 *
 * @category Type Aliases
 * @since 1.0.0
 */
export type AnyConfectApiGroup = Group.ConfectApiGroup<
  string,
  Record<string, Function.ConfectApiFunction>
>;

/**
 * Helper type to merge group records.
 * TypeScript cannot prove that MergeRight<A, B> extends Record<string, T>
 * even when A and B both extend Record<string, T>, so we use this helper.
 *
 * @internal
 */
type MergedGroups<
  A extends Record<string, AnyConfectApiGroup>,
  B extends Record<string, AnyConfectApiGroup>,
> = Types.MergeRight<A, B> extends Record<string, AnyConfectApiGroup>
  ? Types.MergeRight<A, B>
  : never;

/**
 * API - top-level collection of groups.
 *
 * APIs organize groups into a complete application API surface.
 * They provide a way to structure large applications and generate complete Convex exports.
 * Context requirements (R) are tracked and unioned across groups.
 *
 * @category Types
 * @since 1.0.0
 */
export interface ConfectApi<
  out Name extends string,
  out Groups extends Record<string, AnyConfectApiGroup>,
  out R = never,
> extends Pipeable {
  readonly [ApiTypeId]: ApiTypeId;

  readonly name: Name;
  readonly groups: Groups;
}

// =============================================================================
// Constructors (using satisfies pattern)
// =============================================================================

/**
 * Create an empty API with the given name.
 *
 * APIs organize groups into a complete application API surface.
 * Use `.pipe()` with `Api.add()` to add groups.
 *
 * @param name - API name (preserved as literal type)
 * @returns Empty API ready for piping
 *
 * @category Constructors
 * @since 1.0.0
 *
 * @example
 * import * as Api from "./internal/Api"
 * import * as Group from "./internal/Group"
 * import * as Function from "./internal/Function"
 * import * as Schema from "effect/Schema"
 *
 * const usersGroup = Group.group("users").pipe(
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
 * const postsGroup = Group.group("posts").pipe(
 *   Group.add("getPost", Function.query("getPost")
 *     .args(Schema.Struct({ id: Schema.String }))
 *     .returns(Schema.Struct({
 *       id: Schema.String,
 *       title: Schema.String,
 *       content: Schema.String
 *     })))
 * )
 *
 * const myApi = Api.api("myApp").pipe(
 *   Api.add(usersGroup),
 *   Api.add(postsGroup)
 * )
 *
 * // ✅ Literal types preserved!
 * const apiName: "myApp" = myApi.name
 * const groupNames: ("users" | "posts")[] = Object.keys(myApi.groups)
 */
export const api = <Name extends string>(
  name: Name,
): ConfectApi<Name, {}, never> => ({
  [ApiTypeId]: ApiTypeId,
  name,
  groups: {},
  pipe() {
    return pipeArguments(this, arguments);
  },
});

// =============================================================================
// Predicates (using Predicate.hasProperty)
// =============================================================================

/**
 * Check if a value is a Confect API.
 *
 * Uses `Predicate.hasProperty` to check for the presence of the ApiTypeId symbol.
 *
 * @param u - Unknown value to check
 * @returns Type guard narrowing to ConfectApi
 *
 * @category Predicates
 * @since 1.0.0
 *
 * @example
 * if (Api.isApi(value)) {
 *   // value is ConfectApi
 *   console.log(value.name)
 *   console.log(Object.keys(value.groups))
 * }
 */
export const isApi = (
  u: unknown,
): u is ConfectApi<string, Record<string, AnyConfectApiGroup>, never> =>
  Predicate.hasProperty(u, ApiTypeId);

// =============================================================================
// Type Extraction Utilities
// =============================================================================

/**
 * Extract the API name as a literal type.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const myApi = Api.api("myApp").groups({ ... })
 * type Name = Api.GetName<typeof myApi>  // "myApp"
 */
export type GetName<A extends ConfectApi<string, Record<string, AnyConfectApiGroup>, any>> =
  A["name"];

/**
 * Extract the groups record.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const myApi = Api.api("myApp").groups(grps)
 * type Groups = Api.GetGroups<typeof myApi>  // typeof grps
 */
export type GetGroups<A extends ConfectApi<string, Record<string, AnyConfectApiGroup>, any>> =
  A["groups"];

/**
 * Extract group names as a union of literal types.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const myApi = Api.api("myApp").groups({
 *   users: ...,
 *   posts: ...
 * })
 * type Names = Api.GetGroupNames<typeof myApi>
 * // "users" | "posts"
 */
export type GetGroupNames<A extends ConfectApi<string, Record<string, AnyConfectApiGroup>, any>> =
  keyof GetGroups<A>;

/**
 * Extract all functions from all groups as a flat record.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const usersGroup = Group.group("users").pipe(
 *   Group.add("getUser", ...),
 *   Group.add("createUser", ...)
 * )
 * const postsGroup = Group.group("posts").pipe(
 *   Group.add("getPost", ...)
 * )
 * const myApi = Api.api("myApp").groups({
 *   users: usersGroup,
 *   posts: postsGroup
 * })
 * type AllFunctions = Api.GetAllFunctions<typeof myApi>
 * // Record<string, ConfectApiFunction>
 */
export type GetAllFunctions<A extends ConfectApi<string, Record<string, AnyConfectApiGroup>, any>> = {
  [K in keyof GetGroups<A>]: Group.GetFunctions<GetGroups<A>[K]>;
}[keyof GetGroups<A>];

/**
 * Extract the context requirements from an API.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const myApi = Api.api("myApp").groups({ ... })
 * type R = Api.GetContext<typeof myApi>  // never (default)
 */
export type GetContext<A extends ConfectApi<string, Record<string, AnyConfectApiGroup>, any>> =
  A extends ConfectApi<any, any, infer R> ? R : never;

// =============================================================================
// Pipeable Utilities
// =============================================================================

/**
 * Add a group to an API (pipeable).
 *
 * Returns a transformer function that adds the group to the API.
 * The group's name is extracted from the group itself.
 * Context requirements (R) are unioned.
 * Does not mutate the original API.
 *
 * @param group - Group to add (group.name becomes the key)
 * @returns Transformer function that adds the group to an API
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * import * as Api from "./internal/Api"
 * import * as Group from "./internal/Group"
 *
 * const usersGroup = Group.group("users").pipe(
 *   Group.add("getUser", getUserFn)
 * )
 * const postsGroup = Group.group("posts").pipe(
 *   Group.add("getPost", getPostFn)
 * )
 *
 * const myApi = Api.api("myApp").pipe(
 *   Api.add(usersGroup),
 *   Api.add(postsGroup)
 * )
 * // myApi has both users and posts groups
 */
export const add: <
  GroupName extends string,
  GroupFunctions extends Record<string, Function.ConfectApiFunction>,
  GR,
>(
  group: Group.ConfectApiGroup<GroupName, GroupFunctions>,
) => <Name extends string, Groups extends Record<string, AnyConfectApiGroup>, R>(
  api: ConfectApi<Name, Groups, R>,
) => ConfectApi<Name, MergedGroups<Groups, Record<GroupName, typeof group>>, R | GR> =
  (group) => (api) => {
    const newGroups = Record.set(api.groups, group.name, group)
    return {
      [ApiTypeId]: ApiTypeId,
      name: api.name,
      groups: newGroups as any,
      pipe() {
        return pipeArguments(this, arguments);
      },
    };
  };

/**
 * Merge another API's groups into this API (pipeable).
 *
 * Returns a transformer function that merges groups from another API.
 * If there are duplicate group names, groups from the other API take precedence.
 * The error and context types are unioned.
 * Does not mutate either API.
 *
 * @param other - API whose groups to merge
 * @returns Transformer function that merges the APIs
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * import * as Api from "./internal/Api"
 *
 * const api1 = Api.api("myApp").pipe(
 *   Api.add(usersGroup)
 * )
 * const api2 = Api.api("myApp").pipe(
 *   Api.add(postsGroup)
 * )
 * const merged = api1.pipe(Api.merge(api2))
 * // merged has both users and posts groups
 */
export const merge = <
  Name2 extends string,
  Groups2 extends Record<string, AnyConfectApiGroup>,
  R2,
>(
  other: ConfectApi<Name2, Groups2, R2>,
) =>
  <
    Name extends string,
    Groups extends Record<string, AnyConfectApiGroup>,
    R,
  >(
    api: ConfectApi<Name, Groups, R>,
  ): ConfectApi<Name, MergedGroups<Groups, Groups2>, R | R2> => {
    const newGroups = Record.union(api.groups, other.groups, SK);
    return {
      [ApiTypeId]: ApiTypeId,
      name: api.name,
      groups: newGroups as any,
      pipe() {
        return pipeArguments(this, arguments);
      },
    };
  };

// =============================================================================
// Order Utilities
// =============================================================================

/**
 * Order APIs by name (alphabetically).
 *
 * @category Ordering
 * @since 1.0.0
 *
 * @example
 * import * as Array from "effect/Array"
 *
 * const apis = [api1, api2, api3]
 * const sorted = Array.sort(apis, Api.byName)
 */
export const byName: Order.Order<ConfectApi<string, Record<string, AnyConfectApiGroup>, any>> =
  Order.mapInput(
    String.Order,
    (api: ConfectApi<string, Record<string, AnyConfectApiGroup>, any>) => api.name,
  );

/**
 * Order APIs by number of groups (ascending).
 *
 * @category Ordering
 * @since 1.0.0
 *
 * @example
 * import * as Array from "effect/Array"
 *
 * const apis = [api1, api2, api3]
 * const sorted = Array.sort(apis, Api.byGroupCount)
 * // APIs with fewer groups come first
 */
export const byGroupCount: Order.Order<ConfectApi<string, Record<string, AnyConfectApiGroup>, any>> =
  Order.mapInput(
    Order.number,
    (api: ConfectApi<string, Record<string, AnyConfectApiGroup>, any>) =>
      Object.keys(api.groups).length,
  );

/**
 * Order APIs by total number of functions (ascending).
 *
 * @category Ordering
 * @since 1.0.0
 *
 * @example
 * import * as Array from "effect/Array"
 *
 * const apis = [api1, api2, api3]
 * const sorted = Array.sort(apis, Api.byFunctionCount)
 * // APIs with fewer functions come first
 */
export const byFunctionCount: Order.Order<ConfectApi<string, Record<string, AnyConfectApiGroup>, any>> =
  Order.mapInput(
    Order.number,
    (api: ConfectApi<string, Record<string, AnyConfectApiGroup>, any>) => {
      let count = 0;
      for (const group of Object.values(api.groups)) {
        count += Object.keys(group.functions).length;
      }
      return count;
    },
  );

// =============================================================================
// Path Navigation
// =============================================================================

/**
 * Get a group from an API by name.
 *
 * @param api - API to get group from
 * @param name - Group name
 * @returns Group or undefined if not found
 *
 * @category Path Navigation
 * @since 1.0.0
 *
 * @example
 * const myApi = Api.api("myApp").groups({ users: userGroup })
 * const users = Api.getGroup(myApi, "users")
 * // users is userGroup or undefined
 */
export const getGroup = <
  Name extends string,
  Groups extends Record<string, AnyConfectApiGroup>,
  R,
  Key extends keyof Groups,
>(
  api: ConfectApi<Name, Groups, R>,
  name: Key,
): Groups[Key] | undefined => {
  return api.groups[name];
};

/**
 * Get a function from an API by group and function name.
 *
 * @param api - API to get function from
 * @param groupName - Group name
 * @param functionName - Function name
 * @returns Function or undefined if not found
 *
 * @category Path Navigation
 * @since 1.0.0
 *
 * @example
 * const usersGroup = Group.group("users").pipe(
 *   Group.add("getUser", ...)
 * )
 * const myApi = Api.api("myApp").groups({
 *   users: usersGroup
 * })
 * const getUser = Api.getFunction(myApi, "users", "getUser")
 * // getUser is the function or undefined
 */
export const getFunction = <
  Name extends string,
  Groups extends Record<string, AnyConfectApiGroup>,
  R,
  GroupKey extends keyof Groups,
  FunctionKey extends string,
>(
  api: ConfectApi<Name, Groups, R>,
  groupName: GroupKey,
  functionName: FunctionKey,
): Function.ConfectApiFunction | undefined => {
  const group = api.groups[groupName];
  if (!group) return undefined;
  return group.functions[functionName];
};

// =============================================================================
// Convex Integration
// =============================================================================

