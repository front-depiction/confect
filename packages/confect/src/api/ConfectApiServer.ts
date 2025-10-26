import {
  actionGeneric,
  DefaultFunctionArgs,
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
import {
  ConfectScheduler,
  ConfectVectorSearch,
  ConvexActionCtx,
  ConvexMutationCtx,
  ConvexQueryCtx,
} from "../server";
import { ConfectAuth } from "../server/auth";
import {
  ConfectDatabaseReader,
  confectDatabaseReaderLayer,
  ConfectDatabaseWriter,
  confectDatabaseWriterLayer,
} from "../server/database";
import {
  ConfectActionRunner,
  confectActionRunnerLayer,
  ConfectMutationRunner,
  confectMutationRunnerLayer,
  ConfectQueryRunner,
  confectQueryRunnerLayer,
} from "../server/runners";
import {
  ConfectSchemaDefinition,
  DataModelFromConfectSchema,
  GenericConfectSchema,
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
import { confectVectorSearchLayer } from "../server/vector_search";
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
      pipe(
        apiWithDatabaseSchema.api.groups as Record.ReadonlyRecord<
          Groups["name"],
          Groups
        >,
        Record.toEntries,
        Array.map(([groupName, group]) =>
          pipe(
            api.groupHandler(group.name),
            Effect.map((groupHandler) => [
              groupName,
              pipe(
                groupHandler.handlers,
                Array.map(
                  ({
                    function_: { functionType, name, args, returns },
                    handler,
                  }) => {
                    const registeredFunction = Match.value(functionType).pipe(
                      Match.when("Query", () =>
                        queryGeneric(
                          confectQueryFunction(
                            apiWithDatabaseSchema.confectSchemaDefinition,
                            {
                              args,
                              returns,
                              handler,
                            }
                          )
                        )
                      ),
                      Match.when("Mutation", () =>
                        mutationGeneric(
                          confectMutationFunction(
                            apiWithDatabaseSchema.confectSchemaDefinition,
                            {
                              args,
                              returns,
                              handler,
                            }
                          )
                        )
                      ),
                      Match.when("Action", () =>
                        actionGeneric(
                          confectActionFunction(
                            apiWithDatabaseSchema.confectSchemaDefinition,
                            {
                              args,
                              returns,
                              handler,
                            }
                          )
                        )
                      ),
                      Match.exhaustive
                    );

                    return [name, registeredFunction] as const;
                  }
                ),
                Record.fromEntries
              ),
            ] as const)
          )
        ),
        Effect.all,
        Effect.map((entries) => ({
          [TypeId]: TypeId,
          ...Record.fromEntries(entries),
        } as ConfectApiServer<Groups>))
      )
    ),
    Effect.provide(apiServiceLayer),
    Effect.scoped,
    Effect.runSync as any
  );

const runHandler = <ConvexArgs, ConfectArgs, ConvexReturns, ConfectReturns, E, R>(
  args: Schema.Schema<ConfectArgs, ConvexArgs>,
  returns: Schema.Schema<ConfectReturns, ConvexReturns>,
  handler: (a: ConfectArgs) => Effect.Effect<ConfectReturns, E, R>,
  layers: Layer.Layer<R>,
  actualArgs: ConvexArgs
): Promise<ConvexReturns> =>
  pipe(
    Schema.decode(args)(actualArgs),
    Effect.orDie,
    Effect.andThen(handler),
    Effect.provide(layers),
    Effect.andThen(Schema.encodeUnknown(returns)),
    Effect.runPromise
  );

const confectQueryFunction = <
  ConfectSchema extends GenericConfectSchema,
  ConvexArgs extends DefaultFunctionArgs,
  ConfectArgs,
  ConvexReturns,
  ConfectReturns,
  E,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectArgs
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectDatabaseReader<ConfectSchemaDefinition<ConfectSchema>>
      | ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner
      | ConvexQueryCtx<DataModelFromConfectSchema<ConfectSchema>>
    >;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (
    ctx: GenericQueryCtx<DataModelFromConfectSchema<ConfectSchema>>,
    actualArgs: ConvexArgs
  ): Promise<ConvexReturns> => {
    const layers = Layer.mergeAll(
      confectDatabaseReaderLayer(confectSchemaDefinition, ctx.db),
      ConfectAuth.layer(ctx.auth),
      ConfectStorageReader.layer(ctx.storage),
      confectQueryRunnerLayer(ctx.runQuery),
      Layer.succeed(
        ConvexQueryCtx<DataModelFromConfectSchema<ConfectSchema>>(),
        ctx
      )
    );

    return runHandler(args, returns, handler, layers, actualArgs);
  },
});

const confectMutationFunction = <
  ConfectSchema extends GenericConfectSchema,
  ConvexArgs extends DefaultFunctionArgs,
  ConfectArgs,
  ConvexReturns,
  ConfectReturns,
  E,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectArgs
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectDatabaseReader<ConfectSchemaDefinition<ConfectSchema>>
      | ConfectDatabaseWriter<ConfectSchemaDefinition<ConfectSchema>>
      | ConfectAuth
      | ConfectScheduler
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | ConvexMutationCtx<DataModelFromConfectSchema<ConfectSchema>>
    >;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (
    ctx: GenericMutationCtx<DataModelFromConfectSchema<ConfectSchema>>,
    actualArgs: ConvexArgs
  ): Promise<ConvexReturns> => {
    const layers = Layer.mergeAll(
      confectDatabaseReaderLayer(confectSchemaDefinition, ctx.db),
      confectDatabaseWriterLayer(confectSchemaDefinition, ctx.db),
      ConfectAuth.layer(ctx.auth),
      ConfectScheduler.layer(ctx.scheduler),
      ConfectStorageReader.layer(ctx.storage),
      ConfectStorageWriter.layer(ctx.storage),
      confectQueryRunnerLayer(ctx.runQuery),
      confectMutationRunnerLayer(ctx.runMutation),
      Layer.succeed(
        ConvexMutationCtx<DataModelFromConfectSchema<ConfectSchema>>(),
        ctx
      )
    );

    return runHandler(args, returns, handler, layers, actualArgs);
  },
});

const confectActionFunction = <
  ConfectSchema extends GenericConfectSchema,
  ConvexValue extends DefaultFunctionArgs,
  ConfectValue,
  ConvexReturns,
  ConfectReturns,
  E,
>(
  _confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  {
    args,
    returns,
    handler,
  }: {
    args: Schema.Schema<ConfectValue, ConvexValue>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectValue
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | ConfectScheduler
      | ConfectAuth
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectStorageActionWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | ConfectActionRunner
      | ConfectVectorSearch
      | ConvexActionCtx<DataModelFromConfectSchema<ConfectSchema>>
    >;
  }
) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (
    ctx: GenericActionCtx<DataModelFromConfectSchema<ConfectSchema>>,
    actualArgs: ConvexValue
  ): Promise<ConvexReturns> => {
    const layers = Layer.mergeAll(
      ConfectScheduler.layer(ctx.scheduler),
      ConfectAuth.layer(ctx.auth),
      ConfectStorageReader.layer(ctx.storage),
      ConfectStorageWriter.layer(ctx.storage),
      ConfectStorageActionWriter.layer(ctx.storage),
      confectQueryRunnerLayer(ctx.runQuery),
      confectMutationRunnerLayer(ctx.runMutation),
      confectActionRunnerLayer(ctx.runAction),
      confectVectorSearchLayer(ctx.vectorSearch),
      Layer.succeed(
        ConvexActionCtx<DataModelFromConfectSchema<ConfectSchema>>(),
        ctx
      )
    );

    return runHandler(args, returns, handler, layers, actualArgs);
  },
});
