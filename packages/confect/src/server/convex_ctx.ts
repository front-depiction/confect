import type {
  Auth,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  NamedTableInfo,
  Scheduler,
  StorageActionWriter,
  StorageReader,
  StorageWriter,
  VectorIndexNames,
  VectorSearch,
} from "convex/server";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import type { DataModelFromConfectSchema, GenericConfectSchema } from "./schema";
import { TableInfoFromSchema, TableNamesFromSchema } from "./data_model";
import { TableNames } from "../../test/convex/_generated/dataModel";

/**
 * ConvexQueryCtx - Entry point for query contexts
 *
 * Accepts raw GenericQueryCtx from Convex and provides it to component layers.
 */
export const ConvexQueryCtx = Context.GenericTag<GenericQueryCtx<any>>(
  "@rjdellecese/confect/ConvexQueryCtx"
);

export const layerQueryCtx = <S extends GenericConfectSchema>(
  ctx: GenericQueryCtx<DataModelFromConfectSchema<S>>
) => Layer.succeed(ConvexQueryCtx, ctx).pipe(
  Layer.merge(Layer.succeed(ConvexAuth, ctx.auth)),
  Layer.merge(Layer.succeed(ConvexStorageReader, ctx.storage))
)

/**
 * ConvexMutationCtx - Entry point for mutation contexts
 *
 * Accepts raw GenericMutationCtx from Convex and provides it to component layers.
 * Also provides ConvexQueryCtx since mutation contexts extend query contexts.
 */
export const ConvexMutationCtx = Context.GenericTag<GenericMutationCtx<any>>(
  "@rjdellecese/confect/ConvexMutationCtx"
);

export const layerMutationCtx = <S extends GenericConfectSchema>(
  ctx: GenericMutationCtx<DataModelFromConfectSchema<S>>
) => Layer.succeed(ConvexMutationCtx, ctx).pipe(
  Layer.merge(layerQueryCtx(ctx)),
  Layer.merge(Layer.succeed(ConvexScheduler, ctx.scheduler)),
  Layer.merge(Layer.succeed(ConvexStorageWriter, ctx.storage))
)
/**
 * ConvexActionCtx - Entry point for action contexts
 *
 * Accepts raw GenericActionCtx from Convex and provides it to component layers.
 */
export const ConvexActionCtx = Context.GenericTag<GenericActionCtx<any>>(
  "@rjdellecese/confect/ConvexActionCtx"
);

export const layerActionCtx = <S extends GenericConfectSchema, DM extends GenericActionCtx<DataModelFromConfectSchema<S>>>(
  ctx: DM
) => Layer.succeed(ConvexActionCtx, ctx).pipe(
  Layer.merge(Layer.succeed(ConvexScheduler, ctx.scheduler)),
  Layer.merge(Layer.succeed(ConvexAuth, ctx.auth)),
  Layer.merge(Layer.succeed(ConvexStorageActionWriter, ctx.storage)),
  Layer.merge(Layer.succeed(ConvexVectorSearch<S>(), ctx))
)

export const ConvexScheduler = Context.GenericTag<Scheduler>(
  "@rjdellecese/confect/ConvexScheduler"
);
export const ConvexAuth = Context.GenericTag<Auth>(
  "@rjdellecese/confect/ConvexAuth"
);
export const ConvexStorageReader = Context.GenericTag<StorageReader>(
  "@rjdellecese/confect/ConvexStorageReader"
)
export const ConvexStorageWriter = Context.GenericTag<StorageWriter>(
  "@rjdellecese/confect/ConvexStorageWriter"
)
export const ConvexStorageActionWriter = Context.GenericTag<StorageActionWriter>(
  "@rjdellecese/confect/StorageActionWriter"
)

interface ConvexVectorSearch<S extends GenericConfectSchema> {
  vectorSearch: GenericActionCtx<DataModelFromConfectSchema<S>>["vectorSearch"]
}
export const ConvexVectorSearch = <S extends GenericConfectSchema>() => Context.GenericTag<ConvexVectorSearch<S>>(
  "@rjdellecese/confect/StorageAciwctionWriter"
)

