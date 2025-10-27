/**
 * Confect Runner Services
 *
 * Provides Effect-based function runners wrapping Convex's runQuery, runMutation, runAction.
 *
 * Design decisions:
 * - Separate service for each function type (Query, Mutation, Action)
 * - Returns Effect for composability
 * - Mutation runner uses tryPromise to catch rollback errors
 * - Query and Action runners use promise (no expected errors from Convex)
 */

import {
  getFunctionName,
  type FunctionReference,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type OptionalRestArgs,
} from "convex/server";
import { Context, Effect, Layer, Schema } from "effect";

// ===========================
// ConfectQueryRunner
// ===========================

const ConfectQueryRunnerTypeId = Symbol.for("@rjdellecese/confect/ConfectQueryRunner");
type ConfectQueryRunnerTypeId = typeof ConfectQueryRunnerTypeId;

export interface ConfectQueryRunner {
  readonly [ConfectQueryRunnerTypeId]: ConfectQueryRunnerTypeId;
  readonly run: <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) => Effect.Effect<Awaited<ReturnType<Query>>, never>;
}

const makeQueryRunner = (
  runQuery: GenericQueryCtx<unknown>["runQuery"],
): ConfectQueryRunner => ({
  [ConfectQueryRunnerTypeId]: ConfectQueryRunnerTypeId,
  run: <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) => Effect.promise(() => runQuery(query, ...args)),
});

export const ConfectQueryRunner = Context.GenericTag<ConfectQueryRunner>(
  "@rjdellecese/confect/ConfectQueryRunner",
);

export const layerQueryRunner = (
  runQuery: GenericQueryCtx<unknown>["runQuery"],
): Layer.Layer<ConfectQueryRunner> =>
  Layer.succeed(ConfectQueryRunner, makeQueryRunner(runQuery));

// ===========================
// ConfectMutationRunner
// ===========================

const ConfectMutationRunnerTypeId = Symbol.for("@rjdellecese/confect/ConfectMutationRunner");
type ConfectMutationRunnerTypeId = typeof ConfectMutationRunnerTypeId;

export interface ConfectMutationRunner {
  readonly [ConfectMutationRunnerTypeId]: ConfectMutationRunnerTypeId;
  readonly run: <Mutation extends FunctionReference<"mutation", "public" | "internal">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Effect.Effect<Awaited<ReturnType<Mutation>>, MutationRollback>;
}

const makeMutationRunner = (
  runMutation: GenericMutationCtx<unknown>["runMutation"],
): ConfectMutationRunner => ({
  [ConfectMutationRunnerTypeId]: ConfectMutationRunnerTypeId,
  run: <Mutation extends FunctionReference<"mutation", "public" | "internal">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) =>
    Effect.tryPromise({
      try: () => runMutation(mutation, ...args),
      catch: (error) =>
        new MutationRollback({
          mutationName: getFunctionName(mutation),
          error,
        }),
    }),
});

export const ConfectMutationRunner = Context.GenericTag<ConfectMutationRunner>(
  "@rjdellecese/confect/ConfectMutationRunner",
);

export const layerMutationRunner = (
  runMutation: GenericMutationCtx<unknown>["runMutation"],
): Layer.Layer<ConfectMutationRunner> =>
  Layer.succeed(ConfectMutationRunner, makeMutationRunner(runMutation));

// ===========================
// ConfectActionRunner
// ===========================

const ConfectActionRunnerTypeId = Symbol.for("@rjdellecese/confect/ConfectActionRunner");
type ConfectActionRunnerTypeId = typeof ConfectActionRunnerTypeId;

export interface ConfectActionRunner {
  readonly [ConfectActionRunnerTypeId]: ConfectActionRunnerTypeId;
  readonly run: <Action extends FunctionReference<"action", "public" | "internal">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) => Effect.Effect<Awaited<ReturnType<Action>>, never>;
}

const makeActionRunner = (
  runAction: GenericActionCtx<unknown>["runAction"],
): ConfectActionRunner => ({
  [ConfectActionRunnerTypeId]: ConfectActionRunnerTypeId,
  run: <Action extends FunctionReference<"action", "public" | "internal">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) => Effect.promise(() => runAction(action, ...args)),
});

export const ConfectActionRunner = Context.GenericTag<ConfectActionRunner>(
  "@rjdellecese/confect/ConfectActionRunner",
);

export const layerActionRunner = (
  runAction: GenericActionCtx<unknown>["runAction"],
): Layer.Layer<ConfectActionRunner> =>
  Layer.succeed(ConfectActionRunner, makeActionRunner(runAction));

// ===========================
// Errors
// ===========================

export class MutationRollback extends Schema.TaggedError<MutationRollback>(
  "MutationRollback",
)("MutationRollback", {
  mutationName: Schema.String,
  error: Schema.Unknown,
}) {
  /* v8 ignore start */
  override get message(): string {
    return `Mutation ${this.mutationName} failed and was rolled back.\n\n${this.error}`;
  }
  /* v8 ignore stop */
}
