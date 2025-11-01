/**
 * Convex Context Aggregates
 *
 * Provides convenience context objects that aggregate capability services.
 * These are optional - users can depend on individual services directly.
 *
 * Design:
 * - Aggregate contexts provide familiar Convex API shape { db, auth, storage, ... }
 * - Users can choose between aggregate contexts or individual capability services
 * - All individual services are exported from their respective modules
 *
 * Individual service exports:
 * - QueryDB, MutationDB from "./database"
 * - ConfectAuth from "./auth"
 * - ConfectStorageReader, ConfectStorageWriter from "./storage"
 * - ConfectScheduler from "./scheduler"
 * - ConfectQueryRunner, ConfectMutationRunner, ConfectActionRunner from "./runners"
 * - ConfectVectorSearch from "./vector_search"
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ConfectAuth } from "./auth";
import { MutationDB, QueryDB } from "./database";
import { ConfectActionRunner, ConfectMutationRunner, ConfectQueryRunner } from "./runners";
import { ConfectScheduler } from "./scheduler";
import type { GenericConfectSchema } from "./schema";
import { ConfectStorageReader, ConfectStorageWriter } from "./storage";
import { ConfectVectorSearch } from "./vector_search";

// ===========================
// ConfectQueryCtx
// ===========================

/**
 * Query context that aggregates read-only capability services.
 * Provides familiar Convex context shape.
 */
export interface ConfectQueryCtx<S extends GenericConfectSchema = GenericConfectSchema> {
  readonly db: QueryDB<S>;
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

const ConfectMutationCtx = <S extends GenericConfectSchema>() => Context.GenericTag<ConfectMutationCtx<S>>(
  "@rjdellecese/confect/ConfectMutationCtx",
);

/**
 * Build ConfectMutationCtx from capability services using Layer.effect.
 */
export const _layerConfectMutationCtx = <S extends GenericConfectSchema>() => Layer.effect(
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

export const layerConfectMutationCtx = <S extends GenericConfectSchema>() =>
  Layer.merge(_layerConfectMutationCtx<S>(), layerConfectQueryCtx<S>())

// ===========================
// ConfectActionCtx
// ===========================

/**
 * Action context that aggregates all capability services.
 * Provides familiar Convex context shape with access to storage writes, scheduling, and runners.
 */
export interface ConfectActionCtx<S extends GenericConfectSchema = GenericConfectSchema> {
  readonly auth: ConfectAuth;
  readonly storage: ConfectStorageWriter;
  readonly scheduler: ConfectScheduler;
  readonly runQuery: ConfectQueryRunner;
  readonly runMutation: ConfectMutationRunner;
  readonly runAction: ConfectActionRunner;
  readonly vectorSearch: ConfectVectorSearch<S>;
}

const ConfectActionCtx = Context.GenericTag<ConfectActionCtx>(
  "@rjdellecese/confect/ConfectActionCtx",
);

/**
 * Build ConfectActionCtx from capability services using Layer.effect.
 */
export const layerConfectActionCtx = Layer.effect(
  ConfectActionCtx,
  Effect.gen(function* () {
    const auth = yield* ConfectAuth;
    const storage = yield* ConfectStorageWriter;
    const scheduler = yield* ConfectScheduler;
    const runQuery = yield* ConfectQueryRunner;
    const runMutation = yield* ConfectMutationRunner;
    const runAction = yield* ConfectActionRunner;
    const vectorSearch = yield* ConfectVectorSearch;

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
