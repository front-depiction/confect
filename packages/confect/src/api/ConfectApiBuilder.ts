import {
  Array,
  Chunk,
  Context,
  Effect,
  Function,
  Layer,
  Order,
  pipe,
  Record,
  Types,
} from "effect";
import {
  ConfectSchemaDefinition,
  GenericConfectSchema,
} from "../server/schema";
import {
  ConfectApiFunctionAnyWithProps,
  ConfectApiFunctionExcludeName,
  ConfectApiFunctionName,
  Handler,
  HandlerAnyWithProps,
  HandlerWithName,
} from "./ConfectApiFunction";
import {
  ConfectApiGroupAny,
  ConfectApiGroupAnyWithProps,
  ConfectApiGroupFunctions,
  ConfectApiGroupGroups,
  ConfectApiGroupName,
  ConfectApiGroupPath,
  ConfectApiGroupWithName,
  ConfectApiGroupWithPath,
} from "./ConfectApiGroup";
import * as ConfectApi from "./ConfectApi";

export const HandlersTypeId = Symbol.for("@rjdellecese/confect/Handlers");

export type HandlersTypeId = typeof HandlersTypeId;

/**
 * Type assertion function for group path lookups.
 * GroupPath is constrained to valid paths in Groups, so at runtime we know
 * the lookup will succeed. This function provides TypeScript with the type narrowing.
 *
 * Note: The cast is necessary because TypeScript cannot statically verify that
 * Record<string, Groups>[GroupPath] precisely equals ConfectApiGroupWithPath<Groups, GroupPath>,
 * even though GroupPath is constrained to valid paths.
 */
function assertGroupPath<
  Groups extends ConfectApiGroupAnyWithProps,
  GroupPath extends ConfectApiGroupPath<Groups>
>(
  groups: Record.ReadonlyRecord<string, Groups>,
  groupPath: GroupPath
): ConfectApiGroupWithPath<Groups, GroupPath> {
  const group = groups[groupPath];
  if (!group) {
    throw new Error(`Group not found at path: ${groupPath}`);
  }
  // TypeScript cannot prove the Record lookup returns the exact narrowed type
  return group as unknown as ConfectApiGroupWithPath<Groups, GroupPath>;
}

/**
 * Type assertion function for group name lookups.
 * GroupName is constrained to valid names in Groups, so at runtime we know
 * the lookup will succeed. This function provides TypeScript with the type narrowing.
 *
 * Note: The cast is necessary because TypeScript cannot statically verify that
 * Record<string, Groups>[GroupName] precisely equals ConfectApiGroupWithName<Groups, GroupName>,
 * even though GroupName is constrained to valid names.
 */
function assertGroupName<
  Groups extends ConfectApiGroupAnyWithProps,
  GroupName extends ConfectApiGroupName<Groups>
>(
  groups: Record.ReadonlyRecord<string, Groups>,
  groupName: GroupName
): ConfectApiGroupWithName<Groups, GroupName> {
  const group = groups[groupName];
  if (!group) {
    throw new Error(`Group not found with name: ${groupName}`);
  }
  // TypeScript cannot prove the Record lookup returns the exact narrowed type
  return group as unknown as ConfectApiGroupWithName<Groups, GroupName>;
}

/**
 * Type assertion for validated handlers result.
 * HandlersValidateReturn enforces compile-time validation that all functions are handled.
 * At runtime, if the code compiles, we know the validation passed.
 * This function bridges the compile-time validation type to the runtime type.
 */
function assertValidatedHandlers<
  ConfectSchema extends GenericConfectSchema,
  Group extends ConfectApiGroupAny,
  Return
>(
  result: HandlersValidateReturn<Return>
): HandlersFromGroup<ConfectSchema, Group> {
  // At compile time, HandlersValidateReturn ensures Return is Handlers with all functions handled
  // The type is either Handlers<...> or a string literal error (which would fail compilation)
  // At runtime, if we reach here, validation succeeded
  // We need 'as unknown' first because string literals don't overlap with Handlers
  return result as unknown as HandlersFromGroup<ConfectSchema, Group>;
}

export interface Handlers<
  ConfectSchema extends GenericConfectSchema,
  Functions extends ConfectApiFunctionAnyWithProps = never,
> {
  readonly [HandlersTypeId]: {
    _Functions: Types.Covariant<Functions>;
  };
  readonly group: ConfectApiGroupAnyWithProps;
  readonly handlers: ReadonlyArray<HandlersItem<ConfectSchema, Functions>>;

  handle<Name extends ConfectApiFunctionName<Functions>>(
    name: Name,
    handler: HandlerWithName<ConfectSchema, Functions, Name>
  ): Handlers<
    ConfectSchema,
    ConfectApiFunctionExcludeName<Functions, Name>
  >;
}

// Handlers utility types - exported directly
export interface HandlersItem<
  ConfectSchema extends GenericConfectSchema,
  Functions extends ConfectApiFunctionAnyWithProps,
> {
  readonly function_: Functions;
  readonly handler: Handler<ConfectSchema, Functions>;
}

export type HandlersFromGroup<
  ConfectSchema extends GenericConfectSchema,
  Group extends ConfectApiGroupAny,
> = Handlers<ConfectSchema, ConfectApiGroupFunctions<Group>>;

export type HandlersValidateReturn<A> =
  A extends Handlers<infer _ConfectSchema, infer Functions>
    ? [Functions] extends [never]
      ? A
      : `Function not handled: ${ConfectApiFunctionName<Functions>}`
    : "Must return the implemented handlers";

const HandlersProto = {
  [HandlersTypeId]: {
    _Functions: Function.identity,
  },

  handle<ConfectSchema extends GenericConfectSchema>(
    this: Handlers<
      ConfectSchema,
      ConfectApiFunctionAnyWithProps
    >,
    name: string,
    handler: HandlerAnyWithProps
  ) {
    const function_ = this.group.functions[name];
    if (!function_) {
      throw new Error(`Function not found in group: ${name}`);
    }
    return makeHandlers({
      group: this.group,
      handlers: pipe(
        Chunk.fromIterable(this.handlers),
        Chunk.append({
          function_,
          handler,
        })
      ),
    });
  },
};

const makeHandlers = <
  ConfectSchema extends GenericConfectSchema,
  Functions extends ConfectApiFunctionAnyWithProps,
  Group extends ConfectApiGroupAnyWithProps = ConfectApiGroupAnyWithProps,
>({
  group,
  handlers,
}: {
  readonly group: Group;
  readonly handlers: Chunk.Chunk<HandlersItem<ConfectSchema, Functions>>;
}): Handlers<ConfectSchema, Functions> =>
  Object.assign(Object.create(HandlersProto), { group, handlers });

export const group = <
  ConfectSchema extends GenericConfectSchema,
  const ApiName extends string,
  Groups extends ConfectApiGroupAnyWithProps,
  const GroupPath extends ConfectApiGroupPath<Groups>,
  Return,
>(
  api: ConfectApi.ConfectApi<ConfectSchema, ApiName, Groups>,
  groupPath: GroupPath,
  build: (
    handlers: HandlersFromGroup<
      ConfectSchema,
      ConfectApiGroupWithPath<Groups, GroupPath>
    >
  ) => HandlersValidateReturn<Return>
): Layer.Layer<
  ConfectApiGroupService<
    ConfectSchema,
    ApiName,
    ConfectApiGroupWithPath<Groups, GroupPath>
  >,
  ConfectApiGroupService<
    ConfectSchema,
    ApiName,
    ConfectApiGroupGroups<
      ConfectApiGroupWithPath<Groups, GroupPath>
    >
  >
> => {
  const group = assertGroupPath(api.groups, groupPath);

  const initialHandlers = makeHandlers<
    ConfectSchema,
    ConfectApiGroupFunctions<
      ConfectApiGroupWithPath<Groups, GroupPath>
    >,
    ConfectApiGroupWithPath<Groups, GroupPath>
  >({
    group,
    handlers: Chunk.empty(),
  });

  const populatedHandlers = assertValidatedHandlers<
    ConfectSchema,
    ConfectApiGroupWithPath<Groups, GroupPath>,
    Return
  >(build(initialHandlers));

  // Use the populated result directly
  return Layer.succeed(
    ConfectApiGroupService<
      ConfectSchema,
      ApiName,
      ConfectApiGroupWithPath<Groups, GroupPath>
    >({
      apiName: api.name,
      group,
    }),
    {
      apiName: api.name,
      handlers: populatedHandlers,
    }
  );
};

export const api = <
  ConfectSchema extends GenericConfectSchema,
  const ApiName extends string,
  Groups extends ConfectApiGroupAnyWithProps,
>(
  api: ConfectApi.ConfectApi<ConfectSchema, ApiName, Groups>
): Layer.Layer<
  ConfectApiService<ConfectSchema, ApiName, Groups>,
  never,
  ConfectApiGroupService<ConfectSchema, ApiName, Groups>
> =>
  Layer.sync(
    ConfectApiService<ConfectSchema, ApiName, Groups>(
      api.schemaDefinition,
      api.name,
      api.groups
    ),
    () => ({
      apiName: api.name,
      groupHandler: <
        GroupName extends ConfectApiGroupName<Groups>,
      >(
        groupName: GroupName
      ): Effect.Effect<
        HandlersFromGroup<
          ConfectSchema,
          ConfectApiGroupWithName<Groups, GroupName>
        >
      > =>
        Effect.gen(function* () {
          type Group = ConfectApiGroupWithName<
            Groups,
            GroupName
          >;

          const group = assertGroupName(api.groups, groupName);

          const groupService = yield* ConfectApiGroupService<
            ConfectSchema,
            ApiName,
            Group
          >({
            apiName: api.name,
            group,
          });

          return groupService.handlers;
        }),
    })
  );

export interface ConfectApiGroupService<
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Group extends ConfectApiGroupAny,
> {
  readonly apiName: ApiName;
  readonly handlers: HandlersFromGroup<ConfectSchema, Group>;
}

export const ConfectApiGroupService = <
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Group extends ConfectApiGroupAny,
>({
  apiName,
  group,
}: {
  apiName: string;
  group: Group;
}) =>
  Context.GenericTag<ConfectApiGroupService<ConfectSchema, ApiName, Group>>(
    `@rjdellecese/confect/ConfectApiGroupService/${apiName}/${group.name}`
  );

export interface ConfectApiService<
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroupAnyWithProps,
> {
  readonly apiName: ApiName;

  readonly groupHandler: <
    GroupName extends ConfectApiGroupName<Groups>,
  >(
    groupName: GroupName
  ) => Effect.Effect<
    HandlersFromGroup<
      ConfectSchema,
      ConfectApiGroupWithName<Groups, GroupName>
    >
  >;
}

export const ConfectApiService = <
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroupAnyWithProps,
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  apiName: ApiName,
  groups: Record.ReadonlyRecord<string, Groups>
) => {
  const tableNamesIdentifier = pipe(
    confectSchemaDefinition.tableSchemas,
    Record.keys,
    Array.sort(Order.string),
    Array.join("|")
  );

  const groupNamesIdentifier = pipe(
    Record.keys(groups),
    Array.sort(Order.string),
    Array.join("|")
  );

  return Context.GenericTag<ConfectApiService<ConfectSchema, ApiName, Groups>>(
    `@rjdellecese/confect/ConfectApiService/${tableNamesIdentifier}/${apiName}/${groupNamesIdentifier}`
  );
};
