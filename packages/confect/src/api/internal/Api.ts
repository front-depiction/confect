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
 * const myApi = Api.api("myApi").groups({
 *   users: Group.group("users").functions({
 *     getUser: Function.query("getUser").args(...).returns(...),
 *     createUser: Function.mutation("createUser").args(...).returns(...)
 *   }),
 *   posts: Group.group("posts").functions({
 *     getPost: Function.query("getPost").args(...).returns(...)
 *   })
 * })
 *
 * if (Api.isApi(value)) {
 *   // value is ConfectApi
 * }
 *
 * @since 1.0.0
 */

import type {
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import * as Order from "effect/Order";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
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
 * @category Models
 * @since 1.0.0
 */
export declare namespace ConfectApi {
  /**
   * @category Models
   * @since 1.0.0
   */
  export interface Variance<Name, Groups> {
    readonly _name: Types.Covariant<Name>;
    readonly _groups: Types.Covariant<Groups>;
  }
}

/**
 * API - top-level collection of groups.
 *
 * APIs organize groups into a complete application API surface.
 * They provide a way to structure large applications and generate complete Convex exports.
 *
 * @category Types
 * @since 1.0.0
 */
export interface ConfectApi<
  out Name extends string,
  out Groups extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
> {
  readonly [ApiTypeId]: ConfectApi.Variance<Name, Groups>;

  readonly name: Name;
  readonly groups: Groups;
}

// =============================================================================
// Constructors (using satisfies pattern)
// =============================================================================

/**
 * Create an API using a fluent builder pattern.
 *
 * The builder preserves literal types using the `satisfies` pattern,
 * ensuring that API names and group names are not widened to `string`.
 *
 * @param name - API name (preserved as literal type)
 * @returns Builder for specifying groups
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
 * const myApi = Api.api("myApp").groups({
 *   users: Group.group("users").functions({
 *     getUser: Function.query("getUser")
 *       .args(Schema.Struct({ id: Schema.String }))
 *       .returns(Schema.Struct({
 *         id: Schema.String,
 *         name: Schema.String,
 *         email: Schema.String
 *       })),
 *     createUser: Function.mutation("createUser")
 *       .args(Schema.Struct({
 *         name: Schema.String,
 *         email: Schema.String
 *       }))
 *       .returns(Schema.Struct({
 *         id: Schema.String,
 *         name: Schema.String,
 *         email: Schema.String
 *       }))
 *   }),
 *   posts: Group.group("posts").functions({
 *     getPost: Function.query("getPost")
 *       .args(Schema.Struct({ id: Schema.String }))
 *       .returns(Schema.Struct({
 *         id: Schema.String,
 *         title: Schema.String,
 *         content: Schema.String
 *       }))
 *   })
 * })
 *
 * // ✅ Literal types preserved!
 * const apiName: "myApp" = myApi.name
 * const groupNames: ("users" | "posts")[] = Object.keys(myApi.groups)
 */
export const api = <Name extends string>(name: Name) => ({
  groups: <
    Groups extends Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >,
  >(
    groups: Groups,
  ): ConfectApi<Name, Groups> => {
    return {
      [ApiTypeId]: {
        _name: (() => name) as Types.Covariant<Name>,
        _groups: (() => groups) as Types.Covariant<Groups>,
      },
      name,
      groups,
    } satisfies ConfectApi<Name, Groups>;
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
): u is ConfectApi<
  string,
  Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >
> => Predicate.hasProperty(u, ApiTypeId as symbol);

/**
 * Refinement for filtering to APIs.
 *
 * Use with `Record.filter` or `Array.filter` to narrow types.
 *
 * @category Refinements
 * @since 1.0.0
 *
 * @example
 * import * as Record from "effect/Record"
 *
 * const items: Record<string, unknown> = { ... }
 * const apis = Record.filter(items, Api.ApiRefinement)
 * // apis has type Record<string, ConfectApi>
 */
export const ApiRefinement: Predicate.Refinement<
  unknown,
  ConfectApi<
    string,
    Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >
  >
> = isApi;

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
export type GetName<
  A extends ConfectApi<
    string,
    Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >
  >,
> = A["name"];

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
export type GetGroups<
  A extends ConfectApi<
    string,
    Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >
  >,
> = A["groups"];

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
export type GetGroupNames<
  A extends ConfectApi<
    string,
    Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >
  >,
> = keyof GetGroups<A>;

/**
 * Extract all functions from all groups as a flat record.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const myApi = Api.api("myApp").groups({
 *   users: Group.group("users").functions({
 *     getUser: ...,
 *     createUser: ...
 *   }),
 *   posts: Group.group("posts").functions({
 *     getPost: ...
 *   })
 * })
 * type AllFunctions = Api.GetAllFunctions<typeof myApi>
 * // Record<string, ConfectApiFunction>
 */
export type GetAllFunctions<
  A extends ConfectApi<
    string,
    Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >
  >,
> = {
  [K in keyof GetGroups<A>]: Group.GetFunctions<GetGroups<A>[K]>;
}[keyof GetGroups<A>];

// =============================================================================
// Functional Utilities
// =============================================================================

/**
 * Add a group to an API.
 *
 * Returns a new API with the group added. Does not mutate the original.
 *
 * @param api - API to add group to
 * @param name - Group name (key)
 * @param group - Group to add
 * @returns New API with group added
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * const myApi = Api.api("myApp").groups({ users: userGroup })
 * const withPosts = Api.addGroup(myApi, "posts", postsGroup)
 * // withPosts has both users and posts groups
 */
export const addGroup = <
  Name extends string,
  Groups extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
  Key extends string,
  G extends Group.ConfectApiGroup<
    string,
    Record<string, Function.ConfectApiFunction>
  >,
>(
  api: ConfectApi<Name, Groups>,
  name: Key,
  group: G,
): ConfectApi<Name, Groups & Record<Key, G>> => {
  const newGroups = { ...api.groups, [name]: group } as Groups & Record<Key, G>;

  return {
    [ApiTypeId]: {
      _name: (() => api.name) as Types.Covariant<Name>,
      _groups: (() => newGroups) as Types.Covariant<Groups & Record<Key, G>>,
    },
    name: api.name,
    groups: newGroups,
  } satisfies ConfectApi<Name, Groups & Record<Key, G>>;
};

/**
 * Remove a group from an API.
 *
 * Returns a new API without the specified group. Does not mutate the original.
 *
 * @param api - API to remove group from
 * @param name - Group name to remove
 * @returns New API without the group
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * const myApi = Api.api("myApp").groups({
 *   users: userGroup,
 *   posts: postsGroup
 * })
 * const withoutPosts = Api.removeGroup(myApi, "posts")
 * // withoutPosts has only users group
 */
export const removeGroup = <
  Name extends string,
  Groups extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
  Key extends keyof Groups,
>(
  api: ConfectApi<Name, Groups>,
  name: Key,
): ConfectApi<Name, Omit<Groups, Key>> => {
  const newGroups = { ...api.groups };
  delete newGroups[name];

  return {
    [ApiTypeId]: {
      _name: (() => api.name) as Types.Covariant<Name>,
      _groups: (() => newGroups) as Types.Covariant<Omit<Groups, Key>>,
    },
    name: api.name,
    groups: newGroups as Omit<Groups, Key>,
  } satisfies ConfectApi<Name, Omit<Groups, Key>>;
};

/**
 * Rename a group in an API.
 *
 * Returns a new API with the group renamed. Does not mutate the original.
 *
 * @param api - API containing the group
 * @param oldName - Current group name
 * @param newName - New group name
 * @returns New API with group renamed
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * const myApi = Api.api("myApp").groups({ users: userGroup })
 * const renamed = Api.renameGroup(myApi, "users", "accounts")
 * // renamed has accounts instead of users
 */
export const renameGroup = <
  Name extends string,
  Groups extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
  OldKey extends keyof Groups,
  NewKey extends string,
>(
  api: ConfectApi<Name, Groups>,
  oldName: OldKey,
  newName: NewKey,
): ConfectApi<Name, Omit<Groups, OldKey> & Record<NewKey, Groups[OldKey]>> => {
  type ResultGroups = Omit<Groups, OldKey> & Record<NewKey, Groups[OldKey]>;

  const group = api.groups[oldName];
  const copied = { ...api.groups };
  delete copied[oldName];
  const newGroups = { ...copied, [newName]: group } as unknown as ResultGroups;

  return {
    [ApiTypeId]: {
      _name: (() => api.name) as Types.Covariant<Name>,
      _groups: (() => newGroups) as Types.Covariant<ResultGroups>,
    },
    name: api.name,
    groups: newGroups,
  } satisfies ConfectApi<Name, ResultGroups>;
};

/**
 * Transform all groups in an API.
 *
 * Returns a new API with all groups transformed by the mapper function.
 *
 * @param api - API to transform
 * @param f - Mapper function
 * @returns New API with transformed groups
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * import * as Record from "effect/Record"
 *
 * const myApi = Api.api("myApp").groups({ ... })
 * const logged = Api.mapGroups(myApi, (name, group) => {
 *   console.log(`Group: ${name}`)
 *   return group
 * })
 */
export const mapGroups = <
  Name extends string,
  Groups extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
  NewGroups extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
>(
  api: ConfectApi<Name, Groups>,
  f: (
    group: Group.ConfectApiGroup<
      string,
      Record<string, Function.ConfectApiFunction>
    >,
    key: string,
  ) => Group.ConfectApiGroup<
    string,
    Record<string, Function.ConfectApiFunction>
  >,
): ConfectApi<Name, NewGroups> => {
  const newGroups = Record.map(
    api.groups as Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >,
    f,
  ) as NewGroups;

  return {
    [ApiTypeId]: {
      _name: (() => api.name) as Types.Covariant<Name>,
      _groups: (() => newGroups) as Types.Covariant<NewGroups>,
    },
    name: api.name,
    groups: newGroups,
  } satisfies ConfectApi<Name, NewGroups>;
};

/**
 * Filter groups in an API.
 *
 * Returns a new API containing only groups that match the predicate.
 *
 * @param api - API to filter
 * @param predicate - Filter predicate
 * @returns New API with filtered groups
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * const myApi = Api.api("myApp").groups({
 *   users: userGroup,
 *   posts: postsGroup
 * })
 * const filtered = Api.filterGroups(myApi, (_, group) =>
 *   Object.keys(group.functions).length > 5
 * )
 * // filtered has only groups with more than 5 functions
 */
export const filterGroups = <
  Name extends string,
  Groups extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
>(
  api: ConfectApi<Name, Groups>,
  predicate: Predicate.Predicate<
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
): ConfectApi<
  Name,
  Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >
> => {
  const newGroups = Record.filter(api.groups, predicate);

  return {
    [ApiTypeId]: {
      _name: (() => api.name) as Types.Covariant<Name>,
      _groups: (() => newGroups) as Types.Covariant<
        Record<
          string,
          Group.ConfectApiGroup<
            string,
            Record<string, Function.ConfectApiFunction>
          >
        >
      >,
    },
    name: api.name,
    groups: newGroups,
  } satisfies ConfectApi<
    Name,
    Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >
  >;
};

/**
 * Merge two APIs.
 *
 * Returns a new API with groups from both APIs.
 * If there are duplicate group names, groups from the second API take precedence.
 *
 * @param api1 - First API
 * @param api2 - Second API
 * @returns New API with merged groups
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * const api1 = Api.api("myApp").groups({ users: userGroup })
 * const api2 = Api.api("myApp").groups({ posts: postsGroup })
 * const merged = Api.mergeApis(api1, api2)
 * // merged has both users and posts groups
 */
export const mergeApis = <
  Name extends string,
  Groups1 extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
  Groups2 extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
>(
  api1: ConfectApi<Name, Groups1>,
  api2: ConfectApi<Name, Groups2>,
): ConfectApi<Name, Groups1 & Groups2> => {
  const newGroups = { ...api1.groups, ...api2.groups } as Groups1 & Groups2;

  return {
    [ApiTypeId]: {
      _name: (() => api1.name) as Types.Covariant<Name>,
      _groups: (() => newGroups) as Types.Covariant<Groups1 & Groups2>,
    },
    name: api1.name,
    groups: newGroups,
  } satisfies ConfectApi<Name, Groups1 & Groups2>;
};

/**
 * Flatten all functions from all groups into a single record.
 *
 * Returns a record of all functions with keys in the format "groupName.functionName".
 *
 * @param api - API to flatten
 * @returns Record of all functions with prefixed keys
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * const myApi = Api.api("myApp").groups({
 *   users: Group.group("users").functions({
 *     getUser: ...,
 *     createUser: ...
 *   }),
 *   posts: Group.group("posts").functions({
 *     getPost: ...
 *   })
 * })
 * const flat = Api.flattenFunctions(myApi)
 * // {
 * //   "users.getUser": ...,
 * //   "users.createUser": ...,
 * //   "posts.getPost": ...
 * // }
 */
export const flattenFunctions = <
  Name extends string,
  Groups extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
>(
  api: ConfectApi<Name, Groups>,
): Record<string, Function.ConfectApiFunction> => {
  const result: Record<string, Function.ConfectApiFunction> = {};

  for (const [groupName, group] of Object.entries(api.groups)) {
    for (const [funcName, func] of Object.entries(group.functions)) {
      result[`${groupName}.${funcName}`] = func;
    }
  }

  return result;
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
export const byName: Order.Order<
  ConfectApi<
    string,
    Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >
  >
> = Order.mapInput(
  String.Order,
  (
    api: ConfectApi<
      string,
      Record<
        string,
        Group.ConfectApiGroup<
          string,
          Record<string, Function.ConfectApiFunction>
        >
      >
    >,
  ) => api.name,
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
export const byGroupCount: Order.Order<
  ConfectApi<
    string,
    Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >
  >
> = Order.mapInput(
  Order.number,
  (
    api: ConfectApi<
      string,
      Record<
        string,
        Group.ConfectApiGroup<
          string,
          Record<string, Function.ConfectApiFunction>
        >
      >
    >,
  ) => Object.keys(api.groups).length,
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
export const byFunctionCount: Order.Order<
  ConfectApi<
    string,
    Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >
  >
> = Order.mapInput(
  Order.number,
  (
    api: ConfectApi<
      string,
      Record<
        string,
        Group.ConfectApiGroup<
          string,
          Record<string, Function.ConfectApiFunction>
        >
      >
    >,
  ) => {
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
  Groups extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
  Key extends keyof Groups,
>(
  api: ConfectApi<Name, Groups>,
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
 * const myApi = Api.api("myApp").groups({
 *   users: Group.group("users").functions({ getUser: ... })
 * })
 * const getUser = Api.getFunction(myApi, "users", "getUser")
 * // getUser is the function or undefined
 */
export const getFunction = <
  Name extends string,
  Groups extends Record<
    string,
    Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
  >,
  GroupKey extends keyof Groups,
  FunctionKey extends string,
>(
  api: ConfectApi<Name, Groups>,
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

/**
 * Convert a Confect API to Convex registered functions.
 *
 * This is the bridge between our type system and Convex's runtime.
 * The function compiles all schemas to Convex validators and returns
 * a nested record of RegisteredQuery, RegisteredMutation, or RegisteredAction.
 *
 * The output structure matches Convex's expected API format:
 * ```
 * {
 *   groupName: {
 *     functionName: RegisteredFunction,
 *     ...
 *   },
 *   ...
 * }
 * ```
 *
 * @param api - Confect API to convert
 * @param compileSchema - Schema compiler function (from schema_to_validator)
 * @returns Nested record of Convex registered functions
 *
 * @category Convex Integration
 * @since 1.0.0
 *
 * @example
 * import { compileSchema } from "../schema_to_validator"
 * import * as Api from "./internal/Api"
 * import * as Group from "./internal/Group"
 * import * as Function from "./internal/Function"
 *
 * const myApi = Api.api("myApp").groups({
 *   users: Group.group("users").functions({
 *     getUser: Function.query("getUser")
 *       .args(Schema.Struct({ id: Schema.String }))
 *       .returns(UserSchema),
 *     createUser: Function.mutation("createUser")
 *       .args(Schema.Struct({ name: Schema.String, email: Schema.String }))
 *       .returns(UserSchema)
 *   })
 * })
 *
 * const convexApi = Api.toConvexApi(myApi, compileSchema)
 * // {
 * //   users: {
 * //     getUser: RegisteredQuery<...>,
 * //     createUser: RegisteredMutation<...>
 * //   }
 * // }
 */
export const toConvexApi = <
  A extends ConfectApi<
    string,
    Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >
  >,
>(
  api: A,
  compileSchema: <S extends Schema.Schema.AnyNoContext>(schema: S) => any,
): Record<
  string,
  Record<
    string,
    | RegisteredQuery<"public", any, any>
    | RegisteredMutation<"public", any, any>
    | RegisteredAction<"public", any, any>
  >
> => {
  return Record.map(
    api.groups as Record<
      string,
      Group.ConfectApiGroup<string, Record<string, Function.ConfectApiFunction>>
    >,
    (group) => Group.toConvexGroup(group, compileSchema),
  ) as Record<
    string,
    Record<
      string,
      | RegisteredQuery<"public", any, any>
      | RegisteredMutation<"public", any, any>
      | RegisteredAction<"public", any, any>
    >
  >;
};
