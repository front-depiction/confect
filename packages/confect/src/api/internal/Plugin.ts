/**
 * @module internal/Plugin
 *
 * Plugin system for enhancing service layers.
 * Plugins wrap existing services with additional behavior (logging, validation, triggers, etc.)
 *
 * ## Design
 *
 * - Plugins enhance services by wrapping the base implementation
 * - Compose via .pipe() on layers
 * - Pattern: `Layer.empty.pipe(plugin, Layer.provide(requirement))`
 * - **Execution order**: Plugins execute in **right-to-left** order (reverse of pipe)
 *   - Last plugin in the pipe executes first (outermost wrapper)
 *   - First plugin in the pipe executes last (innermost wrapper, closest to base)
 *
 * ## Pattern
 *
 * ```typescript
 * const withLogging = Plugin.forTag(MutationDB, (base) => ({
 *   insert: (table, value) =>
 *     Effect.gen(function*() {
 *       yield* Effect.log("inserting");
 *       return yield* base.insert(table, value);
 *     })
 * }));
 *
 * // Plugins execute right-to-left: withValidation -> withLogging -> base
 * const Enhanced = Layer.empty.pipe(
 *   withLogging,
 *   withValidation,
 *   Layer.provide(MutationDBLive)
 * );
 * ```
 *
 * @since 1.0.0
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Function from "effect/Function";
import * as Option from "effect/Option";
// =============================================================================
// Core Plugin Types
// =============================================================================

/**
 * A plugin is a function returned by `Layer.updateService`.
 *
 * It transforms a Layer by wrapping a service, requiring the service (I) as input
 * and providing the enhanced version as output.
 *
 * The signature matches `Layer.updateService` return type:
 * - Requires: I (the service being enhanced) + R (additional dependencies)
 * - Provides: A (passthrough from input layer)
 * - Errors: E (from enhancement) | E2 (from input layer)
 *
 * @template I - Service identifier type
 * @template E - Error type from enhancement
 * @template R - Additional requirements for enhancement
 *
 * @since 1.0.0
 */
export type Plugin<I, E = never, R = never> = <A, E2, R2>(
  self: Layer.Layer<A, E2, R2>
) => Layer.Layer<A | I, E | E2, I | R | R2>;



// =============================================================================
// Plugin Constructors
// =============================================================================

/**
 * Create a plugin that enhances a service with synchronous wrapper.
 *
 * The wrapper function receives the base service and returns an enhanced version.
 * You can return a complete service or a partial with only the enhanced methods.
 * Unspecified methods will be passed through from the base service.
 *
 * @param tag - Service tag to enhance
 * @param wrapper - Function that wraps the base service
 * @returns Plugin function that can be piped onto layers
 *
 * @category Constructors
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * // Return only the enhanced method (partial)
 * const withLogging = Plugin.forTag(MutationDB, (base) => ({
 *   insert: (table, value) =>
 *     Effect.gen(function*() {
 *       yield* Effect.logInfo(`Inserting into ${table}`);
 *       return yield* base.insert(table, value);
 *     })
 * }));
 *
 * const Enhanced = Layer.empty.pipe(withLogging, Layer.provide(MutationDBLive));
 * ```
 */
export const forTag = <I, S>(
  tag: Context.Tag<I, S>,
  wrapper: (base: S) => S | Partial<S>
): Plugin<I> =>
  <A, E, R>(self: Layer.Layer<A, E, R>): Layer.Layer<A | I, E, I | R> => Layer.flatMap(self, context =>
    Layer.effectContext(Effect.gen(function* () {
      const base = yield* Option.match(Context.getOption(context, tag), {
        onNone: () => tag,
        onSome: Effect.succeed
      })
      const updated = wrapper(base)
      const service = Object.assign({}, base, updated)
      return Context.add(context, tag, service)
    })))


/**
 * Create a plugin that enhances a service with effectful setup.
 *
 * This is a thin wrapper around `Layer.updateService` with Effect support.
 * The wrapper function is an Effect that can access other services during setup,
 * then returns an enhanced service implementation.
 * You can return a complete service or a partial with only the enhanced methods.
 * Unspecified methods will be passed through from the base service.
 * Use this when the plugin needs to access dependencies or perform async initialization.
 *
 * @param tag - Service tag to enhance
 * @param wrapper - Effect that yields dependencies and returns enhanced service
 * @returns Plugin function (from Layer.updateService) that can be piped onto layers
 *
 * @category Constructors
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * // Return only the enhanced method (partial)
 * const withAudit = Plugin.effectForTag(MutationDB, (base) =>
 *   Effect.gen(function*() {
 *     const audit = yield* AuditLog;
 *     yield* Effect.logInfo("Audit plugin initialized");
 *
 *     return {
 *       insert: (table, value) =>
 *         Effect.gen(function*() {
 *           yield* audit.log(`Inserting into ${table}`);
 *           return yield* base.insert(table, value);
 *         })
 *     };
 *   })
 * );
 *
 * const Enhanced = Layer.empty.pipe(withAudit, Layer.provide(Layer.provideMerge(MutationDBLive, AuditLogLive)));
 * ```
 */
export const effectForTag = <S, I, E2 = never, R2 = never>(
  tag: Context.Tag<I, S>,
  wrapper: (base: S) => Effect.Effect<S | Partial<S>, E2, R2>
): Plugin<I, E2, R2> =>
  <A, E, R>(self: Layer.Layer<A, E, R>): Layer.Layer<A | I, E | E2, I | R | R2> => Layer.flatMap(self, context =>
    Layer.effectContext(Effect.gen(function* () {
      const base = yield* Option.match(Context.getOption(context, tag), {
        onNone: () => tag,
        onSome: Effect.succeed
      })
      const updated = yield* wrapper(base)
      const service = Object.assign({}, base, updated)
      return Context.add(context, tag, service)
    })))


// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Identity plugin that returns the layer untouched.
 * Useful as the zero element in plugin composition.
 *
 * @category Utilities
 * @since 1.0.0
 */
export const identity: Plugin<never, never, never> = <A, E, R>(self: Layer.Layer<A, E, R>): Layer.Layer<A, E, R> => self

/**
 * Combine two plugins into a single plugin.
 * Plugins execute right-to-left: `that` executes before `self`.
 *
 * @param self - First plugin (executes second, inner wrapper)
 * @param that - Second plugin (executes first, outer wrapper)
 * @returns Combined plugin
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const combined = Plugin.combine(withLogging, withValidation);
 * // Equivalent to: layer.pipe(withLogging, withValidation)
 * // Execution: withValidation -> withLogging -> base
 * ```
 */
export const combine = <I, I2, E = never, E2 = never, R = never, R2 = never>(
  self: Plugin<I, E, R>,
  that: Plugin<I2, E2, R2>
): Plugin<I | I2, E | E2, R | R2> => Function.compose(self, that)

/**
 * Compose multiple plugins into a single plugin.
 *
 * Plugins execute in **left-to-right** order (as written in the array).
 * This is more intuitive than the pipe order.
 *
 * @param plugins - Array of plugins to compose
 * @returns Single plugin that applies all transformations
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const allPlugins = Plugin.compose([
 *   withLogging,
 *   withValidation,
 *   withTriggers
 * ]);
 *
 * const Enhanced = Layer.empty.pipe(allPlugins, Layer.provide(MutationDBLive));
 * // Execution: withLogging -> withValidation -> withTriggers -> base (left-to-right)
 * ```
 */
export const compose = <I, E = never, R = never>(
  plugins: Array<Plugin<I, E, R>>
): Plugin<I, E, R> =>
  <A, E2, R2>(self: Layer.Layer<A, E2, R2>): Layer.Layer<A | I, E | E2, I | R | R2> => combineAll(plugins)(self)

/**
 * Compose all plugins in an array into a single plugin.
 * Returns identity plugin if array is empty.
 *
 * Plugins execute in **left-to-right** order (as written in the array).
 * This uses reduceRight internally to build the composition.
 *
 * @param plugins - Array of plugins to compose (can be empty)
 * @returns Single plugin, or identity if empty
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const allPlugins = Plugin.combineAll([withLogging, withValidation, withAudit]);
 * // Execution: withLogging -> withValidation -> withAudit -> base (left-to-right)
 *
 * const maybePlugins = config.enableLogging ? [withLogging] : [];
 * const optional = Plugin.combineAll(maybePlugins);
 * // Safe to use even with empty array
 * ```
 */
export const combineAll = <I, E = never, R = never>(
  plugins: ReadonlyArray<Plugin<I, E, R>>
): Plugin<I, E, R> =>
  plugins.reduceRight(
    (acc, plugin) => combine(acc, plugin),
    identity
  );
