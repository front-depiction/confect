import {
  actionGeneric,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  mutationGeneric,
  queryGeneric,
  RegisteredQuery,
} from "convex/server";
import {
  Array,
  Effect,
  Layer,
  Match,
  pipe,
  Record,
  Schema,
  Types,
} from "effect";
import { ConfectScheduler, layer as layerScheduler } from "../server/scheduler";
import { ConfectAuth, layer as layerAuth } from "../server/auth";
import { QueryDB, MutationDB, layerQueryDB, layerMutationDB } from "../server/database";
import {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
  layerActionRunner,
  layerMutationRunner,
  layerQueryRunner,
} from "../server/runners";
import {
  ConvexActionCtx,
  ConvexMutationCtx,
  ConvexQueryCtx,
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
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
  layerStorageActionWriter,
  layerStorageReader,
  layerStorageWriter,
} from "../server/storage";
import { ConfectVectorSearch, layer as layerVectorSearch } from "../server/vector_search";
import { ConfectApiGroupAnyWithProps } from "./ConfectApiGroup";
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

const makeRegisteredFunction = (
  confectSchemaDefinition: ConfectSchemaDefinition<any>,
  handlerItem: {
    function_: {
      functionType: string;
      name: string;
      args: any;
      returns: any;
    };
    handler: any;
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

const buildGroupFunctions = (
  confectSchemaDefinition: ConfectSchemaDefinition<any>,
  handlers: ReadonlyArray<any>
) =>
  pipe(
    handlers,
    Array.map((handlerItem) =>
      makeRegisteredFunction(confectSchemaDefinition, handlerItem)
    ),
    Record.fromEntries
  );

const buildServerGroup = (
  confectSchemaDefinition: ConfectSchemaDefinition<any>,
  api: any,
  groupName: string,
  group: ConfectApiGroupAnyWithProps
) =>
  pipe(
    api.groupHandler(group.name),
    Effect.map((groupHandler: any) => [
      groupName,
      buildGroupFunctions(confectSchemaDefinition, groupHandler.handlers),
    ] as const)
  );

const buildAllServerGroups = <Groups extends ConfectApiGroupAnyWithProps>(
  confectSchemaDefinition: ConfectSchemaDefinition<any>,
  api: any,
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
    Effect.andThen((api) =>
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
    Effect.runSync as any
  );

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
    Effect.andThen(handler),
    Effect.provide(layers),
    Effect.andThen(Schema.encodeUnknown(returns)),
    Effect.runPromise
  );

const confectQueryFunction = (
  confectSchemaDefinition: ConfectSchemaDefinition<any>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<any, any>;
    returns: Schema.Schema<any, any>;
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

const confectMutationFunction = (
  confectSchemaDefinition: ConfectSchemaDefinition<any>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<any, any>;
    returns: Schema.Schema<any, any>;
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

const confectActionFunction = (
  _confectSchemaDefinition: ConfectSchemaDefinition<any>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<any, any>;
    returns: Schema.Schema<any, any>;
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
