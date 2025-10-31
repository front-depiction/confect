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
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { ConfectAuth, layer as layerAuth } from "./auth";
import {
  layerActionCtx,
  layerMutationCtx,
  layerQueryCtx,
} from "./ctx";
import {
  QueryDB,
  MutationDB,
  layerQueryDB,
  layerMutationDB,
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
  type QueryDBTag = ReturnType<typeof QueryDB<ConfectSchema>>;
  type MutationDBTag = ReturnType<typeof MutationDB<ConfectSchema>>;

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
      | QueryDBTag
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
      | QueryDBTag
      | typeof ConfectAuth
      | typeof ConfectStorageReader
      | typeof ConfectQueryRunner
    >;
  }) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericQueryCtx<any>,
      actualArgs: ConvexArgs
    ): Promise<ConvexReturns> => {
      const layers: Layer.Layer<any> = Layer.mergeAll(
        layerQueryDB<ConfectSchema>(confectSchemaDefinition, ctx.db),
        layerAuth(ctx.auth),
        layerStorageReader(ctx.storage),
        layerQueryRunner(ctx.runQuery),
        layerQueryCtx(ctx)
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
      const layers: Layer.Layer<any> = Layer.mergeAll(
        layerQueryDB<ConfectSchema>(confectSchemaDefinition, ctx.db),
        layerMutationDB<ConfectSchema>(confectSchemaDefinition, ctx.db),
        layerAuth(ctx.auth),
        layerScheduler(ctx.scheduler),
        layerStorageReader(ctx.storage),
        layerStorageWriter(ctx.storage),
        layerQueryRunner(ctx.runQuery),
        layerMutationRunner(ctx.runMutation),
        layerMutationCtx(ctx)
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
      const layers: Layer.Layer<any> = Layer.mergeAll(
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
      return Schema.decode(args)(actualArgs).pipe(
        Effect.orDie,
        Effect.flatMap(handler),
        Effect.provide(layers),
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
