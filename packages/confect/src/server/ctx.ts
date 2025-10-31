/**
 * Convex Context Services
 *
 * Provides convenience context objects that aggregate capability services.
 *
 * Design decisions:
 * - Context services are built from capability services using Layer.effect
 * - Users can choose between direct capability access or context objects
 * - Contexts provide familiar Convex API shape with { db, auth, storage, ... }
 */

import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ConfectAuth } from "./auth";
import { MutationDB, QueryDB } from "./database";
import { ConfectMutationRunner, ConfectQueryRunner } from "./runners";
import { ConfectScheduler } from "./scheduler";
import { ConfectStorageReader, ConfectStorageWriter } from "./storage";

// ===========================
// ConfectQueryCtx
// ===========================

/**
 * Query context that aggregates read-only capability services.
 * Provides familiar Convex context shape.
 */
export interface ConfectQueryCtx {
  readonly db: QueryDB;
  readonly auth: ConfectAuth;
  readonly storage: ConfectStorageReader;
  readonly runQuery: ConfectQueryRunner;
}

const ConfectQueryCtx = Context.GenericTag<ConfectQueryCtx>(
  "@rjdellecese/confect/ConfectQueryCtx",
);

/**
 * Build ConfectQueryCtx from capability services using Layer.effect.
 */
export const layerConfectQueryCtx = Layer.effect(
  ConfectQueryCtx,
  Effect.gen(function* () {
    const db = yield* QueryDB;
    const auth = yield* ConfectAuth;
    const storage = yield* ConfectStorageReader;
    const runQuery = yield* ConfectQueryRunner;

    return ConfectQueryCtx.of({
      db,
      auth,
      storage,
      runQuery,
    });
  }),
);

// ===========================
// ConfectMutationCtx
// ===========================

/**
 * Mutation context that aggregates read-write capability services.
 * Provides familiar Convex context shape.
 */
export interface ConfectMutationCtx {
  readonly db: MutationDB;
  readonly auth: ConfectAuth;
  readonly storage: ConfectStorageWriter;
  readonly scheduler: ConfectScheduler;
  readonly runQuery: ConfectQueryRunner;
  readonly runMutation: ConfectMutationRunner;
}

const ConfectMutationCtx = Context.GenericTag<ConfectMutationCtx>(
  "@rjdellecese/confect/ConfectMutationCtx",
);
/**
 * Build ConfectMutationCtx from capability services using Layer.effect.
 */
export const layerConfectMutationCtx = Layer.effect(
  ConfectMutationCtx,
  Effect.gen(function* () {
    const db = yield* MutationDB;
    const auth = yield* ConfectAuth;
    const storage = yield* ConfectStorageWriter;
    const scheduler = yield* ConfectScheduler;
    const runQuery = yield* ConfectQueryRunner;
    const runMutation = yield* ConfectMutationRunner;

    return ConfectMutationCtx.of({
      db,
      auth,
      storage,
      scheduler,
      runQuery,
      runMutation,
    });
  }),
);

// ===========================
// Internal Convex Context Tags (for API builder)
// ===========================

export const ConvexQueryCtx = Context.GenericTag<GenericQueryCtx<GenericDataModel>>(
  "@rjdellecese/confect/ConvexQueryCtx",
);

export const layerQueryCtx = <DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
) =>
  Layer.succeed(ConvexQueryCtx, ctx as unknown as GenericQueryCtx<GenericDataModel>);

// ===========================
// ConvexMutationCtx
// ===========================

export const ConvexMutationCtx = Context.GenericTag<GenericMutationCtx<GenericDataModel>>(
  "@rjdellecese/confect/ConvexMutationCtx",
);

export const layerMutationCtx = <DataModel extends GenericDataModel>(
  ctx: GenericMutationCtx<DataModel>,
) =>
  Layer.succeed(ConvexMutationCtx, ctx as unknown as GenericMutationCtx<GenericDataModel>);

// ===========================
// ConvexActionCtx
// ===========================

export const ConvexActionCtx = Context.GenericTag<GenericActionCtx<GenericDataModel>>(
  "@rjdellecese/confect/ConvexActionCtx",
);

export const layerActionCtx = <DataModel extends GenericDataModel>(
  ctx: GenericActionCtx<DataModel>,
) =>
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
