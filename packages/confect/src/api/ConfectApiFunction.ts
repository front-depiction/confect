import { Effect, Predicate, Schema } from "effect";
import {
  ConfectScheduler,
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
  ConfectVectorSearch,
  ConvexActionCtx,
  ConvexMutationCtx,
  ConvexQueryCtx,
} from "../server";
import { ConfectAuth } from "../server/auth";
import {
  ConfectDatabaseReader,
  ConfectDatabaseWriter,
} from "../server/database";
import {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
} from "../server/runners";
import {
  ConfectSchemaDefinition,
  DataModelFromConfectSchema,
  GenericConfectSchema,
} from "../server/schema";

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
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunctionAnyWithProps,
> =
  Function extends ConfectApiFunctionWithFunctionType<Function, "Query">
    ? QueryHandler<ConfectSchema, Function>
    : Function extends ConfectApiFunctionWithFunctionType<Function, "Mutation">
      ? MutationHandler<ConfectSchema, Function>
      : Function extends ConfectApiFunctionWithFunctionType<Function, "Action">
        ? ActionHandler<ConfectSchema, Function>
        : never;

export type QueryHandler<
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunctionAnyWithPropsWithFunctionType<"Query">,
> = BaseHandler<
  Function,
  | ConfectDatabaseReader<ConfectSchemaDefinition<ConfectSchema>>
  | ConfectAuth
  | ConfectStorageReader
  | ConfectQueryRunner
  | ConvexQueryCtx<DataModelFromConfectSchema<ConfectSchema>>
>;

export type MutationHandler<
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunctionAnyWithPropsWithFunctionType<"Mutation">,
> = BaseHandler<
  Function,
  | ConfectDatabaseReader<ConfectSchemaDefinition<ConfectSchema>>
  | ConfectDatabaseWriter<ConfectSchemaDefinition<ConfectSchema>>
  | ConfectAuth
  | ConfectScheduler
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectQueryRunner
  | ConfectMutationRunner
  | ConvexMutationCtx<DataModelFromConfectSchema<ConfectSchema>>
>;

export type ActionHandler<
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunctionAnyWithPropsWithFunctionType<"Action">,
> = BaseHandler<
  Function,
  | ConfectScheduler
  | ConfectAuth
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectStorageActionWriter
  | ConfectQueryRunner
  | ConfectMutationRunner
  | ConfectActionRunner
  | ConfectVectorSearch
  | ConvexActionCtx<DataModelFromConfectSchema<ConfectSchema>>
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
