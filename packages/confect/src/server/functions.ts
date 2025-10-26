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

import { ConfectAuth } from "./auth";
import { ConvexActionCtx, ConvexMutationCtx, ConvexQueryCtx } from "./ctx";
import type { DataModelFromConfectDataModel } from "./data_model";
import {
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
} from "./database";
import {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
} from "./runners";
import { ConfectScheduler } from "./scheduler";
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
} from "./storage";
import { ConfectVectorSearch } from "./vector_search";

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
      | ConfectDatabaseReader
      | ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner
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
      | ConfectDatabaseReader
      | ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner
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
      | ConfectDatabaseReader
      | ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner
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
            ConfectDatabaseReader.layer(confectSchemaDefinition, ctx.db),
            ConfectAuth.layer(ctx.auth),
            ConfectStorageReader.layer(ctx.storage),
            ConfectQueryRunner.layer(ctx.runQuery),
            ConvexQueryCtx.layer(ctx)
          )
        ),
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
      | ConfectDatabaseReader
      | ConfectDatabaseWriter
      | ConfectAuth
      | ConfectScheduler
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
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
      | ConfectDatabaseReader
      | ConfectDatabaseWriter
      | ConfectAuth
      | ConfectScheduler
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
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
      | ConfectDatabaseReader
      | ConfectDatabaseWriter
      | ConfectAuth
      | ConfectScheduler
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
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
                ConfectDatabaseReader.layer(confectSchemaDefinition, ctx.db),
                ConfectDatabaseWriter.layer(confectSchemaDefinition, ctx.db),
                ConfectAuth.layer(ctx.auth),
                ConfectScheduler.layer(ctx.scheduler),
                ConfectStorageReader.layer(ctx.storage),
                ConfectStorageWriter.layer(ctx.storage),
                ConfectQueryRunner.layer(ctx.runQuery),
                ConfectMutationRunner.layer(ctx.runMutation),
                ConvexMutationCtx.layer(ctx)
              )
            )
          )
        ),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns)
        ),
        Effect.runPromise
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
      | ConfectScheduler
      | ConfectAuth
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectStorageActionWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | ConfectActionRunner
      | ConfectVectorSearch
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
      | ConfectScheduler
      | ConfectAuth
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectStorageActionWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | ConfectActionRunner
      | ConfectVectorSearch
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
      | ConfectScheduler
      | ConfectAuth
      | ConfectStorageReader
      | ConfectStorageWriter
      | ConfectStorageActionWriter
      | ConfectQueryRunner
      | ConfectMutationRunner
      | ConfectActionRunner
      | ConfectVectorSearch
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
                ConfectScheduler.layer(ctx.scheduler),
                ConfectAuth.layer(ctx.auth),
                ConfectStorageReader.layer(ctx.storage),
                ConfectStorageWriter.layer(ctx.storage),
                ConfectStorageActionWriter.layer(ctx.storage),
                ConfectQueryRunner.layer(ctx.runQuery),
                ConfectMutationRunner.layer(ctx.runMutation),
                ConfectActionRunner.layer(ctx.runAction),
                ConfectVectorSearch.layer(ctx.vectorSearch),
                ConvexActionCtx.layer(ctx)
              )
            )
          )
        ),
        Effect.andThen((convexReturns) =>
          Schema.encodeUnknown(returns)(convexReturns)
        ),
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
