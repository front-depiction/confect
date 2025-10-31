import type { UserIdentity as ConvexUserIdentity } from "convex/server";
import * as Schema from "effect/Schema";
import { expectTypeOf, test } from "vitest";
import { UserIdentity } from "../../src/server/schemas/UserIdentity";

test("UserIdentity encoded schema extends Convex type", () => {
  const _userIdentity = UserIdentity({
    foo: Schema.String,
  });
  type EncodedUserIdentity = typeof _userIdentity.Encoded;

  expectTypeOf<EncodedUserIdentity>().toExtend<ConvexUserIdentity>();
});
