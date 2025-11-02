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
  type DataModelFromConfectSchema,
  type GenericConfectSchema,
} from "./schema";
import { compileArgsSchema, compileReturnsSchema } from "./schema_to_validator";
import {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "./storage";
import { ConfectVectorSearch } from "./vector_search";
import { ConfectActionCtx, ConfectMutationCtx, ConfectQueryCtx } from "./ctx";

// Requirement type aliases
type QueryR =
  | ConfectQueryCtx
  | QueryDB
  | ConfectAuth
  | ConfectStorageReader
  | ConfectQueryRunner;

type MutationR =
  | QueryR
  | ConfectMutationCtx
  | MutationDB
  | ConfectScheduler
  | ConfectStorageWriter
  | ConfectMutationRunner;

type ActionR =
  | ConfectActionCtx
  | ConfectScheduler
  | ConfectAuth
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectStorageActionWriter
  | ConfectQueryRunner
  | ConfectMutationRunner
  | ConfectActionRunner
  | ConfectVectorSearch;

// Handler type aliases
type ConfectQueryHandler<ConfectArgs, ConfectReturns, E> = (
  a: ConfectArgs
) => Effect.Effect<ConfectReturns, E, QueryR>;

type ConfectMutationHandler<ConfectArgs, ConfectReturns, E> = (
  a: ConfectArgs
) => Effect.Effect<ConfectReturns, E, MutationR>;

type ConfectActionHandler<ConfectArgs, ConfectReturns, E> = (
  a: ConfectArgs
) => Effect.Effect<ConfectReturns, E, ActionR>;

// Function configuration type aliases
type ConfectQueryConfig<
  ConvexArgs extends DefaultFunctionArgs,
  ConfectArgs,
  ConvexReturns,
  ConfectReturns,
  E,
> = {
  args: Schema.Schema<ConfectArgs, ConvexArgs>;
  returns: Schema.Schema<ConfectReturns, ConvexReturns>;
  handler: ConfectQueryHandler<ConfectArgs, ConfectReturns, E>;
};

type ConfectMutationConfig<
  ConvexArgs extends DefaultFunctionArgs,
  ConfectArgs,
  ConvexReturns,
  ConfectReturns,
  E,
> = {
  args: Schema.Schema<ConfectArgs, ConvexArgs>;
  returns: Schema.Schema<ConfectReturns, ConvexReturns>;
  handler: ConfectMutationHandler<ConfectArgs, ConfectReturns, E>;
};

type ConfectActionConfig<
  ConvexArgs extends DefaultFunctionArgs,
  ConfectArgs,
  ConvexReturns,
  ConfectReturns,
  E,
> = {
  args: Schema.Schema<ConfectArgs, ConvexArgs>;
  returns: Schema.Schema<ConfectReturns, ConvexReturns>;
  handler: ConfectActionHandler<ConfectArgs, ConfectReturns, E>;
};

export const makeConfectFunctions = <
  ConfectSchema extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>
) => {

  const makeQueryLayers = (ctx: GenericQueryCtx<DataModelFromConfectSchema<ConfectSchema>>) =>
    Layer.mergeAll(
      ConfectQueryCtx.TypedDefault<ConfectSchema>(),
      QueryDB.TypedDefault<ConfectSchema>(),
      ConfectQueryRunner.TypedDefault<ConfectSchema>(),
      ConfectAuth.Default,
      ConfectStorageReader.Default,
    ).pipe(
      Layer.provide(layerQueryCtx<ConfectSchema>(ctx)),
      Layer.provide(layerConfectSchemaDefinition(confectSchemaDefinition))
    );

  const makeMutationLayers = (ctx: GenericMutationCtx<DataModelFromConfectSchema<ConfectSchema>>) =>
    Layer.mergeAll(
      ConfectQueryCtx.TypedDefault<ConfectSchema>(),
      ConfectMutationCtx.TypedDefault<ConfectSchema>(),
      QueryDB.TypedDefault<ConfectSchema>(),
      MutationDB.TypedDefault<ConfectSchema>(),
      ConfectQueryRunner.TypedDefault<ConfectSchema>(),
      ConfectMutationRunner.Default,
      ConfectAuth.Default,
      ConfectScheduler.Default,
      ConfectStorageReader.Default,
      ConfectStorageWriter.Default,
    ).pipe(
      Layer.provide(layerMutationCtx<ConfectSchema>(ctx)),
      Layer.provide(layerConfectSchemaDefinition(confectSchemaDefinition))
    );

  const makeActionLayers = (ctx: GenericActionCtx<DataModelFromConfectSchema<ConfectSchema>>) =>
    Layer.mergeAll(
      ConfectActionCtx.TypedDefault<ConfectSchema>(),
      ConfectQueryRunner.TypedDefault<ConfectSchema>(),
      ConfectMutationRunner.Default,
      ConfectActionRunner.Default,
      ConfectAuth.Default,
      ConfectScheduler.Default,
      ConfectStorageReader.Default,
      ConfectStorageWriter.Default,
      ConfectStorageActionWriter.Default,
      ConfectVectorSearch.Default,
    ).pipe(
      Layer.provide(layerActionCtx<ConfectSchema>(ctx)),
      Layer.provide(layerConfectSchemaDefinition(confectSchemaDefinition))
    );

  const confectQuery = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    E,
  >(
    config: ConfectQueryConfig<ConvexArgs, ConfectArgs, ConvexReturns, ConfectReturns, E>
  ): RegisteredQuery<"public", ConvexArgs, Promise<ConvexReturns>> =>
    queryGeneric(confectQueryFunction(config));

  const confectInternalQuery = <
    ConvexArgs extends DefaultFunctionArgs,
    ConfectArgs,
    ConvexReturns,
    ConfectReturns,
    E,
  >(
    config: ConfectQueryConfig<ConvexArgs, ConfectArgs, ConvexReturns, ConfectReturns, E>
  ): RegisteredQuery<"internal", ConvexArgs, Promise<ConvexReturns>> =>
    internalQueryGeneric(confectQueryFunction(config));

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
  }: ConfectQueryConfig<ConvexArgs, ConfectArgs, ConvexReturns, ConfectReturns, E>) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericQueryCtx<DataModelFromConfectSchema<ConfectSchema>>,
      actualArgs: ConvexArgs
    ): Promise<ConvexReturns> => {
      const layers = makeQueryLayers(ctx);

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
  >(
    config: ConfectMutationConfig<ConvexValue, ConfectValue, ConvexReturns, ConfectReturns, E>
  ): RegisteredMutation<"public", ConvexValue, Promise<ConvexReturns>> =>
    mutationGeneric(confectMutationFunction(config));

  const confectInternalMutation = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >(
    config: ConfectMutationConfig<ConvexValue, ConfectValue, ConvexReturns, ConfectReturns, E>
  ): RegisteredMutation<"internal", ConvexValue, Promise<ConvexReturns>> =>
    internalMutationGeneric(confectMutationFunction(config));

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
  }: ConfectMutationConfig<ConvexArgs, ConfectArgs, ConvexReturns, ConfectReturns, E>) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericMutationCtx<DataModelFromConfectSchema<ConfectSchema>>,
      actualArgs: ConvexArgs
    ): Promise<ConvexReturns> => {
      const layers = makeMutationLayers(ctx);

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
  >(
    config: ConfectActionConfig<ConvexValue, ConfectValue, ConvexReturns, ConfectReturns, E>
  ): RegisteredAction<"public", ConvexValue, Promise<ConvexReturns>> =>
    actionGeneric(confectActionFunction(config));

  const confectInternalAction = <
    ConvexValue extends DefaultFunctionArgs,
    ConfectValue,
    ConvexReturns,
    ConfectReturns,
    E,
  >(
    config: ConfectActionConfig<ConvexValue, ConfectValue, ConvexReturns, ConfectReturns, E>
  ): RegisteredAction<"internal", ConvexValue, Promise<ConvexReturns>> =>
    internalActionGeneric(confectActionFunction(config));

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
  }: ConfectActionConfig<ConvexValue, ConfectValue, ConvexReturns, ConfectReturns, E>) => ({
    args: compileArgsSchema(args),
    returns: compileReturnsSchema(returns),
    handler: (
      ctx: GenericActionCtx<DataModelFromConfectSchema<ConfectSchema>>,
      actualArgs: ConvexValue
    ): Promise<ConvexReturns> => {
      const layers = makeActionLayers(ctx);

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
