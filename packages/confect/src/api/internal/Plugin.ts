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
 * const withLogging = Plugin.enhance(MutationDB, (base) => ({
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
export type Plugin<S, E = never, R = never> = <E2, R2>(
  baseLayer: Layer.Layer<S, E2, R2>
) => Layer.Layer<S, E | E2, R | R2>;

/**
 * Extract the service type from a Context.Tag
 *
 * @internal
 */
type ServiceOf<T extends Context.Tag<any, any>> = T extends Context.Tag<
  infer _Id,
  infer Service
>
  ? Service
  : never;

// =============================================================================
// Plugin Constructors
// =============================================================================

/**
 * Create a plugin that enhances a service with synchronous wrapper.
 *
 * The wrapper function receives the base service and returns an enhanced version.
 * All methods must be wrapped - use spread operator to pass through unchanged methods.
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
 * const withLogging = Plugin.enhance(MutationDB, (base) => ({
 *   ...base,
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
export const enhance = <T extends Context.Tag<any, any>>(
  tag: T,
  wrapper: (base: ServiceOf<T>) => ServiceOf<T>
): Plugin<T> =>
  <E, R>(baseLayer: Layer.Layer<T, E, R>): Layer.Layer<T, E, R> =>
    Layer.map(baseLayer, (ctx) => {
      const base = Context.get(ctx, tag);
      const enhanced = wrapper(base);
      return Context.merge(ctx, Context.make(tag, enhanced));
    });

/**
 * Create a plugin that enhances a service with effectful setup.
 *
 * The wrapper function is an Effect that can access other services during setup,
 * then returns an enhanced service implementation.
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
 * const withAudit = Plugin.enhanceEffect(MutationDB, (base) =>
 *   Effect.gen(function*() {
 *     const audit = yield* AuditLog;
 *     yield* Effect.logInfo("Audit plugin initialized");
 *
 *     return {
 *       ...base,
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
export const enhanceEffect = <T extends Context.Tag<any, any>, E2 = never, R2 = never>(
  tag: T,
  wrapper: (base: ServiceOf<T>) => Effect.Effect<ServiceOf<T>, E2, R2>
): Plugin<T, E2, T | R | R2> =>
  <E, R>(baseLayer: Layer.Layer<T, E, R>): Layer.Layer<T, E | E2, T | R | R2> =>
    Layer.suspend(() => {
      // Use a mutable ref to hold the base service once extracted
      let baseService: ServiceOf<T> | null = null;

      // Layer that extracts and stores the base service
      const extractBase = Layer.flatMap(baseLayer, (ctx) => {
        baseService = Context.get(ctx, tag);
        return Layer.succeed(tag, baseService);
      });

      // Layer that wraps the base service
      const wrapLayer = Layer.effect(
        tag,
        Effect.gen(function* () {
          if (!baseService) {
            throw new Error("Base service not extracted");
          }
          // Wrapper can access services from R2
          return yield* wrapper(baseService);
        })
      );

      // Provide extractBase to wrapLayer so baseService is available
      return wrapLayer.pipe(Layer.provide(extractBase));
    });

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
