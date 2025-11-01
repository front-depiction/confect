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

import {
  getFunctionName,
  type FunctionReference,
  type FunctionReturnType,
  type GenericDataModel,
  type OptionalRestArgs,
} from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import type { GenericConfectSchema } from "./schema";
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexActionCtx, ConvexMutationCtx, ConvexQueryCtx } from "./convex_ctx";

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

export const ConfectQueryRunner = Context.GenericTag<ConfectQueryRunner>(
  "@rjdellecese/confect/ConfectQueryRunner",
);

export const layerQueryRunner = Layer.effect(
  ConfectQueryRunner,
  Effect.gen(function* () {
    const { runQuery } = yield* ConvexQueryCtx;
    return makeQueryRunner(runQuery);
  })
);

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

export const ConfectMutationRunner = Context.GenericTag<ConfectMutationRunner>(
  "@rjdellecese/confect/ConfectMutationRunner",
);

export const layerMutationRunner =
  Layer.effect(
    ConfectMutationRunner,
    Effect.gen(function* () {
      const { runMutation } = yield* ConvexMutationCtx;
      return makeMutationRunner(runMutation);
    })
  );

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

export const ConfectActionRunner = Context.GenericTag<ConfectActionRunner>(
  "@rjdellecese/confect/ConfectActionRunner",
);

export const layerActionRunner = Layer.effect(
  ConfectActionRunner,
  Effect.gen(function* () {
    const { runAction } = yield* ConvexActionCtx;
    return makeActionRunner(runAction);
  })
);

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
