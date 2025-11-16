/**
 * @module internal/Plugin
 *
 * Plugin system for enhancing service layers.
 * Plugins wrap existing services with additional behavior (logging, validation, triggers, etc.)
 *
 * ## Design
 *
 * - Plugins are thin wrappers around Effect's `Layer.updateService`
 * - Plugins enhance services by wrapping the base implementation
 * - Compose via .pipe() on layers
 * - Pattern: `EmptyBase.pipe(plugin, Layer.provide(requirement))`
 *
 * ## Pattern
 *
 * ```typescript
 * const withLogging = Plugin.forTag(MutationDB, (base) => ({
 *   ...base,
 *   insert: (table, value) =>
 *     Effect.gen(function*() {
 *       yield* Effect.log("inserting");
 *       return yield* base.insert(table, value);
 *     })
 * }));
 *
 * const EmptyBase = Layer.context<never>();
 * const Enhanced = EmptyBase.pipe(
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
 * This is a thin wrapper around `Layer.updateService` that merges partial updates.
 * The wrapper function receives the base service and returns an enhanced version.
 * You can return a complete service or a partial with only the enhanced methods.
 * Unspecified methods will be passed through from the base service.
 *
 * @param tag - Service tag to enhance
 * @param wrapper - Function that wraps the base service
 * @returns Plugin function (from Layer.updateService) that can be piped onto layers
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
 * const EmptyBase = Layer.context<never>();
 * const Enhanced = EmptyBase.pipe(withLogging, Layer.provide(MutationDBLive));
 * ```
 */
export const forTag = <I, S>(
  tag: Context.Tag<I, S>,
  wrapper: (base: S) => S | Partial<S>
): Plugin<I> =>
  Layer.updateService(tag, (base) => Object.assign({}, base, wrapper(base))) as never;

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
 * const Enhanced = Layer.empty.pipe(withAudit, Layer.provide(MutationDBLive), Layer.provide(AuditLogLive));
 * ```
 */
export const effectForTag = <S, I, E2 = never, R2 = never>(
  tag: Context.Tag<I, S>,
  wrapper: (base: S) => Effect.Effect<S | Partial<S>, E2, R2>
): Plugin<I, E2, R2> =>
  <A, E, R>(self: Layer.Layer<A, E, R>): Layer.Layer<A | I, E | E2, I | R | R2> => Layer.flatMap(self, context =>
    Layer.effectContext(Effect.gen(function* () {
      const base = yield* tag
      const updated = yield* wrapper(base)
      const service = Object.assign({}, base, updated)
      return Context.add(context, tag, service)
    })))


// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Compose multiple plugins into a single plugin.
 *
 * Plugins are applied in order (left to right in array).
 * This is equivalent to chaining .pipe() calls but more concise for many plugins.
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
 * const Enhanced = MutationDBLive.pipe(allPlugins);
 * // Equivalent to: MutationDBLive.pipe(withLogging, withValidation, withTriggers)
 * ```
 */
export const compose = <I, E = never, R = never>(
  plugins: Array<Plugin<I, E, R>>
): Plugin<I, E, R> =>
  <A, E2, R2>(self: Layer.Layer<A, E2, R2>): Layer.Layer<A | I, E | E2, I | R | R2> =>
    plugins.reduce(
      (layer, plugin) => plugin(layer),
      self as Layer.Layer<A | I, E | E2, I | R | R2>
    ) as never;
