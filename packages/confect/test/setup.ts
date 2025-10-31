import { Command } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import * as Effect from "effect/Effect";

export const setup = () =>
  Command.make("bun", "convex", "codegen").pipe(
    Command.stdout("inherit"),
    Command.stderr("inherit"),
    Command.exitCode,
    Effect.provide(NodeContext.layer),
    Effect.runPromise,
  );

export const teardown = () => {};
