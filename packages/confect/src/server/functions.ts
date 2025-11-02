import {
  actionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
  type DefaultFunctionArgs,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type RegisteredAction,
  type RegisteredMutation,
  type RegisteredQuery,
} from "convex/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { ConfectAuth } from "./auth";

import { layerActionCtx, layerMutationCtx, layerQueryCtx } from "./convex_ctx";
import { MutationDB, QueryDB } from "./database";
import {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
} from "./runners";
import { ConfectScheduler } from "./scheduler";
import {
  layerConfectSchemaDefinition,
  type ConfectSchemaDefinition,
  type GenericConfectSchema,
} from "./schema";
import { compileArgsSchema, compileReturnsSchema } from "./schema_to_validator";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "./storage";
import { ConfectVectorSearch } from "./vector_search";
import { ConfectQueryCtx } from "./ctx";

export const makeConfectFunctions = <
  ConfectSchema extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>
) => {

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
      | QueryDB
      | typeof ConfectAuth
      | typeof ConfectStorageReader
      | typeof ConfectQueryRunner
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
      | QueryDBTag
      | typeof ConfectAuth
      | typeof ConfectStorageReader
      | typeof ConfectQueryRunner
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
      | ConfectQueryCtx
      | QueryDB
      | ConfectAuth
      | ConfectStorageReader
      | ConfectQueryRunner
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericQueryCtx<any>,
      actualArgs: ConvexArgs
    ): Promise<ConvexReturns> => {

      const layers = Layer.mergeAll(
        ConfectQueryCtx.TypedDefault<ConfectSchema>(),
        QueryDB.TypedDefault<ConfectSchema>(),
        ConfectQueryRunner.TypedDefault<ConfectSchema>(),
        ConfectAuth.Default,
        ConfectStorageReader.Default,
      ).pipe(
        Layer.provideMerge(layerQueryCtx(ctx)),
        Layer.provideMerge(layerConfectSchemaDefinition(confectSchemaDefinition))
      );

      return Schema.decode(args)(actualArgs).pipe(
        Effect.orDie,
        Effect.flatMap(handler),
        Effect.provide(layers),
        Effect.flatMap(Schema.encodeUnknown(returns)),
        Effect.runPromise
      );
    },
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
      | QueryDBTag
      | MutationDBTag
      | typeof ConfectAuth
      | typeof ConfectScheduler
      | typeof ConfectStorageReader
      | typeof ConfectStorageWriter
      | typeof ConfectQueryRunner
      | typeof ConfectMutationRunner
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
      | QueryDBTag
      | MutationDBTag
      | typeof ConfectAuth
      | typeof ConfectScheduler
      | typeof ConfectStorageReader
      | typeof ConfectStorageWriter
      | typeof ConfectQueryRunner
      | typeof ConfectMutationRunner
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
      | QueryDBTag
      | MutationDBTag
      | typeof ConfectAuth
      | typeof ConfectScheduler
      | typeof ConfectStorageReader
      | typeof ConfectStorageWriter
      | typeof ConfectQueryRunner
      | typeof ConfectMutationRunner
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericMutationCtx<any>,
      actualArgs: ConvexArgs
    ): Promise<ConvexReturns> => {
      const baseLayers = Layer.mergeAll(
        layerMutationCtx(ctx),
        confectSchemaDefin(confectSchemaDefinition)
      );
      const serviceLayers = Layer.mergeAll(
        QueryDB.TypedDefault<ConfectSchema>(),
        MutationDB.TypedDefault<ConfectSchema>(),
        ConfectAuth.Default,
        ConfectScheduler.Default,
        ConfectStorageReader.Default,
        ConfectStorageWriter.Default,
        ConfectQueryRunner.TypedDefault<ConfectSchema>(),
        ConfectMutationRunner.Default
      );
      const allLayers = Layer.provide(serviceLayers, baseLayers);

      return Schema.decode(args)(actualArgs).pipe(
        Effect.orDie,
        Effect.flatMap(handler),
        Effect.provide(allLayers),
        Effect.flatMap(Schema.encodeUnknown(returns)),
        Effect.runPromise
      );
    },
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
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericActionCtx<any>,
      actualArgs: ConvexValue
    ): Promise<ConvexReturns> => {
      const baseLayers = layerActionCtx(ctx);
      const serviceLayers = Layer.mergeAll(
        ConfectAuth.Default,
        ConfectScheduler.Default,
        ConfectStorageReader.Default,
        ConfectStorageWriter.Default,
        ConfectStorageActionWriter.Default,
        ConfectQueryRunner.TypedDefault<ConfectSchema>(),
        ConfectMutationRunner.Default,
        ConfectActionRunner.Default,
        ConfectVectorSearch.Default
      );
      const allLayers = Layer.provide(serviceLayers, baseLayers);

      return Schema.decode(args)(actualArgs).pipe(
        Effect.orDie,
        Effect.flatMap(handler),
        Effect.provide(allLayers),
        Effect.flatMap(Schema.encodeUnknown(returns)),
        Effect.runPromise
      );
    },
  });

  return {
    confectQuery,
    confectInternalQuery,
    confectMutation,
    confectInternalMutation,
    confectAction,
    confectInternalAction,
    QueryDB,
    MutationDB,
  };
};
