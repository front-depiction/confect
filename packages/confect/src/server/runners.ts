import {
  getFunctionName,
  type FunctionReference,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type OptionalRestArgs,
} from "convex/server";
import { Context, Effect, Layer, Schema } from "effect";

const makeQueryRunner =
  (runQuery: GenericQueryCtx<any>["runQuery"]) =>
  <Query extends FunctionReference<"query", "public" | "internal">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ) =>
    Effect.promise(() => runQuery(query, ...args));

const makeMutationRunner =
  (runMutation: GenericMutationCtx<any>["runMutation"]) =>
  <Mutation extends FunctionReference<"mutation", "public" | "internal">>(
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
    });

const makeActionRunner =
  (runAction: GenericActionCtx<any>["runAction"]) =>
  <Action extends FunctionReference<"action", "public" | "internal">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ) =>
    Effect.promise(() => runAction(action, ...args));

export class ConfectQueryRunner extends Context.Tag(
  "@rjdellecese/confect/ConfectQueryRunner"
)<ConfectQueryRunner, ReturnType<typeof makeQueryRunner>>() {
  static readonly layer = (runQuery: GenericQueryCtx<any>["runQuery"]) =>
    Layer.succeed(this, makeQueryRunner(runQuery));
}

export class ConfectMutationRunner extends Context.Tag(
  "@rjdellecese/confect/ConfectMutationRunner"
)<ConfectMutationRunner, ReturnType<typeof makeMutationRunner>>() {
  static readonly layer = (runMutation: GenericMutationCtx<any>["runMutation"]) =>
    Layer.succeed(this, makeMutationRunner(runMutation));
}

export class ConfectActionRunner extends Context.Tag(
  "@rjdellecese/confect/ConfectActionRunner"
)<ConfectActionRunner, ReturnType<typeof makeActionRunner>>() {
  static readonly layer = (runAction: GenericActionCtx<any>["runAction"]) =>
    Layer.succeed(this, makeActionRunner(runAction));
}

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
