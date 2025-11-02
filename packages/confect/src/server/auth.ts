/**
 * Confect Auth Service
 *
 * Provides Effect-based authentication wrapping Convex's Auth API.
 *
 * Design decisions:
 * - Returns Effect for composability
 * - Fails with typed error when no user identity exists
 * - Uses Option to handle nullable user identity from Convex
 * - Depends on ConvexAuth from convex_ctx for raw Convex auth access
 */
import type { Auth, UserIdentity } from "convex/server";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ConvexAuth } from "./convex_ctx";

const ConfectAuthTypeId = Symbol.for("@rjdellecese/confect/ConfectAuth");
type ConfectAuthTypeId = typeof ConfectAuthTypeId;

export interface IConfectAuthShape {
  readonly [ConfectAuthTypeId]: ConfectAuthTypeId;
  readonly getUserIdentity: Effect.Effect<Option.Option<UserIdentity>>;
}

const make = (auth: Auth): IConfectAuthShape => ({
  [ConfectAuthTypeId]: ConfectAuthTypeId,
  getUserIdentity: Effect.promise(() => auth.getUserIdentity()).pipe(
    Effect.map(Option.fromNullable)
  ),
});

export class ConfectAuth extends Effect.Service<ConfectAuth>()("@rjdellecese/confect/ConfectAuth", {
  effect: Effect.gen(function* () {
    const auth = yield* ConvexAuth;
    return make(auth);
  }),
  accessors: true,
}) {}

