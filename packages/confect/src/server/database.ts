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
  GenericDataModel,
  QueryInitializer,
} from "convex/server";
import type { GenericId } from "convex/values";
import {
  Context,
  Effect,
  Layer,
  ParseResult,
  pipe,
  Schema,
} from "effect";
import type {
  DataModelFromConfectDataModel,
} from "./data_model";
import type {
  ConfectDataModelFromConfectSchemaDefinition,
  GenericConfectSchemaDefinition,
} from "./schema";
import {
  makeQueryInitializer,
  type ConfectQueryInitializer,
  getDocumentById,
} from "./query";

// ===========================
// Type Aliases (reduce noise)
// ===========================

type ConvexDataModel<ConfectSchema extends GenericConfectSchemaDefinition> =
  DataModelFromConfectDataModel<
    ConfectDataModelFromConfectSchemaDefinition<ConfectSchema>
  >;

// ===========================
// ConfectDatabaseReader
// ===========================

export interface ConfectDatabaseReader {
  readonly table: <TableName extends string>(
    tableName: TableName,
  ) => Effect.Effect<ConfectQueryInitializer>;
}

export const ConfectDatabaseReader = Context.GenericTag<ConfectDatabaseReader>(
  "@rjdellecese/confect/ConfectDatabaseReader",
);

export const layerDatabaseReader = <
  ConfectSchema extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchema,
  convexDatabaseReader: GenericDatabaseReader<ConvexDataModel<ConfectSchema>>,
): Layer.Layer<ConfectDatabaseReader> =>
  Layer.succeed(
    ConfectDatabaseReader,
    makeConfectDatabaseReader(confectSchemaDefinition, convexDatabaseReader),
  );

const makeConfectDatabaseReader = <
  ConfectSchema extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchema,
  convexDatabaseReader: GenericDatabaseReader<ConvexDataModel<ConfectSchema>>,
): ConfectDatabaseReader => ({
  table: (tableName) => {
    const tableDefinition = confectSchemaDefinition.confectSchema[tableName];
    return makeQueryInitializer(
      convexDatabaseReader.query(tableName) as QueryInitializer<never>,
      tableName,
      tableDefinition?.tableSchema,
    );
  },
});

// ===========================
// ConfectDatabaseWriter
// ===========================

export interface ConfectDatabaseWriter {
  readonly insert: <TableName extends string>(
    tableName: TableName,
    document: Record<string, unknown>,
  ) => Effect.Effect<GenericId<TableName>, DocumentEncodeError>;
  readonly patch: <TableName extends string>(
    tableName: TableName,
    id: GenericId<TableName>,
    patchedValues: Partial<Record<string, unknown>>,
  ) => Effect.Effect<void, DocumentEncodeError | DocumentDecodeError | GetByIdFailure>;
  readonly replace: <TableName extends string>(
    tableName: TableName,
    id: GenericId<TableName>,
    value: Record<string, unknown>,
  ) => Effect.Effect<void, DocumentEncodeError>;
  readonly delete: <TableName extends string>(
    tableName: TableName,
    id: GenericId<TableName>,
  ) => Effect.Effect<void>;
}

export const ConfectDatabaseWriter = Context.GenericTag<ConfectDatabaseWriter>(
  "@rjdellecese/confect/ConfectDatabaseWriter",
);

export const layerDatabaseWriter = <
  ConfectSchema extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchema,
  convexDatabaseWriter: GenericDatabaseWriter<ConvexDataModel<ConfectSchema>>,
): Layer.Layer<ConfectDatabaseWriter> =>
  Layer.succeed(
    ConfectDatabaseWriter,
    makeConfectDatabaseWriter(confectSchemaDefinition, convexDatabaseWriter),
  );

const makeConfectDatabaseWriter = <
  ConfectSchema extends GenericConfectSchemaDefinition,
>(
  confectSchemaDefinition: ConfectSchema,
  convexDatabaseWriter: GenericDatabaseWriter<ConvexDataModel<ConfectSchema>>,
): ConfectDatabaseWriter => ({
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
});

// ===========================
// Encoding Helper
// ===========================

const encodeDocument = (
  self: unknown,
  tableName: string,
  tableSchema: Schema.Schema.Any | undefined,
): Effect.Effect<unknown, DocumentEncodeError, never> => {
  if (!tableSchema) {
    return Effect.succeed(self);
  }

  return pipe(
    self,
    Schema.encode(tableSchema),
    Effect.catchTag("ParseError", (parseError) =>
      Effect.gen(function* () {
        const formattedParseError =
          yield* ParseResult.TreeFormatter.formatError(parseError);

        return yield* Effect.fail(
          new DocumentEncodeError({
            tableName,
            id: (self as { _id?: string })?._id ?? "unknown",
            parseError: formattedParseError,
          }),
        );
      }),
    ),
  ) as Effect.Effect<unknown, DocumentEncodeError, never>;
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

// Re-export from query.ts for convenience
export {
  DocumentDecodeError,
  GetByIdFailure,
} from "./query";

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
