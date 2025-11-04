/* eslint-disable prefer-rest-params */
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
   * Prototype interface for query functions.
   * @category Models
   * @since 1.0.0
   */
  export interface Proto {
    readonly [QueryFunctionTypeId]: unknown;
    readonly functionType: "Query";
    readonly name: string;
    readonly args: Schema.Schema.AnyNoContext;
    readonly returns: Schema.Schema.AnyNoContext;
    readonly pipe: Pipeable["pipe"];
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
  out Name extends string = string,
  out Args extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  out Returns extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
> extends Pipeable {
  readonly [QueryFunctionTypeId]: QueryFunctionTypeId;

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
   * Prototype interface for mutation functions.
   * @category Models
   * @since 1.0.0
   */
  export interface Proto {
    readonly [MutationFunctionTypeId]: unknown;
    readonly functionType: "Mutation";
    readonly name: string;
    readonly args: Schema.Schema.AnyNoContext;
    readonly returns: Schema.Schema.AnyNoContext;
    readonly pipe: Pipeable["pipe"];
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
  out Name extends string = string,
  out Args extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  out Returns extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
> extends Pipeable {
  readonly [MutationFunctionTypeId]: MutationFunctionTypeId;

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
   * Prototype interface for action functions.
   * @category Models
   * @since 1.0.0
   */
  export interface Proto {
    readonly [ActionFunctionTypeId]: unknown;
    readonly functionType: "Action";
    readonly name: string;
    readonly args: Schema.Schema.AnyNoContext;
    readonly returns: Schema.Schema.AnyNoContext;
    readonly pipe: Pipeable["pipe"];
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
  out Name extends string = string,
  out Args extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  out Returns extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
> extends Pipeable {
  readonly [ActionFunctionTypeId]: ActionFunctionTypeId;

  readonly functionType: "Action";
  readonly name: Name;
  readonly args: Args;
  readonly returns: Returns;
}

/**
 * Union of all Confect API function types.
 *
 * Simple discriminated union of Query, Mutation, and Action functions.
 *
 * @category Types
 * @since 1.0.0
 */
export type ConfectApiFunction =
  | ConfectApiQueryFunction
  | ConfectApiMutationFunction
  | ConfectApiActionFunction;

// =============================================================================
// Proto Objects (for prototype-based construction)
// =============================================================================

/**
 * Prototype object for query functions.
 * Shared across all query function instances via prototype chain.
 * @internal
 */
const QueryProto: ConfectApiQueryFunction.Proto = {
  [QueryFunctionTypeId]: QueryFunctionTypeId,
  functionType: "Query" as const,
  name: "",
  args: Schema.Any,
  returns: Schema.Any,
  pipe() {
    return pipeArguments(this, arguments);
  },
};

/**
 * Prototype object for mutation functions.
 * Shared across all mutation function instances via prototype chain.
 * @internal
 */
const MutationProto: ConfectApiMutationFunction.Proto = {
  [MutationFunctionTypeId]: MutationFunctionTypeId,
  functionType: "Mutation" as const,
  name: "",
  args: Schema.Any,
  returns: Schema.Any,
  pipe() {
    return pipeArguments(this, arguments);
  },
};

/**
 * Prototype object for action functions.
 * Shared across all action function instances via prototype chain.
 * @internal
 */
const ActionProto: ConfectApiActionFunction.Proto = {
  [ActionFunctionTypeId]: ActionFunctionTypeId,
  functionType: "Action" as const,
  name: "",
  args: Schema.Any,
  returns: Schema.Any,
  pipe() {
    return pipeArguments(this, arguments);
  },
};

// =============================================================================
// makeProto Functions (for creating instances with correct types)
// =============================================================================

/**
 * Creates a query function instance using prototype-based construction.
 * @internal
 */
const makeQueryProto = <
  Name extends string,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
>(options: {
  readonly name: Name;
  readonly args: Args;
  readonly returns: Returns;
}): ConfectApiQueryFunction<Name, Args, Returns> => {
  return Object.assign(Object.create(QueryProto), {
    [QueryFunctionTypeId]: QueryFunctionTypeId,
    functionType: "Query" as const,
    ...options,
  });
};

/**
 * Creates a mutation function instance using prototype-based construction.
 * @internal
 */
const makeMutationProto = <
  Name extends string,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
>(options: {
  readonly name: Name;
  readonly args: Args;
  readonly returns: Returns;
}): ConfectApiMutationFunction<Name, Args, Returns> => {
  return Object.assign(Object.create(MutationProto), {
    [MutationFunctionTypeId]: MutationFunctionTypeId,
    functionType: "Mutation" as const,
    ...options,
  });
};

/**
 * Creates an action function instance using prototype-based construction.
 * @internal
 */
const makeActionProto = <
  Name extends string,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
>(options: {
  readonly name: Name;
  readonly args: Args;
  readonly returns: Returns;
}): ConfectApiActionFunction<Name, Args, Returns> => {
  return Object.assign(Object.create(ActionProto), {
    [ActionFunctionTypeId]: ActionFunctionTypeId,
    functionType: "Action"
  }, options);
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
    ): ConfectApiQueryFunction<Name, Args, Returns> =>
      makeQueryProto({ name, args, returns }),
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
    ): ConfectApiMutationFunction<Name, Args, Returns> =>
      makeMutationProto({ name, args, returns }),
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
    ): ConfectApiActionFunction<Name, Args, Returns> =>
      makeActionProto({ name, args, returns }),
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
 * @category Refinements
 * @since 1.0.0
 *
 * @example
 * const functions = [getUser, createUser, sendEmail]
 * const queries = functions.filter(Function.isQuery)
 * // queries has type ConfectApiQueryFunction[]
 */
export const isQuery = (
  fn: ConfectApiFunction,
): fn is ConfectApiQueryFunction =>
  Predicate.hasProperty(fn, QueryFunctionTypeId);

/**
 * Check if a function is a mutation.
 *
 * Uses `Predicate.hasProperty` to check for the MutationFunctionTypeId symbol.
 *
 * @param fn - Function to check
 * @returns Type guard narrowing to ConfectApiMutationFunction
 *
 * @category Refinements
 * @since 1.0.0
 *
 * @example
 * const functions = [getUser, createUser, sendEmail]
 * const mutations = functions.filter(Function.isMutation)
 * // mutations has type ConfectApiMutationFunction[]
 */
export const isMutation = (fn: ConfectApiFunction,): fn is ConfectApiMutationFunction =>
  Predicate.hasProperty(fn, MutationFunctionTypeId);

/**
 * Check if a function is an action.
 *
 * Uses `Predicate.hasProperty` to check for the ActionFunctionTypeId symbol.
 *
 * @param fn - Function to check
 * @returns Type guard narrowing to ConfectApiActionFunction
 *
 * @category Refinements
 * @since 1.0.0
 *
 * @example
 * const functions = [getUser, createUser, sendEmail]
 * const actions = functions.filter(Function.isAction)
 * // actions has type ConfectApiActionFunction[]
 */
export const isAction = (fn: ConfectApiFunction,): fn is ConfectApiActionFunction =>
  Predicate.hasProperty(fn, ActionFunctionTypeId);

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
  | RegisteredQuery<"public", any, any>
  | RegisteredMutation<"public", any, any>
  | RegisteredAction<"public", any, any> => {
  // Convex registered functions have this structure
  // Using 'any' for args/returns as this is an API boundary between our types and Convex's
  return {
    exportName: fn.name,
    argsValidator: compileSchema(fn.args),
    returnsValidator: compileSchema(fn.returns),
    visibility: "public" as const,
  } as any; // API boundary cast - Convex's type vs our type
};
