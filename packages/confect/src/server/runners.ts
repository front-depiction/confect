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
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { ConvexActionRunner, ConvexMutationRunner, ConvexQueryRunner } from "./convex_ctx";
import { GenericConfectSchema } from "./schema";

// ===========================
// ConfectQueryRunner
// ===========================

const ConfectQueryRunnerTypeId = Symbol.for("@rjdellecese/confect/ConfectQueryRunner");
type ConfectQueryRunnerTypeId = typeof ConfectQueryRunnerTypeId;

export interface IConfectQueryRunner {
  readonly [ConfectQueryRunnerTypeId]: ConfectQueryRunnerTypeId;
  readonly run: <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) => Effect.Effect<FunctionReturnType<Query>>;
}

const makeQueryRunner = (runQuery: GenericQueryCtx<never>["runQuery"]): IConfectQueryRunner => ({
  [ConfectQueryRunnerTypeId]: ConfectQueryRunnerTypeId,
  run: <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) => Effect.promise(() => runQuery(query, ...args)),
});

export class ConfectQueryRunner extends Effect.Service<ConfectQueryRunner>()("@rjdellecese/confect/ConfectQueryRunner", {
  effect: Effect.gen(function* () {
    const { runQuery } = yield* ConvexQueryRunner();
    return makeQueryRunner(runQuery);
  }),
  accessors: true,
}) {
  static TypedDefault<S extends GenericConfectSchema>() {
    return this.Default as Layer.Layer<ConfectQueryRunner, never, ConvexQueryRunner<S>>
  }
}



// ===========================
// ConfectMutationRunner
// ===========================

const ConfectMutationRunnerTypeId = Symbol.for("@rjdellecese/confect/ConfectMutationRunner");
type ConfectMutationRunnerTypeId = typeof ConfectMutationRunnerTypeId;

export interface IConfectMutationRunner {
  readonly [ConfectMutationRunnerTypeId]: ConfectMutationRunnerTypeId;
  readonly run: <Mutation extends FunctionReference<"mutation", "public" | "internal">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ) => Effect.Effect<FunctionReturnType<Mutation>, MutationRollback>;
}

const makeMutationRunner = (
  runMutation: GenericMutationCtx<never>["runMutation"],
): IConfectMutationRunner => ({
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

export class ConfectMutationRunner extends Effect.Service<ConfectMutationRunner>()("@rjdellecese/confect/ConfectMutationRunner", {
  effect: Effect.gen(function* () {
    const { runMutation } = yield* ConvexMutationRunner();
    return makeMutationRunner(runMutation);
  }),
  accessors: true,
}) {}

// ===========================
// ConfectActionRunner
// ===========================

const ConfectActionRunnerTypeId = Symbol.for("@rjdellecese/confect/ConfectActionRunner");
type ConfectActionRunnerTypeId = typeof ConfectActionRunnerTypeId;

export interface IConfectActionRunner {
  readonly [ConfectActionRunnerTypeId]: ConfectActionRunnerTypeId;
  readonly run: <Action extends FunctionReference<"action", "public" | "internal">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) => Effect.Effect<FunctionReturnType<Action>>;
}

const makeActionRunner = (runAction: GenericActionCtx<never>["runAction"]): IConfectActionRunner => ({
  [ConfectActionRunnerTypeId]: ConfectActionRunnerTypeId,
  run: <Action extends FunctionReference<"action", "public" | "internal">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) => Effect.promise(() => runAction(action, ...args)),
});

export class ConfectActionRunner extends Effect.Service<ConfectActionRunner>()("@rjdellecese/confect/ConfectActionRunner", {
  effect: Effect.gen(function* () {
    const { runAction } = yield* ConvexActionRunner();
    return makeActionRunner(runAction);
  }),
  accessors: true,
}) {}

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
