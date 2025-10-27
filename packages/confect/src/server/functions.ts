import {
  actionGeneric,
  type DefaultFunctionArgs,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
  type RegisteredAction,
  type RegisteredMutation,
  type RegisteredQuery,
} from "convex/server";
import { Effect, Layer, pipe, Schema } from "effect";

import { ConfectAuth, layer as layerAuth } from "./auth";
import {
  ConvexActionCtx,
  ConvexMutationCtx,
  ConvexQueryCtx,
  layerActionCtx,
  layerMutationCtx,
  layerQueryCtx,
} from "./ctx";
import type { DataModelFromConfectDataModel } from "./data_model";
import {
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
  layerDatabaseReader,
  layerDatabaseWriter,
} from "./database";
import {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
  layerActionRunner,
  layerMutationRunner,
  layerQueryRunner,
} from "./runners";
import { ConfectScheduler, layer as layerScheduler } from "./scheduler";
import type {
  ConfectDataModelFromConfectSchema,
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "./schema";
import { compileArgsSchema, compileReturnsSchema } from "./schema_to_validator";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
  layerStorageActionWriter,
  layerStorageReader,
  layerStorageWriter,
} from "./storage";
import { ConfectVectorSearch, layer as layerVectorSearch } from "./vector_search";

export const makeConfectFunctions = <
  ConfectSchema extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>
) => {
  type ConfectDataModel = ConfectDataModelFromConfectSchema<ConfectSchema>;
  type DataModel = DataModelFromConfectDataModel<ConfectDataModel>;

  const confectQuery = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
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
      | typeof ConfectDatabaseReader
      | typeof ConfectAuth
      | typeof ConfectStorageReader
      | typeof ConfectQueryRunner
      | typeof ConvexQueryCtx
    >;
  }): RegisteredQuery<"public", ConvexArgs, Promise<ConvexReturns>> =>
    queryGeneric(confectQueryFunction({ args, returns, handler }));

  const confectInternalQuery = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
    args,
    handler,
    returns,
  }: {
    args: Schema.Schema<ConfectArgs, ConvexArgs>;
    returns: Schema.Schema<ConfectReturns, ConvexReturns>;
    handler: (
      a: ConfectArgs
    ) => Effect.Effect<
      ConfectReturns,
      E,
      | typeof ConfectDatabaseReader
      | typeof ConfectAuth
      | typeof ConfectStorageReader
      | typeof ConfectQueryRunner
      | typeof ConvexQueryCtx
    >;
  }): RegisteredQuery<"internal", ConvexArgs, Promise<ConvexReturns>> =>
    internalQueryGeneric(confectQueryFunction({ args, returns, handler }));

  const confectQueryFunction = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
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
      | typeof ConfectDatabaseReader
      | typeof ConfectAuth
      | typeof ConfectStorageReader
      | typeof ConfectQueryRunner
      | typeof ConvexQueryCtx
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericQueryCtx<DataModel>,
      actualArgs: ConvexArgs
    ): Promise<ConvexReturns> =>
      pipe(
        actualArgs,
        Schema.decode(args),
        Effect.orDie,
        Effect.andThen((decodedArgs) => handler(decodedArgs)),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns)
        ),
        Effect.provide(
          Layer.mergeAll(
            layerDatabaseReader(confectSchemaDefinition, ctx.db),
            layerAuth(ctx.auth),
            layerStorageReader(ctx.storage),
            layerQueryRunner(ctx.runQuery),
            layerQueryCtx(ctx)
          )
        ) as Effect.Effect<ConvexReturns, ParseResult.ParseError | E, never>,
        Effect.runPromise
      ),
  });

  const confectMutation = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
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
      | typeof ConfectDatabaseReader
      | typeof ConfectDatabaseWriter
      | typeof ConfectAuth
      | typeof ConfectScheduler
      | typeof ConfectStorageReader
      | typeof ConfectStorageWriter
      | typeof ConfectQueryRunner
      | typeof ConfectMutationRunner
      | typeof ConvexMutationCtx
    >;
  }): RegisteredMutation<"public", ConvexValue, Promise<ConvexReturns>> =>
    mutationGeneric(confectMutationFunction({ args, returns, handler }));

  const confectInternalMutation = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
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
      | typeof ConfectDatabaseReader
      | typeof ConfectDatabaseWriter
      | typeof ConfectAuth
      | typeof ConfectScheduler
      | typeof ConfectStorageReader
      | typeof ConfectStorageWriter
      | typeof ConfectQueryRunner
      | typeof ConfectMutationRunner
      | typeof ConvexMutationCtx
    >;
  }): RegisteredMutation<"internal", ConvexValue, Promise<ConvexReturns>> =>
    internalMutationGeneric(
      confectMutationFunction({ args, returns, handler })
    );

  const confectMutationFunction = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
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
      | typeof ConfectDatabaseReader
      | typeof ConfectDatabaseWriter
      | typeof ConfectAuth
      | typeof ConfectScheduler
      | typeof ConfectStorageReader
      | typeof ConfectStorageWriter
      | typeof ConfectQueryRunner
      | typeof ConfectMutationRunner
      | typeof ConvexMutationCtx
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericMutationCtx<DataModel>,
      actualArgs: ConvexArgs
    ): Promise<ConvexReturns> =>
      pipe(
        actualArgs,
        Schema.decode(args),
        Effect.orDie,
        Effect.andThen((decodedArgs) =>
          pipe(
            handler(decodedArgs),
            Effect.provide(
              Layer.mergeAll(
                layerDatabaseReader(confectSchemaDefinition, ctx.db),
                layerDatabaseWriter(confectSchemaDefinition, ctx.db),
                layerAuth(ctx.auth),
                layerScheduler(ctx.scheduler),
                layerStorageReader(ctx.storage),
                layerStorageWriter(ctx.storage),
                layerQueryRunner(ctx.runQuery),
                layerMutationRunner(ctx.runMutation),
                layerMutationCtx(ctx)
              )
            )
          )
        ),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns)
        ),
        Effect.runPromise as any
      ),
  });

  const confectAction = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
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
      | typeof ConfectScheduler
      | typeof ConfectAuth
      | typeof ConfectStorageReader
      | typeof ConfectStorageWriter
      | typeof ConfectStorageActionWriter
      | typeof ConfectQueryRunner
      | typeof ConfectMutationRunner
      | typeof ConfectActionRunner
      | typeof ConfectVectorSearch
      | typeof ConvexActionCtx
    >;
  }): RegisteredAction<"public", ConvexValue, Promise<ConvexReturns>> =>
    actionGeneric(confectActionFunction({ args, returns, handler }));

  const confectInternalAction = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
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
      | typeof ConfectScheduler
      | typeof ConfectAuth
      | typeof ConfectStorageReader
      | typeof ConfectStorageWriter
      | typeof ConfectStorageActionWriter
      | typeof ConfectQueryRunner
      | typeof ConfectMutationRunner
      | typeof ConfectActionRunner
      | typeof ConfectVectorSearch
      | typeof ConvexActionCtx
    >;
  }): RegisteredAction<"internal", ConvexValue, Promise<ConvexReturns>> =>
    internalActionGeneric(confectActionFunction({ args, returns, handler }));

  const confectActionFunction = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >({
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
      | typeof ConfectScheduler
      | typeof ConfectAuth
      | typeof ConfectStorageReader
      | typeof ConfectStorageWriter
      | typeof ConfectStorageActionWriter
      | typeof ConfectQueryRunner
      | typeof ConfectMutationRunner
      | typeof ConfectActionRunner
      | typeof ConfectVectorSearch
      | typeof ConvexActionCtx
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericActionCtx<DataModel>,
      actualArgs: ConvexValue
    ): Promise<ConvexReturns> =>
      pipe(
        actualArgs,
        Schema.decode(args),
        Effect.orDie,
        Effect.andThen((decodedArgs) =>
          pipe(
            handler(decodedArgs),
            Effect.provide(
              Layer.mergeAll(
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
              )
            )
          )
        ),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns)
        ) as Effect.Effect<ConvexReturns, ParseResult.ParseError | E, never>,
        Effect.runPromise
      ),
  });

  return {
    confectQuery,
    confectInternalQuery,
    confectMutation,
    confectInternalMutation,
    confectAction,
    confectInternalAction,
    ConfectDatabaseReader,
    ConfectDatabaseWriter,
  };
};
