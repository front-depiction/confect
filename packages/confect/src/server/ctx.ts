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
import { ConfectActionRunner, ConfectMutationRunner, ConfectQueryRunner } from "./runners";
import { ConfectScheduler } from "./scheduler";
import { GenericConfectSchema } from "./schema";
import { ConfectStorageReader, ConfectStorageWriter } from "./storage";
import { ConfectVectorSearch } from "./vector_search";

// ===========================
// ConfectQueryCtx
// ===========================

/**
 * Query context that aggregates read-only capability services.
 * Provides familiar Convex context shape.
 */
export interface ConfectQueryCtx<S extends GenericConfectSchema> {
  readonly db: QueryDB<S>;
  readonly auth: ConfectAuth;
  readonly storage: ConfectStorageReader;
  readonly runQuery: ConfectQueryRunner;
}

const ConfectQueryCtx = <S extends GenericConfectSchema>() => Context.GenericTag<ConfectQueryCtx<S>>(
  "@rjdellecese/confect/ConfectQueryCtx",
);

/**
 * Build ConfectQueryCtx from capability services using Layer.effect.
 */
export const layerConfectQueryCtx = <S extends GenericConfectSchema>() => Layer.effect(
  ConfectQueryCtx<S>(),
  Effect.gen(function* () {
    const db = yield* QueryDB<S>();
    const auth = yield* ConfectAuth;
    const storage = yield* ConfectStorageReader;
    const runQuery = yield* ConfectQueryRunner;

    return {
      db,
      auth,
      storage,
      runQuery,
    };
  }),
);

// ===========================
// ConfectMutationCtx
// ===========================

/**
 * Mutation context that aggregates read-write capability services.
 * Provides familiar Convex context shape.
 */
export interface ConfectMutationCtx<S extends GenericConfectSchema> {
  readonly db: MutationDB<S>;
  readonly auth: ConfectAuth;
  readonly storage: ConfectStorageWriter;
  readonly scheduler: ConfectScheduler;
  readonly runQuery: ConfectQueryRunner;
  readonly runMutation: ConfectMutationRunner;
}

const ConfectMutationCtx =<S extends GenericConfectSchema>() => Context.GenericTag<ConfectMutationCtx<S>>(
  "@rjdellecese/confect/ConfectMutationCtx",
);
/**
 * Build ConfectMutationCtx from capability services using Layer.effect.
 */
export const layerConfectMutationCtx = <S extends GenericConfectSchema>() => Layer.effect(
  ConfectMutationCtx<S>(),
  Effect.gen(function* () {
    const db = yield* MutationDB<S>();
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
    };
  }),
);

// ===========================
// Internal Convex Context Tags (for API builder)
// ===========================

export const ConvexQueryCtx = <DataModel extends GenericDataModel>() => Context.GenericTag<GenericQueryCtx<DataModel>>(
  "@rjdellecese/confect/ConvexQueryCtx",
);
export const layerQueryCtx = <DataModel extends GenericDataModel>(ctx: GenericQueryCtx<DataModel>) =>
   Layer.succeed(ConvexQueryCtx<DataModel>(), ctx);

// ===========================
// ConvexMutationCtx
// ===========================

export const ConvexMutationCtx = <DataModel extends GenericDataModel>() => Context.GenericTag<GenericMutationCtx<DataModel>>(
  "@rjdellecese/confect/ConvexMutationCtx",
);
export const layerMutationCtx = <DataModel extends GenericDataModel>(ctx: GenericMutationCtx<DataModel>) =>
  Layer.succeed(ConvexMutationCtx<DataModel>(), ctx );

// ===========================
// ConfectActionCtx
// ===========================

/**
 * Action context that aggregates all capability services.
 * Provides familiar Convex context shape with access to storage writes, scheduling, and runners.
 */
export interface ConfectActionCtx<S extends GenericConfectSchema> {
  readonly auth: ConfectAuth;
  readonly storage: ConfectStorageWriter;
  readonly scheduler: ConfectScheduler;
  readonly runQuery: ConfectQueryRunner;
  readonly runMutation: ConfectMutationRunner;
  readonly runAction: ConfectActionRunner;
  readonly vectorSearch: ConfectVectorSearch<S>;
}

const ConfectActionCtx = <S extends GenericConfectSchema>() => Context.GenericTag<ConfectActionCtx<S>>(
  "@rjdellecese/confect/ConfectActionCtx",
);

/**
 * Build ConfectActionCtx from capability services using Layer.effect.
 */
export const layerConfectActionCtx = <S extends GenericConfectSchema>() => Layer.effect(
  ConfectActionCtx<S>(),
  Effect.gen(function* () {
    const auth = yield* ConfectAuth;
    const storage = yield* ConfectStorageWriter;
    const scheduler = yield* ConfectScheduler;
    const runQuery = yield* ConfectQueryRunner;
    const runMutation = yield* ConfectMutationRunner;
    const runAction = yield* ConfectActionRunner;
    const vectorSearch = yield* ConfectVectorSearch<S>();

    return {
      auth,
      storage,
      scheduler,
      runQuery,
      runMutation,
      runAction,
      vectorSearch,
    };
  }),
);

// ===========================
// ConvexActionCtx
// ===========================

export const ConvexActionCtx = <DataModel extends GenericDataModel>() => Context.GenericTag<GenericActionCtx<DataModel>>(
  "@rjdellecese/confect/ConvexActionCtx",
);
export const layerActionCtx = <DataModel extends GenericDataModel>(ctx: GenericActionCtx<DataModel>) =>
  Layer.succeed(ConvexActionCtx<DataModel>(), ctx);
