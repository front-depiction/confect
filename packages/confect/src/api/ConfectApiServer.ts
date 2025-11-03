/**
 * @module api/ConfectApiServer
 *
 * Server-side implementation of Confect API - generates Convex functions from API definitions.
 *
 * ## Type Architecture
 *
 * This module bridges two type systems:
 * 1. **data_model.d.ts** - Type-level API representation (ApiServer<Api>)
 * 2. **Runtime types** - Branded types with TypeId symbols (ConfectApiServer<Groups>)
 *
 * The public API uses `ApiServer<Api>` from data_model for better type inference,
 * while internal implementation uses branded runtime types for compatibility.
 *
 * ## Schema Access Pattern
 *
 * The server needs the full `ConfectSchemaDefinition` (not just the schema) because:
 * - Database layers require precompiled table schemas with/without system fields
 * - Convex validators need to be generated from schemas
 * - Schema definition includes computed metadata (tableSchemas, convexSchemaDefinition)
 *
 * The full schema definition is now integrated into `ConfectApi` via the `schemaDefinition` field.
 *
 * ## Key Functions
 *
 * - `make()` - Generates Convex server functions from API + handlers
 * - Returns `ApiServer<Api>` - nested object of RegisteredQuery/Mutation/Action
 *
 * @example
 * ```typescript
 * export const api = ConfectApiServer.make(
 *   apiWithSchema,
 *   Layer.mergeAll(groupHandlers, ...)
 * );
 * // Type: ApiServer<typeof myApi>
 * // Runtime: { users: { list: RegisteredQuery, ... }, ... }
 * ```
 */
import {
  actionGeneric,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  mutationGeneric,
  queryGeneric
} from "convex/server";
import { pipe } from "effect";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import { ConfectAuth } from "../server/auth";
import {
  layerActionCtx,
  layerMutationCtx,
  layerQueryCtx,
} from "../server/convex_ctx";
import {
  ConfectActionCtx,
  ConfectMutationCtx,
  ConfectQueryCtx,
} from "../server/ctx";
import { MutationDB, QueryDB } from "../server/database";
import {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
} from "../server/runners";
import { ConfectScheduler } from "../server/scheduler";
import {
  layerConfectSchemaDefinition,
  ConfectSchemaDefinition,
  DataModelFromConfectSchema,
  GenericConfectSchema
} from "../server/schema";
import {
  compileArgsSchema,
  compileReturnsSchema,
} from "../server/schema_to_validator";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "../server/storage";
import { ConfectVectorSearch } from "../server/vector_search";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import { ConfectApiGroupAnyWithProps, type ConfectApiGroupName } from "./ConfectApiGroup";
import * as ConfectApi from "./ConfectApi";
import type {
  ApiServer,
} from "./data_model";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiServer");

export type TypeId = typeof TypeId;

const makeRegisteredFunction = <S extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  handlerItem: {
    function_: {
      functionType: string;
      name: string;
      args: Schema.Schema.AnyNoContext;
      returns: Schema.Schema.AnyNoContext;
    };
    handler: (a: unknown) => Effect.Effect<unknown, unknown, unknown>;
  }
) => {
  const {
    function_: { functionType, name, args, returns },
    handler,
  } = handlerItem;

  const registeredFunction = Match.value(functionType as "Query" | "Mutation" | "Action").pipe(
    Match.when("Query", () =>
      queryGeneric(
        confectQueryFunction(confectSchemaDefinition, {
          args,
          returns,
          handler,
        })
      )
    ),
    Match.when("Mutation", () =>
      mutationGeneric(
        confectMutationFunction(confectSchemaDefinition, {
          args,
          returns,
          handler,
        })
      )
    ),
    Match.when("Action", () =>
      actionGeneric(
        confectActionFunction(confectSchemaDefinition, {
          args,
          returns,
          handler,
        })
      )
    ),
    Match.exhaustive
  );

  return [name, registeredFunction] as const;
};

const buildGroupFunctions = <S extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  // Internal handlers from ConfectApiBuilder - generic schemas and handlers
  handlers: ReadonlyArray<{
    function_: {
      functionType: string;
      name: string;
      args: Schema.Schema.AnyNoContext;
      returns: Schema.Schema.AnyNoContext;
    };
    handler: (a: unknown) => Effect.Effect<unknown, unknown, unknown>;
  }>
) =>
  pipe(
    handlers,
    Array.map((handlerItem) =>
      makeRegisteredFunction(confectSchemaDefinition, handlerItem)
    ),
    Record.fromEntries
  );

const buildServerGroup = <
  S extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroupAnyWithProps,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  api: ConfectApiBuilder.ConfectApiService<S, ApiName, Groups>,
  groupName: string
) =>
  pipe(
    // API boundary cast: groupName comes from Record.toEntries which widens to string,
    // but at runtime it's guaranteed to be a valid group name from Groups["name"].
    // TypeScript's ConfectApiGroupName<Groups> expects the specific group type,
    // not the union of all group names, so we need this cast.
    api.groupHandler(groupName as ConfectApiGroupName<Groups>),
    Effect.map((groupHandler) => [
      groupName,
      buildGroupFunctions(confectSchemaDefinition, groupHandler.handlers),
    ] as const)
  );

// Internal helper - builds server groups from the API service.
// Returns the legacy ConfectApiServer<Groups> type which matches ApiServer<Api> structurally
// but includes the TypeId brand. The TypeId is added for runtime type checking compatibility
// with existing code, though the data_model ApiServer type doesn't include it.
const buildAllServerGroups = <
  S extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroupAnyWithProps,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  api: ConfectApiBuilder.ConfectApiService<S, ApiName, Groups>,
  groups: Record.ReadonlyRecord<Groups["name"], Groups>
) =>
  pipe(
    groups,
    Record.toEntries,
    Array.map(([groupName, _group]) =>
      buildServerGroup(confectSchemaDefinition, api, groupName)
    ),
    Effect.all,
    Effect.map((entries) => ({
      [TypeId]: TypeId,
      ...Record.fromEntries(entries),
    }))
  );

export const make = <
  Api extends ConfectApi.ConfectApiAnyWithProps,
  E = never,
  R = never
>(
  api: Api,
  // User-provided layer to construct the API service.
  // E and R are unconstrained - the layer determines its own error and requirement types.
  apiServiceLayer: Layer.Layer<
    ConfectApiBuilder.ConfectApiService<
      Api["schemaDefinition"]["confectSchema"],
      Api["name"],
      Api["groups"][keyof Api["groups"]]
    >,
    E,
    R
  >
): ApiServer<Api> => {
  const apiServiceTag = ConfectApiBuilder.ConfectApiService(
    api.schemaDefinition,
    api.name,
    api.groups
  );

  const serverEffect = pipe(
    apiServiceTag,
    Effect.flatMap((apiService) =>
      buildAllServerGroups(
        api.schemaDefinition,
        apiService,
        api.groups as Record.ReadonlyRecord<
          Api["groups"][keyof Api["groups"]]["name"],
          Api["groups"][keyof Api["groups"]]
        >
      )
    ),
    Effect.provide(apiServiceLayer),
    Effect.scoped
  ) as unknown as Effect.Effect<ApiServer<Api>, E, never>;

  // API boundary: Convex requires synchronous function registration.
  // Effect.runSync executes the server building effect synchronously and returns
  // the ApiServer<Api> result. The cast above is safe because:
  // 1. apiServiceLayer provides all requirements (R)
  // 2. Effect.scoped removes the Scope requirement
  // 3. buildAllServerGroups returns the correct ApiServer<Api> type
  return Effect.runSync(serverEffect);
};

// Internal handler runner that bridges Convex's untyped ctx with Effect's typed layer system.
// API boundary notes:
// - actualArgs: unknown from Convex (typed as 'any' for Convex API compatibility)
// - Returns Promise<any> because Convex expects untyped return values
// - Schema.decode handles unknown->typed validation (orDie = programmer error if schemas don't match)
// - Schema.encode handles typed->unknown serialization
// The error type E is not constrained here - handlers determine their own error types.
const runHandler = <E, R, Args extends Schema.Schema.AnyNoContext, Returns extends Schema.Schema.AnyNoContext>(
  args: Args,
  returns: Returns,
  handler: (a: Args["Type"]) => Effect.Effect<Returns["Encoded"], E, R>,
  layers: Layer.Layer<R>,
  actualArgs: any // API boundary: Convex provides untyped arguments
): Promise<any> => // API boundary: Convex expects untyped return value
  pipe(
    Schema.decode(args)(actualArgs),
    Effect.orDie,
    Effect.flatMap(handler),
    Effect.provide(layers),
    Effect.flatMap(Schema.encodeUnknown(returns)),
    Effect.runPromise
  );

const confectQueryFunction = <
  E,
  R,
  S extends GenericConfectSchema,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  {
    args,
    returns,
    handler,
  }: {
    args: Args;
    returns: Returns;
    // Handler comes from API builder as (unknown) => Effect<unknown, unknown, unknown>
    // We accept it as a generic typed handler, then cast when calling runHandler
    handler: (a: Args["Type"]) => Effect.Effect<Returns["Encoded"], E, R>;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  // API boundary: Convex handlers receive/return untyped ctx and args.
  // Type safety is enforced at the API builder level via handler constraints.
  handler: (ctx: GenericQueryCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {
    const layers = Layer.mergeAll(
      ConfectQueryCtx.TypedDefault<S>(),
      QueryDB.TypedDefault<S>(),
      ConfectQueryRunner.TypedDefault<S>(),
      ConfectAuth.Default,
      ConfectStorageReader.Default,
    ).pipe(
      Layer.provide(layerQueryCtx<S>(ctx)),
      Layer.provide(layerConfectSchemaDefinition(confectSchemaDefinition))
    );

    // API boundary cast: Handler comes from builder with generic R, but we know
    // it's constrained to QueryRequirements at the builder level. This cast is safe
    // because the layers above provide all query services.
    type QueryHandler = (a: Args["Type"]) => Effect.Effect<
      Returns["Encoded"],
      E,
      | ConfectQueryCtx
      | QueryDB
      | ConfectQueryRunner
      | ConfectAuth
      | ConfectStorageReader
    >;
    return runHandler(args, returns, handler as QueryHandler, layers, actualArgs);
  },
});

const confectMutationFunction = <
  E,
  R,
  S extends GenericConfectSchema,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  {
    args,
    returns,
    handler,
  }: {
    args: Args;
    returns: Returns;
    // Handler comes from API builder as (unknown) => Effect<unknown, unknown, unknown>
    // We accept it as a generic typed handler, then cast when calling runHandler
    handler: (a: Args["Type"]) => Effect.Effect<Returns["Encoded"], E, R>;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  // API boundary: Convex handlers receive/return untyped ctx and args.
  // Type safety is enforced at the API builder level via handler constraints.
  handler: (ctx: GenericMutationCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {
    const layers = Layer.mergeAll(
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
    ).pipe(
      Layer.provide(layerMutationCtx<S>(ctx)),
      Layer.provide(layerConfectSchemaDefinition(confectSchemaDefinition))
    );

    // API boundary cast: Handler comes from builder with generic R, but we know
    // it's constrained to MutationRequirements at the builder level. This cast is safe
    // because the layers above provide all mutation services.
    type MutationHandler = (a: Args["Type"]) => Effect.Effect<
      Returns["Encoded"],
      E,
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
    >;
    return runHandler(args, returns, handler as MutationHandler, layers, actualArgs);
  },
});

const confectActionFunction = <
  E,
  R,
  S extends GenericConfectSchema,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  {
    args,
    returns,
    handler,
  }: {
    args: Args;
    returns: Returns;
    // Handler comes from API builder as (unknown) => Effect<unknown, unknown, unknown>
    // We accept it as a generic typed handler, then cast when calling runHandler
    handler: (a: Args["Type"]) => Effect.Effect<Returns["Encoded"], E, R>;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  // API boundary: Convex handlers receive/return untyped ctx and args.
  // Type safety is enforced at the API builder level via handler constraints.
  handler: (ctx: GenericActionCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {
    const layers = Layer.mergeAll(
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
    ).pipe(
      Layer.provide(layerActionCtx<S>(ctx)),
      Layer.provide(layerConfectSchemaDefinition(confectSchemaDefinition))
    );

    // API boundary cast: Handler comes from builder with generic R, but we know
    // it's constrained to ActionRequirements at the builder level. This cast is safe
    // because the layers above provide all action services.
    type ActionHandler = (a: Args["Type"]) => Effect.Effect<
      Returns["Encoded"],
      E,
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
    >;
    return runHandler(args, returns, handler as ActionHandler, layers, actualArgs);
  },
});
