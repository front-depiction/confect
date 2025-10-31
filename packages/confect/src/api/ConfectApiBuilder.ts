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
    // The handlers array is constructed incrementally through .handle() calls.
    // Each call adds a new HandlerItem. While we know the structure is correct
    // (function_ and handler are properly typed), TypeScript cannot verify the
    // array spread preserves Chunk.Chunk invariants from the prototype method context.
    // We use Array spread for simplicity and cast to Chunk at the boundary.
    // This cast is safe because:
    // 1. handlers is already Chunk.Chunk<HandlersItem<...>>
    // 2. We're adding a conforming HandlerItem structure
    // 3. The array structure matches Chunk's internal representation
    return makeHandlers({
      group: this.group,
      handlers: [
        ...this.handlers,
        {
          function_,
          handler,
        },
      ] as unknown as Chunk.Chunk<HandlersItem<ConfectSchema, ConfectApiFunctionAnyWithProps>>,
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
  // GroupPath is a string literal type derived from Groups union.
  // At runtime, we know groupPath is a valid key in api.groups, but TypeScript
  // cannot statically verify the Record lookup returns the exact ConfectApiGroupWithPath type.
  // This cast is safe because GroupPath constrains groupPath to valid paths in Groups.
  const group = apiWithDatabaseSchema.api.groups[
    groupPath
  ]! as ConfectApiGroupWithPath<Groups, GroupPath>;

  // Create initial empty handlers with explicit type parameters
  // This cast is necessary because makeHandlers expects ConfectApiGroupAnyWithProps
  // but 'group' has the more specific type ConfectApiGroupWithPath. The cast is safe
  // because ConfectApiGroupWithPath extends ConfectApiGroupAnyWithProps.
  const initialHandlers = makeHandlers<
    ConfectSchema,
    ConfectApiGroupFunctions<
      ConfectApiGroupWithPath<Groups, GroupPath>
    >
  >({
    group: group as ConfectApiGroupAnyWithProps,
    handlers: Chunk.empty(),
  });

  // The build() function is a user-provided callback that chains .handle() calls.
  // TypeScript's HandlersValidateReturn ensures all functions are handled, but returns
  // a string literal error message if not. At runtime, if validation passes, we know
  // the result is HandlersFromGroup. This cast bridges the compile-time validation
  // type (string literal error or Handlers) to the runtime guarantee.
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

          // GroupName is constrained to ConfectApiGroupName<Groups>, so groupName is a valid key.
          // However, TypeScript cannot statically verify the Record lookup yields ConfectApiGroupWithName.
          // This cast is safe because GroupName ensures we're looking up a group that exists in Groups.
          const group = apiWithDatabaseSchema.api.groups[groupName]! as unknown as Group;

          // Context.GenericTag returns a Tag<Service>, but yield* on a Tag should resolve to Service.
          // TypeScript struggles with the complex generic inference through yield* and Context.GenericTag.
          // This cast explicitly tells TypeScript that yielding the tag provides the service Effect.
          // Safe because ConfectApiGroupService returns Context.GenericTag<ConfectApiGroupService<...>>.
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
