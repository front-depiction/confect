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

import type { Expand, VectorIndexNames, VectorSearchQuery } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { GenericConfectSchema } from "./schema";
import type { TableInfoFromSchema, TableNamesFromSchema } from "./data_model";
import {
  ConvexVectorSearch,
} from "./convex_ctx";
import type { GenericActionCtx } from "convex/server";

const ConfectVectorSearchTypeId = Symbol.for("@rjdellecese/confect/ConfectVectorSearch");
type ConfectVectorSearchTypeId = typeof ConfectVectorSearchTypeId;

export interface ConfectVectorSearch<
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
    Awaited<ReturnType<GenericActionCtx<never>["vectorSearch"]>>,
    never
  >;
}

const make = <S extends GenericConfectSchema>(
  vectorSearch: GenericActionCtx<never>["vectorSearch"],
): ConfectVectorSearch<S> => ({
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

export const ConfectVectorSearch = Context.GenericTag<ConfectVectorSearch>(
  "@rjdellecese/confect/ConfectVectorSearch",
);

export const layer = Layer.effect(
  ConfectVectorSearch,
  Effect.gen(function* () {
    const vectorSearch = yield* ConvexVectorSearch();
    return make(vectorSearch);
  })
);
