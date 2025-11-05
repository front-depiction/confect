/**
 * Confect Query Builders (runtime-free)
 *
 * Effect-based query interfaces wrapping Convex's Query/OrderedQuery/QueryInitializer.
 *
 * Mirrors Convex's structure:
 * https://github.com/get-convex/convex-js/blob/main/src/server/query.ts
 */

import type {
  DocumentByInfo,
  ExpressionOrValue,
  FilterBuilder,
  GenericTableInfo,
  IndexNames,
  IndexRange,
  IndexRangeBuilder,
  NamedIndex,
  NamedSearchIndex,
  OrderedQuery,
  PaginationResult,
  Query,
  QueryInitializer,
  SearchFilter,
  SearchFilterBuilder,
  SearchIndexNames,
} from "convex/server";
import type { GenericId } from "convex/values";

import {
  identity
} from "effect";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type {
  ConfectDocumentFromSchema,
  DerivedTableSchema,
  TableInfoFromSchema,
  TableNamesFromSchema,
} from "./data_model";
import type {
  GenericConfectSchema,
} from "./schema";

// ===========================
// Public Interfaces
// ===========================

/** A query with an order that has already been defined. */
export interface ConfectOrderedQuery<TableInfo extends GenericTableInfo> {
  readonly first: () => Effect.Effect<
    Option.Option<DocumentByInfo<TableInfo>>,
    DocumentDecodeError
  >;

  readonly take: (
    n: number,
  ) => Effect.Effect<ReadonlyArray<DocumentByInfo<TableInfo>>, DocumentDecodeError>;

  readonly collect: () => Effect.Effect<
    ReadonlyArray<DocumentByInfo<TableInfo>>,
    DocumentDecodeError
  >;

  readonly stream: () => Stream.Stream<
    DocumentByInfo<TableInfo>,
    DocumentDecodeError
  >;

  readonly paginate: (options: {
    cursor: string | null;
    numItems: number;
  }) => Effect.Effect<PaginationResult<DocumentByInfo<TableInfo>>, DocumentDecodeError>;

  readonly filter: (
    predicate: (q: FilterBuilder<TableInfo>) => ExpressionOrValue<boolean>
  ) => ConfectOrderedQuery<TableInfo>;

  readonly unique: () => Effect.Effect<
    Option.Option<DocumentByInfo<TableInfo>>,
    DocumentDecodeError
  >;
}

/** A query that extends OrderedQuery with the ability to define order. */
export interface ConfectQuery<TableInfo extends GenericTableInfo> extends ConfectOrderedQuery<TableInfo> {
  readonly order: (order: "asc" | "desc") => ConfectOrderedQuery<TableInfo>;
}

/** Entry point for building queries over a Confect table. */
export interface ConfectQueryInitializer<TableInfo extends GenericTableInfo> {
  readonly fullTableScan: () => ConfectQuery<TableInfo>;

  readonly withIndex: <IndexName extends IndexNames<TableInfo>>(
    indexName: IndexName,
    indexRange?: (q: IndexRangeBuilder<DocumentByInfo<TableInfo>, NamedIndex<TableInfo, IndexName>>) => IndexRange
  ) => ConfectQuery<TableInfo>;

  readonly withSearchIndex: <IndexName extends SearchIndexNames<TableInfo>>(
    indexName: IndexName,
    searchFilter: (q: SearchFilterBuilder<DocumentByInfo<TableInfo>, NamedSearchIndex<TableInfo, IndexName>>) => SearchFilter
  ) => ConfectOrderedQuery<TableInfo>;
}

// ===========================
// Query Builder Functions
// ===========================

/** Create an ordered query wrapper from a Convex ordered query. */
export const makeOrderedQuery = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
  I = never
>(
  query: OrderedQuery<TableInfoFromSchema<S, TN>>,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): ConfectOrderedQuery<TableInfoFromSchema<S, TN>> => ({
  first: () =>
    Effect.promise(() => query.first()).pipe(
      Effect.map(Option.fromNullable),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(Option.none()),
          onSome: (doc) =>
            decodeDocument(doc, tableName, tableSchema).pipe(
              Effect.map(Option.some),
            ),
        }),
      ),
    ),

  take: (n: number) =>
    Effect.promise(() => query.take(n)).pipe(
      Effect.flatMap((docs) =>
        decodeDocuments(docs, tableName, tableSchema),
      ),
    ),

  collect: () =>
    Effect.promise(() => query.collect()).pipe(
      Effect.flatMap((docs) =>
        decodeDocuments(docs, tableName, tableSchema),
      ),
    ),

  stream: () =>
    Stream.fromAsyncIterable(query, identity).pipe(
      Stream.orDie,
      Stream.mapEffect((doc) => decodeDocument(doc, tableName, tableSchema)),
    ),

  paginate: (options: {
    cursor: string | null;
    numItems: number;
  }) =>
    Effect.promise(() => query.paginate(options)).pipe(
      Effect.flatMap((res) =>
        decodeDocuments(res.page, tableName, tableSchema).pipe(
          Effect.map((page) => ({ ...res, page } as PaginationResult<ConfectDocumentFromSchema<S, TN>>)),
        ),
      ),
    ),

  filter: (predicate) =>
    makeOrderedQuery(
      query.filter(predicate),
      tableName,
      tableSchema
    ),

  unique: () =>
    Effect.promise(() => query.unique()).pipe(
      Effect.map(Option.fromNullable),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(Option.none()),
          onSome: (doc) =>
            decodeDocument(doc, tableName, tableSchema).pipe(
              Effect.map(Option.some),
            ),
        }),
      ),
    ),
});

/** Create a query wrapper from a Convex query. */
export const makeQuery = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
  I = never
>(
  query: Query<TableInfoFromSchema<S, TN>>,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): ConfectQuery<TableInfoFromSchema<S, TN>> =>
  Object.assign(makeOrderedQuery(query, tableName, tableSchema), {
    order: (order: "asc" | "desc") =>
      makeOrderedQuery(
        query.order(order),
        tableName,
        tableSchema
      ),
  });

/** Create a query initializer wrapper from a Convex query initializer. */
export const makeQueryInitializer = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
  I = never
>(
  query: QueryInitializer<TableInfoFromSchema<S, TN>>,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): ConfectQueryInitializer<TableInfoFromSchema<S, TN>> =>
  ({
    fullTableScan: () =>
      makeQuery(
        query.fullTableScan(),
        tableName,
        tableSchema
      ),

    withIndex: (indexName, indexRange) =>
      makeQuery(
        query.withIndex(indexName, indexRange),
        tableName,
        tableSchema
      ),

    withSearchIndex: (indexName, searchFilter) =>
      makeOrderedQuery(
        query.withSearchIndex(indexName, searchFilter),
        tableName,
        tableSchema
      ),
  });

// ===========================
// Helper Functions
// ===========================

const decodeDocument = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
  I
>(
  doc: unknown,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): Effect.Effect<ConfectDocumentFromSchema<S, TN>, DocumentDecodeError, never> => {
  if (!tableSchema) return Effect.succeed(doc as ConfectDocumentFromSchema<S, TN>);

  return Schema.decodeUnknown(tableSchema)(doc).pipe(
    Effect.mapError((parseError) =>
      new DocumentDecodeError({
        tableName,
        id: (doc as { _id?: string })?._id ?? "unknown",
        parseError: ParseResult.TreeFormatter.formatErrorSync(parseError),
      }),
    ),
  );
};

const decodeDocuments = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
  I
>(
  docs: unknown,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): Effect.Effect<ReadonlyArray<ConfectDocumentFromSchema<S, TN>>, DocumentDecodeError, never> => {
  if (!tableSchema) return Effect.succeed(docs as ReadonlyArray<ConfectDocumentFromSchema<S, TN>>);

  return Schema.decodeUnknown(Schema.Array(tableSchema))(docs).pipe(
    Effect.mapError((parseError) =>
      new DocumentDecodeError({
        tableName,
        id: "array",
        parseError: ParseResult.TreeFormatter.formatErrorSync(parseError),
      }),
    ),
  );
};


export const getDocumentById = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
  I
>(
  tableName: TN,
  id: GenericId<TN>,
  convexDatabaseReader: { get: (id: GenericId<TN>) => Promise<ConfectDocumentFromSchema<S, TN>> },
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): Effect.Effect<ConfectDocumentFromSchema<S, TN>, DocumentDecodeError | GetByIdFailure, never> =>
  Effect.promise(() => convexDatabaseReader.get(id)).pipe(
    Effect.map(Option.fromNullable),
    Effect.filterOrFail(
      Option.isSome,
      () => new GetByIdFailure({ tableName, id })
    ),
    Effect.flatMap((doc) => decodeDocument(doc.value, tableName, tableSchema)),
  );

// ===========================
// Errors
// ===========================

export class GetByIdFailure extends Schema.TaggedError<GetByIdFailure>(
  "GetByIdFailure",
)("GetByIdFailure", {
  id: Schema.String,
  tableName: Schema.String,
}) {
  override get message(): string {
    return `Document with ID '${this.id}' in table '${this.tableName}' not found`;
  }
}

export class DocumentDecodeError extends Schema.TaggedError<DocumentDecodeError>(
  "DocumentDecodeError",
)("DocumentDecodeError", {
  tableName: Schema.String,
  id: Schema.String,
  parseError: Schema.String,
}) {
  override get message(): string {
    return `Document with ID '${this.id}' in table '${this.tableName}' could not be decoded:\n\n${this.parseError}`;
  }
}
