import type {
  Auth,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  Scheduler,
  StorageActionWriter,
  StorageReader,
  StorageWriter
} from "convex/server";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type { DataModelFromConfectSchema, GenericConfectSchema } from "./schema";

/**
 * ConvexQueryCtx - Entry point for query contexts
 *
 * Accepts raw GenericQueryCtx from Convex and provides it to component layers.
 */
export const ConvexQueryCtx = <S extends GenericConfectSchema>() => Context.GenericTag<GenericQueryCtx<DataModelFromConfectSchema<S>>>(
  "@rjdellecese/confect/ConvexQueryCtx"
);

export const layerQueryCtx = <S extends GenericConfectSchema>(
  ctx: GenericQueryCtx<DataModelFromConfectSchema<S>>
) => Layer.succeed(ConvexQueryCtx<S>(), ctx).pipe(
  Layer.merge(Layer.succeed(ConvexAuth, ctx.auth)),
  Layer.merge(Layer.succeed(ConvexStorageReader, ctx.storage)),
  Layer.merge(Layer.succeed(ConvexQueryRunner<S>(), ctx))
)

/**
 * ConvexMutationCtx - Entry point for mutation contexts
 *
 * Accepts raw GenericMutationCtx from Convex and provides it to component layers.
 * Also provides ConvexQueryCtx since mutation contexts extend query contexts.
 */
export const ConvexMutationCtx = <S extends GenericConfectSchema>() => Context.GenericTag<GenericMutationCtx<DataModelFromConfectSchema<S>>>(
  "@rjdellecese/confect/ConvexMutationCtx"
);

export const layerMutationCtx = <S extends GenericConfectSchema>(
  ctx: GenericMutationCtx<DataModelFromConfectSchema<S>>
) => Layer.succeed(ConvexMutationCtx<S>(), ctx).pipe(
  Layer.merge(layerQueryCtx(ctx)),
  Layer.merge(Layer.succeed(ConvexScheduler, ctx.scheduler)),
  Layer.merge(Layer.succeed(ConvexStorageWriter, ctx.storage)),
  Layer.merge(Layer.succeed(ConvexMutationRunner<S>(), ctx))
)
/**
 * ConvexActionCtx - Entry point for action contexts
 *
 * Accepts raw GenericActionCtx from Convex and provides it to component layers.
 */
export const ConvexActionCtx = <S extends GenericConfectSchema>() => Context.GenericTag<GenericActionCtx<DataModelFromConfectSchema<S>>>(
  "@rjdellecese/confect/ConvexActionCtx"
);

export const layerActionCtx = <S extends GenericConfectSchema>(
  ctx: GenericActionCtx<DataModelFromConfectSchema<S>>
) => Layer.succeed(ConvexActionCtx<S>(), ctx).pipe(
  Layer.merge(Layer.succeed(ConvexScheduler, ctx.scheduler)),
  Layer.merge(Layer.succeed(ConvexAuth, ctx.auth)),
  Layer.merge(Layer.succeed(ConvexStorageReader, ctx.storage)),
  Layer.merge(Layer.succeed(ConvexStorageWriter, ctx.storage)),
  Layer.merge(Layer.succeed(ConvexStorageActionWriter, ctx.storage)),
  Layer.merge(Layer.succeed(ConvexVectorSearch<S>(), ctx)),
  Layer.merge(Layer.succeed(ConvexQueryRunner<S>(), ctx)),
  Layer.merge(Layer.succeed(ConvexMutationRunner<S>(), ctx)),
  Layer.merge(Layer.succeed(ConvexActionRunner<S>(), ctx))
)

export const ConvexScheduler = Context.GenericTag<Scheduler>(
  "@rjdellecese/confect/ConvexScheduler"
);

export const ConvexAuth = Context.GenericTag<Auth>(
  "@rjdellecese/confect/ConvexAuth"
);

export const ConvexStorageReader = Context.GenericTag<StorageReader>(
  "@rjdellecese/confect/ConvexStorageReader"
);

export const ConvexStorageWriter = Context.GenericTag<StorageWriter>(
  "@rjdellecese/confect/StorageWriter"
);

export const ConvexStorageActionWriter = Context.GenericTag<StorageActionWriter>(
  "@rjdellecese/confect/StorageActionWriter"
);
export type { Scheduler, Auth, StorageReader, StorageWriter, StorageActionWriter };
// Query Runner
export interface ConvexQueryRunner<S extends GenericConfectSchema> {
  runQuery: GenericQueryCtx<DataModelFromConfectSchema<S>>["runQuery"];
}
export const ConvexQueryRunner = <S extends GenericConfectSchema>() =>
  Context.GenericTag<ConvexQueryRunner<S>>("@rjdellecese/confect/ConvexQueryRunner");

// Mutation Runner
export interface ConvexMutationRunner<S extends GenericConfectSchema> {
  runMutation: GenericMutationCtx<DataModelFromConfectSchema<S>>["runMutation"];
}
export const ConvexMutationRunner = <S extends GenericConfectSchema>() =>
  Context.GenericTag<ConvexMutationRunner<S>>("@rjdellecese/confect/ConvexMutationRunner");

// Action Runner
export interface ConvexActionRunner<S extends GenericConfectSchema> {
  runAction: GenericActionCtx<DataModelFromConfectSchema<S>>["runAction"];
}

export interface ConvexVectorSearch<S extends GenericConfectSchema> {
  vectorSearch: GenericActionCtx<DataModelFromConfectSchema<S>>["vectorSearch"];
}

export const ConvexActionRunner = <S extends GenericConfectSchema>() =>
  Context.GenericTag<ConvexActionRunner<S>>("@rjdellecese/confect/ConvexActionRunner");

export const ConvexVectorSearch = <S extends GenericConfectSchema>() =>
  Context.GenericTag<ConvexVectorSearch<S>>("@rjdellecese/confect/ConvexVectorSearchRunner");

