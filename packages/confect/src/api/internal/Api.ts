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
 * API - top-level collection of groups.
 *
 * APIs are pure data structures that organize groups.
 * They don't extend Context.Tag - they're just metadata about which groups exist.
 *
 * To serve an API, you provide a Layer that satisfies all the group Tags.
 *
 * @category Types
 * @since 1.0.0
 */
export interface ConfectApi<
  out Name extends string,
  out Groups extends Group.ConfectApiGroup.IAnyGroup = never,
> extends Pipeable {
  readonly [ApiTypeId]: ApiTypeId;

  readonly name: Name;
  readonly groups: Record.ReadonlyRecord<string, Groups>;
}

export declare namespace ConfectApi {
  export interface AnyApi extends ConfectApi<string, Group.ConfectApiGroup.AnyGroup> { }
}

// =============================================================================
// Constructors
// =============================================================================

/**
 * Prototype for all ConfectApi instances.
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
 * APIs are pure data structures - just metadata about which groups exist.
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
 * import * as Layer from "effect/Layer"
 *
 * // 1. Define groups (pure data)
 * const usersGroup = Group.group("users").pipe(
 *   Group.add(Function.query("getUser").args(...).returns(...))
 * )
 * const postsGroup = Group.group("posts").pipe(
 *   Group.add(Function.query("getPost").args(...).returns(...))
 * )
 *
 * // 2. Define API (pure data)
 * const myApi = Api.api("myApp").pipe(
 *   Api.add(usersGroup),
 *   Api.add(postsGroup)
 * )
 *
 * // 3. Implement handlers as Layers
 * const UsersLive = Layer.effect(usersGroup, Effect.succeed({
 *   getUser: (args) => Effect.succeed({ id: args.id, name: "John" })
 * }))
 * const PostsLive = Layer.effect(postsGroup, Effect.succeed({
 *   getPost: (args) => Effect.succeed({ id: args.id, title: "Hello" })
 * }))
 *
 * // 4. Provide all groups
 * const MyApiLive = Layer.mergeAll(UsersLive, PostsLive)
 *
 * // 5. Serve to Convex
 * export default Api.serve(schemaDefinition, myApi, MyApiLive)
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
): u is ConfectApi<string, Group.ConfectApiGroup.AnyGroup> =>
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
export type GetName<A extends ConfectApi<string, Group.ConfectApiGroup.AnyGroup>> =
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
export type GetGroups<A extends ConfectApi.AnyApi> =
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
type GetGroupNames<A> = A extends ConfectApi<any, infer Groups>
  ? Groups extends Group.ConfectApiGroup.AnyGroup
  ? Group.GetName<Groups>
  : never
  : never



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
export type GetAllFunctions<A extends ConfectApi<string, Group.ConfectApiGroup.AnyGroup>> = {
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
 *   Group.add(getUserFn)
 * )
 * const postsGroup = Group.group("posts").pipe(
 *   Group.add(getPostFn)
 * )
 *
 * const myApi = Api.api("myApp").pipe(
 *   Api.add(usersGroup),
 *   Api.add(postsGroup)
 * )
 * // myApi has both users and posts groups
 */
export const add = <G extends Group.ConfectApiGroup.AnyGroup>(
  group: G,
) => <Name extends string, Groups extends Group.ConfectApiGroup.IAnyGroup>(
  api: ConfectApi<Name, Groups>,
): ConfectApi<Name, Groups | G> => {
    const groups = Record.set(api.groups, group.name, group);
    const self = Object.create(ConfectApiProto);
    self.name = api.name;
    self.groups = groups;
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
  Groups2 extends Group.ConfectApiGroup.AnyGroup,
>(
  other: ConfectApi<Name2, Groups2>,
) =>
  <
    Name extends string,
    Groups extends Group.ConfectApiGroup.AnyGroup,
  >(
    api: ConfectApi<Name, Groups>,
  ): ConfectApi<Name, Groups | Groups2> => {
    const groups = Record.union(api.groups, other.groups, SK);
    const self = Object.create(ConfectApiProto);
    self.name = api.name;
    self.groups = groups;
    return self;
  };

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
export const getGroup = <Api extends ConfectApi.AnyApi>(
  api: Api,
  name: GetGroupNames<Api>,
) => api.groups[name]!;

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
 *   Group.add(getUserFn)
 * )
 * const myApi = Api.api("myApp").pipe(
 *   Api.add(usersGroup)
 * )
 * const getUser = Api.getFunction(myApi, "users", "getUser")
 * // getUser is the function or undefined
 */
export const getFunction = <
  Name extends string,
  Groups extends Group.ConfectApiGroup.AnyGroup,
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
// Convex Runtime Services
// =============================================================================

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
type ConvexApiServer<Groups extends Group.ConfectApiGroup.AnyGroup> = {
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
  apiLayer: Layer.Layer<any, never, QueryLayers>,
  groupTag: Group.ConfectApiGroup.AnyGroup,
  functionName: string
): RegisteredQuery<"public", any, any> =>
  queryGeneric({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: async (ctx: GenericQueryCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {

      // Get handlers from the group Tag in the provided Layer
      const handlers = await groupTag.pipe(
        Effect.provide(apiLayer),
        Effect.provide(QueryLayers<S>()),
        Effect.provide(makeQueryRuntimeLayer(confectSchemaDefinition, ctx)),
        Effect.runPromise
      )

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
  apiLayer: Layer.Layer<any, never, MutationLayers>,
  groupTag: Group.ConfectApiGroup.AnyGroup,
  functionName: string
): RegisteredMutation<"public", any, any> => {
  console.log("[confect] Constructing mutation function:", functionName);
  return mutationGeneric({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: async (ctx: GenericMutationCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {
      console.log(`[confect] Executing mutation handler for ${functionName} with actualArgs:`, actualArgs);

      // Get handlers from the group Tag in the provided Layer
      const handlers = await groupTag.pipe(
        Effect.provide(apiLayer),
        Effect.provide(MutationLayers<S>()),
        Effect.provide(makeMutationRuntimeLayer(confectSchemaDefinition, ctx)),
        Effect.runPromise
      )

      console.log(`[confect] Got handlers for mutation: ${functionName}`);

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
  apiLayer: Layer.Layer<any, never, ActionLayers>,
  groupTag: Group.ConfectApiGroup.AnyGroup,
  functionName: string
): RegisteredAction<"public", any, any> => {
  console.log("[confect] Constructing action function:", functionName);
  return actionGeneric({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: async (ctx: GenericActionCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {
      console.log(`[confect] Executing action handler for ${functionName} with actualArgs:`, actualArgs);

      // Get handlers from the group Tag in the provided Layer
      const handlers = await groupTag.pipe(
        Effect.provide(apiLayer),
        Effect.provide(ActionLayers<S>()),
        Effect.provide(makeActionRuntimeLayer(confectSchemaDefinition, ctx)),
        Effect.runPromise
      )

      console.log(`[confect] Got handlers for action: ${functionName}`);

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
 * Convert an API definition to Convex registered functions.
 *
 * This bridges Effect Layers to Convex's runtime.
 * It takes:
 * - Schema definition (for Convex validators and database layers)
 * - API definition (pure data structure with groups and functions)
 * - API Layer that provides all group handlers
 *
 * The apiLayer signature is: `Layer<Groups, never, DefaultServices>`
 * - Provides: All the group Tags (handlers for each group)
 * - Requires: Default Convex services (QueryDB, MutationDB, etc.)
 *
 * Returns a nested object structure: { [groupName]: { [functionName]: RegisteredFunction } }
 *
 * @param schemaDefinition - Confect schema definition for the database
 * @param api - API definition (pure data)
 * @param apiLayer - Layer that provides all group handlers
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
 * const UsersLive = Layer.effect(usersGroup, Effect.succeed({ ... }))
 * const PostsLive = Layer.effect(postsGroup, Effect.succeed({ ... }))
 * const MyApiLive = Layer.mergeAll(UsersLive, PostsLive)
 *
 * export default Api.serve(schemaDefinition, myApi, MyApiLive);
 * // Convex export: { users: { getUser: RegisteredQuery, ... }, posts: { ... } }
 */
export const serve = <
  S extends GenericConfectSchema,
  Name extends string,
  Groups extends Group.ConfectApiGroup.AnyGroup,
>(
  schemaDefinition: ConfectSchemaDefinition<S>,
  api: ConfectApi<Name, Groups>,
  apiLayer: Layer.Layer<any, never, ConfectBuildTimeServices>
): ConvexApiServer<Groups> => {
  console.log("[confect] Building Convex API server...");
  console.log("[confect] Groups to serve:", Object.keys(api.groups));
  return Record.map(api.groups, (group, groupName) => {
    console.log(`[confect] Processing group: ${groupName}`);
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
            group,
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
            group,
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
            group,
            functionName
          );
        }),
        Match.exhaustive
      )
    })
  }) as never;
}

