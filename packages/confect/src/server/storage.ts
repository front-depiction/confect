/**
 * Confect Storage Services
 *
 * Provides Effect-based storage capabilities wrapping Convex's Storage API.
 *
 * Design decisions:
 * - Three separate services for different capabilities (Reader, Writer, ActionWriter)
 * - Returns Effect for composability
 * - Uses typed errors for failure cases
 * - Decodes URLs using Schema.URL for type safety
 * - Depends on Convex storage tags from convex_ctx for raw Convex storage access
 */

import type {
  StorageActionWriter,
  StorageReader,
  StorageWriter,
} from "convex/server";
import type { GenericId } from "convex/values";
import { pipe } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  ConvexStorageActionWriter,
  ConvexStorageReader,
  ConvexStorageWriter,
} from "./convex_ctx";

// ===========================
// ConfectStorageReader
// ===========================

const ConfectStorageReaderTypeId = Symbol.for("@rjdellecese/confect/ConfectStorageReader");
type ConfectStorageReaderTypeId = typeof ConfectStorageReaderTypeId;

export interface ConfectStorageReaderShape {
  readonly [ConfectStorageReaderTypeId]: ConfectStorageReaderTypeId;
  readonly getUrl: (
    storageId: GenericId<"_storage">,
  ) => Effect.Effect<URL, FileNotFoundError>;
}

const makeStorageReader = (storageReader: StorageReader): ConfectStorageReaderShape => ({
  [ConfectStorageReaderTypeId]: ConfectStorageReaderTypeId,
  getUrl: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageReader.getUrl(storageId)).pipe(
      Effect.map(Option.fromNullable),
      Effect.flatMap(Option.match({
        onNone: () => Effect.fail(new FileNotFoundError({ id: storageId })),
        onSome: (url) => pipe(url, Schema.decode(Schema.URL), Effect.orDie),
      }),
      ),
    ),
});

export class ConfectStorageReader extends Effect.Service<ConfectStorageReader>()("@rjdellecese/confect/ConfectStorageReader", {
  effect: Effect.gen(function* () {
    const storageReader = yield* ConvexStorageReader;
    return makeStorageReader(storageReader);
  }),
  accessors: true,
}) {}

// Factory function for providing a specific StorageReader instance
export const layerStorageReader = (storageReader: StorageReader) =>
  Layer.succeed(ConfectStorageReader as any, makeStorageReader(storageReader) as any);

// ===========================
// ConfectStorageWriter
// ===========================

const ConfectStorageWriterTypeId = Symbol.for("@rjdellecese/confect/ConfectStorageWriter");
type ConfectStorageWriterTypeId = typeof ConfectStorageWriterTypeId;

export interface IConfectStorageWriter {
  readonly [ConfectStorageWriterTypeId]: ConfectStorageWriterTypeId;
  readonly generateUploadUrl: () => Effect.Effect<URL>;
  readonly delete: (
    storageId: GenericId<"_storage">,
  ) => Effect.Effect<void, FileNotFoundError>;
}

const makeStorageWriter = (storageWriter: StorageWriter): IConfectStorageWriter => ({
  [ConfectStorageWriterTypeId]: ConfectStorageWriterTypeId,
  generateUploadUrl: () => Effect.promise(() => storageWriter.generateUploadUrl()).pipe(
    Effect.flatMap(Schema.decode(Schema.URL)),
    Effect.orDie
  ),
  delete: (storageId: GenericId<"_storage">) => Effect.tryPromise({
    try: () => storageWriter.delete(storageId),
    catch: () => new FileNotFoundError({ id: storageId }),
  }),
});

export class ConfectStorageWriter extends Effect.Service<ConfectStorageWriter>()("@rjdellecese/confect/ConfectStorageWriter", {
  effect: Effect.gen(function* () {
    const storageWriter = yield* ConvexStorageWriter;
    return makeStorageWriter(storageWriter);
  }),
  accessors: true,
}) {}

// Factory function for providing a specific StorageWriter instance
export const layerStorageWriter = (storageWriter: StorageWriter) =>
  Layer.succeed(ConfectStorageWriter as any, makeStorageWriter(storageWriter) as any);

// ===========================
// ConfectStorageActionWriter
// ===========================

const ConfectStorageActionWriterTypeId = Symbol.for("@rjdellecese/confect/ConfectStorageActionWriter");
type ConfectStorageActionWriterTypeId = typeof ConfectStorageActionWriterTypeId;

export interface ConfectStorageActionWriterShape {
  readonly [ConfectStorageActionWriterTypeId]: ConfectStorageActionWriterTypeId;
  readonly get: (
    storageId: GenericId<"_storage">,
  ) => Effect.Effect<Blob, FileNotFoundError>;
  readonly store: (
    blob: Blob,
    options?: { sha256?: string },
  ) => Effect.Effect<GenericId<"_storage">>;
}

const makeStorageActionWriter = (
  storageActionWriter: StorageActionWriter,
): ConfectStorageActionWriterShape => ({
  [ConfectStorageActionWriterTypeId]: ConfectStorageActionWriterTypeId,
  get: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageActionWriter.get(storageId)).pipe(
      Effect.flatMap(Option.fromNullable),
      Effect.mapError(() => new FileNotFoundError({ id: storageId }))
    ),
  store: (blob: Blob, options?: { sha256?: string }) => Effect.promise(() => storageActionWriter.store(blob, options)),
});

export class ConfectStorageActionWriter extends Effect.Service<ConfectStorageActionWriter>()("@rjdellecese/confect/ConfectStorageActionWriter", {
  effect: Effect.gen(function* () {
    const storageActionWriter = yield* ConvexStorageActionWriter;
    return makeStorageActionWriter(storageActionWriter);
  }),
  accessors: true,
}) {}

// Factory function for providing a specific StorageActionWriter instance
export const layerStorageActionWriter = (storageActionWriter: StorageActionWriter) =>
  Layer.succeed(ConfectStorageActionWriter as any, makeStorageActionWriter(storageActionWriter) as any);

// ===========================
// Errors
// ===========================

export class FileNotFoundError extends Schema.TaggedError<FileNotFoundError>(
  "FileNotFoundError",
)("FileNotFoundError", {
  id: Schema.String,
}) {
  override get message(): string {
    return `File with ID '${this.id}' not found`;
  }
}
