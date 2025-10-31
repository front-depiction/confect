/**
 * @deprecated This module is deprecated. Schema is now integrated directly into ConfectApi.
 *
 * **Migration Guide:**
 *
 * Before:
 * ```typescript
 * import * as ConfectApiWithDatabaseSchema from "@rjdellecese/confect/api/ConfectApiWithDatabaseSchema";
 *
 * const apiWithSchema = ConfectApiWithDatabaseSchema.make(
 *   schemaDefinition,
 *   ConfectApi.make("myApi")
 * );
 * ```
 *
 * After:
 * ```typescript
 * import * as ConfectApi from "@rjdellecese/confect/api/ConfectApi";
 *
 * const api = ConfectApi.make(schemaDefinition, "myApi");
 * ```
 *
 * **Changes:**
 * - `ConfectApi.make()` now takes `(schema, name)` instead of just `name`
 * - No need for a separate wrapper - schema is part of the API
 * - All type parameters automatically flow from schema
 *
 * @module api/ConfectApiWithDatabaseSchema
 */

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

/**
 * @deprecated Schema is now integrated in ConfectApi. Use ConfectApi.make(schema, name) instead.
 */
export interface ConfectApiWithDatabaseSchema<
  ConfectSchema extends GenericConfectSchema,
  Name extends string,
  Groups extends ConfectApiGroupAny,
> {
  readonly [TypeId]: TypeId;
  readonly api: ConfectApi.ConfectApi<ConfectSchema, Name, Groups>;
  readonly confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>;
}

// Type aliases - exported directly
/**
 * @deprecated Use ConfectApi.ConfectApiAny instead.
 */
export interface ConfectApiWithDatabaseSchemaAny {
  readonly [TypeId]: TypeId;
}

/**
 * @deprecated Use ConfectApi.ConfectApiAnyWithProps instead.
 */
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
  api: ConfectApi.ConfectApi<ConfectSchema, Name, Groups>;
}): ConfectApiWithDatabaseSchema<ConfectSchema, Name, Groups> =>
  Object.assign(Object.create(Proto), {
    confectSchemaDefinition,
    api,
  });

/**
 * @deprecated Schema is now integrated in ConfectApi.make(schema, name).
 * This wrapper is no longer needed.
 *
 * **Migration:**
 *
 * Before:
 * ```typescript
 * const apiWithSchema = ConfectApiWithDatabaseSchema.make(schema, api);
 * ```
 *
 * After:
 * ```typescript
 * const api = ConfectApi.make(schema, name);
 * ```
 */
export const make = <
  ConfectSchema extends GenericConfectSchema,
  const Name extends string,
  Groups extends ConfectApiGroupAny,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  api: ConfectApi.ConfectApi<ConfectSchema, Name, Groups>
): ConfectApiWithDatabaseSchema<ConfectSchema, Name, Groups> =>
  makeProto({ confectSchemaDefinition, api });
