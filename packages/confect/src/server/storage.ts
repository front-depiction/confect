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
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import {
  ConvexStorageReader,
  ConvexStorageWriter,
  ConvexStorageActionWriter,
} from "./convex_ctx";
import type { GenericConfectSchema } from "./schema";
import type { GenericDataModel } from "convex/server";

// ===========================
// ConfectStorageReader
// ===========================

const ConfectStorageReaderTypeId = Symbol.for("@rjdellecese/confect/ConfectStorageReader");
type ConfectStorageReaderTypeId = typeof ConfectStorageReaderTypeId;

export interface ConfectStorageReader {
  readonly [ConfectStorageReaderTypeId]: ConfectStorageReaderTypeId;
  readonly getUrl: (
    storageId: GenericId<"_storage">,
  ) => Effect.Effect<URL, FileNotFoundError>;
}

const makeStorageReader = (storageReader: StorageReader): ConfectStorageReader => ({
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

export const ConfectStorageReader = Context.GenericTag<ConfectStorageReader>(
  "@rjdellecese/confect/ConfectStorageReader",
);

export const layerStorageReader = Layer.effect(
  ConfectStorageReader,
  Effect.gen(function* () {
    const storageReader = yield* ConvexStorageReader;
    return makeStorageReader(storageReader);
  })
);

// ===========================
// ConfectStorageWriter
// ===========================

const ConfectStorageWriterTypeId = Symbol.for("@rjdellecese/confect/ConfectStorageWriter");
type ConfectStorageWriterTypeId = typeof ConfectStorageWriterTypeId;

export interface ConfectStorageWriter {
  readonly [ConfectStorageWriterTypeId]: ConfectStorageWriterTypeId;
  readonly generateUploadUrl: () => Effect.Effect<URL>;
  readonly delete: (
    storageId: GenericId<"_storage">,
  ) => Effect.Effect<void, FileNotFoundError>;
}

const makeStorageWriter = (storageWriter: StorageWriter): ConfectStorageWriter => ({
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

export const ConfectStorageWriter = Context.GenericTag<ConfectStorageWriter>(
  "@rjdellecese/confect/ConfectStorageWriter",
);

export const layerStorageWriter = Layer.effect(
  ConfectStorageWriter,
  Effect.gen(function* () {
    const storageWriter = yield* ConvexStorageWriter;
    return makeStorageWriter(storageWriter);
  })
);

// ===========================
// ConfectStorageActionWriter
// ===========================

const ConfectStorageActionWriterTypeId = Symbol.for("@rjdellecese/confect/ConfectStorageActionWriter");
type ConfectStorageActionWriterTypeId = typeof ConfectStorageActionWriterTypeId;

export interface ConfectStorageActionWriter {
  readonly [ConfectStorageActionWriterTypeId]: ConfectStorageActionWriterTypeId;
  readonly get: (
    storageId: GenericId<"_storage">,
  ) => Effect.Effect<Blob, FileNotFoundError>;
  readonly store: (
    blob: Blob,
    options?: { sha256?: string },
  ) => Effect.Effect<GenericId<"_storage">, never>;
}

const makeStorageActionWriter = (
  storageActionWriter: StorageActionWriter,
): ConfectStorageActionWriter => ({
  [ConfectStorageActionWriterTypeId]: ConfectStorageActionWriterTypeId,
  get: (storageId: GenericId<"_storage">) =>
    Effect.promise(() => storageActionWriter.get(storageId)).pipe(
      Effect.flatMap(Option.fromNullable),
      Effect.mapError(() => new FileNotFoundError({ id: storageId }))
    ),
  store: (blob: Blob, options?: { sha256?: string }) => Effect.promise(() => storageActionWriter.store(blob, options)),
});

export const ConfectStorageActionWriter = Context.GenericTag<ConfectStorageActionWriter>(
  "@rjdellecese/confect/ConfectStorageActionWriter",
);

export const layerStorageActionWriter = Layer.effect(
  ConfectStorageActionWriter,
  Effect.gen(function* () {
    const storageActionWriter = yield* ConvexStorageActionWriter;
    return makeStorageActionWriter(storageActionWriter);
  })
);

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
