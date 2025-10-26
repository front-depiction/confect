import { Predicate } from "effect";
import {
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "../server/schema";
import {
  ConfectApiGroupAny,
  ConfectApiGroupAnyWithProps,
} from "./ConfectApiGroup";
import * as ConfectApi from "./ConfectApi";

export const TypeId = Symbol.for(
  "@rjdellecese/confect/ConfectApiWithDatabaseSchema"
);

export type TypeId = typeof TypeId;

export const isConfectApiWithDatabaseSchema = (
  u: unknown
): u is ConfectApiWithDatabaseSchemaAny => Predicate.hasProperty(u, TypeId);

// TODO: Rename this to ConfectApiScaffolding? Or something else?
export interface ConfectApiWithDatabaseSchema<
  ConfectSchema extends GenericConfectSchema,
  Name extends string,
  Groups extends ConfectApiGroupAny,
> {
  readonly [TypeId]: TypeId;
  readonly api: ConfectApi.ConfectApi<Name, Groups>;
  readonly confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>;
}

// Type aliases - exported directly
export interface ConfectApiWithDatabaseSchemaAny {
  readonly [TypeId]: TypeId;
}

export interface ConfectApiWithDatabaseSchemaAnyWithProps
  extends ConfectApiWithDatabaseSchema<
    GenericConfectSchema,
    string,
    ConfectApiGroupAnyWithProps
  > {}

const Proto = {
  [TypeId]: TypeId,
};

const makeProto = <
  ConfectSchema extends GenericConfectSchema,
  const Name extends string,
  Groups extends ConfectApiGroupAny,
>({
  confectSchemaDefinition,
  api,
}: {
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>;
  api: ConfectApi.ConfectApi<Name, Groups>;
}): ConfectApiWithDatabaseSchema<ConfectSchema, Name, Groups> =>
  Object.assign(Object.create(Proto), {
    confectSchemaDefinition,
    api,
  });

export const make = <
  ConfectSchema extends GenericConfectSchema,
  const Name extends string,
  Groups extends ConfectApiGroupAny,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  api: ConfectApi.ConfectApi<Name, Groups>
): ConfectApiWithDatabaseSchema<ConfectSchema, Name, Groups> =>
  makeProto({ confectSchemaDefinition, api });
