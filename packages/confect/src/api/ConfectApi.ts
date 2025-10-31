import { Predicate, Record } from "effect";
import {
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "../server/schema";
import { ConfectApiGroupAny, ConfectApiGroupAnyWithProps } from "./ConfectApiGroup";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApi");
export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApiAny =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApi<
  S extends GenericConfectSchema,
  Name extends string,
  Groups extends ConfectApiGroupAny = never,
> {
  readonly [TypeId]: TypeId;
  readonly schema: S;
  readonly name: Name;
  readonly groups: {
    [GroupName in Groups["name"]]: Extract<Groups, { name: GroupName }>;
  };

  add<Group extends ConfectApiGroupAny>(
    group: Group
  ): ConfectApi<S, Name, Groups | Group>;
}

// Type aliases - exported directly instead of in namespace
export interface ConfectApiAny {
  readonly [TypeId]: TypeId;
  readonly schema: GenericConfectSchema;
  readonly name: string;
}

export interface ConfectApiAnyWithProps
  extends ConfectApi<
    GenericConfectSchema,
    string,
    ConfectApiGroupAnyWithProps
  > {}

const Proto = {
  [TypeId]: TypeId,

  add<Group extends ConfectApiGroupAnyWithProps>(
    this: ConfectApiAnyWithProps,
    group: Group
  ) {
    return makeProto({
      schema: this.schema,
      name: this.name,
      groups: Record.set(this.groups, group.name, group),
    });
  },
};

const makeProto = <
  S extends GenericConfectSchema,
  const Name extends string,
  Groups extends ConfectApiGroupAnyWithProps,
>({
  schema,
  name,
  groups,
}: {
  schema: S;
  name: Name;
  groups: Record.ReadonlyRecord<string, Groups>;
}): ConfectApi<S, Name, Groups> =>
  Object.assign(Object.create(Proto), {
    schema,
    name,
    groups,
  });

export const make = <S extends GenericConfectSchema, const Name extends string>(
  schemaDefinition: ConfectSchemaDefinition<S>,
  name: Name
): ConfectApi<S, Name> =>
  makeProto({ schema: schemaDefinition.confectSchema, name, groups: Record.empty() });

// ===========================
// Type Utilities (using data_model.d.ts)
// ===========================

/**
 * Extract the API name from a ConfectApi instance.
 *
 * @example
 * type Name = ConfectApiName<MyApi>  // "myApi"
 */
export type ConfectApiName<Api extends ConfectApiAnyWithProps> = Api["name"];

/**
 * Extract the database schema from a ConfectApi instance.
 *
 * @example
 * type Schema = ConfectApiSchema<MyApi>  // The GenericConfectSchema
 */
export type ConfectApiSchema<Api extends ConfectApiAnyWithProps> = Api["schema"];

/**
 * Extract all top-level group names from a ConfectApi instance.
 *
 * @example
 * type GroupNames = ConfectApiGroupNames<MyApi>  // "users" | "posts"
 */
export type ConfectApiGroupNames<Api extends ConfectApiAnyWithProps> = keyof Api["groups"] & string;

/**
 * Extract a specific group by name from a ConfectApi instance.
 *
 * @example
 * type UsersGroup = ConfectApiGroupByName<MyApi, "users">
 */
export type ConfectApiGroupByName<
  Api extends ConfectApiAnyWithProps,
  GroupName extends ConfectApiGroupNames<Api>,
> = Api["groups"][GroupName];

/**
 * Extract all groups from a ConfectApi instance as a union.
 *
 * @example
 * type AllGroups = ConfectApiGroups<MyApi>  // UsersGroup | PostsGroup
 */
export type ConfectApiGroups<Api extends ConfectApiAnyWithProps> = Api["groups"][keyof Api["groups"]];
