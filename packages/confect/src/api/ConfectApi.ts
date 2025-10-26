import { Predicate, Record } from "effect";
import { ConfectApiGroupAny, ConfectApiGroupAnyWithProps } from "./ConfectApiGroup";

export const TypeId = Symbol.for("@rjdellecese/confect/ConfectApi");

export type TypeId = typeof TypeId;

export const isConfectApi = (u: unknown): u is ConfectApiAny =>
  Predicate.hasProperty(u, TypeId);

export interface ConfectApi<
  Name extends string,
  Groups extends ConfectApiGroupAny = never,
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly groups: {
    [GroupName in Groups["name"]]: Extract<Groups, { name: GroupName }>;
  };

  add<Group extends ConfectApiGroupAny>(
    group: Group
  ): ConfectApi<Name, Groups | Group>;
}

// Type aliases - exported directly instead of in namespace
export interface ConfectApiAny {
  readonly [TypeId]: TypeId;
}

export interface ConfectApiAnyWithProps
  extends ConfectApi<string, ConfectApiGroupAnyWithProps> {}

const Proto = {
  [TypeId]: TypeId,

  add<Group extends ConfectApiGroupAnyWithProps>(
    this: ConfectApiAnyWithProps,
    group: Group
  ) {
    return makeProto({
      name: this.name,
      groups: Record.set(this.groups, group.name, group),
    });
  },
};

const makeProto = <
  const Name extends string,
  Groups extends ConfectApiGroupAnyWithProps,
>({
  name,
  groups,
}: {
  name: Name;
  groups: Record.ReadonlyRecord<string, Groups>;
}): ConfectApi<Name, Groups> =>
  Object.assign(Object.create(Proto), {
    name,
    groups,
  });

export const make = <const Name extends string>(name: Name): ConfectApi<Name> =>
  makeProto({ name, groups: Record.empty() });
