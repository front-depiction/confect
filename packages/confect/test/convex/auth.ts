import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { UserIdentity } from "../../src/server/schemas/UserIdentity";
import { ConfectAuth, confectQuery } from "./confect";

export const getUserIdentity = confectQuery({
  args: Schema.Struct({}),
  returns: Schema.OptionFromSelf(UserIdentity({})),
  handler: () =>
    Effect.gen(function* () {
      const auth = yield* ConfectAuth;

      return yield* auth.getUserIdentity;
    }),
});
