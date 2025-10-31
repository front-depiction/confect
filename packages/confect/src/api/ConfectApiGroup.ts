import { Predicate, Record } from "effect";
import { GenericConfectSchema } from "../server/schema";
import {
  ConfectApiFunctionAnyWithProps,
  Handler,
} from "./ConfectApiFunction";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApiGroup");

export type TypeId = typeof TypeId;

export const isConfectApiGroup = (u: unknown): u is ConfectApiGroupAny =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApiGroup<
  ConfectSchema extends GenericConfectSchema,
  Name extends string,
  Functions extends ConfectApiFunctionAnyWithProps = never,
  Groups extends ConfectApiGroupAnyWithProps = never,
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly functions: {
    [FunctionName in Functions["name"]]: Extract<
      Functions,
      { readonly name: FunctionName }
    >;
  };
  readonly groups: {
    [GroupName in Groups["name"]]: Extract<Groups, { name: GroupName }>;
  };

  // TODO: Rename to addFunction
  add<Function extends ConfectApiFunctionAnyWithProps | { build(): ConfectApiFunctionAnyWithProps }>(
    function_: Function
  ): ConfectApiGroup<
    ConfectSchema,
    Name,
    Functions | (Function extends { build(): infer F } ? F : Function),
    Groups
  >;

  addGroup<Group extends ConfectApiGroupAnyWithProps>(
    group: Group
  ): ConfectApiGroup<ConfectSchema, Name, Functions, Groups | Group>;
}

// Type aliases - exported directly instead of in namespace
export interface ConfectApiGroupAny {
  readonly [TypeId]: TypeId;
  readonly name: string;
}

export type ConfectApiGroupAnyWithProps = ConfectApiGroup<
  GenericConfectSchema,
  string,
  ConfectApiFunctionAnyWithProps
>;

// Utility types - exported directly
export type ConfectApiGroupName<Group> =
  Group extends ConfectApiGroup<
    infer _ConfectSchema,
    infer Name,
    infer _Functions,
    infer _Groups
  >
    ? Name
    : never;

/**
 * Recursively generates paths for a group and its nested groups.
 * For a group with no subgroups, returns just the group name.
 * For a group with subgroups, returns the group name plus all possible paths
 * through its direct subgroups (not all groups in the union).
 */
export type ConfectApiGroupPath<Group extends ConfectApiGroupAny> =
  [ConfectApiGroupGroups<Group>] extends [never]
    ? ConfectApiGroupName<Group>
    : ConfectApiGroupName<Group> | ConfectApiGroupPathFromGroups<Group, ConfectApiGroupGroups<Group>>;

type ConfectApiGroupPathFromGroups<
  Parent extends ConfectApiGroupAny,
  Groups extends ConfectApiGroupAnyWithProps,
> = Groups extends ConfectApiGroupAnyWithProps
  ? `${ConfectApiGroupName<Parent>}.${ConfectApiGroupPath<Groups>}`
  : never;

export type ConfectApiGroupFunctions<Group extends ConfectApiGroupAny> =
  Group extends ConfectApiGroup<
    infer _ConfectSchema,
    infer _Name,
    infer Functions,
    infer _Groups
  >
    ? Functions
    : never;

export type ConfectApiGroupGroups<Group extends ConfectApiGroupAny> =
  Group extends ConfectApiGroup<
    infer _ConfectSchema,
    infer _Name,
    infer _Functions,
    infer Groups
  >
    ? Groups
    : never;

export type ConfectApiGroupGroupNames<Group extends ConfectApiGroupAny> =
  Group extends ConfectApiGroup<
    infer _ConfectSchema,
    infer _Name,
    infer _Functions,
    infer Groups
  >
    ? Groups extends never
      ? never
      : Groups["name"]
    : never;

export type ConfectApiGroupWithName<Group, Name extends string> = Extract<
  Group,
  { readonly name: Name }
>;

/**
 * Recursively extracts the group at the given dot-separated path.
 * Path must match the format defined in `ConfectApiGroupPath` above, e.g. "group" or "group.subgroup".
 *
 * Example:
 *   type G = ConfectApiGroupWithPath<RootGroup, "group.subgroup">;
 */
export type ConfectApiGroupWithPath<Group, Path extends string> = Group extends any
  ? Path extends `${infer Head}.${infer Tail}`
    ? Group extends { readonly name: Head }
      ? Group extends {
          readonly groups: Record.ReadonlyRecord<string, infer SubGroup>;
        }
        ? ConfectApiGroupWithPath<SubGroup, Tail>
        : never
      : never
    : ConfectApiGroupWithName<Group, Path>
  : never;

export type ConfectApiGroupHandlersFrom<
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunctionAnyWithProps,
> = {
  readonly [Current in Function as Current["name"]]: Handler<
    ConfectSchema,
    Current
  >;
};

const Proto = {
  [TypeId]: TypeId,

  add<Function extends ConfectApiFunctionAnyWithProps | { build(): ConfectApiFunctionAnyWithProps }>(
    this: ConfectApiGroupAnyWithProps,
    function_: Function
  ) {
    // Support both builder pattern (.query().args().returns()) and direct ConfectApiFunction.
    // The "build" in function_ check narrows to builder objects, but TypeScript doesn't
    // automatically narrow union types in ternary expressions. We know:
    // - If "build" in function_ is true: function_.build() returns ConfectApiFunctionAnyWithProps
    // - If "build" in function_ is false: function_ is ConfectApiFunctionAnyWithProps
    // Either way, fn is ConfectApiFunctionAnyWithProps. This cast is safe.
    const fn = ("build" in function_ ? function_.build() : function_) as ConfectApiFunctionAnyWithProps;

    return makeProto({
      name: this.name,
      functions: Record.set(this.functions, fn.name, fn),
      groups: this.groups,
    });
  },

  addGroup<Group extends ConfectApiGroupAnyWithProps>(
    this: ConfectApiGroupAnyWithProps,
    group: Group
  ) {
    return makeProto({
      name: this.name,
      functions: this.functions,
      groups: Record.set(this.groups, group.name, group),
    });
  },
};

const makeProto = <
  ConfectSchema extends GenericConfectSchema,
  Name extends string,
  Functions extends ConfectApiFunctionAnyWithProps,
  Groups extends ConfectApiGroupAnyWithProps,
>({
  name,
  functions,
  groups,
}: {
  name: Name;
  functions: Record.ReadonlyRecord<string, Functions>;
  groups: Record.ReadonlyRecord<string, Groups>;
}): ConfectApiGroup<ConfectSchema, Name, Functions, Groups> =>
  Object.assign(Object.create(Proto), {
    name,
    functions,
    groups,
  });

export const make = <
  ConfectSchema extends GenericConfectSchema,
  const Name extends string,
>(
  name: Name
): ConfectApiGroup<ConfectSchema, Name> =>
  makeProto({
    name,
    functions: Record.empty(),
    groups: Record.empty(),
  });
