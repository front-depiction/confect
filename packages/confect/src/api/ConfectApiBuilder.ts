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
import * as ConfectApiWithDatabaseSchema from "./ConfectApiWithDatabaseSchema";

export const HandlersTypeId = Symbol.for("@rjdellecese/confect/Handlers");

export type HandlersTypeId = typeof HandlersTypeId;

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
    return makeHandlers({
      group: this.group,
      handlers: [
        ...this.handlers,
        {
          function_,
          handler,
        },
      ] as any,
    });
  },
};

const makeHandlers = <
  ConfectSchema extends GenericConfectSchema,
  Functions extends ConfectApiFunctionAnyWithProps,
>({
  group,
  handlers,
}: {
  readonly group: ConfectApiGroupAnyWithProps;
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
  apiWithDatabaseSchema: ConfectApiWithDatabaseSchema.ConfectApiWithDatabaseSchema<
    ConfectSchema,
    ApiName,
    Groups
  >,
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
  const group = apiWithDatabaseSchema.api.groups[
    groupPath
  ]! as ConfectApiGroupWithPath<Groups, GroupPath>;

  // Create initial empty handlers with explicit type parameters
  const initialHandlers = makeHandlers<
    ConfectSchema,
    ConfectApiGroupFunctions<
      ConfectApiGroupWithPath<Groups, GroupPath>
    >
  >({
    group: group as ConfectApiGroupAnyWithProps,
    handlers: Chunk.empty(),
  });

  // Call build() - user chains .handle() calls, returns populated
  const populatedHandlers = build(initialHandlers) as unknown as HandlersFromGroup<
    ConfectSchema,
    ConfectApiGroupWithPath<Groups, GroupPath>
  >;

  // Use the populated result directly
  return Layer.succeed(
    ConfectApiGroupService<
      ConfectSchema,
      ApiName,
      ConfectApiGroupWithPath<Groups, GroupPath>
    >({
      apiName: apiWithDatabaseSchema.api.name,
      group,
    }),
    {
      apiName: apiWithDatabaseSchema.api.name,
      handlers: populatedHandlers,
    }
  );
};

export const api = <
  ConfectSchema extends GenericConfectSchema,
  const ApiName extends string,
  Groups extends ConfectApiGroupAnyWithProps,
>(
  apiWithDatabaseSchema: ConfectApiWithDatabaseSchema.ConfectApiWithDatabaseSchema<
    ConfectSchema,
    ApiName,
    Groups
  >
): Layer.Layer<
  ConfectApiService<ConfectSchema, ApiName, Groups>,
  never,
  ConfectApiGroupService<ConfectSchema, ApiName, Groups>
> =>
  Layer.sync(
    ConfectApiService<ConfectSchema, ApiName, Groups>(
      apiWithDatabaseSchema.confectSchemaDefinition,
      apiWithDatabaseSchema.api.name,
      apiWithDatabaseSchema.api.groups
    ),
    () => ({
      apiName: apiWithDatabaseSchema.api.name,
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

          const group = apiWithDatabaseSchema.api.groups[groupName]! as unknown as Group;

          const groupService = yield* ConfectApiGroupService({
            apiName: apiWithDatabaseSchema.api.name,
            group,
          }) as unknown as Effect.Effect<
            ConfectApiGroupService<ConfectSchema, ApiName, Group>
          >;

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
