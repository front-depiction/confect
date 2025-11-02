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

import * as Effect from "effect/Effect";
import { ConfectAuth, IConfectAuthShape } from "./auth";
import { IMutationDB, IQueryDB, MutationDB, QueryDB } from "./database";
import { ConfectActionRunner, ConfectMutationRunner, ConfectQueryRunner, IConfectActionRunner, IConfectMutationRunner, IConfectQueryRunner } from "./runners";
import { ConfectScheduler, IConfectScheduler } from "./scheduler";
import type { ConfectSchemaDefinition, DataModelFromConfectSchema, GenericConfectSchema } from "./schema";
import { ConfectStorageReader, ConfectStorageWriter, IConfectStorageWriter } from "./storage";
import { ConfectVectorSearch, IConfectVectorSearch } from "./vector_search";
import * as Layer from "effect/Layer";
import { Auth, GenericQueryCtx, Scheduler, StorageReader, StorageWriter } from "convex/server";

// ===========================
// ConfectQueryCtx
// ===========================

/**
 * Query context that aggregates read-only capability services.
 * Provides familiar Convex context shape.
 */
interface ConfectQueryCtxShape<S extends GenericConfectSchema = GenericConfectSchema> {
  readonly db: IQueryDB<S>;
  readonly auth: ConfectAuth;
  readonly storage: ConfectStorageReader;
  readonly runQuery: ConfectQueryRunner;
}

export class ConfectQueryCtx extends Effect.Service<ConfectQueryCtx>()("@rjdellecese/confect/ConfectQueryCtx", {
  effect: Effect.gen(function* () {
    const db = yield* QueryDB;
    const auth = yield* ConfectAuth;
    const storage = yield* ConfectStorageReader;
    const runQuery = yield* ConfectQueryRunner;

    return {
      db,
      auth,
      storage,
      runQuery,
    } satisfies ConfectQueryCtxShape;
  }),
  dependencies: [
    QueryDB.Default,
    ConfectAuth.Default,
    ConfectStorageReader.Default,
    ConfectQueryRunner.Default,
  ],
}) {
  static TypedDefault<S extends GenericConfectSchema>() {
    return this.Default as Layer.Layer<ConfectQueryCtx, never, ConfectSchemaDefinition<S> | GenericQueryCtx<DataModelFromConfectSchema<S>> | Auth | StorageReader>
  }
}



// ===========================
// ConfectMutationCtx
// ===========================

/**
 * Mutation context that aggregates read-write capability services.
 * Provides familiar Convex context shape.
 */
export interface ConfectMutationCtxShape<S extends GenericConfectSchema = GenericConfectSchema> {
  readonly db: IMutationDB<S>;
  readonly auth: IConfectAuthShape;
  readonly storage: IConfectStorageWriter;
  readonly scheduler: IConfectScheduler;
  readonly runQuery: IConfectQueryRunner;
  readonly runMutation: IConfectMutationRunner;
}

export class ConfectMutationCtx extends Effect.Service<ConfectMutationCtx>()("@rjdellecese/confect/ConfectMutationCtx", {
  effect: Effect.gen(function* () {
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
    } satisfies ConfectMutationCtxShape;
  }),
  dependencies: [
    MutationDB.Default,
    ConfectAuth.Default,
    ConfectStorageWriter.Default,
    ConfectScheduler.Default,
    ConfectQueryRunner.Default,
    ConfectMutationRunner.Default,
  ],
  accessors: false,
}) {
  static TypedDefault<S extends GenericConfectSchema>() {
    return this.Default as Layer.Layer<
      ConfectMutationCtx,
      never,
      | ConfectSchemaDefinition<S>
      | GenericQueryCtx<DataModelFromConfectSchema<S>>
      | Auth
      | StorageReader
      | StorageWriter
    >
  }
}


// ===========================
// ConfectActionCtx
// ===========================

/**
 * Action context that aggregates all capability services.
 * Provides familiar Convex context shape with access to storage writes, scheduling, and runners.
 */
export interface ConfectActionCtxShape<S extends GenericConfectSchema = GenericConfectSchema> {
  readonly auth: IConfectAuthShape;
  readonly storage: IConfectAuthShape;
  readonly scheduler: IConfectScheduler;
  readonly runQuery: IConfectQueryRunner;
  readonly runMutation: IConfectMutationRunner;
  readonly runAction: IConfectActionRunner;
  readonly vectorSearch: IConfectVectorSearch<S>;
}

export class ConfectActionCtx extends Effect.Service<ConfectActionCtx>()("@rjdellecese/confect/ConfectActionCtx", {
  effect: Effect.gen(function* () {
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
  dependencies: [
    ConfectAuth.Default,
    ConfectStorageWriter.Default,
    ConfectScheduler.Default,
    ConfectQueryRunner.Default,
    ConfectMutationRunner.Default,
    ConfectActionRunner.Default,
    ConfectVectorSearch.Default,
  ],
  accessors: false,
}) {
  static TypedDefault<S extends GenericConfectSchema>() {
    return this.Default as Layer.Layer<
      ConfectActionCtx,
      never,
      | ConfectSchemaDefinition<S>
      | Auth
      | Scheduler
      | StorageWriter
    >
  }
}


