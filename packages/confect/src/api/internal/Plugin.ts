/**
 * @module internal/Plugin
 *
 * Plugin system for enhancing service layers.
 * Plugins wrap existing services with additional behavior (logging, validation, triggers, etc.)
 *
 * ## Design Principles
 *
 * - Plugins enhance services by wrapping the base implementation
 * - Compose via `.pipe()` on layers or `Plugin.combineAll()`
 * - Pattern: `Layer.empty.pipe(plugin, Layer.provide(requirement))`
 * - Supports heterogeneous composition (plugins for different services)
 *
 * ## Execution Order
 *
 * **Pipe-based composition** (right-to-left):
 * ```typescript
 * Layer.empty.pipe(p1, p2, p3, Layer.provide(service))
 * // Executes: p3 -> p2 -> p1 -> base
 * ```
 *
 * **Array-based composition** (left-to-right):
 * ```typescript
 * Plugin.combineAll([p1, p2, p3])
 * // Executes: p1 -> p2 -> p3 -> base
 * ```
 *
 * ## Basic Example
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
 * // Pipe pattern (right-to-left)
 * const Enhanced = Layer.empty.pipe(
 *   withLogging,
 *   withValidation,
 *   Layer.provide(MutationDBLive)
 * );
 * // Execution: withValidation -> withLogging -> base
 * ```
 *
 * ## Heterogeneous Composition
 *
 * ```typescript
 * // Plugins for different services compose cleanly
 * const crossCutting = Plugin.combineAll([
 *   withDBLogging,   // enhances MutationDB
 *   withLogPrefix,   // enhances LogService
 *   withCaching      // enhances CacheService
 * ]);
 * // Type: Plugin<MutationDB | LogService | CacheService, never, never>
 *
 * const Enhanced = Layer.empty.pipe(
 *   crossCutting,
 *   Layer.provide(Layer.provideMerge(
 *     MutationDBLive,
 *     Layer.provideMerge(LogServiceLive, CacheServiceLive)
 *   ))
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
import * as Types from "effect/Types";
// =============================================================================
// Core Plugin Types
// =============================================================================

/**
 * A plugin is a layer transformation function that enhances services.
 *
 * It transforms a Layer by wrapping a service, requiring the service (I) as input
 * and providing the enhanced version as output.
 *
 * ## Type Parameters
 *
 * @template I - Service identifier(s) being enhanced (can be union for multi-service plugins)
 * @template E - Error type from enhancement (defaults to never)
 * @template R - Additional requirements for enhancement (defaults to never)
 *
 * ## Signature Details
 *
 * Input layer provides `A`, has errors `E2`, requires `R2`
 * Output layer provides `A | I`, has errors `E | E2`, requires `I | R | R2`
 *
 * - **Provides**: `A | I` - Passthrough existing services (A) + enhanced service (I)
 * - **Errors**: `E | E2` - Enhancement errors (E) + existing errors (E2)
 * - **Requires**: `I | R | R2` - Service to enhance (I) + enhancement deps (R) + existing deps (R2)
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
export const identity: Identity = <A, E, R>(self: Layer.Layer<A, E, R>): Layer.Layer<A, E, R> => self
type Identity = Plugin<never, never, never>;
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
 * This is more intuitive than pipe-based composition.
 *
 * Supports heterogeneous plugins - properly infers union types when composing
 * plugins that enhance different services.
 *
 * @param plugins - Array of plugins to compose
 * @returns Single plugin with unioned type requirements
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * // Homogeneous composition
 * const allPlugins = Plugin.compose([
 *   withLogging,
 *   withValidation,
 *   withTriggers
 * ]);
 * // Execution: withLogging -> withValidation -> withTriggers -> base
 *
 * // Heterogeneous composition
 * const crossCutting = Plugin.compose([
 *   withDBLogging,    // Plugin<MutationDB, ...>
 *   withLogPrefix     // Plugin<LogService, ...>
 * ]);
 * // Type: Plugin<MutationDB | LogService, ...>
 * ```
 */
export const compose = <const Ps extends Identity[]>(
  plugins: Ps
) =>
  <A, E2, R2>(self: Layer.Layer<A, E2, R2>) => combineAll(plugins)(self)

/**
 * Compose all plugins in an array into a single plugin.
 * Returns identity plugin if array is empty.
 *
 * ## Key Features
 *
 * - **Left-to-right execution**: Plugins execute in array order
 * - **Type-safe heterogeneous composition**: Properly infers unions when composing plugins for different services
 * - **Safe with empty arrays**: Returns identity plugin when empty
 *
 * Uses `reduceRight` internally to build the composition from right to left,
 * which results in left-to-right execution order.
 *
 * @param plugins - Tuple of plugins to compose (can be empty)
 * @returns Single plugin with properly unioned I, E, R types
 *
 * @category Utilities
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * // Simple composition
 * const allPlugins = Plugin.combineAll([withLogging, withValidation, withAudit]);
 * // Execution: withLogging -> withValidation -> withAudit -> base
 *
 * // Heterogeneous composition (different services)
 * const crossCutting = Plugin.combineAll([
 *   withDBLogging,    // Plugin<MutationDB, never, never>
 *   withLogPrefix,    // Plugin<LogService, never, never>
 *   withCaching       // Plugin<CacheService, never, never>
 * ]);
 * // Type correctly inferred: Plugin<MutationDB | LogService | CacheService, never, never>
 *
 * // Safe with conditional plugins
 * const maybePlugins = config.enableLogging ? [withLogging] : [];
 * const optional = Plugin.combineAll(maybePlugins);
 * // Returns identity if array is empty
 * ```
 */
export const combineAll = <const Ps extends Identity[]>(
  plugins: Ps
): Plugin<
  InputsOf<Ps>,
  ErrorsOf<Ps>,
  RequirementsOf<Ps>
> =>
  plugins.reduceRight(
    (acc, plugin) => combine(acc, plugin),
    identity
  );


type InputOf<P> = P extends Plugin<infer I, infer _, infer _> ? I : never;
type ErrorOf<P> = P extends Plugin<infer _, infer E, infer _> ? E : never;
type RequirementOf<P> = P extends Plugin<infer _, infer _, infer R> ? R : never;

type InputsOf<Ps extends readonly Identity[]> = Ps[number] extends infer P
  ? P extends Identity
  ? InputOf<P>
  : never
  : never;

type ErrorsOf<Ps extends readonly Identity[]> = Ps[number] extends infer P
  ? P extends Identity
  ? ErrorOf<P>
  : never
  : never;

type RequirementsOf<Ps extends readonly Identity[]> = Ps[number] extends infer P
  ? P extends Identity
  ? RequirementOf<P>
  : never
  : never;
