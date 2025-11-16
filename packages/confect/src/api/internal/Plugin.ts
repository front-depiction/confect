/**
 * @module internal/Plugin
 *
 * Plugin system for enhancing service layers.
 * Plugins wrap existing services with additional behavior (logging, validation, triggers, etc.)
 *
 * ## Design
 *
 * - Plugins enhance Layers, not Tags
 * - Use Layer.map to transform the context
 * - Extract base service, wrap it, merge back into context
 * - Compose via .pipe() on layers
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
 * const Enhanced = MutationDBLive.pipe(
 *   withLogging,
 *   withValidation,
 *   withTriggers
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
 * A plugin is a function that transforms a Layer by wrapping its service.
 *
 * @template S - Service tag type
 * @template E - Error type
 * @template R - Requirements type
 *
 * @since 1.0.0
 */
export type Plugin<I, E = never, R = never> = <E2, R2>(
  baseLayer: Layer.Layer<I, E2, R2>
) => Layer.Layer<I, E | E2, R | R2>;



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
 * const Enhanced = MutationDBLive.pipe(withLogging);
 * ```
 */
export const forTag = <I, S>(
  tag: Context.Tag<I, S>,
  wrapper: (base: S) => S | Partial<S>
): Plugin<I> =>
  <E, R>(baseLayer: Layer.Layer<I, E, R>): Layer.Layer<I, E, R> =>
    Layer.map(baseLayer, (ctx) => {
      const base = Context.get(ctx, tag);
      const partial = wrapper(base);
      return Context.add(ctx, tag, Object.assign({}, base, partial));
    });

/**
 * Create a plugin that enhances a service with effectful setup.
 *
 * The wrapper function is an Effect that can access other services during setup,
 * then returns an enhanced service implementation.
 * You can return a complete service or a partial with only the enhanced methods.
 * Unspecified methods will be passed through from the base service.
 * Use this when the plugin needs to access dependencies or perform async initialization.
 *
 * @param tag - Service tag to enhance
 * @param wrapper - Effect that yields dependencies and returns enhanced service
 * @returns Plugin function that can be piped onto layers
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
 * const Enhanced = MutationDBLive.pipe(withAudit);
 * ```
 */
export const effectForTag = <S, I, E2 = never, R2 = never>(
  tag: Context.Tag<I, S>,
  wrapper: (base: S) => Effect.Effect<S | Partial<S>, E2, R2>
): Plugin<I, E2, R2> =>
  <E, R>(baseLayer: Layer.Layer<I, E, R>): Layer.Layer<I, E | E2, R | R2> => Layer.flatMap(baseLayer, context =>
    Layer.effectContext(Effect.gen(function* () {
      const base = Context.get(context, tag);
      const partial = yield* wrapper(base);
      return Context.add(context, tag, Object.assign({}, base, partial));
    }))
  )
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
export const compose = <S, E = never, R = never>(
  plugins: Array<Plugin<S, E, R>>
): Plugin<S, E, R> =>
  <E2, R2>(baseLayer: Layer.Layer<S, E2, R2>): Layer.Layer<S, E | E2, R | R2> =>
    plugins.reduce(
      (layer, plugin) => plugin(layer),
      baseLayer as Layer.Layer<S, E | E2, R | R2>
    );
