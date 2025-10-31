/**
 * Confect Scheduler Service
 *
 * Provides Effect-based scheduling wrapping Convex's Scheduler API.
 *
 * Design decisions:
 * - Uses Effect.Duration instead of milliseconds for type safety
 * - Uses Effect.DateTime instead of timestamps for clarity
 * - Returns Effect for composability
 */

import type {
  OptionalRestArgs,
  SchedulableFunctionReference,
  Scheduler,
} from "convex/server";
import * as Layer from "effect/Layer";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";
import * as DateTime from "effect/DateTime";
import * as Context from "effect/Context";

const ConfectSchedulerTypeId = Symbol.for("@rjdellecese/confect/ConfectScheduler");
type ConfectSchedulerTypeId = typeof ConfectSchedulerTypeId;

export interface ConfectScheduler {
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
export const ConfectScheduler = Context.GenericTag<ConfectScheduler>(
  "@rjdellecese/confect/ConfectScheduler",
);

const make = (scheduler: Scheduler): ConfectScheduler => ({

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



export const layer = (scheduler: Scheduler): Layer.Layer<ConfectScheduler> =>
  Layer.succeed(ConfectScheduler, make(scheduler));
