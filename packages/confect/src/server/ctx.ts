/**
 * Convex Context Services (Internal)
 *
 * These are internal-only tags used by the API builder.
 * Users should use capability services (QueryDB, MutationDB, Auth, etc.) instead.
 *
 * Design decisions:
 * - Context tags are internal implementation details
 * - Backward compatibility layers use Layer.effect to compose capabilities
 * - Users work with high-level capability services, not raw contexts
 */

import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import { Context, Effect, Layer } from "effect";
import { QueryDB, MutationDB } from "./database";
import { ConfectAuth } from "./auth";
import { ConfectStorageReader, ConfectStorageWriter } from "./storage";
import { ConfectScheduler } from "./scheduler";
import { ConfectQueryRunner, ConfectMutationRunner } from "./runners";

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

// ===========================
// Backward Compatibility Layers
// ===========================

/**
 * @deprecated Use capability services (QueryDB, Auth, etc.) directly instead of ConvexQueryCtx
 *
 * Backward compatibility layer that provides ConvexQueryCtx by composing capability services.
 * This allows gradual migration from raw context to capability-based design.
 *
 * @example
 * ```typescript
 * // Old way (deprecated)
 * const ctx = yield* ConvexQueryCtx;
 * const doc = await ctx.db.get(id);
 *
 * // New way (preferred)
 * const db = yield* QueryDB;
 * const doc = yield* db.get("tableName", id);
 * ```
 */
export const layerConvexQueryCtxCompat = Layer.effect(
  ConvexQueryCtx,
  Effect.gen(function* () {
    const db = yield* QueryDB;
    const auth = yield* ConfectAuth;
    const storage = yield* ConfectStorageReader;
    const runQuery = yield* ConfectQueryRunner;

    return {
      db,
      auth,
      storage,
      runQuery,
    } as unknown as GenericQueryCtx<GenericDataModel>;
  }),
);

/**
 * @deprecated Use capability services (MutationDB, Auth, etc.) directly instead of ConvexMutationCtx
 *
 * Backward compatibility layer that provides ConvexMutationCtx by composing capability services.
 * This allows gradual migration from raw context to capability-based design.
 *
 * @example
 * ```typescript
 * // Old way (deprecated)
 * const ctx = yield* ConvexMutationCtx;
 * await ctx.db.insert("table", doc);
 *
 * // New way (preferred)
 * const db = yield* MutationDB;
 * yield* db.insert("table", doc);
 * ```
 */
export const layerConvexMutationCtxCompat = Layer.effect(
  ConvexMutationCtx,
  Effect.gen(function* () {
    const db = yield* MutationDB;
    const auth = yield* ConfectAuth;
    const storage = yield* ConfectStorageWriter;
    const scheduler = yield* ConfectScheduler;
    const runQuery = yield* ConfectQueryRunner;
    const runMutation = yield* ConfectMutationRunner;

    return {
      db,
      auth,
      storage,
      scheduler,
      runQuery,
      runMutation,
    } as unknown as GenericMutationCtx<GenericDataModel>;
  }),
);
