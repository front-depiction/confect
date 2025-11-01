/**
 * Confect Scheduler Service
 *
 * Provides Effect-based scheduling wrapping Convex's Scheduler API.
 *
 * Design decisions:
 * - Uses Effect.Duration instead of milliseconds for type safety
 * - Uses Effect.DateTime instead of timestamps for clarity
 * - Returns Effect for composability
 * - Depends on ConvexScheduler from convex_ctx for raw Convex scheduler access
 */

import type {
  OptionalRestArgs,
  SchedulableFunctionReference,
  Scheduler,
} from "convex/server";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { ConvexScheduler } from "./convex_ctx";

const ConfectSchedulerTypeId = Symbol.for("@rjdellecese/confect/ConfectScheduler");
type ConfectSchedulerTypeId = typeof ConfectSchedulerTypeId;

export interface IConfectScheduler {
  readonly [ConfectSchedulerTypeId]: ConfectSchedulerTypeId;
  readonly runAfter: <FuncRef extends SchedulableFunctionReference>(
    delay: Duration.DurationInput,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ) => Effect.Effect<void>;
  readonly runAt: <FuncRef extends SchedulableFunctionReference>(
    dateTime: DateTime.DateTime,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ) => Effect.Effect<void>;
}

const make = (scheduler: Scheduler): IConfectScheduler => ({

  [ConfectSchedulerTypeId]: ConfectSchedulerTypeId,

  runAfter: <FuncRef extends SchedulableFunctionReference>(
    delay: Duration.DurationInput,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ) => {
    const delayMs = Duration.toMillis(delay);
    return Effect.promise(() =>
      scheduler.runAfter(delayMs, functionReference, ...args),
    );
  },

  runAt: <FuncRef extends SchedulableFunctionReference>(
    dateTime: DateTime.DateTime,
    functionReference: FuncRef,
    ...args: OptionalRestArgs<FuncRef>
  ) => {
    const timestamp = DateTime.toEpochMillis(dateTime);
    return Effect.promise(() =>
      scheduler.runAt(timestamp, functionReference, ...args),
    );
  },
});

export class ConfectScheduler extends Effect.Service<ConfectScheduler>()("@rjdellecese/confect/ConfectScheduler", {
  effect: Effect.gen(function* () {
    const scheduler = yield* ConvexScheduler;
    return make(scheduler);
  }),
  accessors: true,
}) {}
