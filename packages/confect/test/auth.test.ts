import { describe } from "@effect/vitest";
import { assertEquals } from "@effect/vitest/utils";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { api } from "./convex/_generated/api";
import { TestConvexService } from "./TestConvexService";
import { effect } from "./test_utils";

describe("authentication", () => {
  effect("when user is authenticated", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const name = "Joe";

      const asUser = c.withIdentity({
        name,
      });

      const userIdentityOption = yield* asUser.query(api.auth.getUserIdentity, {});

      assertEquals(Option.isSome(userIdentityOption), true);
      if (Option.isSome(userIdentityOption)) {
        assertEquals(userIdentityOption.value.name, name);
      }
    }),
  );

  effect("when user is not authenticated", () =>
    Effect.gen(function* () {
      const c = yield* TestConvexService;

      const userIdentityOption = yield* c.query(api.auth.getUserIdentity, {});

      assertEquals(Option.isNone(userIdentityOption), true);
    }),
  );
});
