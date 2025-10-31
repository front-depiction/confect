import {
  actionGeneric,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  mutationGeneric,
  queryGeneric,
  RegisteredQuery,
} from "convex/server";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Match from "effect/Match";
import { pipe } from "effect";
import * as Record from "effect/Record";
import * as Schema from "effect/Schema";
import * as Types from "effect/Types";
import { layer as layerScheduler } from "../server/scheduler";
import { layer as layerAuth } from "../server/auth";
import { layerQueryDB, layerMutationDB } from "../server/database";
import {
  layerActionRunner,
  layerMutationRunner,
  layerQueryRunner,
} from "../server/runners";
import {
  layerActionCtx,
  layerMutationCtx,
  layerQueryCtx,
} from "../server/ctx";
import { ConfectSchemaDefinition, GenericConfectSchema } from "../server/schema";
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
import { ConfectApiGroupAnyWithProps, ConfectApiGroupName } from "./ConfectApiGroup";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiWithDatabaseSchema from "./ConfectApiWithDatabaseSchema";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiServer");

export type TypeId = typeof TypeId;

export type ConfectApiServer<
  Groups extends ConfectApiGroupAnyWithProps,
> = Types.Simplify<
  {
    readonly [TypeId]: TypeId;
  } & {
    readonly [GroupName in Groups["name"]]: {
      [FunctionName in keyof Extract<
        Groups,
        { name: GroupName }
      >["functions"]]: RegisteredQuery<
        "public",
        Extract<
          Groups,
          { name: GroupName }
        >["functions"][FunctionName]["args"]["Encoded"],
        Extract<
          Groups,
          { name: GroupName }
        >["functions"][FunctionName]["returns"]["Encoded"]
      >;
    };
  }
>;

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
    // Type assertion: groupName comes from Record.toEntries so it's a valid group name at runtime
    api.groupHandler(group.name as ConfectApiGroupName<Groups>),
    Effect.map((groupHandler) => [
      groupName,
      buildGroupFunctions(confectSchemaDefinition, groupHandler.handlers),
    ] as const)
  );

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
    } as ConfectApiServer<Groups>))
  );

export const make = <
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroupAnyWithProps,
>(
  apiWithDatabaseSchema: ConfectApiWithDatabaseSchema.ConfectApiWithDatabaseSchema<
    ConfectSchema,
    ApiName,
    Groups
  >,
  apiServiceLayer: Layer.Layer<
    ConfectApiBuilder.ConfectApiService<ConfectSchema, ApiName, Groups>,
    any,
    any
  >
): ConfectApiServer<Groups> =>
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
          Groups["name"],
          Groups
        >
      )
    ),
    Effect.provide(apiServiceLayer),
    Effect.scoped,
    // API boundary cast: Convex requires synchronous function registration.
    // Effect.runSync returns the unwrapped result but TypeScript can't infer
    // the return type through the complex pipe chain. This is safe because
    // buildAllServerGroups returns Effect<ConfectApiServer<Groups>>.
    Effect.runSync as any
  );

// Internal handler runner that bridges Convex's untyped ctx with Effect's typed layer system.
// Uses `any` for schema types because:
// 1. Convex handlers receive/return untyped values (any) at the API boundary
// 2. Schema encode/decode operations handle unknown->typed conversions
// 3. The layer R must match what handler requires (can't be constrained further here)
// Type safety is enforced at the ConfectApiFunction level, not at this low-level runner.
const runHandler = (
  args: Schema.Schema<any, any>,
  returns: Schema.Schema<any, any>,
  handler: (a: any) => Effect.Effect<any, any, any>,
  layers: Layer.Layer<any>,
  actualArgs: any
): Promise<any> =>
  pipe(
    Schema.decode(args)(actualArgs),
    Effect.orDie,
    Effect.flatMap(handler),
    Effect.provide(layers),
    Effect.flatMap(Schema.encodeUnknown(returns)),
    Effect.runPromise
  );

const confectQueryFunction = <
  S extends GenericConfectSchema
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema.AnyNoContext;
    returns: Schema.Schema.AnyNoContext;
    handler: (a: any) => Effect.Effect<any, any, any>;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (ctx: GenericQueryCtx<any>, actualArgs: any): Promise<any> => {
    const layers = Layer.mergeAll(
      layerQueryDB(confectSchemaDefinition, ctx.db),
      layerAuth(ctx.auth),
      layerStorageReader(ctx.storage),
      layerQueryRunner(ctx.runQuery),
      layerQueryCtx(ctx)
    );

    return runHandler(args, returns, handler, layers, actualArgs);
  },
});

const confectMutationFunction = <
  S extends GenericConfectSchema
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema.AnyNoContext;
    returns: Schema.Schema.AnyNoContext;
    handler: (a: any) => Effect.Effect<any, any, any>;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (ctx: GenericMutationCtx<any>, actualArgs: any): Promise<any> => {
    const layers = Layer.mergeAll(
      layerQueryDB(confectSchemaDefinition, ctx.db),
      layerMutationDB(confectSchemaDefinition, ctx.db),
      layerAuth(ctx.auth),
      layerScheduler(ctx.scheduler),
      layerStorageReader(ctx.storage),
      layerStorageWriter(ctx.storage),
      layerQueryRunner(ctx.runQuery),
      layerMutationRunner(ctx.runMutation),
      layerMutationCtx(ctx)
    );

    return runHandler(args, returns, handler, layers, actualArgs);
  },
});

const confectActionFunction = <
  S extends GenericConfectSchema
>(
  _confectSchemaDefinition: ConfectSchemaDefinition<S>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema.AnyNoContext;
    returns: Schema.Schema.AnyNoContext;
    handler: (a: any) => Effect.Effect<any, any, any>;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (ctx: GenericActionCtx<any>, actualArgs: any): Promise<any> => {
    const layers = Layer.mergeAll(
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
    );

    return runHandler(args, returns, handler, layers, actualArgs);
  },
});
