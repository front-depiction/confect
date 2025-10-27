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
  GenericTableInfo,
  OrderedQuery,
  PaginationResult,
  Query,
  QueryInitializer
} from "convex/server";
import type { GenericId } from "convex/values";

import {
  Effect,
  identity,
  Option,
  ParseResult,
  pipe,
  Schema,
  Stream,
} from "effect";
import type {
  ConfectDocumentFromSchemaDefinition,
  DerivedTableSchema,
  TableInfoFromSchemaDefinition,
  TableNamesFromSchemaDefinition,
} from "./data_model";
import type {
  ConfectSchemaDefinition,
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
}

/** Entry point for building queries over a Confect table. */
export interface ConfectQueryInitializer<TableInfo extends GenericTableInfo> {
  readonly index: (
    indexName: string,
    order?: "asc" | "desc",
  ) => ConfectOrderedQuery<TableInfo>;

  readonly search: (
    indexName: string,
    searchFilter: unknown,
  ) => ConfectOrderedQuery<TableInfo>;
}

// ===========================
// Query Builder Functions
// ===========================

/** Create an ordered query wrapper from a Convex ordered query. */
export const makeOrderedQuery = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchemaDefinition<ConfectSchemaDefinition<S>>,
  I = never
>(
  query: OrderedQuery<TableInfoFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>> | Query<TableInfoFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>>,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): ConfectOrderedQuery<TableInfoFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>> => ({
    first: () =>
      pipe(
        Effect.promise(() => query.first()),
        Effect.map(Option.fromNullable),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(Option.none()),
            onSome: (doc) =>
              pipe(
                decodeDocument(doc, tableName, tableSchema),
                Effect.map(Option.some),
              ),
          }),
        ),
      ),

    take: (
      n: number,
    ) =>
      pipe(
        Effect.promise(() => query.take(n)),
        Effect.flatMap((docs) =>
          decodeDocuments(docs, tableName, tableSchema),
        ),
      ),

    collect: () =>
      pipe(
        Effect.promise(() => query.collect()),
        Effect.flatMap((docs) =>
          decodeDocuments(docs, tableName, tableSchema),
        ),
      ),

    stream: () =>
      pipe(
        Stream.fromAsyncIterable(query as AsyncIterable<DocumentByInfo<TableInfoFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>>>, identity),
        Stream.orDie,
        Stream.mapEffect((doc) => decodeDocument(doc, tableName, tableSchema)),
      ),

    paginate: (options: {
      cursor: string | null;
      numItems: number;
    }) =>
      pipe(
        Effect.promise(() => query.paginate(options)),
        Effect.flatMap((res) =>
          pipe(
            decodeDocuments(res.page, tableName, tableSchema),
            Effect.map((page) => ({ ...res, page } as PaginationResult<ConfectDocumentFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>>)),
          ),
        ),
      ),
  });

/** Create a query initializer wrapper from a Convex query initializer. */
export const makeQueryInitializer = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchemaDefinition<ConfectSchemaDefinition<S>>,
  I = never
>(
  query: QueryInitializer<TableInfoFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>>,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): Effect.Effect<ConfectQueryInitializer<TableInfoFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>>, never, never> =>
  Effect.succeed({
    index: (indexName: string, order: "asc" | "desc" = "asc") => {
      const ordered = query.withIndex(indexName as never).order(order);
      return makeOrderedQuery(ordered, tableName, tableSchema);
    },

    search: (indexName: string, searchFilter: unknown) => {
      const ordered = query.withSearchIndex(
        indexName as never,
        searchFilter as never,
      );
      return makeOrderedQuery(ordered, tableName, tableSchema);
    },
  });

// ===========================
// Helper Functions
// ===========================

const decodeDocument = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchemaDefinition<ConfectSchemaDefinition<S>>,
  I
>(
  doc: unknown,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): Effect.Effect<ConfectDocumentFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>, DocumentDecodeError, never> => {
  if (!tableSchema) return Effect.succeed(doc as ConfectDocumentFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>);

  return pipe(
    Schema.decodeUnknown(tableSchema)(doc),
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
  TN extends TableNamesFromSchemaDefinition<ConfectSchemaDefinition<S>>,
  I
>(
  docs: unknown,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): Effect.Effect<ReadonlyArray<ConfectDocumentFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>>, DocumentDecodeError, never> => {
  if (!tableSchema) return Effect.succeed(docs as ReadonlyArray<ConfectDocumentFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>>);

  return pipe(
    Schema.decodeUnknown(Schema.Array(tableSchema))(docs),
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
  TN extends TableNamesFromSchemaDefinition<ConfectSchemaDefinition<S>>,
  I
>(
  tableName: TN,
  id: GenericId<TN>,
  convexDatabaseReader: { get: (id: GenericId<TN>) => Promise<ConfectDocumentFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>> },
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): Effect.Effect<ConfectDocumentFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>, DocumentDecodeError | GetByIdFailure, never> =>
  pipe(
    Effect.promise(() => convexDatabaseReader.get(id)),
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
