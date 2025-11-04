/**
 * @module internal/Function
 *
 * Atomic function types for the Confect API.
 *
 * This module defines discriminated union types for API functions (Query/Mutation/Action)
 * using phantom types for maximum type-level tracking and Effect patterns for composability.
 *
 * ## Design Principles
 *
 * 1. **Discriminated Union** - Three variants for Convex's function types
 * 2. **Phantom Types** - Stored under symbol to avoid namespace pollution
 * 3. **Variance Annotations** - Using Effect's Types module for correct variance
 * 4. **Literal Preservation** - Using `satisfies` to keep literal types
 * 5. **Brand Pattern** - Prevents mixing with plain objects
 *
 * @example
 * import * as Function from "./internal/Function"
 *
 * const getUser = Function.query("getUser")
 *   .args(Schema.Struct({ id: Schema.String }))
 *   .returns(UserSchema)
 *
 * if (Function.isQuery(fn)) {
 *   // fn is ConfectApiQueryFunction
 * }
 *
 * @since 1.0.0
 */

import type {
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from "convex/server";
import { pipeArguments, type Pipeable } from "effect/Pipeable";
import * as Predicate from "effect/Predicate";
import * as Schema from "effect/Schema";
import * as Types from "effect/Types";

// =============================================================================
// Symbols and Type IDs
// =============================================================================

/**
 * @category Symbols
 * @since 1.0.0
 */
export const QueryFunctionTypeId: unique symbol = Symbol.for(
  "@confect/QueryFunction",
);

/**
 * @category Symbols
 * @since 1.0.0
 */
export type QueryFunctionTypeId = typeof QueryFunctionTypeId;

/**
 * @category Symbols
 * @since 1.0.0
 */
export const MutationFunctionTypeId: unique symbol = Symbol.for(
  "@confect/MutationFunction",
);

/**
 * @category Symbols
 * @since 1.0.0
 */
export type MutationFunctionTypeId = typeof MutationFunctionTypeId;

/**
 * @category Symbols
 * @since 1.0.0
 */
export const ActionFunctionTypeId: unique symbol = Symbol.for(
  "@confect/ActionFunction",
);

/**
 * @category Symbols
 * @since 1.0.0
 */
export type ActionFunctionTypeId = typeof ActionFunctionTypeId;

// =============================================================================
// Function Types
// =============================================================================

/**
 * @category Models
 * @since 1.0.0
 */
export declare namespace ConfectApiQueryFunction {
  /**
   * @category Models
   * @since 1.0.0
   */
  export interface Variance<Name, Args, Returns, E, R> {
    readonly _name: Types.Covariant<Name>;
    readonly _args: Types.Invariant<Args>;
    readonly _returns: Types.Covariant<Returns>;
    readonly _e: Types.Invariant<E>;
    readonly _r: Types.Covariant<R>;
  }
}

/**
 * Query function - read-only database access.
 *
 * Queries can read from the database but cannot modify it.
 * They have access to QueryDB, ConfectAuth, and other read-only services.
 *
 * @category Types
 * @since 1.0.0
 */
export interface ConfectApiQueryFunction<
  out Name extends string,
  out Args extends Schema.Schema.AnyNoContext,
  out Returns extends Schema.Schema.AnyNoContext,
  out E = never,
  out R = never,
> extends Pipeable {
  readonly [QueryFunctionTypeId]: ConfectApiQueryFunction.Variance<
    Name,
    Args,
    Returns,
    E,
    R
  >;

  readonly functionType: "Query";
  readonly name: Name;
  readonly args: Args;
  readonly returns: Returns;
}

/**
 * @category Models
 * @since 1.0.0
 */
export declare namespace ConfectApiMutationFunction {
  /**
   * @category Models
   * @since 1.0.0
   */
  export interface Variance<Name, Args, Returns, E, R> {
    readonly _name: Types.Covariant<Name>;
    readonly _args: Types.Invariant<Args>;
    readonly _returns: Types.Covariant<Returns>;
    readonly _e: Types.Invariant<E>;
    readonly _r: Types.Covariant<R>;
  }
}

/**
 * Mutation function - read-write database access.
 *
 * Mutations can read from and write to the database within a transaction.
 * They have access to MutationDB, ConfectAuth, ConfectScheduler, and other mutation services.
 *
 * @category Types
 * @since 1.0.0
 */
export interface ConfectApiMutationFunction<
  out Name extends string,
  out Args extends Schema.Schema.AnyNoContext,
  out Returns extends Schema.Schema.AnyNoContext,
  out E = never,
  out R = never,
> extends Pipeable {
  readonly [MutationFunctionTypeId]: ConfectApiMutationFunction.Variance<
    Name,
    Args,
    Returns,
    E,
    R
  >;

  readonly functionType: "Mutation";
  readonly name: Name;
  readonly args: Args;
  readonly returns: Returns;
}

/**
 * @category Models
 * @since 1.0.0
 */
export declare namespace ConfectApiActionFunction {
  /**
   * @category Models
   * @since 1.0.0
   */
  export interface Variance<Name, Args, Returns, E, R> {
    readonly _name: Types.Covariant<Name>;
    readonly _args: Types.Invariant<Args>;
    readonly _returns: Types.Covariant<Returns>;
    readonly _e: Types.Invariant<E>;
    readonly _r: Types.Covariant<R>;
  }
}

/**
 * Action function - external API access, no automatic database transactions.
 *
 * Actions can call external APIs, schedule jobs, and perform operations
 * that don't fit in Convex's transactional model. They can run queries
 * and mutations via runners.
 *
 * @category Types
 * @since 1.0.0
 */
export interface ConfectApiActionFunction<
  out Name extends string,
  out Args extends Schema.Schema.AnyNoContext,
  out Returns extends Schema.Schema.AnyNoContext,
  out E = never,
  out R = never,
> extends Pipeable {
  readonly [ActionFunctionTypeId]: ConfectApiActionFunction.Variance<
    Name,
    Args,
    Returns,
    E,
    R
  >;

  readonly functionType: "Action";
  readonly name: Name;
  readonly args: Args;
  readonly returns: Returns;
}

/**
 * Union of all Confect API function types.
 *
 * This is a discriminated union with `functionType` as the discriminator.
 * Uses `any` for invariant parameters to allow assignment of specific types.
 *
 * @category Types
 * @since 1.0.0
 */
export type ConfectApiFunction =
  | ConfectApiQueryFunction<string, any, any, any, any>
  | ConfectApiMutationFunction<string, any, any, any, any>
  | ConfectApiActionFunction<string, any, any, any, any>;

// =============================================================================
// Variance Markers (shared objects for zero runtime cost)
// =============================================================================

/**
 * @internal
 */
const queryVariance: any = {
  _name: (_: never) => _,
  _args: (_: never) => _,
  _returns: (_: never) => _,
  _e: (_: never) => _,
  _r: (_: never) => _,
};

/**
 * @internal
 */
const mutationVariance: any = {
  _name: (_: never) => _,
  _args: (_: never) => _,
  _returns: (_: never) => _,
  _e: (_: never) => _,
  _r: (_: never) => _,
};

/**
 * @internal
 */
const actionVariance: any = {
  _name: (_: never) => _,
  _args: (_: never) => _,
  _returns: (_: never) => _,
  _e: (_: never) => _,
  _r: (_: never) => _,
};

// =============================================================================
// Constructors (using satisfies pattern)
// =============================================================================

/**
 * Create a query function using a fluent builder pattern.
 *
 * The builder preserves literal types using the `satisfies` pattern,
 * ensuring that function names and other string literals are not widened to `string`.
 *
 * @param name - Function name (preserved as literal type)
 * @returns Builder for specifying args and returns
 *
 * @category Constructors
 * @since 1.0.0
 *
 * @example
 * import * as Function from "./internal/Function"
 * import * as Schema from "effect/Schema"
 *
 * const getUser = Function.query("getUser")
 *   .args(Schema.Struct({ id: Schema.String }))
 *   .returns(Schema.Struct({
 *     id: Schema.String,
 *     name: Schema.String,
 *     email: Schema.String
 *   }))
 *
 * // ✅ Literal type preserved!
 * const name: "getUser" = getUser.name
 */
export const query = <Name extends string>(name: Name) => ({
  args: <Args extends Schema.Schema.AnyNoContext>(args: Args) => ({
    returns: <Returns extends Schema.Schema.AnyNoContext>(
      returns: Returns,
    ): ConfectApiQueryFunction<Name, Args, Returns, never, never> => ({
      [QueryFunctionTypeId]: queryVariance,
      functionType: "Query",
      name,
      args,
      returns,
      pipe(this: ConfectApiQueryFunction<Name, Args, Returns, never, never>) {
        return pipeArguments(this, arguments);
      },
    }),
  }),
});

/**
 * Create a mutation function using a fluent builder pattern.
 *
 * The builder preserves literal types using the `satisfies` pattern,
 * ensuring that function names and other string literals are not widened to `string`.
 *
 * @param name - Function name (preserved as literal type)
 * @returns Builder for specifying args and returns
 *
 * @category Constructors
 * @since 1.0.0
 *
 * @example
 * import * as Function from "./internal/Function"
 * import * as Schema from "effect/Schema"
 *
 * const createUser = Function.mutation("createUser")
 *   .args(Schema.Struct({
 *     name: Schema.String,
 *     email: Schema.String
 *   }))
 *   .returns(Schema.Struct({
 *     id: Schema.String,
 *     name: Schema.String,
 *     email: Schema.String
 *   }))
 *
 * // ✅ Literal type preserved!
 * const name: "createUser" = createUser.name
 */
export const mutation = <Name extends string>(name: Name) => ({
  args: <Args extends Schema.Schema.AnyNoContext>(args: Args) => ({
    returns: <Returns extends Schema.Schema.AnyNoContext>(
      returns: Returns,
    ): ConfectApiMutationFunction<Name, Args, Returns, never, never> => {
      return {
        [MutationFunctionTypeId]: mutationVariance,
        functionType: "Mutation",
        name,
        args,
        returns,
        pipe(this: ConfectApiMutationFunction<Name, Args, Returns, never, never>) {
          return pipeArguments(this, arguments);
        },
      };
    },
  }),
});

/**
 * Create an action function using a fluent builder pattern.
 *
 * The builder preserves literal types using the `satisfies` pattern,
 * ensuring that function names and other string literals are not widened to `string`.
 *
 * @param name - Function name (preserved as literal type)
 * @returns Builder for specifying args and returns
 *
 * @category Constructors
 * @since 1.0.0
 *
 * @example
 * import * as Function from "./internal/Function"
 * import * as Schema from "effect/Schema"
 *
 * const sendEmail = Function.action("sendEmail")
 *   .args(Schema.Struct({
 *     to: Schema.String,
 *     subject: Schema.String,
 *     body: Schema.String
 *   }))
 *   .returns(Schema.Void)
 *
 * // ✅ Literal type preserved!
 * const name: "sendEmail" = sendEmail.name
 */
export const action = <Name extends string>(name: Name) => ({
  args: <Args extends Schema.Schema.AnyNoContext>(args: Args) => ({
    returns: <Returns extends Schema.Schema.AnyNoContext>(
      returns: Returns,
    ): ConfectApiActionFunction<Name, Args, Returns, never, never> => {
      return {
        [ActionFunctionTypeId]: actionVariance,
        functionType: "Action",
        name,
        args,
        returns,
        pipe(this: ConfectApiActionFunction<Name, Args, Returns, never, never>) {
          return pipeArguments(this, arguments);
        },
      };
    },
  }),
});

// =============================================================================
// Predicates (using Predicate.hasProperty)
// =============================================================================

/**
 * Check if a value is any Confect API function.
 *
 * Uses `Predicate.hasProperty` to check for the presence of any function type symbol.
 *
 * @param u - Unknown value to check
 * @returns Type guard narrowing to ConfectApiFunction
 *
 * @category Predicates
 * @since 1.0.0
 *
 * @example
 * if (Function.isFunction(value)) {
 *   // value is ConfectApiFunction
 *   console.log(value.name, value.functionType)
 * }
 */
export const isFunction = (u: unknown): u is ConfectApiFunction =>
  Predicate.hasProperty(u, QueryFunctionTypeId) ||
  Predicate.hasProperty(u, MutationFunctionTypeId) ||
  Predicate.hasProperty(u, ActionFunctionTypeId);

/**
 * Check if a function is a query.
 *
 * Uses `Predicate.hasProperty` to check for the QueryFunctionTypeId symbol.
 *
 * @param fn - Function to check
 * @returns Type guard narrowing to ConfectApiQueryFunction
 *
 * @category Predicates
 * @since 1.0.0
 *
 * @example
 * const functions = [getUser, createUser, sendEmail]
 * const queries = functions.filter(Function.isQuery)
 * // queries has type ConfectApiQueryFunction[]
 */
export const isQuery = (
  fn: ConfectApiFunction,
): fn is ConfectApiQueryFunction<string, any, any, any, any> =>
  Predicate.hasProperty(fn, QueryFunctionTypeId);

/**
 * Check if a function is a mutation.
 *
 * Uses `Predicate.hasProperty` to check for the MutationFunctionTypeId symbol.
 *
 * @param fn - Function to check
 * @returns Type guard narrowing to ConfectApiMutationFunction
 *
 * @category Predicates
 * @since 1.0.0
 *
 * @example
 * const functions = [getUser, createUser, sendEmail]
 * const mutations = functions.filter(Function.isMutation)
 * // mutations has type ConfectApiMutationFunction[]
 */
export const isMutation = (
  fn: ConfectApiFunction,
): fn is ConfectApiMutationFunction<string, any, any, any, any> =>
  Predicate.hasProperty(fn, MutationFunctionTypeId);

/**
 * Check if a function is an action.
 *
 * Uses `Predicate.hasProperty` to check for the ActionFunctionTypeId symbol.
 *
 * @param fn - Function to check
 * @returns Type guard narrowing to ConfectApiActionFunction
 *
 * @category Predicates
 * @since 1.0.0
 *
 * @example
 * const functions = [getUser, createUser, sendEmail]
 * const actions = functions.filter(Function.isAction)
 * // actions has type ConfectApiActionFunction[]
 */
export const isAction = (
  fn: ConfectApiFunction,
): fn is ConfectApiActionFunction<string, any, any, any, any> =>
  Predicate.hasProperty(fn, ActionFunctionTypeId);

// =============================================================================
// Refinements (for Record.filter)
// =============================================================================

/**
 * Refinement for filtering to query functions.
 *
 * Use with `Record.filter` or `Array.filter` to narrow types.
 *
 * @category Refinements
 * @since 1.0.0
 *
 * @example
 * import * as Record from "effect/Record"
 *
 * const functions: Record<string, ConfectApiFunction> = { ... }
 * const queries = Record.filter(functions, Function.QueryRefinement)
 * // queries has type Record<string, ConfectApiQueryFunction>
 */
export const QueryRefinement: Predicate.Refinement<
  ConfectApiFunction,
  ConfectApiQueryFunction<string, any, any, any, any>
> = isQuery;

/**
 * Refinement for filtering to mutation functions.
 *
 * Use with `Record.filter` or `Array.filter` to narrow types.
 *
 * @category Refinements
 * @since 1.0.0
 *
 * @example
 * import * as Record from "effect/Record"
 *
 * const functions: Record<string, ConfectApiFunction> = { ... }
 * const mutations = Record.filter(functions, Function.MutationRefinement)
 * // mutations has type Record<string, ConfectApiMutationFunction>
 */
export const MutationRefinement: Predicate.Refinement<
  ConfectApiFunction,
  ConfectApiMutationFunction<string, any, any, any, any>
> = isMutation;

/**
 * Refinement for filtering to action functions.
 *
 * Use with `Record.filter` or `Array.filter` to narrow types.
 *
 * @category Refinements
 * @since 1.0.0
 *
 * @example
 * import * as Record from "effect/Record"
 *
 * const functions: Record<string, ConfectApiFunction> = { ... }
 * const actions = Record.filter(functions, Function.ActionRefinement)
 * // actions has type Record<string, ConfectApiActionFunction>
 */
export const ActionRefinement: Predicate.Refinement<
  ConfectApiFunction,
  ConfectApiActionFunction<string, any, any, any, any>
> = isAction;

// =============================================================================
// Type Extraction Utilities
// =============================================================================

/**
 * Extract the function name as a literal type.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const getUser = Function.query("getUser").args(...).returns(...)
 * type Name = Function.GetName<typeof getUser>  // "getUser"
 */
export type GetName<Fn extends ConfectApiFunction> = Fn["name"];

/**
 * Extract the arguments schema.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const getUser = Function.query("getUser").args(ArgsSchema).returns(...)
 * type Args = Function.GetArgs<typeof getUser>  // typeof ArgsSchema
 */
export type GetArgs<Fn extends ConfectApiFunction> = Fn["args"];

/**
 * Extract the return value schema.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const getUser = Function.query("getUser").args(...).returns(ReturnsSchema)
 * type Returns = Function.GetReturns<typeof getUser>  // typeof ReturnsSchema
 */
export type GetReturns<Fn extends ConfectApiFunction> = Fn["returns"];

/**
 * Extract the runtime type of the arguments (after decoding).
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const getUser = Function.query("getUser")
 *   .args(Schema.Struct({ id: Schema.String }))
 *   .returns(...)
 *
 * type ArgsType = Function.GetArgsType<typeof getUser>  // { id: string }
 */
export type GetArgsType<Fn extends ConfectApiFunction> = Schema.Schema.Type<
  GetArgs<Fn>
>;

/**
 * Extract the encoded type of the arguments (before decoding).
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const getUser = Function.query("getUser")
 *   .args(Schema.Struct({ id: Schema.String }))
 *   .returns(...)
 *
 * type ArgsEncoded = Function.GetArgsEncoded<typeof getUser>  // { id: string }
 */
export type GetArgsEncoded<Fn extends ConfectApiFunction> =
  Schema.Schema.Encoded<GetArgs<Fn>>;

/**
 * Extract the runtime type of the return value (after decoding).
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const getUser = Function.query("getUser")
 *   .args(...)
 *   .returns(Schema.Struct({ id: Schema.String, name: Schema.String }))
 *
 * type ReturnsType = Function.GetReturnsType<typeof getUser>
 * // { id: string, name: string }
 */
export type GetReturnsType<Fn extends ConfectApiFunction> =
  Schema.Schema.Type<GetReturns<Fn>>;

/**
 * Extract the encoded type of the return value (before decoding).
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const getUser = Function.query("getUser")
 *   .args(...)
 *   .returns(Schema.Struct({ id: Schema.String, name: Schema.String }))
 *
 * type ReturnsEncoded = Function.GetReturnsEncoded<typeof getUser>
 * // { id: string, name: string }
 */
export type GetReturnsEncoded<Fn extends ConfectApiFunction> =
  Schema.Schema.Encoded<GetReturns<Fn>>;

/**
 * Extract the function type ("Query" | "Mutation" | "Action").
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * const getUser = Function.query("getUser").args(...).returns(...)
 * type FT = Function.GetFunctionType<typeof getUser>  // "Query"
 */
export type GetFunctionType<Fn extends ConfectApiFunction> =
  Fn["functionType"];

/**
 * Extract the error type from a function.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * type Err = Function.GetError<typeof getUser>  // never (by default)
 */
export type GetError<Fn extends ConfectApiFunction> =
  Fn extends ConfectApiQueryFunction<string, any, any, infer E, any>
    ? E
    : Fn extends ConfectApiMutationFunction<string, any, any, infer E, any>
      ? E
      : Fn extends ConfectApiActionFunction<string, any, any, infer E, any>
        ? E
        : never;

/**
 * Extract the context requirements from a function.
 *
 * @category Type Utilities
 * @since 1.0.0
 *
 * @example
 * type Ctx = Function.GetContext<typeof getUser>  // never (by default)
 */
export type GetContext<Fn extends ConfectApiFunction> =
  Fn extends ConfectApiQueryFunction<string, any, any, any, infer R>
    ? R
    : Fn extends ConfectApiMutationFunction<string, any, any, any, infer R>
      ? R
      : Fn extends ConfectApiActionFunction<string, any, any, any, infer R>
        ? R
        : never;

// =============================================================================
// Convex Conversion
// =============================================================================

/**
 * Convert a Confect API function to a Convex registered function.
 *
 * This is the bridge between our type system and Convex's runtime.
 * The function compiles the schemas to Convex validators and returns
 * a RegisteredQuery, RegisteredMutation, or RegisteredAction.
 *
 * @param fn - Confect API function to convert
 * @param compileSchema - Schema compiler function (from schema_to_validator)
 * @returns Convex registered function
 *
 * @category Convex Integration
 * @since 1.0.0
 *
 * @example
 * import { compileSchema } from "../schema_to_validator"
 *
 * const getUser = Function.query("getUser")
 *   .args(Schema.Struct({ id: Schema.String }))
 *   .returns(UserSchema)
 *
 * const convexFunction = Function.toConvexFunction(getUser, compileSchema)
 * // RegisteredQuery<"public", { id: string }, User>
 */
export const toConvexFunction = <Fn extends ConfectApiFunction, Validator>(
  fn: Fn,
  compileSchema: <S extends Schema.Schema.AnyNoContext>(
    schema: S,
  ) => Validator, // Convex Validator type
):
  | RegisteredQuery<"public", GetArgsEncoded<Fn>, GetReturnsEncoded<Fn>>
  | RegisteredMutation<"public", GetArgsEncoded<Fn>, GetReturnsEncoded<Fn>>
  | RegisteredAction<"public", GetArgsEncoded<Fn>, GetReturnsEncoded<Fn>> => {
  // Convex registered functions have this structure
  return {
    exportName: fn.name,
    argsValidator: compileSchema(fn.args),
    returnsValidator: compileSchema(fn.returns),
    visibility: "public" as const,
  } as any; // API boundary cast - Convex's type vs our type
};
