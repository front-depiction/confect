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
  NamedTableInfo,
  VectorIndexNames,
  VectorSearchQuery,
} from "convex/server";
import { Context, Effect, Layer } from "effect";
import type {
  DataModelFromConfectDataModel,
  GenericConfectDataModel,
  TableNamesInConfectDataModel,
} from "./data_model";

const ConfectVectorSearchTypeId = Symbol.for("@rjdellecese/confect/ConfectVectorSearch");
type ConfectVectorSearchTypeId = typeof ConfectVectorSearchTypeId;

type VectorSearch<ConfectDataModel extends GenericConfectDataModel> =
  GenericActionCtx<
    DataModelFromConfectDataModel<ConfectDataModel>
  >["vectorSearch"];

export interface ConfectVectorSearch {
  readonly [ConfectVectorSearchTypeId]: ConfectVectorSearchTypeId;
  readonly search: <
    ConfectDataModel extends GenericConfectDataModel,
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
    IndexName extends VectorIndexNames<
      NamedTableInfo<DataModelFromConfectDataModel<ConfectDataModel>, TableName>
    >,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<
        NamedTableInfo<
          DataModelFromConfectDataModel<ConfectDataModel>,
          TableName
        >,
        IndexName
      >
    >,
  ) => Effect.Effect<
    Awaited<ReturnType<VectorSearch<ConfectDataModel>>>,
    never
  >;
}

const make = <ConfectDataModel extends GenericConfectDataModel>(
  vectorSearch: VectorSearch<ConfectDataModel>,
): ConfectVectorSearch => ({
  [ConfectVectorSearchTypeId]: ConfectVectorSearchTypeId,
  search: <
    TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
    IndexName extends VectorIndexNames<
      NamedTableInfo<DataModelFromConfectDataModel<ConfectDataModel>, TableName>
    >,
  >(
    tableName: TableName,
    indexName: IndexName,
    query: Expand<
      VectorSearchQuery<
        NamedTableInfo<
          DataModelFromConfectDataModel<ConfectDataModel>,
          TableName
        >,
        IndexName
      >
    >,
  ) => Effect.promise(() => vectorSearch(tableName, indexName, query)),
});

export const ConfectVectorSearch = Context.GenericTag<ConfectVectorSearch>(
  "@rjdellecese/confect/ConfectVectorSearch",
);

export const layer = <ConfectDataModel extends GenericConfectDataModel>(
  vectorSearch: VectorSearch<ConfectDataModel>,
): Layer.Layer<ConfectVectorSearch> =>
  Layer.succeed(ConfectVectorSearch, make(vectorSearch));
