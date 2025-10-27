/**
 * Confect Auth Service
 *
 * Provides Effect-based authentication wrapping Convex's Auth API.
 *
 * Design decisions:
 * - Returns Effect for composability
 * - Fails with typed error when no user identity exists
 * - Uses Option to handle nullable user identity from Convex
 */

import type { Auth } from "convex/server";
import { Context, Effect, Layer, Option, Schema } from "effect";

const ConfectAuthTypeId = Symbol.for("@rjdellecese/confect/ConfectAuth");
type ConfectAuthTypeId = typeof ConfectAuthTypeId;

type UserIdentity = Exclude<
  Awaited<ReturnType<Auth["getUserIdentity"]>>,
  null
>;

export interface ConfectAuth {
  readonly [ConfectAuthTypeId]: ConfectAuthTypeId;
  readonly getUserIdentity: Effect.Effect<
    UserIdentity,
    NoUserIdentityFoundError
  >;
}

const make = (auth: Auth): ConfectAuth => ({
  [ConfectAuthTypeId]: ConfectAuthTypeId,
  getUserIdentity: Effect.promise(() => auth.getUserIdentity()).pipe(
    Effect.flatMap((identity) =>
      Option.match(Option.fromNullable(identity), {
        onNone: () => Effect.fail(new NoUserIdentityFoundError()),
        onSome: Effect.succeed,
      }),
    ),
  ),
});

export const ConfectAuth = Context.GenericTag<ConfectAuth>(
  "@rjdellecese/confect/ConfectAuth",
);

export const layer = (auth: Auth): Layer.Layer<ConfectAuth> =>
  Layer.succeed(ConfectAuth, make(auth));

export class NoUserIdentityFoundError extends Schema.TaggedError<NoUserIdentityFoundError>(
  "NoUserIdentityFoundError",
)("NoUserIdentityFoundError", {}) {
  override get message(): string {
    return "No user identity found";
  }
}
