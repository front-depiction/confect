import { Effect, Predicate, Schema } from "effect";
import {
  ConfectScheduler,
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
  ConfectVectorSearch,
} from "../server";
import { ConfectAuth } from "../server/auth";
import {
  ConvexActionCtx,
  ConvexMutationCtx,
  ConvexQueryCtx,
} from "../server/ctx";
import { QueryDB, MutationDB } from "../server/database";
import {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
} from "../server/runners";
import { GenericConfectSchema } from "../server/schema";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiFunction");

export type TypeId = typeof TypeId;

export const isConfectApiFunction = (
  u: unknown
): u is ConfectApiFunctionAnyWithProps => Predicate.hasProperty(u, TypeId);

export interface ConfectApiFunction<
  FunctionType_ extends FunctionType,
  Name extends string,
  Args extends Schema.Schema.AnyNoContext,
  Returns extends Schema.Schema.AnyNoContext,
> {
  readonly [TypeId]: TypeId;
  readonly functionType: FunctionType_;
  readonly name: Name;
  readonly args: Args;
  readonly returns: Returns;
}

// Type aliases - exported directly instead of in namespace
export interface ConfectApiFunctionAnyWithProps
  extends ConfectApiFunction<
    FunctionType,
    string,
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface ConfectApiFunctionAnyWithPropsWithFunctionType<
  FunctionType_ extends FunctionType,
> extends ConfectApiFunction<
    FunctionType_,
    string,
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

// Utility types - exported directly
export type ConfectApiFunctionName<Function extends ConfectApiFunctionAnyWithProps> =
  Function extends ConfectApiFunction<
    infer _FunctionType,
    infer Name,
    infer _Args,
    infer _Returns
  >
    ? Name
    : never;

export type ConfectApiFunctionArgs<Function extends ConfectApiFunctionAnyWithProps> =
  Function extends ConfectApiFunction<
    infer _FunctionType,
    infer _Name,
    infer Args,
    infer _Returns
  >
    ? Args
    : never;

export type ConfectApiFunctionReturns<Function extends ConfectApiFunctionAnyWithProps> =
  Function extends ConfectApiFunction<
    infer _FunctionType,
    infer _Name,
    infer _Args,
    infer Returns
  >
    ? Returns
    : never;

export type ConfectApiFunctionWithName<
  Function extends ConfectApiFunctionAnyWithProps,
  Name extends string,
> = Extract<Function, { readonly name: Name }>;

export type ConfectApiFunctionWithFunctionType<
  Function extends ConfectApiFunctionAnyWithProps,
  FunctionType_ extends FunctionType,
> = Extract<Function, { readonly functionType: FunctionType_ }>;

export type ConfectApiFunctionExcludeName<
  Function extends ConfectApiFunctionAnyWithProps,
  Name extends string,
> = Exclude<Function, { readonly name: Name }>;

export type Handler<
  _ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunctionAnyWithProps,
> =
  Function extends ConfectApiFunctionWithFunctionType<Function, "Query">
    ? QueryHandler<Function>
    : Function extends ConfectApiFunctionWithFunctionType<Function, "Mutation">
      ? MutationHandler<Function>
      : Function extends ConfectApiFunctionWithFunctionType<Function, "Action">
        ? ActionHandler<Function>
        : never;

export type QueryHandler<
  Function extends ConfectApiFunctionAnyWithPropsWithFunctionType<"Query">,
> = BaseHandler<
  Function,
  | typeof QueryDB
  | ConfectAuth
  | ConfectStorageReader
  | typeof ConfectQueryRunner
  | typeof ConvexQueryCtx
>;

export type MutationHandler<
  Function extends ConfectApiFunctionAnyWithPropsWithFunctionType<"Mutation">,
> = BaseHandler<
  Function,
  | typeof QueryDB
  | typeof MutationDB
  | ConfectAuth
  | ConfectScheduler
  | ConfectStorageReader
  | ConfectStorageWriter
  | typeof ConfectQueryRunner
  | typeof ConfectMutationRunner
  | typeof ConvexMutationCtx
>;

export type ActionHandler<
  Function extends ConfectApiFunctionAnyWithPropsWithFunctionType<"Action">,
> = BaseHandler<
  Function,
  | ConfectScheduler
  | ConfectAuth
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectStorageActionWriter
  | typeof ConfectQueryRunner
  | typeof ConfectMutationRunner
  | typeof ConfectActionRunner
  | typeof ConfectVectorSearch
  | typeof ConvexActionCtx
>;

type BaseHandler<
  Function extends ConfectApiFunctionAnyWithProps,
  Requirements,
> = <E>(
  args: ConfectApiFunctionArgs<Function>["Type"]
) => Effect.Effect<
  ConfectApiFunctionReturns<Function>["Type"],
  E,
  Requirements
>;

// Handler utility types - exported directly
export type HandlerAnyWithProps = Handler<
  GenericConfectSchema,
  ConfectApiFunctionAnyWithProps
>;

export type HandlerWithName<
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunctionAnyWithProps,
  Name extends string,
> = Handler<ConfectSchema, ConfectApiFunctionWithName<Function, Name>>;

const Proto = {
  [TypeId]: TypeId,
};

export type FunctionType = "Query" | "Mutation" | "Action";

/**
 * Fluent builder for defining Confect API functions.
 * Inspired by Effect's HttpApiEndpoint builder pattern.
 */
class ConfectApiFunctionBuilder<
  FT extends FunctionType,
  Name extends string,
  Args extends Schema.Schema.AnyNoContext | undefined = undefined,
  Returns extends Schema.Schema.AnyNoContext | undefined = undefined,
> {
  constructor(
    private readonly functionType: FT,
    private readonly _name: Name,
    private readonly argsSchema?: Args,
    private readonly returnsSchema?: Returns,
  ) {}

  /**
   * Set the arguments schema for this function.
   *
   * @example
   * ConfectApiFunction.query("getUser")
   *   .args(Schema.Struct({ id: Schema.String }))
   *   .returns(UserSchema)
   */
  args<A extends Schema.Schema.AnyNoContext>(
    schema: A,
  ): ConfectApiFunctionBuilder<FT, Name, A, Returns> {
    return new ConfectApiFunctionBuilder(
      this.functionType,
      this._name,
      schema,
      this.returnsSchema,
    );
  }

  /**
   * Set the return schema for this function.
   *
   * @example
   * ConfectApiFunction.mutation("createTask")
   *   .args(Schema.Struct({ text: Schema.String }))
   *   .returns(Schema.String) // Returns task ID
   */
  returns<R extends Schema.Schema.AnyNoContext>(
    schema: R,
  ): ConfectApiFunctionBuilder<FT, Name, Args, R> {
    return new ConfectApiFunctionBuilder(
      this.functionType,
      this._name,
      this.argsSchema,
      schema,
    );
  }

  /**
   * Build the final ConfectApiFunction.
   * Called internally when the function is added to a group.
   *
   * @internal
   */
  build(): Args extends Schema.Schema.AnyNoContext
    ? Returns extends Schema.Schema.AnyNoContext
      ? ConfectApiFunction<FT, Name, Args, Returns>
      : never
    : never {
    if (!this.argsSchema) {
      throw new Error(
        `ConfectApiFunction "${this._name}": .args() must be called before building`,
      );
    }
    if (!this.returnsSchema) {
      throw new Error(
        `ConfectApiFunction "${this._name}": .returns() must be called before building`,
      );
    }

    // Builder pattern invariant: Runtime checks guarantee argsSchema and returnsSchema are defined,
    // which means Args and Returns are narrowed to Schema.Schema.AnyNoContext (not undefined).
    // However, TypeScript's control flow analysis cannot narrow generic type parameters through
    // runtime checks. The conditional return type requires Args/Returns to be non-undefined schemas,
    // which we've verified at runtime. This cast bridges the runtime guarantee to the conditional
    // return type. Safe because: (1) runtime checks prevent undefined schemas, (2) the builder API
    // enforces .args() and .returns() must be called before .build(), (3) the returned structure
    // matches ConfectApiFunction<FT, Name, Args, Returns> exactly.
    return Object.assign(Object.create(Proto), {
      functionType: this.functionType,
      name: this._name,
      args: this.argsSchema,
      returns: this.returnsSchema,
    }) as any;
  }
}

/**
 * Create a Query function builder.
 *
 * Queries are read-only operations that fetch data from the database.
 * They can access: database reader, auth, storage reader, query runner, ctx.
 *
 * @example
 * ConfectApiFunction.query("listTasks")
 *   .args(Schema.Struct({ limit: Schema.optional(Schema.Number) }))
 *   .returns(Schema.Array(TaskSchema))
 */
export const query = <const Name extends string>(
  name: Name,
): ConfectApiFunctionBuilder<"Query", Name> =>
  new ConfectApiFunctionBuilder("Query", name);

/**
 * Create a Mutation function builder.
 *
 * Mutations are write operations that modify database state.
 * They can access: database reader/writer, auth, scheduler, storage, runners, ctx.
 *
 * @example
 * ConfectApiFunction.mutation("createTask")
 *   .args(Schema.Struct({ text: Schema.String }))
 *   .returns(Schema.String) // Returns new task ID
 */
export const mutation = <const Name extends string>(
  name: Name,
): ConfectApiFunctionBuilder<"Mutation", Name> =>
  new ConfectApiFunctionBuilder("Mutation", name);

/**
 * Create an Action function builder.
 *
 * Actions are operations that can perform side effects (HTTP calls, etc.).
 * They can access: all services including runners, vector search, storage writer.
 *
 * @example
 * ConfectApiFunction.action("sendEmail")
 *   .args(Schema.Struct({ to: Schema.String, subject: Schema.String }))
 *   .returns(Schema.Void)
 */
export const action = <const Name extends string>(
  name: Name,
): ConfectApiFunctionBuilder<"Action", Name> =>
  new ConfectApiFunctionBuilder("Action", name);

/**
 * Legacy API: Create a function using the old make() pattern.
 *
 * @deprecated Use .query(), .mutation(), or .action() instead for better DX.
 *
 * @example
 * // Old way:
 * ConfectApiFunction.make("Query")({ name: "getUser", args: ..., returns: ... })
 *
 * // New way (preferred):
 * ConfectApiFunction.query("getUser").args(...).returns(...)
 */
export const make =
  <FT extends FunctionType>(functionType: FT) =>
  <
    const Name extends string,
    Args extends Schema.Schema.AnyNoContext,
    Returns extends Schema.Schema.AnyNoContext,
  >({
    name,
    args,
    returns,
  }: {
    name: Name;
    args: Args;
    returns: Returns;
  }): ConfectApiFunction<FT, Name, Args, Returns> =>
    Object.assign(Object.create(Proto), {
      functionType,
      name,
      args,
      returns,
    });
