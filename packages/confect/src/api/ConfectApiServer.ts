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
 * Currently, the schema definition is passed via `ConfectApiWithDatabaseSchema` wrapper.
 * Future refactoring may integrate the full schema definition into `ConfectApi` directly.
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
import { layer as layerAuth } from "../server/auth";
import {
  layerActionCtx,
  layerMutationCtx,
  layerQueryCtx,
} from "../server/convex_ctx";
import {
  layerConfectActionCtx,
  layerConfectMutationCtx,
} from "../server/ctx";
import { layerMutationDB, layerQueryDB } from "../server/database";
import {
  layerActionRunner,
  layerMutationRunner,
  layerQueryRunner,
} from "../server/runners";
import { layer as layerScheduler } from "../server/scheduler";
import { ConfectSchemaDefinition, DataModelFromConfectSchema, GenericConfectSchema } from "../server/schema";
import {
  compileArgsSchema,
  compileReturnsSchema,
} from "../server/schema_to_validator";
import {
  layerStorageActionWriter,
  layerStorageReader,
  layerStorageWriter,
} from "../server/storage";
import { layer as layerVectorSearch } from "../server/vector_search";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import { ConfectApiGroupAnyWithProps } from "./ConfectApiGroup";
import * as ConfectApiWithDatabaseSchema from "./ConfectApiWithDatabaseSchema";
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
  groupName: string,
  group: ConfectApiGroupAnyWithProps
) =>
  pipe(
    // Type assertion: group.name comes from Groups and is a valid group name at runtime.
    // TypeScript can't infer this because groupName is widened to string by Record.toEntries.
    api.groupHandler(group.name as any),
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
    Array.map(([groupName, group]) =>
      buildServerGroup(confectSchemaDefinition, api, groupName, group)
    ),
    Effect.all,
    Effect.map((entries) => ({
      [TypeId]: TypeId,
      ...Record.fromEntries(entries),
    }))
  );

export const make = <
  Api extends ConfectApiWithDatabaseSchema.ConfectApiWithDatabaseSchemaAnyWithProps,
  E = never,
  R = never
>(
  apiWithDatabaseSchema: Api,
  // User-provided layer to construct the API service.
  // E and R are unconstrained - the layer determines its own error and requirement types.
  apiServiceLayer: Layer.Layer<
    ConfectApiBuilder.ConfectApiService<
      Api["confectSchemaDefinition"]["confectSchema"],
      Api["api"]["name"],
      Api["api"]["groups"][keyof Api["api"]["groups"]]
    >,
    E,
    R
  >
): ApiServer<Api["api"]> =>
  pipe(
    ConfectApiBuilder.ConfectApiService(
      apiWithDatabaseSchema.confectSchemaDefinition,
      apiWithDatabaseSchema.api.name,
      apiWithDatabaseSchema.api.groups
    ),
    Effect.flatMap((api) =>
      buildAllServerGroups(
        apiWithDatabaseSchema.confectSchemaDefinition,
        api,
        apiWithDatabaseSchema.api.groups as Record.ReadonlyRecord<
          Api["api"]["groups"][keyof Api["api"]["groups"]]["name"],
          Api["api"]["groups"][keyof Api["api"]["groups"]]
        >
      )
    ),
    Effect.provide(apiServiceLayer),
    Effect.scoped,
    // API boundary cast: Convex requires synchronous function registration.
    // Effect.runSync returns the unwrapped result but TypeScript can't infer
    // the return type through the complex pipe chain. This is safe because
    // buildAllServerGroups returns Effect<ApiServer<Api["api"]>>.
    Effect.runSync as any
  );

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
    // Handler requirements are generic - handlers come from API builder with unknown requirements.
    // The layers below provide all services available to queries.
    handler: (a: Args["Type"]) => Effect.Effect<Returns["Encoded"], E, R>;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  // API boundary: Convex handlers receive/return untyped ctx and args.
  // Type safety is enforced at the API builder level via handler constraints.
  handler: (ctx: GenericQueryCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {
    const layers = Layer.mergeAll(
      // Type assertion: ctx.db is structurally compatible but TypeScript can't prove it.
      // DataModelFromConfectSchema<S> === ConvexDataModel<ConfectSchemaDefinition<S>> at runtime.
      layerQueryDB(confectSchemaDefinition, ctx.db as any),
      layerAuth(ctx.auth),
      layerStorageReader(ctx.storage),
      layerQueryRunner(ctx.runQuery),
      layerQueryCtx(ctx)
    );

    // Type assertion: handler requirements R are satisfied by the layers we provide above.
    // This is safe because the API builder ensures handlers only use available services.
    return runHandler(args, returns, handler as any, layers, actualArgs);
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
    // Handler requirements are generic - handlers come from API builder with unknown requirements.
    // The layers below provide all services available to mutations.
    handler: (a: Args["Type"]) => Effect.Effect<Returns["Encoded"], E, R>;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  // API boundary: Convex handlers receive/return untyped ctx and args.
  // Type safety is enforced at the API builder level via handler constraints.
  handler: (ctx: GenericMutationCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {
    const layers = layerConfectMutationCtx<S>().pipe(
      Layer.provideMerge(Layer.mergeAll(
        layerQueryDB(confectSchemaDefinition, ctx.db),
        layerMutationDB(confectSchemaDefinition, ctx.db),
        layerAuth(ctx.auth),
        layerScheduler(ctx.scheduler),
        layerStorageReader(ctx.storage),
        layerStorageWriter(ctx.storage),
        layerQueryRunner(ctx.runQuery),
        layerMutationRunner(ctx.runMutation),
        layerMutationCtx(ctx)
      ))
    );

    // Type assertion: handler requirements R are satisfied by the layers we provide above.
    // This is safe because the API builder ensures handlers only use available services.
    return runHandler(args, returns, handler as any, layers, actualArgs);
  },
});

const confectActionFunction = <
  E,
  R,
  S extends GenericConfectSchema,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext
>(
  _confectSchemaDefinition: ConfectSchemaDefinition<S>,
  {
    args,
    returns,
    handler,
  }: {
    args: Args;
    returns: Returns;
    // Handler requirements are generic - handlers come from API builder with unknown requirements.
    // The layers below provide all services available to actions.
    handler: (a: Args["Type"]) => Effect.Effect<Returns["Encoded"], E, R>;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  // API boundary: Convex handlers receive/return untyped ctx and args.
  // Type safety is enforced at the API builder level via handler constraints.
  handler: (ctx: GenericActionCtx<DataModelFromConfectSchema<S>>, actualArgs: any): Promise<any> => {
    const layers = layerConfectActionCtx<S>().pipe(
      Layer.provideMerge(Layer.mergeAll(
        layerScheduler(ctx.scheduler),
        layerAuth(ctx.auth),
        layerStorageReader(ctx.storage),
        layerStorageWriter(ctx.storage),
        layerStorageActionWriter(ctx.storage),
        layerQueryRunner(ctx.runQuery),
        layerMutationRunner(ctx.runMutation),
        layerActionRunner(ctx.runAction),
        layerVectorSearch(ctx.vectorSearch),
        layerActionCtx(ctx)
      ))
    );

    // Type assertion: handler requirements R are satisfied by the layers we provide above.
    // This is safe because the API builder ensures handlers only use available services.
    return runHandler(args, returns, handler as any, layers, actualArgs);
  },
});
