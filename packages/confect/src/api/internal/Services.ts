/**
 * @module internal/Services
 *
 * Service type unions defining which services are available in different function contexts.
 *
 * This enables compile-time enforcement of service access restrictions:
 * - Query handlers can only access QueryServices
 * - Mutation handlers can access MutationServices (includes QueryServices)
 * - Action handlers can access ActionServices
 *
 * @since 1.0.0
 */

import type { GenericConfectSchema } from "../../server/schema";
import type { QueryDB } from "../../server/database";
import type { MutationDB } from "../../server/database";
import type { ConfectAuth } from "../../server/auth";
import type { ConfectStorageReader } from "../../server/storage";
import type { ConfectStorageWriter } from "../../server/storage";
import type { ConfectStorageActionWriter } from "../../server/storage";
import type { ConfectQueryRunner } from "../../server/runners";
import type { ConfectMutationRunner } from "../../server/runners";
import type { ConfectActionRunner } from "../../server/runners";
import type { ConfectScheduler } from "../../server/scheduler";
import type { ConfectQueryCtx } from "../../server/ctx";
import type { ConfectMutationCtx } from "../../server/ctx";
import type { ConfectActionCtx } from "../../server/ctx";
import type { ConfectVectorSearch } from "../../server/vector_search";

/**
 * Services available in query function handlers.
 *
 * Queries have read-only access to the database and can use:
 * - QueryDB for database reads
 * - ConfectAuth for authentication
 * - ConfectStorageReader for reading uploaded files
 * - ConfectQueryRunner for running other queries
 * - ConfectQueryCtx for the raw Convex query context
 *
 * @since 1.0.0
 */
export type QueryServices =
  | QueryDB
  | ConfectAuth
  | ConfectStorageReader
  | ConfectQueryRunner
  | ConfectQueryCtx;


export type MutationExclusiveServices =
  | MutationDB
  | ConfectMutationCtx
  | ConfectMutationRunner
  | ConfectScheduler
  | ConfectStorageWriter;
/**
 * Services available in mutation function handlers.
 *
 * Mutations can read and write to the database and include all query services plus:
 * - MutationDB for database reads and writes
 * - ConfectMutationCtx for the raw Convex mutation context
 * - ConfectMutationRunner for running other mutations
 * - ConfectScheduler for scheduling functions
 * - ConfectStorageWriter for writing files
 *
 * @since 1.0.0
 */
export type MutationServices =
  | QueryServices
  | MutationExclusiveServices

/**
 * Services available in action function handlers.
 *
 * Actions can perform side effects and have access to:
 * - ConfectActionCtx for the raw Convex action context
 * - ConfectActionRunner for running other actions
 * - All runners (query, mutation, action)
 * - Storage services (reader, writer, action writer)
 * - ConfectVectorSearch for vector search operations
 * - ConfectAuth for authentication
 * - ConfectScheduler for scheduling functions
 *
 * Note: Actions do NOT have direct database access (no QueryDB or MutationDB).
 * They must use runners to execute queries or mutations.
 *
 * @since 1.0.0
 */
export type ActionServices<S extends GenericConfectSchema = GenericConfectSchema> =
  | ConfectActionCtx
  | ConfectActionRunner
  | ConfectQueryRunner
  | ConfectMutationRunner
  | ConfectAuth
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectStorageActionWriter
  | ConfectVectorSearch
  | ConfectScheduler;
