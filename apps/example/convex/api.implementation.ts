/**
 * API Implementation - Layer-based handlers with dependencies
 *
 * This file implements the handlers for our API using Effect Layers.
 *
 * Note: Convex runtime services (QueryDB, MutationDB, etc.) are special - they depend
 * on the runtime ctx parameter and can't be provided ahead of time. Instead, handlers
 * have open R requirements that get provided by Api.serve() when wrapping with Convex.
 *
 * Application-level dependencies (custom services) CAN be provided via Layers.
 */

import * as Api from "@rjdellecese/confect/api/internal/Api";
import * as Group from "@rjdellecese/confect/api/internal/Group";
import { MutationDB } from "@rjdellecese/confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { notesApi, notesGroup } from "./api.definition";
import { QueryDB } from "./confect";

// =============================================================================
// Notes Group Implementation
// =============================================================================
/**
 * Live implementation of the notes group.
 *
 * Handlers have open R requirements (QueryDB, MutationDB) that get provided
 * by the Convex runtime when Api.serve() wraps them.
 */
export const NotesGroupLive = Group.build(
  notesGroup,
  Effect.gen(function* () {
    const queryDb = yield* QueryDB;
    const mutationDb = yield* MutationDB;

    return {
      listNotes: () =>
        Effect.gen(function* () {
          return yield* queryDb
            .query("notes")
            .withIndex("by_creation_time")
            .collect();
        }),

      insertNote: (args) =>
        Effect.gen(function* () {
          return yield* mutationDb.insert("notes", { text: args.text });
        }),

      deleteNote: (args) =>
        Effect.gen(function* () {
          yield* mutationDb.delete("notes", args.noteId);
          return null;
        }),

      getFirst: () =>
        Effect.gen(function* () {
          return yield* queryDb.query("notes").withIndex("by_creation_time").first();
        }),

      getRandom: () => Effect.succeed(Math.random()),
    };
  }),
);

// Type check: Layer provides GroupService, no requirements (handlers have open R)
// Layer.Layer<Group.GroupService<"notes">, never, never>

// =============================================================================
// Complete API Layer
// =============================================================================

/**
 * The complete API Layer, fully resolved and ready for Api.serve().
 *
 * Since we're using Convex runtime services which are provided automatically,
 * this Layer has no requirements.
 *
 * If you had application-level dependencies, you'd provide them here:
 * ```
 * const NotesApiLayer = Api.build(notesApi).pipe(
 *   Layer.provide(NotesGroupLive),
 *   Layer.provide(MyCustomServiceLive),  // Custom app dependency
 * );
 * ```
 */
export const NotesApiLayer = Api.build(notesApi).pipe(
  Layer.provide(NotesGroupLive)
);

// Type check: Layer fully resolved, ready for Api.serve()
// Layer.Layer<Api.ApiService, never, never>
