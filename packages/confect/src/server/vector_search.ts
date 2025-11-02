/**
 * Confect Vector Search Service
 *
 * Provides Effect-based vector search wrapping Convex's vectorSearch API.
 *
 * Design decisions:
 * - Returns Effect for composability
 * - Preserves Convex's vector search type safety
 * - Supports all Convex vector search query options
 * - Depends on ConvexVectorSearch from convex_ctx for raw vector search access
 */

import type { Expand, GenericActionCtx, VectorIndexNames, VectorSearchQuery } from "convex/server";
import * as Effect from "effect/Effect";
import { ConvexVectorSearch } from "./convex_ctx";
import type { TableInfoFromSchema, TableNamesFromSchema } from "./data_model";
import type { GenericConfectSchema } from "./schema";

const ConfectVectorSearchTypeId = Symbol.for("@rjdellecese/confect/ConfectVectorSearch");
type ConfectVectorSearchTypeId = typeof ConfectVectorSearchTypeId;

export interface IConfectVectorSearch<
  S extends GenericConfectSchema = GenericConfectSchema,
> {
  readonly [ConfectVectorSearchTypeId]: ConfectVectorSearchTypeId;
  readonly search: <
    TN extends TableNamesFromSchema<S>,
    IndexName extends VectorIndexNames<TableInfoFromSchema<S, TN>>,
  >(
    tableName: TN,
    indexName: IndexName,
    query: Expand<VectorSearchQuery<TableInfoFromSchema<S, TN>, IndexName>>,
  ) => Effect.Effect<
    Awaited<ReturnType<GenericActionCtx<never>["vectorSearch"]>>
  >;
}

const make = <S extends GenericConfectSchema>(
  vectorSearch: GenericActionCtx<any>["vectorSearch"],
): IConfectVectorSearch<S> => ({
  [ConfectVectorSearchTypeId]: ConfectVectorSearchTypeId,
  search: <
    TN extends TableNamesFromSchema<S>,
    IndexName extends VectorIndexNames<TableInfoFromSchema<S, TN>>,
  >(
    tableName: TN,
    indexName: IndexName,
    query: Expand<VectorSearchQuery<TableInfoFromSchema<S, TN>, IndexName>>,
  ) => Effect.promise(() => vectorSearch(tableName, indexName, query)),
});

export class ConfectVectorSearch extends Effect.Service<ConfectVectorSearch>()("@rjdellecese/confect/ConfectVectorSearch", {
  effect: Effect.gen(function* () {
    const { vectorSearch } = yield* ConvexVectorSearch();
    return make(vectorSearch);
  }),
  accessors: true,
}) {}
