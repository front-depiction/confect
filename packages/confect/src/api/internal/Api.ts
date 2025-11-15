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

import type {
  DefaultFunctionArgs,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import { actionGeneric, mutationGeneric, queryGeneric } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { pipe, SK } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import { pipeArguments, type Pipeable } from "effect/Pipeable";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import * as Types from "effect/Types";
import { ConfectAuth } from "../../server/auth";
import { layerActionCtx, layerMutationCtx, layerQueryCtx } from "../../server/convex_ctx";
import { ConfectActionCtx, ConfectMutationCtx, ConfectQueryCtx } from "../../server/ctx";
import { MutationDB, QueryDB } from "../../server/database";
import {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
} from "../../server/runners";
import { ConfectScheduler } from "../../server/scheduler";
import {
  layerConfectSchemaDefinition,
  type ConfectSchemaDefinition,
  type DataModelFromConfectSchema,
  type GenericConfectSchema,
} from "../../server/schema";
import { compileArgsSchema, compileReturnsSchema } from "../../server/schema_to_validator";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "../../server/storage";
import { ConfectVectorSearch } from "../../server/vector_search";
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
export type AnyGroup = Group.ConfectApiGroup<string, Function.ConfectApiFunction>;

/**
 * Helper type to merge group records.
 * TypeScript cannot prove that MergeRight<A, B> extends Record<string, T>
 * even when A and B both extend Record<string, T>, so we use this helper.
 *
 * @internal
 */
type MergedGroups<
  A extends Record<string, AnyGroup>,
  B extends Record<string, AnyGroup>,
> = Types.MergeRight<A, B> extends Record<string, AnyGroup>
  ? Types.MergeRight<A, B>
  : never;

/**
 * API - top-level collection of groups.
 *
 * APIs organize groups into a complete application API surface.
 * They provide a way to structure large applications and generate complete Convex exports.
 *
 * Groups are Context.Tags, so you can use them directly in Layers.
 *
 * @category Types
 * @since 1.0.0
 */
export interface ConfectApi<
  out Name extends string,
  out Groups extends Group.ConfectApiGroup<string, Function.ConfectApiFunction> = never,
> extends Pipeable {
  readonly [ApiTypeId]: ApiTypeId;

  readonly name: Name;
  readonly groups: Record.ReadonlyRecord<string, Groups>;
}

// =============================================================================
// Constructors (using prototype pattern)
// =============================================================================

/**
 * Prototype for all ConfectApi instances.
 * Shared across all API objects for memory efficiency.
 * @internal
 */
const ConfectApiProto = {
  [ApiTypeId]: ApiTypeId,
  pipe() {
    return pipeArguments(this, arguments);
  },
};

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
): ConfectApi<Name> => {
  const self = Object.create(ConfectApiProto);
  self.name = name;
  self.groups = {};
  return self;
};

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
): u is ConfectApi<string, AnyGroup> =>
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
export type GetName<A extends ConfectApi<string, AnyGroup>> =
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
export type GetGroups<A extends ConfectApi<string, AnyGroup>> =
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
export type GetGroupNames<A extends ConfectApi<string, AnyGroup>> =
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
export type GetAllFunctions<A extends ConfectApi<string, AnyGroup>> = {
  [K in keyof GetGroups<A>]: Group.GetFunctions<GetGroups<A>[K]>;
}[keyof GetGroups<A>];


// =============================================================================
// Pipeable Utilities
// =============================================================================

/**
 * Add a group to an API (pipeable).
 *
 * Returns a transformer function that adds the group to the API.
 * The group's name is extracted from the group itself.
 * Groups are Context.Tags, so you can use them directly in Layers.
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
export const add = <
  Name2 extends string,
  Functions extends Function.ConfectApiFunction
>(
  group: Group.ConfectApiGroup<Name2, Functions>,
) => <Name extends string, Groups extends AnyGroup>(
  api: ConfectApi<Name, Groups>,
): ConfectApi<
  Name,
  Groups | typeof group
> => {
    const self = Object.create(ConfectApiProto);
    self.name = api.name;
    self.groups = Record.set(api.groups, group.name, group);
    return self;
  };

/**
 * Merge another API's groups into this API (pipeable).
 *
 * Returns a transformer function that merges groups from another API.
 * If there are duplicate group names, groups from the other API take precedence.
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
  Groups2 extends AnyGroup,
>(
  other: ConfectApi<Name2, Groups2>,
) =>
  <
    Name extends string,
    Groups extends AnyGroup,
  >(
    api: ConfectApi<Name, Groups>,
  ): ConfectApi<Name, Groups | Groups2> => {
    const self = Object.create(ConfectApiProto);
    self.name = api.name;
    self.groups = Record.union(api.groups, other.groups, SK);
    return self;
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
export const byName: Order.Order<ConfectApi<string, AnyGroup>> =
  Order.mapInput(
    String.Order,
    (api: ConfectApi<string, AnyGroup>) => api.name,
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
export const byGroupCount: Order.Order<ConfectApi<string, Record<string, AnyGroup>>> =
  Order.mapInput(
    Order.number,
    (api: ConfectApi<string, Record<string, AnyGroup>>) =>
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
export const byFunctionCount: Order.Order<ConfectApi<string, Record<string, AnyGroup>>> =
  Order.mapInput(
    Order.number,
    (api: ConfectApi<string, Record<string, AnyGroup>>) => {
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
  Groups extends Record<string, AnyGroup>,
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
  Groups extends AnyGroup,
  R,
  GroupKey extends keyof Groups,
  FunctionKey extends string,
>(
  api: ConfectApi<Name, Groups, R>,
  groupName: GroupKey,
  functionName: FunctionKey,
): Function.ConfectApiFunction | undefined => {
  const tagClass = api.groups[groupName];
  if (!tagClass) return undefined;
  return tagClass.group.functions[functionName];
};

// =============================================================================
// Convex Runtime Services
// =============================================================================



// =============================================================================
// Layer Building (Dependency Management)
// =============================================================================

/**
 * Service tag for an API.
 *
 * Follows Effect HTTP pattern: captures API definition + runtime context.
 * The service value contains the API definition and runtime context.
 *
 * @category Layer Building
 * @since 1.0.0
 */
export class ApiService extends Context.Tag("@confect/ApiService")<
  ApiService,
  {
    readonly api: ConfectApi<string>
    readonly context: Context.Context<never>
  }
>() { }

/**
 * Type helper: Extract union of all GroupService tags from API groups.
 *
 * @internal
 */
export type UnionOfGroupServices<Groups extends Record<string, Group.TagClass<any, any, any>>> = {
  [K in keyof Groups]: Groups[K]
}[keyof Groups];


/**
 * Create a top-level Api Layer.
 *
 * Follows Effect HTTP's HttpApiBuilder.api() pattern.
 * Returns Layer that requires all GroupServices and provides ApiService.
 *
 * @param api - API definition
 * @returns Layer that requires all group services
 *
 * @category Layer Building
 * @since 1.0.0
 *
 * @example
 * const MyApiLive = Api.build(myApi).pipe(
 *   Layer.provide(UsersLive),  // Provides GroupService<"users">
 *   Layer.provide(FilesLive)   // Provides GroupService<"files">
 * );
 */
export const toLayer = <
  Name extends string,
  Groups extends AnyGroup,
  R
>(
  api: ConfectApi<Name, Groups, R>
): Layer.Layer<
  ApiService,
  never,
  Groups
> =>
  Layer.effect(
    ApiService,
    Effect.map(Effect.context(), (context) => ({
      api: api,
      context: context
    }))
  )

// =============================================================================
// Convex Integration
// =============================================================================

/**
 * Type helper: Extract ConvexApiServer type from API groups.
 *
 * Represents the nested object structure returned by Api.serve():
 * { [groupName]: { [functionName]: RegisteredQuery | RegisteredMutation | RegisteredAction } }
 *
 * @internal
 */
type ConvexApiServer<Groups extends Record<string, AnyGroup>> = {
  [K in keyof Groups]: Record<
    string,
    | RegisteredQuery<"public", DefaultFunctionArgs, any>
    | RegisteredMutation<"public", DefaultFunctionArgs, any>
    | RegisteredAction<"public", DefaultFunctionArgs, any>
  >
};



// =============================================================================
// Runtime Layer Helpers
// =============================================================================

/**
 * Type alias for query runtime services.
 * @internal
 */
type QueryLayers =
  | ConfectQueryCtx
  | QueryDB
  | ConfectQueryRunner
  | ConfectAuth
  | ConfectStorageReader

/**
 * Helper to create merged layer for query runtime services.
 * @internal
 */
const QueryLayers = <S extends GenericConfectSchema>() => Layer.mergeAll(
  ConfectQueryCtx.TypedDefault<S>(),
  QueryDB.TypedDefault<S>(),
  ConfectQueryRunner.Default,
  ConfectAuth.Default,
  ConfectStorageReader.Default,
)

/**
 * Create runtime layer for query functions (ctx-specific).
 * @internal
 */
const makeQueryRuntimeLayer = <S extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  ctx: GenericQueryCtx<DataModelFromConfectSchema<S>>
) => Layer.merge(layerQueryCtx(ctx), layerConfectSchemaDefinition(confectSchemaDefinition))

/**
 * Type alias for mutation runtime services.
 * @internal
 */
type MutationLayers =
  | ConfectQueryCtx
  | ConfectMutationCtx
  | QueryDB
  | MutationDB
  | ConfectQueryRunner
  | ConfectMutationRunner
  | ConfectAuth
  | ConfectScheduler
  | ConfectStorageReader
  | ConfectStorageWriter

/**
 * Helper to create merged layer for mutation runtime services.
 * @internal
 */
const MutationLayers = <S extends GenericConfectSchema>() => Layer.mergeAll(
  ConfectQueryCtx.TypedDefault<S>(),
  ConfectMutationCtx.TypedDefault<S>(),
  QueryDB.TypedDefault<S>(),
  MutationDB.TypedDefault<S>(),
  ConfectQueryRunner.TypedDefault<S>(),
  ConfectMutationRunner.Default,
  ConfectAuth.Default,
  ConfectScheduler.Default,
  ConfectStorageReader.Default,
  ConfectStorageWriter.Default,
)

/**
 * Create runtime layer for mutation functions (ctx-specific).
 * @internal
 */
const makeMutationRuntimeLayer = <S extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  ctx: GenericMutationCtx<DataModelFromConfectSchema<S>>
) => Layer.merge(layerMutationCtx(ctx), layerConfectSchemaDefinition(confectSchemaDefinition))

/**
 * Type alias for action runtime services.
 * @internal
 */
type ActionLayers =
  | ConfectActionCtx
  | ConfectQueryRunner
  | ConfectMutationRunner
  | ConfectActionRunner
  | ConfectAuth
  | ConfectScheduler
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectStorageActionWriter
  | ConfectVectorSearch

/**
 * Helper to create merged layer for action runtime services.
 * @internal
 */
const ActionLayers = <S extends GenericConfectSchema>() => Layer.mergeAll(
  ConfectActionCtx.TypedDefault<S>(),
  ConfectQueryRunner.TypedDefault<S>(),
  ConfectMutationRunner.Default,
  ConfectActionRunner.Default,
  ConfectAuth.Default,
  ConfectScheduler.Default,
  ConfectStorageReader.Default,
  ConfectStorageWriter.Default,
  ConfectStorageActionWriter.Default,
  ConfectVectorSearch.Default,
)

/**
 * Create runtime layer for action functions (ctx-specific).
 * @internal
 */
const makeActionRuntimeLayer = <S extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  ctx: GenericActionCtx<DataModelFromConfectSchema<S>>
) => Layer.merge(layerActionCtx(ctx), layerConfectSchemaDefinition(confectSchemaDefinition))

/**
 * Wrap a handler Effect with Convex query function wrapper.
 * @internal
 */
const makeQueryFunction = <S extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  args: Schema.Schema.AnyNoContext,
  returns: Schema.Schema.AnyNoContext,
  apiLayer: Layer.Layer<ApiService, never, QueryLayers>,
  groupServiceTag: Group.TagClass<any, any, any>,
  functionName: string
): RegisteredQuery<"public", any, any> =>
  queryGeneric({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: async (ctx: GenericQueryCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {

      const apiService = await ApiService.pipe(
        Effect.provide(apiLayer),
        Effect.provide(QueryLayers<S>()),
        Effect.provide(makeQueryRuntimeLayer(confectSchemaDefinition, ctx)),
        Effect.runPromise
      )

      // Extract handler from context at runtime
      const handlers = pipe(
        Context.getOption(apiService.context, groupServiceTag),
        Option.getOrThrow
      );
      const handler = handlers[functionName];

      if (!handler) {
        throw new Error(`Handler not found: ${functionName}`);
      }

      return pipe(
        Schema.decode(args)(actualArgs),
        Effect.orDie,
        Effect.flatMap(handler),
        Effect.flatMap(Schema.encodeUnknown(returns)),
        Effect.runPromise
      );
    },
  });

/**
 * Wrap a handler Effect with Convex mutation function wrapper.
 * @internal
 */
const makeMutationFunction = <S extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  args: Schema.Schema.AnyNoContext,
  returns: Schema.Schema.AnyNoContext,
  apiLayer: Layer.Layer<ApiService, never, MutationLayers>,
  groupServiceTag: Group.TagClass<any, any, any>,
  functionName: string
): RegisteredMutation<"public", any, any> => {
  console.log("[confect] Constructing mutation function:", functionName);
  return mutationGeneric({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: async (ctx: GenericMutationCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {
      console.log(`[confect] Executing mutation handler for ${functionName} with actualArgs:`, actualArgs);

      // Extract ApiService at runtime with Convex layers
      const apiService = await ApiService.pipe(

        Effect.provide(apiLayer),
        Effect.provide(MutationLayers<S>()),
        Effect.provide(makeMutationRuntimeLayer(confectSchemaDefinition, ctx)),
        Effect.runPromise
      )

      console.log(`[confect] ApiService provided for mutation: ${functionName}`);

      // Extract handler from context
      const handlers = pipe(
        Context.getOption(apiService.context, groupServiceTag),
        Option.getOrThrow
      );
      const handler = handlers[functionName];

      if (!handler) {
        console.error(`[confect] Handler not found for mutation: ${functionName}`);
        throw new Error(`Handler not found: ${functionName}`);
      }

      console.log(`[confect] Decoding and running handler for mutation: ${functionName}`);

      return pipe(
        Schema.decode(args)(actualArgs),
        Effect.orDie,
        Effect.flatMap(handler),
        Effect.flatMap(Schema.encodeUnknown(returns)),
        Effect.runPromise
      );
    },
  });
};

/**
 * Wrap a handler Effect with Convex action function wrapper.
 * @internal
 */
const makeActionFunction = <S extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  args: Schema.Schema.AnyNoContext,
  returns: Schema.Schema.AnyNoContext,
  apiLayer: Layer.Layer<ApiService, never, ActionLayers>,
  groupServiceTag: Group.TagClass<any, any, any>,
  functionName: string
): RegisteredAction<"public", any, any> => {
  console.log("[confect] Constructing action function:", functionName);
  return actionGeneric({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: async (ctx: GenericActionCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {
      console.log(`[confect] Executing action handler for ${functionName} with actualArgs:`, actualArgs);

      // Extract ApiService at runtime with Convex layers
      const apiService = await ApiService.pipe(
        Effect.tap(Effect.logInfo("Interesting: ")),
        Effect.provide(apiLayer),
        Effect.tap(Effect.logInfo("Interesting: ")),
        Effect.provide(ActionLayers<S>()),
        Effect.tap(Effect.logInfo("Interesting: ")),
        Effect.provide(makeActionRuntimeLayer(confectSchemaDefinition, ctx)),
        Effect.tap(Effect.logInfo("Interesting: ")),
        Effect.tapError(Effect.logError),
        Effect.runPromise
      )

      console.log(`[confect] ApiService provided for action: ${functionName}`);

      // Extract handler from context
      const handlers = pipe(
        Context.getOption(apiService.context, groupServiceTag),
        Option.getOrThrow
      );
      const handler = handlers[functionName];

      if (!handler) {
        console.error(`[confect] Handler not found for action: ${functionName}`);
        throw new Error(`Handler not found: ${functionName}`);
      }

      console.log(`[confect] Decoding and running handler for action: ${functionName}`);

      return pipe(
        Schema.decode(args)(actualArgs),
        Effect.orDie,
        Effect.flatMap(handler),
        Effect.flatMap(Schema.encodeUnknown(returns)),
        Effect.runPromise
      );
    },
  });
};

type ConfectBuildTimeServices =
  | QueryLayers
  | MutationLayers
  | ActionLayers

/**
 * Convert a Layer-based API to Convex registered functions.
 *
 * This is the final step that bridges the Effect Layer system to Convex's runtime.
 * It takes:
 * - Schema definition (for Convex validators and database layers)
 * - API definition (pure data structure with groups and functions)
 * - API Layer (provides ApiService which contains runtime context with all group handlers)
 *
 * Returns a nested object structure: { [groupName]: { [functionName]: RegisteredFunction } }
 *
 * The apiLayer can have requirements for Convex runtime services (QueryDB, MutationDB, etc.)
 * which will be provided automatically at runtime by the Convex context.
 *
 * @param schemaDefinition - Confect schema definition for the database
 * @param api - API definition (pure data)
 * @param apiLayer - Layer that provides ApiService (may require Convex runtime services)
 * @returns Nested object of Convex registered functions
 *
 * @category Convex Integration
 * @since 1.0.0
 *
 * @example
 * import * as Api from "./internal/Api"
 * import * as Group from "./internal/Group"
 * import * as Layer from "effect/Layer"
 *
 * const myApi = Api.api("myApp").pipe(
 *   Api.add(usersGroup),
 *   Api.add(postsGroup)
 * );
 *
 * const MyApiLive = Api.build(myApi).pipe(
 *   Layer.provide(UsersLive),
 *   Layer.provide(PostsLive)
 * );
 *
 * export default Api.serve(schemaDefinition, myApi, MyApiLive);
 * // Convex export: { users: { getUser: RegisteredQuery, ... }, posts: { ... } }
 */
export const serve = <
  S extends GenericConfectSchema,
  Name extends string,
  Groups extends Record<string, AnyGroup>,
>(
  schemaDefinition: ConfectSchemaDefinition<S>,
  api: ConfectApi<Name, Groups, any>,
  apiLayer: Layer.Layer<ApiService, never, ConfectBuildTimeServices>
): ConvexApiServer<Groups> => {
  console.log("[confect] Building Convex API server...");
  console.log("[confect] Groups to serve:", Object.keys(api.groups));
  return Record.map(api.groups, (tagClass, groupName) => {
    console.log(`[confect] Processing group: ${groupName}`);
    const group = tagClass.group;  // Extract group from TagClass
    return Record.map(group.functions, (func, functionName) => {
      console.log(`[confect] Registering function: [${groupName}].${functionName}. Type: ${func.functionType}`);
      return Match.value(func.functionType).pipe(
        Match.when("Query", () => {
          console.log(`[confect] => Building RegisteredQuery for: ${groupName}.${functionName}`);
          return makeQueryFunction(
            schemaDefinition,
            func.args,
            func.returns,
            apiLayer as never,
            tagClass,  // Pass TagClass directly
            functionName
          );
        }),
        Match.when("Mutation", () => {
          console.log(`[confect] => Building RegisteredMutation for: ${groupName}.${functionName}`);
          return makeMutationFunction(
            schemaDefinition,
            func.args,
            func.returns,
            apiLayer as never,
            tagClass,  // Pass TagClass directly
            functionName
          );
        }),
        Match.when("Action", () => {
          console.log(`[confect] => Building RegisteredAction for: ${groupName}.${functionName}`);
          return makeActionFunction(
            schemaDefinition,
            func.args,
            func.returns,
            apiLayer,
            tagClass,  // Pass TagClass directly
            functionName
          );
        }),
        Match.exhaustive
      )
    })
  }) as never;
}

