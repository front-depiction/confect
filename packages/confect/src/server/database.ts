/**
 * Confect Database Services
 *
 * Provides Effect-based database operations wrapping Convex's database API.
 *
 * Design decisions:
 * - Minimal transformation - wrap, don't reimplement
 * - Schema validation integrated at boundaries
 * - Separate reader and writer services
 * - Query builders extracted to query.ts (following Convex pattern)
 *
 * @see https://github.com/get-convex/convex-js/tree/main/src/server
 */

import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ParseResult from "effect/ParseResult";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import type {
  ConfectDocumentFromSchema,
  ConvexDataModel,
  TableInfoFromSchema,
  TableNamesFromSchema,
} from "./data_model";
import {
  DocumentDecodeError,
  GetByIdFailure,
  getDocumentById,
  makeQueryInitializer,
  type ConfectQueryInitializer,
} from "./query";
import type {
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "./schema";

// Re-export error classes for convenience
export { DocumentDecodeError, GetByIdFailure };



// ===========================
// QueryDB - Read-only database operations
// ===========================

export interface QueryDB<
  S extends GenericConfectSchema = GenericConfectSchema,
> extends GenericDatabaseReader<ConvexDataModel<ConfectSchemaDefinition<S>>> {
  readonly getWithSchema: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
  ) => Effect.Effect<
    Option.Option<ConfectDocumentFromSchema<S, TN>>,
    DocumentDecodeError
  >;

  readonly table: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
  ) => Effect.Effect<ConfectQueryInitializer<TableInfoFromSchema<S, TN>>>;
}

export const QueryDB = <S extends GenericConfectSchema>() => Context.GenericTag<QueryDB<S>>(
  "@rjdellecese/confect/QueryDB",
);
// Legacy export for backward compatibility
/** @deprecated Use QueryDB instead */
export const ConfectDatabaseReader = QueryDB;

export const makeQueryDB = <
  S extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  convexDatabaseReader: GenericDatabaseReader<ConvexDataModel<ConfectSchemaDefinition<S>>>,
): QueryDB<S> => ({
  // Convex GenericDatabaseReader methods (pass through)
  get: (id) => convexDatabaseReader.get(id),
  query: (tableName) => convexDatabaseReader.query(tableName),
  normalizeId: (tableName, id) => convexDatabaseReader.normalizeId(tableName, id),
  system: convexDatabaseReader.system,

  // Confect enhanced methods
  getWithSchema: (tableName, id) => {
    const maybeSchema = Option.fromNullable(confectSchemaDefinition.confectSchema[tableName]?.tableSchema)
    return Effect.promise(() => convexDatabaseReader.get(id)).pipe(
      Effect.map(Option.fromNullable),
      Effect.zip(Effect.succeed(maybeSchema)),
      Effect.flatMap(([maybeDoc, maybeSchema]) =>
        Option.match(maybeSchema, {
          onNone: () => Effect.succeed(maybeDoc),
          onSome: (schema) => Effect.transposeMapOption(maybeDoc, (doc) => Schema.decodeUnknown(schema)(doc))
        })
      ),
      Effect.mapError(e => new DocumentDecodeError({
        tableName, id, parseError: e.message
      }))
    )
  },

  table: (tableName) => {
    const tableDefinition = confectSchemaDefinition.confectSchema[tableName];
    return makeQueryInitializer(
      convexDatabaseReader.query(tableName),
      tableName,
      tableDefinition?.tableSchema,
    )
  },
});

export const layerQueryDB = <
  S extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  convexDatabaseReader: GenericDatabaseReader<ConvexDataModel<ConfectSchemaDefinition<S>>>,
): Layer.Layer<QueryDB<S>> =>
  Layer.succeed(
    QueryDB<S>(),
    makeQueryDB(confectSchemaDefinition, convexDatabaseReader),
  );

// Legacy exports for backward compatibility
/** @deprecated Use makeQueryDB instead */
export const makeConfectDatabaseReader = makeQueryDB;
/** @deprecated Use layerQueryDB instead */
export const layerDatabaseReader = layerQueryDB;

// ===========================
// MutationDB - Read and write database operations
// ===========================

export interface MutationDB<
  S extends GenericConfectSchema = GenericConfectSchema,
> extends QueryDB<S>, GenericDatabaseWriter<ConvexDataModel<ConfectSchemaDefinition<S>>> {
  readonly insertWithSchema: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    document: WithoutSystemFields<ConfectDocumentFromSchema<S, TN>>,
  ) => Effect.Effect<GenericId<TN>, DocumentEncodeError>;
  readonly patchWithSchema: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
    patchedValues: Partial<WithoutSystemFields<ConfectDocumentFromSchema<S, TN>>>,
  ) => Effect.Effect<void, DocumentEncodeError | DocumentDecodeError | GetByIdFailure>;
  readonly replaceWithSchema: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
    value: WithoutSystemFields<ConfectDocumentFromSchema<S, TN>>,
  ) => Effect.Effect<void, DocumentEncodeError>;
  readonly deleteWithSchema: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
  ) => Effect.Effect<void>;
}

export const MutationDB = <S extends GenericConfectSchema>() => Context.GenericTag<MutationDB<S>>(
  "@rjdellecese/confect/MutationDB",
);

// Legacy export for backward compatibility
/** @deprecated Use MutationDB instead */
export const ConfectDatabaseWriter = MutationDB;

export const makeMutationDB = <
  S extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  convexDatabaseWriter: GenericDatabaseWriter<ConvexDataModel<ConfectSchemaDefinition<S>>>,
): MutationDB<S> => {
  const reader = makeQueryDB(confectSchemaDefinition, convexDatabaseWriter);

  return {
    ...reader,

    // Convex GenericDatabaseWriter methods (pass through)
    insert: (tableName, document) => convexDatabaseWriter.insert(tableName, document),
    patch: (id, value) => convexDatabaseWriter.patch(id, value),
    replace: (id, value) => convexDatabaseWriter.replace(id, value),
    delete: (id) => convexDatabaseWriter.delete(id),

    // Confect enhanced methods with schema validation
    insertWithSchema: (tableName, document) =>
      Effect.gen(function* () {
        const tableDefinition = confectSchemaDefinition.confectSchema[tableName];
        const encodedDocument = yield* encodeDocument(
          document,
          tableName,
          tableDefinition?.tableSchema,
        );
        return yield* Effect.promise(() =>
          convexDatabaseWriter.insert(tableName, encodedDocument as never),
        );
      }),

    patchWithSchema: (tableName, id, patchedValues) =>
      Effect.gen(function* () {
        const tableDefinition = confectSchemaDefinition.confectSchema[tableName];
        const original = yield* getDocumentById(
          tableName,
          id,
          convexDatabaseWriter,
          tableDefinition?.tableSchema,
        );
        const updated = { ...original, ...patchedValues };
        const encodedDocument = yield* encodeDocument(
          updated,
          tableName,
          tableDefinition?.tableSchema,
        );
        yield* Effect.promise(() =>
          convexDatabaseWriter.replace(id, encodedDocument),
        );
      }),

    replaceWithSchema: (tableName, id, value) =>
      Effect.gen(function* () {
        const tableDefinition = confectSchemaDefinition.confectSchema[tableName];
        const encodedDocument = yield* encodeDocument(
          value,
          tableName,
          tableDefinition?.tableSchema,
        );
        yield* Effect.promise(() =>
          convexDatabaseWriter.replace(id, encodedDocument as never),
        );
      }),

    deleteWithSchema: (_tableName, id) => Effect.promise(() => convexDatabaseWriter.delete(id)),
  };
};

export const layerMutationDB = <
  S extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  convexDatabaseWriter: GenericDatabaseWriter<ConvexDataModel<ConfectSchemaDefinition<S>>>,
): Layer.Layer<MutationDB<S> | QueryDB<S>> => {
  const db = makeMutationDB(confectSchemaDefinition, convexDatabaseWriter)
  return Layer.merge(
    Layer.succeed(MutationDB<S>(), db),
     Layer.succeed(QueryDB<S>(), db) 
    )

}
  

// Legacy exports for backward compatibility
/** @deprecated Use makeMutationDB instead */
export const makeConfectDatabaseWriter = makeMutationDB;
/** @deprecated Use layerMutationDB instead */
export const layerDatabaseWriter = layerMutationDB;

// ===========================
// Encoding Helper
// ===========================

const encodeDocument = <A, I>(
  self: A,
  tableName: string,
  tableSchema: Schema.Schema<A, I> | undefined,
): Effect.Effect<I, DocumentEncodeError> => {
  if (!tableSchema) {
    return Effect.succeed(self as never);
  }

  const extractIdForError = (doc: unknown): string => Predicate.hasProperty(doc, "_id") && Predicate.isString(doc._id) ? doc._id : "unknown"

  return Schema.encode(tableSchema)(self).pipe(
    Effect.mapError((parseError) =>
      new DocumentEncodeError({
        tableName,
        id: extractIdForError(self),
        parseError: ParseResult.TreeFormatter.formatErrorSync(parseError),
      }),
    ),
  );
};

// ===========================
// Errors
// ===========================

export class DocumentEncodeError extends Schema.TaggedError<DocumentEncodeError>(
  "DocumentEncodeError",
)("DocumentEncodeError", {
  tableName: Schema.String,
  id: Schema.String,
  parseError: Schema.String,
}) {
  override get message(): string {
    return `Document with ID '${this.id}' in table '${this.tableName}' could not be encoded:\n\n${this.parseError}`;
  }
}

// Keep legacy error export for compatibility
export class GetByIndexFailure extends Schema.TaggedError<GetByIndexFailure>(
  "GetByIndexFailure",
)("GetByIndexFailure", {
  tableName: Schema.String,
  indexName: Schema.String,
  indexFieldValues: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `No documents found in table '${this.tableName}' with index '${this.indexName}' and field values '${this.indexFieldValues}'`;
  }
}
