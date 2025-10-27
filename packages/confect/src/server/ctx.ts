/**
 * Convex Context Services
 *
 * Provides access to raw Convex context objects within Effect programs.
 *
 * Design decisions:
 * - Simple wrapper services - no transformation of Convex APIs
 * - Separate tag for each context type (Query, Mutation, Action)
 * - Allows access to raw Convex context when needed
 * - No TypeId needed - these are pass-through services
 */

import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { Context, Layer } from "effect";

// ===========================
// ConvexQueryCtx
// ===========================

export const ConvexQueryCtx = Context.GenericTag<GenericQueryCtx<GenericDataModel>>(
  "@rjdellecese/confect/ConvexQueryCtx",
);

export const layerQueryCtx = <DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
): Layer.Layer<GenericQueryCtx<GenericDataModel>> =>
  Layer.succeed(ConvexQueryCtx, ctx as unknown as GenericQueryCtx<GenericDataModel>);

// ===========================
// ConvexMutationCtx
// ===========================

export const ConvexMutationCtx = Context.GenericTag<GenericMutationCtx<GenericDataModel>>(
  "@rjdellecese/confect/ConvexMutationCtx",
);

export const layerMutationCtx = <DataModel extends GenericDataModel>(
  ctx: GenericMutationCtx<DataModel>,
): Layer.Layer<GenericMutationCtx<GenericDataModel>> =>
  Layer.succeed(ConvexMutationCtx, ctx as unknown as GenericMutationCtx<GenericDataModel>);

// ===========================
// ConvexActionCtx
// ===========================

export const ConvexActionCtx = Context.GenericTag<GenericActionCtx<GenericDataModel>>(
  "@rjdellecese/confect/ConvexActionCtx",
);

export const layerActionCtx = <DataModel extends GenericDataModel>(
  ctx: GenericActionCtx<DataModel>,
): Layer.Layer<GenericActionCtx<GenericDataModel>> =>
  Layer.succeed(ConvexActionCtx, ctx as unknown as GenericActionCtx<GenericDataModel>);
