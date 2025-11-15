/**
 * API Definition - Pure data, no handlers
 *
 * This file defines the shape of our API using the new Layer-based approach.
 * Following Effect HTTP's pattern: definitions are pure, handlers come later.
 */

import * as Api from "@rjdellecese/confect/api/internal/Api";
import * as Function from "@rjdellecese/confect/api/internal/Function";
import * as Group from "@rjdellecese/confect/api/internal/Group";
import * as Schema from "effect/Schema";
import { Id } from "./confect";
import { confectSchema } from "./schema";

// =============================================================================
// Schemas
// =============================================================================

// Note: We define schemas inline here, but they could be in a separate file
const ListNotesArgs = Schema.Struct({});
const ListNotesResult = Schema.Array(
  confectSchema.tableSchemas.notes.withSystemFields,
);

const InsertNoteArgs = Schema.Struct({
  text: Schema.String,
});
const InsertNoteResult = Id("notes");

const DeleteNoteArgs = Schema.Struct({
  noteId: Id("notes"),
});
const DeleteNoteResult = Schema.Null;

const GetRandomArgs = Schema.Struct({});
const GetRandomResult = Schema.Number;

const GetFirstArgs = Schema.Struct({});
const GetFirstResult = Schema.Option(
  confectSchema.tableSchemas.notes.withSystemFields,
);

// =============================================================================
// Function Definitions (Pure, R = never)
// =============================================================================

const listNotesQuery = Function.query("listNotes")
  .args(ListNotesArgs)
  .returns(ListNotesResult);


const insertNoteMutation = Function.mutation("insertNote")
  .args(InsertNoteArgs)
  .returns(InsertNoteResult);

const deleteNoteMutation = Function.mutation("deleteNote")
  .args(DeleteNoteArgs)
  .returns(DeleteNoteResult);

const getFirstQuery = Function.query("getFirst")
  .args(GetFirstArgs)
  .returns(GetFirstResult);

const getRandomAction = Function.action("getRandom")
  .args(GetRandomArgs)
  .returns(GetRandomResult);

// =============================================================================
// Group Definition (Pure, R = never)
// =============================================================================

export class Notes extends Group.group("notes").pipe(
  Group.add("listNotes", listNotesQuery),
  Group.add("insertNote", insertNoteMutation),
  Group.add("deleteNote", deleteNoteMutation),
  Group.add("getFirst", getFirstQuery),
  Group.add("getRandom", getRandomAction),
  g => Group.Tag(g)<Notes>()
) { }

// =============================================================================
// API Definition (Pure, R = never)
// =============================================================================

export const notesApi = Api.api("NotesApi").pipe(
  Api.add(Notes),
);
