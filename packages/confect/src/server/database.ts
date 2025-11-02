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
  GenericQueryCtx,
  SystemDataModel,
  WithOptionalSystemFields,
  WithoutSystemFields,
} from "convex/server";
import type { GenericId } from "convex/values";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ParseResult from "effect/ParseResult";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import { ConvexMutationCtx, ConvexQueryCtx } from "./convex_ctx";
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
import {
  ConfectSchemaDefinition,
  DataModelFromConfectSchema,
  GenericConfectSchema,
} from "./schema";

// Re-export error classes for convenience
export { DocumentDecodeError, GetByIdFailure };

// ===========================
// Helper Types
// ===========================

/**
 * This is like Partial, but it also allows undefined to be passed to optional
 * fields when `exactOptionalPropertyTypes` is enabled in the tsconfig.
 */
type PatchValue<T> = {
  [P in keyof T]?: undefined extends T[P] ? T[P] | undefined : T[P];
};

// ===========================
// QueryDB - Read-only database operations
// ===========================

const QueryDBTypeId = Symbol.for("@rjdellecese/confect/QueryDB");
type QueryDBTypeId = typeof QueryDBTypeId;

/**
 * An interface to read from the database within Confect query functions.
 *
 * The three entry points are:
 *   - {@link IQueryDB.get}, which fetches a single document by its {@link GenericId}.
 *   - {@link IQueryDB.query}, which starts building a query.
 *   - {@link IQueryDB.normalizeId}, which normalizes an ID string.
 *
 * If you're using code generation, use the `QueryDB` type with your schema
 * type parameter for full type safety.
 *
 * @public
 */
export interface IQueryDB<S extends GenericConfectSchema = GenericConfectSchema> {
  readonly [QueryDBTypeId]: QueryDBTypeId;

  /**
   * Fetch a single document from the database by its {@link GenericId}.
   *
   * @param tableName - The name of the table to fetch the document from.
   * @param id - The {@link GenericId} of the document to fetch from the database.
   * @returns - An Effect containing the Option of the decoded document, or fails with DocumentDecodeError.
   */
  readonly get: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
  ) => Effect.Effect<Option.Option<ConfectDocumentFromSchema<S, TN>>, DocumentDecodeError>;

  /**
   * Begin a query for the given table name.
   *
   * Queries don't execute immediately, so calling this method and extending its
   * query are free until the results are actually used.
   *
   * @param tableName - The name of the table to query.
   * @returns - An Effect containing a {@link ConfectQueryInitializer} object to start building a query.
   */
  readonly query: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
  ) => Effect.Effect<ConfectQueryInitializer<TableInfoFromSchema<S, TN>>>;

  /**
   * Returns the string ID format for the ID in a given table, or None if the ID
   * is from a different table or is not a valid ID.
   *
   * This accepts the string ID format as well as the `.toString()` representation
   * of the legacy class-based ID format.
   *
   * This does not guarantee that the ID exists (i.e. `db.get(id)` may return None).
   *
   * @param tableName - The name of the table.
   * @param id - The ID string.
   */
  readonly normalizeId: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: string,
  ) => Option.Option<GenericId<TN>>;

  /**
   * An interface to read from the system tables within Confect query functions.
   *
   * @public
   */
  readonly system: GenericDatabaseReader<SystemDataModel>["system"];
}

const makeQueryDB = <S extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  convexDatabaseReader: GenericDatabaseReader<DataModelFromConfectSchema<S>>,
): IQueryDB<S> => ({
  [QueryDBTypeId]: QueryDBTypeId,

  system: convexDatabaseReader.system,

  normalizeId: (tableName, id) =>
    Option.fromNullable(convexDatabaseReader.normalizeId(tableName, id)),

  get: (tableName, id) => {
    const maybeSchema = Option.fromNullable(
      confectSchemaDefinition.confectSchema[tableName]?.tableSchema,
    );
    return Effect.promise(() => convexDatabaseReader.get(id)).pipe(
      Effect.map(Option.fromNullable),
      Effect.flatMap((maybeDoc) =>
        Option.match(maybeSchema, {
          onNone: () => Effect.succeed(maybeDoc),
          onSome: (schema) =>
            Option.match(maybeDoc, {
              onNone: () => Effect.succeed(Option.none()),
              onSome: (doc) =>
                Schema.decodeUnknown(schema)(doc).pipe(
                  Effect.map(Option.some),
                  Effect.mapError((parseError) =>
                    new DocumentDecodeError({
                      tableName,
                      id,
                      parseError: ParseResult.TreeFormatter.formatErrorSync(parseError),
                    }),
                  ),
                ),
            }),
        }),
      ),
    );
  },

  query: (tableName) => {
    const tableSchema = confectSchemaDefinition.confectSchema[tableName]?.tableSchema;
    const queryInit = convexDatabaseReader.query(tableName);
    return makeQueryInitializer(queryInit, tableName, tableSchema);
  },
});

export class QueryDB extends Effect.Service<QueryDB>()("@rjdellecese/confect/QueryDB", {
  effect: Effect.gen(function* () {
    const ctx = yield* ConvexQueryCtx();
    const schemaDefinition = yield* ConfectSchemaDefinition();
    return makeQueryDB(schemaDefinition, ctx.db);
  }),
}) {
  static TypedDefault<S extends GenericConfectSchema>() {
    return this.Default as Layer.Layer<QueryDB, never, GenericQueryCtx<DataModelFromConfectSchema<S>> | ConfectSchemaDefinition<S>>
  }
}

// ===========================
// MutationDB - Read and write database operations
// ===========================

const MutationDBTypeId = Symbol.for("@rjdellecese/confect/MutationDB");
type MutationDBTypeId = typeof MutationDBTypeId;

/**
 * An interface to read from and write to the database within Confect mutation
 * functions.
 *
 * Convex guarantees that all writes within a single mutation are
 * executed atomically, so you never have to worry about partial writes leaving
 * your data in an inconsistent state.
 *
 * If you're using code generation, use the `MutationDB` type with your schema
 * type parameter for full type safety.
 *
 * @public
 */
export interface IMutationDB<S extends GenericConfectSchema = GenericConfectSchema>
  extends IQueryDB<S> {
  readonly [MutationDBTypeId]: MutationDBTypeId;

  /**
   * Insert a new document into a table.
   *
   * @param tableName - The name of the table to insert a new document into.
   * @param value - The document to insert (without system fields).
   * @returns - An Effect containing the {@link GenericId} of the new document, or fails with DocumentEncodeError.
   */
  readonly insert: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    value: WithoutSystemFields<ConfectDocumentFromSchema<S, TN>>,
  ) => Effect.Effect<GenericId<TN>, DocumentEncodeError>;

  /**
   * Patch an existing document, shallow merging it with the given partial
   * document.
   *
   * New fields are added. Existing fields are overwritten. Fields set to
   * `undefined` are removed.
   *
   * @param tableName - The name of the table the document is in.
   * @param id - The {@link GenericId} of the document to patch.
   * @param value - The partial document to merge. If this new value specifies
   * system fields like `_id`, they must match the document's existing field values.
   * @returns - An Effect that succeeds when the patch is complete, or fails with errors.
   */
  readonly patch: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
    value: PatchValue<ConfectDocumentFromSchema<S, TN>>,
  ) => Effect.Effect<void, DocumentEncodeError | DocumentDecodeError | GetByIdFailure>;

  /**
   * Replace the value of an existing document, overwriting its old value.
   *
   * @param tableName - The name of the table the document is in.
   * @param id - The {@link GenericId} of the document to replace.
   * @param value - The new document. This value can omit the system fields,
   * and the database will fill them in.
   * @returns - An Effect that succeeds when the replace is complete, or fails with DocumentEncodeError.
   */
  readonly replace: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
    value: WithOptionalSystemFields<ConfectDocumentFromSchema<S, TN>>,
  ) => Effect.Effect<void, DocumentEncodeError>;

  /**
   * Delete an existing document.
   *
   * @param tableName - The name of the table the document is in.
   * @param id - The {@link GenericId} of the document to remove.
   * @returns - An Effect that succeeds when the delete is complete.
   */
  readonly delete: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
  ) => Effect.Effect<void>;

  /**
   * An interface to read from and write to the system tables within Confect
   * mutation functions.
   *
   * @public
   */
  readonly system: GenericDatabaseWriter<SystemDataModel>["system"];
}

const makeMutationDB = <S extends GenericConfectSchema>(
  confectSchemaDefinition: ConfectSchemaDefinition<S>,
  convexDatabaseWriter: GenericDatabaseWriter<ConvexDataModel<ConfectSchemaDefinition<S>>>,
): IMutationDB<S> => {
  const reader = makeQueryDB(confectSchemaDefinition, convexDatabaseWriter);

  return {
    ...reader,
    [MutationDBTypeId]: MutationDBTypeId,
    system: convexDatabaseWriter.system,

    insert: (tableName, document) =>
      Effect.gen(function* () {
        const tableSchema = confectSchemaDefinition.confectSchema[tableName]?.tableSchema;
        const encodedDocument = yield* encodeDocument(document, tableName, tableSchema);
        return yield* Effect.promise(() =>
          convexDatabaseWriter.insert(tableName, encodedDocument as never),
        );
      }),

    patch: (tableName, id, patchedValues) =>
      Effect.gen(function* () {
        const tableSchema = confectSchemaDefinition.confectSchema[tableName]?.tableSchema;
        const original = yield* getDocumentById(tableName, id, convexDatabaseWriter, tableSchema);
        const updated = { ...original, ...patchedValues };
        const encodedDocument = yield* encodeDocument(updated, tableName, tableSchema);
        yield* Effect.promise(() => convexDatabaseWriter.replace(id, encodedDocument));
      }),

    replace: (tableName, id, value) =>
      Effect.gen(function* () {
        const tableSchema = confectSchemaDefinition.confectSchema[tableName]?.tableSchema;
        const encodedDocument = yield* encodeDocument(value, tableName, tableSchema);
        yield* Effect.promise(() => convexDatabaseWriter.replace(id, encodedDocument as never));
      }),

    delete: (_tableName, id) => Effect.promise(() => convexDatabaseWriter.delete(id)),
  };
};

export class MutationDB extends Effect.Service<MutationDB>()("@rjdellecese/confect/MutationDB", {
  effect: Effect.gen(function* () {
    const ctx = yield* ConvexMutationCtx();
    const schemaDefinition = yield* ConfectSchemaDefinition();
    return makeMutationDB(schemaDefinition, ctx.db);
  }),
  dependencies: [QueryDB.Default],
}) {
  static TypedDefault<S extends GenericConfectSchema>() {
    return this.Default as Layer.Layer<MutationDB, never, ReturnType<typeof ConvexMutationCtx<S>> | ConfectSchemaDefinition<S>>
  }
}
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

  const extractIdForError = (doc: unknown): string =>
    Predicate.hasProperty(doc, "_id") && Predicate.isString(doc._id) ? doc._id : "unknown";

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
