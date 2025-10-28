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
import * as ParseResult from "effect/ParseResult";
import { pipe } from "effect/Function";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
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

// Re-export error classes for convenience
export { DocumentDecodeError, GetByIdFailure };
import type {
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "./schema";



// ===========================
// ConfectDatabaseReader
// ===========================

export interface ConfectDatabaseReader<
  S extends GenericConfectSchema = GenericConfectSchema,
> {
  readonly get: <TN extends TableNamesFromSchema<S>>(
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

export const ConfectDatabaseReader = Context.GenericTag<ConfectDatabaseReader>(
  "@rjdellecese/confect/ConfectDatabaseReader",
);

export const makeConfectDatabaseReader = <
  S extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  convexDatabaseReader: GenericDatabaseReader<ConvexDataModel<ConfectSchemaDefinition<S>>>,
): ConfectDatabaseReader<S> => ({
  get: (tableName, id) => {
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

export const layerDatabaseReader = <
  S extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  convexDatabaseReader: GenericDatabaseReader<ConvexDataModel<ConfectSchemaDefinition<S>>>,
): Layer.Layer<ConfectDatabaseReader<S>> =>
  Layer.succeed(
    ConfectDatabaseReader,
    makeConfectDatabaseReader(confectSchemaDefinition, convexDatabaseReader),
  );

// ===========================
// ConfectDatabaseWriter
// ===========================

export interface ConfectDatabaseWriter<
  S extends GenericConfectSchema = GenericConfectSchema,
> extends ConfectDatabaseReader<S> {
  readonly insert: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    document: WithoutSystemFields<ConfectDocumentFromSchema<S, TN>>,
  ) => Effect.Effect<GenericId<TN>, DocumentEncodeError>;
  readonly patch: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
    patchedValues: Partial<WithoutSystemFields<ConfectDocumentFromSchema<S, TN>>>,
  ) => Effect.Effect<void, DocumentEncodeError | DocumentDecodeError | GetByIdFailure>;
  readonly replace: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
    value: WithoutSystemFields<ConfectDocumentFromSchema<S, TN>>,
  ) => Effect.Effect<void, DocumentEncodeError>;
  readonly delete: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
  ) => Effect.Effect<void>;
}

export const ConfectDatabaseWriter = Context.GenericTag<ConfectDatabaseWriter>(
  "@rjdellecese/confect/ConfectDatabaseWriter",
);

export const makeConfectDatabaseWriter = <
  S extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  convexDatabaseWriter: GenericDatabaseWriter<ConvexDataModel<ConfectSchemaDefinition<S>>>,
): ConfectDatabaseWriter<S> => {
  const reader = makeConfectDatabaseReader(confectSchemaDefinition, convexDatabaseWriter);

  return {
    ...reader,

    insert: (tableName, document) =>
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

    patch: (tableName, id, patchedValues) =>
      Effect.gen(function* () {
        const tableDefinition = confectSchemaDefinition.confectSchema[tableName];
        const original = yield* getDocumentById(
          tableName,
          id,
          convexDatabaseWriter,
          tableDefinition?.tableSchema,
        );
        const updated = { ...(original as object), ...patchedValues };
        const encodedDocument = yield* encodeDocument(
          updated,
          tableName,
          tableDefinition?.tableSchema,
        );
        yield* Effect.promise(() =>
          convexDatabaseWriter.replace(id, encodedDocument as never),
        );
      }),

    replace: (tableName, id, value) =>
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

    delete: (_tableName, id) => Effect.promise(() => convexDatabaseWriter.delete(id)),
  };
};

export const layerDatabaseWriter = <
  S extends GenericConfectSchema,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  convexDatabaseWriter: GenericDatabaseWriter<ConvexDataModel<ConfectSchemaDefinition<S>>>,
): Layer.Layer<ConfectDatabaseWriter<S>> =>
  Layer.succeed(
    ConfectDatabaseWriter,
    makeConfectDatabaseWriter(confectSchemaDefinition, convexDatabaseWriter),
  );

// ===========================
// Encoding Helper
// ===========================

const encodeDocument = <A, I>(
  self: A,
  tableName: string,
  tableSchema: Schema.Schema<A, I> | undefined,
): Effect.Effect<I, DocumentEncodeError> => {
  if (!tableSchema) {
    return Effect.succeed(self as unknown as I);
  }

  return pipe(
    Schema.encode(tableSchema)(self),
    Effect.mapError((parseError) =>
      new DocumentEncodeError({
        tableName,
        id: (self as { _id?: string })?._id ?? "unknown",
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
