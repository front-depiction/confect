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
import type { Auth, UserIdentity } from "convex/server";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

const ConfectAuthTypeId = Symbol.for("@rjdellecese/confect/ConfectAuth");
type ConfectAuthTypeId = typeof ConfectAuthTypeId;

export interface ConfectAuth {
  readonly [ConfectAuthTypeId]: ConfectAuthTypeId;
  readonly getUserIdentity: Effect.Effect<Option.Option<UserIdentity>>;
}

export const ConfectAuth = Context.GenericTag<ConfectAuth>(
  "@rjdellecese/confect/ConfectAuth",
);


const make = (auth: Auth): ConfectAuth => ({
  [ConfectAuthTypeId]: ConfectAuthTypeId,
  getUserIdentity: Effect.promise(() => auth.getUserIdentity()).pipe(Effect.map(Option.fromNullable)
  )
});
export const layer = (auth: Auth): Layer.Layer<ConfectAuth> => Layer.succeed(ConfectAuth, make(auth));
