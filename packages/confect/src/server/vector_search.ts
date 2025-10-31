/**
 * Confect Vector Search Service
 *
 * Provides Effect-based vector search wrapping Convex's vectorSearch API.
 *
 * Design decisions:
 * - Returns Effect for composability
 * - Preserves Convex's vector search type safety
 * - Supports all Convex vector search query options
 */

import type {
  Expand,
  GenericActionCtx,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type {
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "./schema";
import type {
  ConvexDataModel,
  TableInfoFromSchema,
  TableNamesFromSchema,
} from "./data_model";

const ConfectVectorSearchTypeId = Symbol.for("@rjdellecese/confect/ConfectVectorSearch");
type ConfectVectorSearchTypeId = typeof ConfectVectorSearchTypeId;

type VectorSearch<S extends GenericConfectSchema> =
  GenericActionCtx<ConvexDataModel<ConfectSchemaDefinition<S>>>["vectorSearch"];

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
  ) => Effect.Effect<Awaited<ReturnType<VectorSearch<S>>>, never>;
}

const make = <S extends GenericConfectSchema>(
  vectorSearch: VectorSearch<S>,
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

export const layer = <S extends GenericConfectSchema>(
  vectorSearch: VectorSearch<S>,
): Layer.Layer<ConfectVectorSearch<S>> =>
  Layer.succeed(ConfectVectorSearch, make(vectorSearch));
