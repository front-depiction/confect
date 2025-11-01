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
 * - Depends on Convex runner tags from convex_ctx for raw runner access
 */

import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from "convex/server";
import {
  getFunctionName,
  type FunctionReference,
  type FunctionReturnType,
  type OptionalRestArgs,
} from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { ConvexActionRunner, ConvexMutationRunner, ConvexQueryRunner } from "./convex_ctx";

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
  ) => Effect.Effect<FunctionReturnType<Query>>;
}

const makeQueryRunner = (runQuery: GenericQueryCtx<never>["runQuery"]): ConfectQueryRunner => ({
  [ConfectQueryRunnerTypeId]: ConfectQueryRunnerTypeId,
  run: <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) => Effect.promise(() => runQuery(query, ...args)),
});

const _ConfectQueryRunner = Context.GenericTag<ConfectQueryRunner>(
  "@rjdellecese/confect/ConfectQueryRunner",
);

const DefaultConfectQueryRunner = Layer.effect(
  _ConfectQueryRunner,
  Effect.gen(function* () {
    const { runQuery } = yield* ConvexQueryRunner();
    return makeQueryRunner(runQuery);
  })
);

export const ConfectQueryRunner = Object.assign(_ConfectQueryRunner, {
  Default: DefaultConfectQueryRunner,
});

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
  ) => Effect.Effect<FunctionReturnType<Mutation>, MutationRollback>;
}

const makeMutationRunner = (
  runMutation: GenericMutationCtx<never>["runMutation"],
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

const _ConfectMutationRunner = Context.GenericTag<ConfectMutationRunner>(
  "@rjdellecese/confect/ConfectMutationRunner",
);

const DefaultConfectMutationRunner = Layer.effect(
  _ConfectMutationRunner,
  Effect.gen(function* () {
    const { runMutation } = yield* ConvexMutationRunner();
    return makeMutationRunner(runMutation);
  })
);

export const ConfectMutationRunner = Object.assign(_ConfectMutationRunner, {
  Default: DefaultConfectMutationRunner,
});

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
  ) => Effect.Effect<FunctionReturnType<Action>>;
}

const makeActionRunner = (runAction: GenericActionCtx<never>["runAction"]): ConfectActionRunner => ({
  [ConfectActionRunnerTypeId]: ConfectActionRunnerTypeId,
  run: <Action extends FunctionReference<"action", "public" | "internal">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) => Effect.promise(() => runAction(action, ...args)),
});

const _ConfectActionRunner = Context.GenericTag<ConfectActionRunner>(
  "@rjdellecese/confect/ConfectActionRunner",
);

const DefaultConfectActionRunner = Layer.effect(
  _ConfectActionRunner,
  Effect.gen(function* () {
    const { runAction } = yield* ConvexActionRunner();
    return makeActionRunner(runAction);
  })
);

export const ConfectActionRunner = Object.assign(_ConfectActionRunner, {
  Default: DefaultConfectActionRunner,
});

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
