/**
 * API Export - Convert Layer-based API to Convex functions
 *
 * This file uses Api.serve() to convert our Layer-based API definition
 * into Convex registered functions that can be imported by clients.
 *
 * The result is a nested object:
 * {
 *   notes: {
 *     listNotes: RegisteredQuery,
 *     insertNote: RegisteredMutation,
 *     deleteNote: RegisteredMutation,
 *     getFirst: RegisteredQuery,
 *     getRandom: RegisteredAction
 *   }
 * }
 */

import * as Api from "@rjdellecese/confect/api/internal/Api";
import { notesApi } from "./api.definition";
import { NotesApiLayer } from "./api.implementation";
import { confectSchema } from "./schema";

// Export the Convex functions
export default Api.serve(confectSchema, notesApi, NotesApiLayer);

/**
 * Compare with old approach:
 *
 * OLD (functions.ts):
 * ```
 * export const insertNote = confectMutation({
 *   args: InsertNoteArgs,
 *   returns: InsertNoteResult,
 *   handler: ({ text }) => Effect.gen(function* () {
 *     const writer = yield* ConfectDatabaseWriter;
 *     return yield* writer.insert("notes", { text });
 *   }),
 * });
 * ```
 *
 * NEW (this file):
 * 1. Define API shape in api.definition.ts (pure, no handlers)
 * 2. Implement handlers in api.implementation.ts (Layer-based)
 * 3. Serve with Api.serve() (this file)
 *
 * Benefits:
 * - Clear separation of definition and implementation
 * - Type-safe dependency management via Layers
 * - Easy to mock/test with Group.buildMock()
 * - Composable with Layer.provide()
 * - Follows Effect HTTP's proven patterns
 */
