# Implementation Plan: API Builder & Server Generation Completion

**Feature**: api-builder-completion
**Phase**: 4 - Implementation Plan
**Status**: 🔴 Ready to Execute
**Derived From**: [design.md](./design.md)
**Verify each step***: run "bunx tsc --noEmit" after each step
---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-26 | Claude | Initial implementation plan |

---

## Executive Summary

**Total Estimated Effort**: 17 hours
**Implementation Phases**: 5
**Files to Modify**: 8
**Files to Create**: 5
**Tests to Add**: ~30

**Critical Path**: Phase 1 (Critical Fixes) → Phase 2-5 (Enhancements in parallel possible)

---

## Table of Contents

1. [Phase 1: Critical Fixes](#phase-1-critical-fixes)
2. [Phase 2: Reflection API](#phase-2-reflection-api)
3. [Phase 3: Error Unification](#phase-3-error-unification)
4. [Phase 4: Schema Caching](#phase-4-schema-caching)
5. [Phase 5: Middleware System](#phase-5-middleware-system)
6. [Progress Tracking](#progress-tracking)
7. [Risk Mitigation](#risk-mitigation)
8. [Quality Gates](#quality-gates)
9. [Rollback Plan](#rollback-plan)

---

## Phase 1: Critical Fixes

**Priority**: 🔴 P0 - Blocking
**Estimated Time**: 1 hour
**Dependencies**: None
**Status**: ⏸️ Not Started

### Overview

Fix the two critical bugs preventing the API system from working end-to-end.

### Tasks

#### Task 1.1: Fix Handler Collection in ConfectApiBuilder.group()

**File**: `packages/confect/src/api/ConfectApiBuilder.ts`
**Lines**: 138-165
**Estimated Time**: 15 minutes

**Current Code**:
```typescript
export const group = <...>(...): Layer.Layer<...> => {
  // TODO
  const group = apiWithDatabaseSchema.api.groups[groupPath]!;
  const handlers = Chunk.empty(); // ← Empty, never populated

  return Layer.succeed(
    ConfectApiGroupService(...),
    {
      apiName: apiWithDatabaseSchema.api.name,
      handlers: build(
        makeHandlers({ group, handlers })
      ) as unknown as Handlers.FromGroup<...>,
    }
  );
};
```

**Changes Required**:

1. Remove TODO comment
2. Trust the `build()` return value
3. Store result instead of casting to unknown

**New Code**:
```typescript
export const group = <...>(...): Layer.Layer<...> => {
  const group = apiWithDatabaseSchema.api.groups[groupPath]!;

  // Create initial empty handlers
  const initialHandlers = makeHandlers({
    group,
    handlers: Chunk.empty()
  });

  // Call build() - user chains .handle() calls, returns populated
  const populatedHandlers = build(initialHandlers);

  // Use the populated result directly
  return Layer.succeed(
    ConfectApiGroupService(...),
    {
      apiName: apiWithDatabaseSchema.api.name,
      handlers: populatedHandlers
    }
  );
};
```

**Acceptance Criteria**:
- [ ] TODO comment removed
- [ ] `build()` return value used directly
- [ ] No type casting to `unknown`
- [ ] Handlers array is populated after `build()`
- [ ] Type signature unchanged
- [ ] Existing tests pass

**Verification**:
```bash
pnpm test packages/confect/src/api/ConfectApiBuilder.test.ts
```

---

#### Task 1.2: Fix Server Generation in ConfectApiServer.make()

**File**: `packages/confect/src/api/ConfectApiServer.ts`
**Lines**: 186
**Estimated Time**: 15 minutes

**Current Code**:
```typescript
export const make = <...>(...): ConfectApiServer<Groups> => {
  return Effect.gen(function* () {
    const layerRuntime = yield* Layer.toRuntime(apiServiceLayer);

    return Runtime.runSync(layerRuntime, Effect.gen(function* () {
      const api = yield* ConfectApiBuilder.ConfectApiService(...);

      // TODO
      const a = Record.map(...); // ← Builds correct structure

      return hole<any>(); // ← PROBLEM: Returns placeholder
    }));
  }).pipe(Effect.scoped, Effect.runSync);
};
```

**Changes Required**:

1. Remove TODO comment
2. Rename variable `a` to `serverGroups` (clarity)
3. Return assembled object with TypeId
4. Remove `hole<any>()`

**New Code**:
```typescript
export const make = <...>(...): ConfectApiServer<Groups> => {
  return Effect.gen(function* () {
    const layerRuntime = yield* Layer.toRuntime(apiServiceLayer);

    return Runtime.runSync(layerRuntime, Effect.gen(function* () {
      const api = yield* ConfectApiBuilder.ConfectApiService(...);

      const serverGroups = Record.map(
        apiWithDatabaseSchema.api.groups as Record.ReadonlyRecord<
          Groups["name"],
          Groups
        >,
        (group) =>
          Effect.runSync(
            Effect.gen(function* () {
              const groupHandler = yield* api.groupHandler(group.name);

              return pipe(
                groupHandler.handlers,
                Array.map(({ function_: fn, handler }) => {
                  const registeredFunction = Match.value(fn.functionType).pipe(
                    Match.when("Query", () =>
                      queryGeneric(confectQueryFunction(
                        apiWithDatabaseSchema.confectSchemaDefinition,
                        { args: fn.args, returns: fn.returns, handler }
                      ))
                    ),
                    Match.when("Mutation", () =>
                      mutationGeneric(confectMutationFunction(
                        apiWithDatabaseSchema.confectSchemaDefinition,
                        { args: fn.args, returns: fn.returns, handler }
                      ))
                    ),
                    Match.when("Action", () =>
                      actionGeneric(confectActionFunction(
                        apiWithDatabaseSchema.confectSchemaDefinition,
                        { args: fn.args, returns: fn.returns, handler }
                      ))
                    ),
                    Match.exhaustive
                  );
                  return [fn.name, registeredFunction] as const;
                }),
                Record.fromEntries
              );
            })
          )
      );

      // Return the assembled server with TypeId
      return {
        [TypeId]: TypeId,
        ...serverGroups
      } as ConfectApiServer<Groups>;
    }));
  }).pipe(Effect.scoped, Effect.runSync);
};
```

**Acceptance Criteria**:
- [ ] TODO comment removed
- [ ] Variable renamed to `serverGroups`
- [ ] Returns object with TypeId
- [ ] `hole<any>()` removed
- [ ] Type signature matches `ConfectApiServer<Groups>`
- [ ] All groups present in return value
- [ ] All functions present in each group

**Verification**:
```bash
pnpm test packages/confect/src/api/ConfectApiServer.test.ts
```

---

#### Task 1.3: Add End-to-End Integration Test

**File**: `packages/confect/src/api/ConfectApi.test.ts` (update existing)
**Estimated Time**: 30 minutes

**Test to Add**:

```typescript
import { describe, expect, test } from "vitest";
import { ConvexReactClient } from "convex/react";
import { Effect, Layer, Schema } from "effect";
import { defineConfectSchema, defineConfectTable } from "../server";
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiClient from "./ConfectApiClient";
import * as ConfectApiFunction from "./ConfectApiFunction";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiServer from "./ConfectApiServer";
import * as ConfectApiWithDatabaseSchema from "./ConfectApiWithDatabaseSchema";

describe("ConfectApi - End-to-End Integration", () => {
  test("complete workflow: API definition → handlers → server → client", () => {
    // 1. Define schema
    const confectSchemaDefinition = defineConfectSchema({
      notes: defineConfectTable(
        Schema.Struct({
          content: Schema.String,
        })
      ),
    });

    // 2. Define API with groups and functions
    const Group = ConfectApiGroup.make("group")
      .add(
        ConfectApiFunction.make("Query")({
          name: "myFunction",
          args: Schema.Struct({ foo: Schema.Number }),
          returns: Schema.String,
        })
      )
      .add(
        ConfectApiFunction.make("Query")({
          name: "myFunction2",
          args: Schema.Struct({ foo: Schema.Number }),
          returns: Schema.String,
        })
      );

    const Api = ConfectApi.make("Api").add(Group);

    const ApiWithDatabaseSchema = ConfectApiWithDatabaseSchema.make(
      confectSchemaDefinition,
      Api
    );

    // 3. Implement handlers
    const GroupLive = ConfectApiBuilder.group(
      ApiWithDatabaseSchema,
      "group",
      (handlers) =>
        handlers
          .handle("myFunction", (args) => Effect.succeed(`foo: ${args.foo}`))
          .handle("myFunction2", (args) => Effect.succeed(`foo: ${args.foo}`))
    );

    const ApiLive = ConfectApiBuilder.api(ApiWithDatabaseSchema).pipe(
      Layer.provide(GroupLive)
    );

    // 4. Generate server
    const server = ConfectApiServer.make(ApiWithDatabaseSchema, ApiLive);

    // 5. Verify server structure
    expect(server[ConfectApiServer.TypeId]).toBe(ConfectApiServer.TypeId);
    expect(server.group).toBeDefined();
    expect(server.group.myFunction).toBeDefined();
    expect(server.group.myFunction2).toBeDefined();
    expect(typeof server.group.myFunction).toBe("function");
    expect(typeof server.group.myFunction2).toBe("function");

    // 6. Generate client
    const client = ConfectApiClient.make(
      Api,
      new ConvexReactClient("http://localhost:3000")
    );

    // 7. Verify client structure
    expect(client.group).toBeDefined();
    expect(client.group.myFunction).toBeDefined();
    expect(client.group.myFunction2).toBeDefined();
    expect(typeof client.group.myFunction).toBe("function");
  });

  test("handler collection populates handlers array", () => {
    const confectSchemaDefinition = defineConfectSchema({
      notes: defineConfectTable(Schema.Struct({ content: Schema.String })),
    });

    const Group = ConfectApiGroup.make("group").add(
      ConfectApiFunction.make("Query")({
        name: "testFunction",
        args: Schema.Struct({ id: Schema.String }),
        returns: Schema.String,
      })
    );

    const Api = ConfectApi.make("Api").add(Group);
    const ApiWithDb = ConfectApiWithDatabaseSchema.make(confectSchemaDefinition, Api);

    const GroupLive = ConfectApiBuilder.group(ApiWithDb, "group", (handlers) =>
      handlers.handle("testFunction", (args) => Effect.succeed(args.id))
    );

    // Extract handlers from layer
    const groupService = Layer.toRuntime(GroupLive).pipe(
      Effect.andThen((runtime) =>
        Runtime.runSync(
          runtime,
          ConfectApiBuilder.ConfectApiGroupService({
            apiName: "Api",
            group: Group,
          })
        )
      ),
      Effect.scoped,
      Effect.runSync
    );

    expect(groupService.handlers.handlers.length).toBe(1);
    expect(groupService.handlers.handlers[0].function_.name).toBe("testFunction");
  });

  test("nested groups work correctly", () => {
    const confectSchemaDefinition = defineConfectSchema({
      notes: defineConfectTable(Schema.Struct({ content: Schema.String })),
    });

    const NestedGroup = ConfectApiGroup.make("nested").add(
      ConfectApiFunction.make("Query")({
        name: "nestedFunction",
        args: Schema.Struct({}),
        returns: Schema.String,
      })
    );

    const ParentGroup = ConfectApiGroup.make("parent").addGroup(NestedGroup);

    const Api = ConfectApi.make("Api").add(ParentGroup);
    const ApiWithDb = ConfectApiWithDatabaseSchema.make(confectSchemaDefinition, Api);

    const NestedGroupLive = ConfectApiBuilder.group(
      ApiWithDb,
      "parent.nested",
      (handlers) => handlers.handle("nestedFunction", () => Effect.succeed("nested"))
    );

    const ParentGroupLive = ConfectApiBuilder.group(
      ApiWithDb,
      "parent",
      (handlers) => handlers
    ).pipe(Layer.provide(NestedGroupLive));

    const ApiLive = ConfectApiBuilder.api(ApiWithDb).pipe(
      Layer.provide(ParentGroupLive)
    );

    const server = ConfectApiServer.make(ApiWithDb, ApiLive);

    expect(server.parent).toBeDefined();
    expect(server.parent.nested).toBeDefined();
    expect(server.parent.nested.nestedFunction).toBeDefined();
  });
});
```

**Acceptance Criteria**:
- [ ] End-to-end test passes
- [ ] Handler collection test passes
- [ ] Nested groups test passes
- [ ] All tests run without errors
- [ ] Test coverage >90% for modified code

**Verification**:
```bash
pnpm test packages/confect/src/api/ConfectApi.test.ts
```

---

### Phase 1 Checklist

- [ ] Task 1.1: Handler collection fixed
- [ ] Task 1.2: Server generation fixed
- [ ] Task 1.3: Integration tests added
- [ ] All existing tests pass
- [ ] TypeScript compilation successful
- [ ] No console warnings or errors
- [ ] Code reviewed and approved

### Phase 1 Success Criteria

✅ **Must Have**:
- Handler collection works end-to-end
- Server generation returns working object
- Integration test passes
- No TypeScript errors

### Phase 1 Deliverables

- Modified `ConfectApiBuilder.ts` (handler collection fixed)
- Modified `ConfectApiServer.ts` (server generation fixed)
- Updated `ConfectApi.test.ts` (comprehensive tests)
- Test coverage report showing >90% coverage

---

## Phase 2: Reflection API

**Priority**: 🟡 P1 - High Value
**Estimated Time**: 2 hours
**Dependencies**: Phase 1 (optional - can develop in parallel)
**Status**: ⏸️ Not Started

### Overview

Implement API introspection to enable OpenAPI generation, documentation tools, and runtime analysis.

### Tasks

#### Task 2.1: Define Reflection Types

**File**: `packages/confect/src/api/ConfectApi.ts` (add types)
**Estimated Time**: 30 minutes

**Types to Add**:

```typescript
// Reflection context types
export interface GroupReflectionContext {
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly path: string; // "group" or "group4.group2"
  readonly depth: number; // Nesting level (0 = root)
  readonly parentGroup?: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
}

export interface FunctionReflectionContext {
  readonly function: ConfectApiFunction.ConfectApiFunction.AnyWithProps;
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly groupPath: string;
  readonly fullPath: string; // "group4.group2.myFunction3"
  readonly functionType: "Query" | "Mutation" | "Action";
  readonly argsSchema: Schema.Schema<any, any>;
  readonly returnsSchema: Schema.Schema<any, any>;
}

export interface ReflectionOptions {
  readonly onGroup?: (ctx: GroupReflectionContext) => void;
  readonly onFunction?: (ctx: FunctionReflectionContext) => void;
}

// Data structure alternative
export interface ApiReflectionStructure {
  readonly apiName: string;
  readonly groups: ReadonlyArray<GroupReflectionStructure>;
}

export interface GroupReflectionStructure {
  readonly name: string;
  readonly path: string;
  readonly functions: ReadonlyArray<FunctionReflectionStructure>;
  readonly nestedGroups: ReadonlyArray<GroupReflectionStructure>;
}

export interface FunctionReflectionStructure {
  readonly name: string;
  readonly type: "Query" | "Mutation" | "Action";
  readonly path: string;
}
```

**Acceptance Criteria**:
- [ ] All types defined
- [ ] JSDoc comments added
- [ ] TypeScript compilation successful
- [ ] Types exported from module

---

#### Task 2.2: Implement reflect() Function

**File**: `packages/confect/src/api/ConfectApi.ts` (add function)
**Estimated Time**: 60 minutes

**Function to Implement**:

```typescript
/**
 * Recursively traverses an API structure, invoking callbacks for each group and function.
 *
 * @param api - The API to reflect upon
 * @param options - Callbacks to invoke during traversal
 *
 * @example
 * ```typescript
 * const groups: string[] = [];
 * const functions: string[] = [];
 *
 * ConfectApi.reflect(Api, {
 *   onGroup: (ctx) => groups.push(ctx.path),
 *   onFunction: (ctx) => functions.push(ctx.fullPath)
 * });
 * ```
 */
export const reflect = <
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps
>(
  api: ConfectApi<ApiName, Groups>,
  options: ReflectionOptions
): void => {
  const visited = new Set<string>(); // Prevent infinite recursion

  const traverseGroup = (
    group: ConfectApiGroup.ConfectApiGroup.AnyWithProps,
    path: string,
    depth: number,
    parentGroup?: ConfectApiGroup.ConfectApiGroup.AnyWithProps
  ): void => {
    // Prevent revisiting
    if (visited.has(path)) return;
    visited.add(path);

    // Callback for group
    options.onGroup?.({
      group,
      path,
      depth,
      parentGroup
    });

    // Iterate functions in this group
    Record.forEach(group.functions, (fn) => {
      options.onFunction?.({
        function: fn,
        group,
        groupPath: path,
        fullPath: `${path}.${fn.name}`,
        functionType: fn.functionType,
        argsSchema: fn.args,
        returnsSchema: fn.returns
      });
    });

    // Recursively traverse nested groups
    Record.forEach(group.groups, (nestedGroup) => {
      const nestedPath = `${path}.${nestedGroup.name}`;
      traverseGroup(nestedGroup, nestedPath, depth + 1, group);
    });
  };

  // Start traversal from root groups
  Record.forEach(api.groups, (group) => {
    traverseGroup(group, group.name, 0);
  });
};
```

**Acceptance Criteria**:
- [ ] Function implemented
- [ ] Handles nested groups correctly
- [ ] Prevents infinite recursion
- [ ] Callbacks receive correct context
- [ ] JSDoc comments complete
- [ ] TypeScript compilation successful

---

#### Task 2.3: Implement reflectToStructure() Function

**File**: `packages/confect/src/api/ConfectApi.ts` (add function)
**Estimated Time**: 30 minutes

**Function to Implement**:

```typescript
/**
 * Reflects an API into a data structure for analysis or serialization.
 *
 * @param api - The API to reflect upon
 * @returns Data structure representing the API
 *
 * @example
 * ```typescript
 * const structure = ConfectApi.reflectToStructure(Api);
 * console.log(structure.groups[0].functions[0].name);
 * ```
 */
export const reflectToStructure = <
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps
>(
  api: ConfectApi<ApiName, Groups>
): ApiReflectionStructure => {
  const groupsMap = new Map<string, GroupReflectionStructure>();
  const rootGroups: GroupReflectionStructure[] = [];

  reflect(api, {
    onGroup: (ctx) => {
      const groupStructure: GroupReflectionStructure = {
        name: ctx.group.name,
        path: ctx.path,
        functions: [],
        nestedGroups: []
      };

      groupsMap.set(ctx.path, groupStructure);

      if (ctx.depth === 0) {
        rootGroups.push(groupStructure);
      } else if (ctx.parentGroup) {
        const parentPath = ctx.path.substring(0, ctx.path.lastIndexOf("."));
        const parent = groupsMap.get(parentPath);
        parent?.nestedGroups.push(groupStructure);
      }
    },
    onFunction: (ctx) => {
      const group = groupsMap.get(ctx.groupPath);
      group?.functions.push({
        name: ctx.function.name,
        type: ctx.functionType,
        path: ctx.fullPath
      });
    }
  });

  return {
    apiName: api.name,
    groups: rootGroups
  };
};
```

**Acceptance Criteria**:
- [ ] Function implemented
- [ ] Returns correct structure
- [ ] Maintains hierarchy
- [ ] Handles empty groups
- [ ] JSDoc comments complete

---

#### Task 2.4: Add Reflection Tests

**File**: `packages/confect/src/api/reflection.test.ts` (new file)
**Estimated Time**: 30 minutes

**Tests to Add**:

```typescript
import { describe, expect, test } from "vitest";
import { Schema } from "effect";
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiFunction from "./ConfectApiFunction";

describe("ConfectApi.reflect", () => {
  const Group1 = ConfectApiGroup.make("group1")
    .add(
      ConfectApiFunction.make("Query")({
        name: "fn1",
        args: Schema.Struct({ a: Schema.Number }),
        returns: Schema.String
      })
    )
    .add(
      ConfectApiFunction.make("Mutation")({
        name: "fn2",
        args: Schema.Struct({ b: Schema.String }),
        returns: Schema.Void
      })
    );

  const NestedGroup = ConfectApiGroup.make("nested").add(
    ConfectApiFunction.make("Query")({
      name: "nestedFn",
      args: Schema.Struct({}),
      returns: Schema.Number
    })
  );

  const Group2 = ConfectApiGroup.make("group2").addGroup(NestedGroup);

  const Api = ConfectApi.make("TestApi").add(Group1).add(Group2);

  test("visits all groups", () => {
    const groups = new Set<string>();

    ConfectApi.reflect(Api, {
      onGroup: (ctx) => groups.add(ctx.path)
    });

    expect(groups).toContain("group1");
    expect(groups).toContain("group2");
    expect(groups).toContain("group2.nested");
    expect(groups.size).toBe(3);
  });

  test("visits all functions", () => {
    const functions = new Set<string>();

    ConfectApi.reflect(Api, {
      onFunction: (ctx) => functions.add(ctx.fullPath)
    });

    expect(functions).toContain("group1.fn1");
    expect(functions).toContain("group1.fn2");
    expect(functions).toContain("group2.nested.nestedFn");
    expect(functions.size).toBe(3);
  });

  test("provides correct depth", () => {
    const depths: number[] = [];

    ConfectApi.reflect(Api, {
      onGroup: (ctx) => depths.push(ctx.depth)
    });

    expect(depths).toContain(0); // Root groups
    expect(depths).toContain(1); // Nested groups
  });

  test("provides parent group for nested groups", () => {
    let nestedGroupParent: string | undefined;

    ConfectApi.reflect(Api, {
      onGroup: (ctx) => {
        if (ctx.path === "group2.nested") {
          nestedGroupParent = ctx.parentGroup?.name;
        }
      }
    });

    expect(nestedGroupParent).toBe("group2");
  });

  test("provides correct function context", () => {
    const contexts: any[] = [];

    ConfectApi.reflect(Api, {
      onFunction: (ctx) => {
        if (ctx.function.name === "fn1") {
          contexts.push(ctx);
        }
      }
    });

    expect(contexts[0].functionType).toBe("Query");
    expect(contexts[0].groupPath).toBe("group1");
    expect(contexts[0].fullPath).toBe("group1.fn1");
  });
});

describe("ConfectApi.reflectToStructure", () => {
  const Group = ConfectApiGroup.make("group").add(
    ConfectApiFunction.make("Query")({
      name: "fn",
      args: Schema.Struct({}),
      returns: Schema.String
    })
  );

  const Api = ConfectApi.make("TestApi").add(Group);

  test("returns correct structure", () => {
    const structure = ConfectApi.reflectToStructure(Api);

    expect(structure.apiName).toBe("TestApi");
    expect(structure.groups.length).toBe(1);
    expect(structure.groups[0].name).toBe("group");
    expect(structure.groups[0].functions.length).toBe(1);
    expect(structure.groups[0].functions[0].name).toBe("fn");
  });

  test("maintains nested group hierarchy", () => {
    const NestedGroup = ConfectApiGroup.make("nested").add(
      ConfectApiFunction.make("Query")({
        name: "nestedFn",
        args: Schema.Struct({}),
        returns: Schema.String
      })
    );

    const ParentGroup = ConfectApiGroup.make("parent").addGroup(NestedGroup);
    const Api2 = ConfectApi.make("Api2").add(ParentGroup);

    const structure = ConfectApi.reflectToStructure(Api2);

    expect(structure.groups[0].nestedGroups.length).toBe(1);
    expect(structure.groups[0].nestedGroups[0].name).toBe("nested");
    expect(structure.groups[0].nestedGroups[0].functions[0].name).toBe("nestedFn");
  });
});
```

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] Coverage >90%
- [ ] Edge cases tested (empty groups, deep nesting)
- [ ] Test output clear and informative

---

### Phase 2 Checklist

- [ ] Task 2.1: Reflection types defined
- [ ] Task 2.2: reflect() function implemented
- [ ] Task 2.3: reflectToStructure() implemented
- [ ] Task 2.4: Tests added and passing
- [ ] JSDoc comments complete
- [ ] TypeScript compilation successful
- [ ] Code reviewed and approved

### Phase 2 Success Criteria

✅ **Must Have**:
- Can traverse all groups and functions
- Callbacks receive complete context
- Nested groups handled correctly
- Data structure alternative works

### Phase 2 Deliverables

- Modified `ConfectApi.ts` (reflection functions added)
- New `reflection.test.ts` (comprehensive tests)
- JSDoc documentation for all public APIs
- Examples in comments

---

## Phase 3: Error Unification

**Priority**: 🟡 P1 - High Value
**Estimated Time**: 5 hours
**Dependencies**: Phase 1 (recommended)
**Status**: ⏸️ Not Started

### Overview

Implement API-wide error schemas with discriminated unions and status code mapping.

### Tasks

#### Task 3.1: Update ConfectApi Interface

**File**: `packages/confect/src/api/ConfectApi.ts`
**Estimated Time**: 60 minutes

**Changes Required**:

1. Add `Error` type parameter to `ConfectApi` interface
2. Add `errors` property
3. Add `addError()` method
4. Update prototype
5. Update `make()` function

**New Types**:

```typescript
export interface ErrorConfig {
  readonly schema: Schema.Schema<any, any>;
  readonly status?: number; // HTTP status code
}

export interface ConfectApi<
  Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  Error = never
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly groups: Record.ReadonlyRecord<string, Groups>;
  readonly errors: ReadonlyArray<ErrorConfig>;

  add<Group extends ConfectApiGroup.ConfectApiGroup.AnyWithProps>(
    group: Group
  ): ConfectApi<Name, Groups | Group, Error>;

  addError<E>(
    schema: Schema.Schema<E>,
    options?: { status?: number }
  ): ConfectApi<Name, Groups, Error | E>;
}

// Type-level error extraction
export declare namespace ConfectApi {
  export type Error<A> =
    A extends ConfectApi<infer _Name, infer _Groups, infer E>
      ? E
      : never;
}
```

**Updated Prototype**:

```typescript
const ConfectApiProto = {
  [TypeId]: TypeId,

  add<Group>(this: ConfectApi<any, any, any>, group: Group) {
    return makeConfectApi({
      name: this.name,
      groups: { ...this.groups, [group.name]: group },
      errors: this.errors
    });
  },

  addError<E>(
    this: ConfectApi<any, any, any>,
    schema: Schema.Schema<E>,
    options?: { status?: number }
  ) {
    return makeConfectApi({
      name: this.name,
      groups: this.groups,
      errors: [...this.errors, { schema, status: options?.status }]
    });
  }
};

const makeConfectApi = <Name extends string, Groups, Error>({
  name,
  groups,
  errors
}: {
  name: Name;
  groups: Record.ReadonlyRecord<string, Groups>;
  errors: ReadonlyArray<ErrorConfig>;
}): ConfectApi<Name, Groups, Error> =>
  Object.assign(Object.create(ConfectApiProto), {
    name,
    groups,
    errors: errors ?? []
  });

export const make = <const Name extends string>(
  name: Name
): ConfectApi<Name, never, never> =>
  makeConfectApi({
    name,
    groups: {},
    errors: []
  });
```

**Acceptance Criteria**:
- [ ] `Error` type parameter added
- [ ] `errors` property added
- [ ] `addError()` method works
- [ ] Type extraction works
- [ ] Prototype updated
- [ ] `make()` initializes empty errors

---

#### Task 3.2: Implement Error Schema Unification

**File**: `packages/confect/src/api/ConfectApi.ts` (add utilities)
**Estimated Time**: 60 minutes

**Functions to Add**:

```typescript
/**
 * Unifies all error schemas in an API into a single union schema.
 *
 * @param api - The API with error schemas
 * @returns Union schema of all errors
 */
export const unifyErrors = <Api extends ConfectApi<any, any, any>>(
  api: Api
): Schema.Schema<ConfectApi.Error<Api>> => {
  if (api.errors.length === 0) {
    return Schema.Never as any;
  }

  if (api.errors.length === 1) {
    return api.errors[0].schema;
  }

  // Create union of all error schemas
  const [first, ...rest] = api.errors.map((e) => e.schema);
  return Schema.Union(first, ...rest) as any;
};

/**
 * Gets the HTTP status code for an error.
 *
 * @param api - The API with error configurations
 * @param error - The error value
 * @returns HTTP status code (defaults to 500)
 */
export const getErrorStatus = <Api extends ConfectApi<any, any, any>>(
  api: Api,
  error: ConfectApi.Error<Api>
): number => {
  const config = api.errors.find((e) => {
    // Check if error matches schema
    const result = Schema.decodeUnknownEither(e.schema)(error);
    return Either.isRight(result);
  });

  return config?.status ?? 500;
};
```

**Acceptance Criteria**:
- [ ] `unifyErrors()` creates union schema
- [ ] Handles zero errors (Schema.Never)
- [ ] Handles single error
- [ ] Handles multiple errors
- [ ] `getErrorStatus()` finds matching error
- [ ] Returns default 500 for unknown errors

---

#### Task 3.3: Update Function Handler Types

**File**: `packages/confect/src/api/ConfectApiFunction.ts`
**Estimated Time**: 90 minutes

**Changes Required**:

1. Update handler type to include API errors
2. Thread API error through builder types
3. Update `Handlers` interface

**Type Changes**:

```typescript
// Handler type includes API errors
export type Handler<
  ConfectSchema extends GenericConfectSchema,
  Fn extends ConfectApiFunction.AnyWithProps,
  ApiError = never
> = (
  args: Schema.Schema.Type<Fn["args"]>
) => Effect.Effect<
  Schema.Schema.Type<Fn["returns"]>,
  Fn["handlerError"] | ApiError | ParseResult.ParseError,
  HandlerRequirements<ConfectSchema, Fn>
>;

// Update Handlers interface
export interface Handlers<
  ConfectSchema extends GenericConfectSchema,
  Functions extends ConfectApiFunction.ConfectApiFunction.AnyWithProps = never,
  ApiError = never
> {
  readonly [HandlersTypeId]: {
    _Functions: Types.Covariant<Functions>;
  };
  readonly group: ConfectApiGroup.ConfectApiGroup.AnyWithProps;
  readonly handlers: ReadonlyArray<Handlers.Item<ConfectSchema, Functions, ApiError>>;

  handle<Name extends ConfectApiFunction.ConfectApiFunction.Name<Functions>>(
    name: Name,
    handler: Handler<
      ConfectSchema,
      ConfectApiFunction.ConfectApiFunction.WithName<Functions, Name>,
      ApiError
    >
  ): Handlers<
    ConfectSchema,
    ConfectApiFunction.ConfectApiFunction.ExcludeName<Functions, Name>,
    ApiError
  >;
}
```

**Acceptance Criteria**:
- [ ] Handler type includes `ApiError`
- [ ] `Handlers` interface updated
- [ ] Type parameter threads through
- [ ] Handlers can return API errors
- [ ] TypeScript compilation successful

---

#### Task 3.4: Update ConfectApiBuilder

**File**: `packages/confect/src/api/ConfectApiBuilder.ts`
**Estimated Time**: 60 minutes

**Changes Required**:

1. Thread API error through `group()` signature
2. Extract API errors from `ConfectApiWithDatabaseSchema`
3. Pass to handlers

**Updated Signature**:

```typescript
export const group = <
  ConfectSchema extends GenericConfectSchema,
  const ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  const GroupPath extends ConfectApiGroup.ConfectApiGroup.Path<Groups>,
  ApiError, // ← NEW
  Return
>(
  apiWithDatabaseSchema: ConfectApiWithDatabaseSchema.ConfectApiWithDatabaseSchema<
    ConfectSchema,
    ApiName,
    Groups,
    ApiError // ← NEW
  >,
  groupPath: GroupPath,
  build: (
    handlers: Handlers.FromGroup<
      ConfectSchema,
      ConfectApiGroup.ConfectApiGroup.WithPath<Groups, GroupPath>,
      ApiError // ← NEW
    >
  ) => Handlers.ValidateReturn<Return>
): Layer.Layer<...> => {
  const group = apiWithDatabaseSchema.api.groups[groupPath]!;

  const initialHandlers = makeHandlers({
    group,
    handlers: Chunk.empty()
  });

  const populatedHandlers = build(initialHandlers);

  return Layer.succeed(
    ConfectApiGroupService(...),
    {
      apiName: apiWithDatabaseSchema.api.name,
      handlers: populatedHandlers
    }
  );
};
```

**Acceptance Criteria**:
- [ ] `ApiError` parameter added
- [ ] Threads through `Handlers.FromGroup`
- [ ] No breaking changes to usage
- [ ] TypeScript compilation successful

---

#### Task 3.5: Update ConfectApiWithDatabaseSchema

**File**: `packages/confect/src/api/ConfectApiWithDatabaseSchema.ts`
**Estimated Time**: 30 minutes

**Changes Required**:

Add `Error` type parameter and extract from API

**Updated Interface**:

```typescript
export interface ConfectApiWithDatabaseSchema<
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  Error = never // ← NEW
> {
  readonly confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>;
  readonly api: ConfectApi.ConfectApi<ApiName, Groups, Error>;
}

export const make = <
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  Error
>(
  confectSchemaDefinition: ConfectSchemaDefinition<ConfectSchema>,
  api: ConfectApi.ConfectApi<ApiName, Groups, Error>
): ConfectApiWithDatabaseSchema<ConfectSchema, ApiName, Groups, Error> => ({
  confectSchemaDefinition,
  api
});
```

**Acceptance Criteria**:
- [ ] `Error` parameter added
- [ ] Type extracted from API
- [ ] `make()` function updated

---

#### Task 3.6: Update Server Generation

**File**: `packages/confect/src/api/ConfectApiServer.ts`
**Estimated Time**: 90 minutes

**Changes Required**:

1. Pass API error schema to function builders
2. Handle API errors in handlers
3. Map errors to status codes

**Updated Function Builders**:

```typescript
const confectQueryFunction = <
  ConfectSchema extends GenericConfectSchema,
  ConvexArgs,
  ConfectArgs,
  ConvexReturns,
  ConfectReturns,
  E,
  ApiError
>({
  args,
  returns,
  handler,
  apiErrorSchema // ← NEW
}: {
  args: Schema.Schema<ConfectArgs, ConvexArgs>;
  returns: Schema.Schema<ConfectReturns, ConvexReturns>;
  handler: (a: ConfectArgs) => Effect.Effect<ConfectReturns, E | ApiError, R>;
  apiErrorSchema: Schema.Schema<ApiError>; // ← NEW
}) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (ctx, actualArgs) =>
    pipe(
      actualArgs,
      Schema.decode(args),
      Effect.orDie,
      Effect.andThen(handler),
      Effect.catchAll((error) => {
        // Try to decode as API error
        const apiErrorResult = Schema.decodeUnknownEither(apiErrorSchema)(error);

        if (Either.isRight(apiErrorResult)) {
          // This is an API-level error - could include status code
          // For now, just fail with the error
          return Effect.fail(apiErrorResult.right);
        }

        // Function-specific error - rethrow
        return Effect.fail(error);
      }),
      Effect.andThen((result) => Schema.encodeUnknown(returns)(result)),
      Effect.runPromise
    )
});
```

**In Server.make()**:

```typescript
const apiErrorSchema = unifyErrors(apiWithDatabaseSchema.api);

// Pass to function builders
confectQueryFunction(
  apiWithDatabaseSchema.confectSchemaDefinition,
  {
    args: fn.args,
    returns: fn.returns,
    handler,
    apiErrorSchema // ← NEW
  }
)
```

**Acceptance Criteria**:
- [ ] API error schema passed to builders
- [ ] Errors handled in handlers
- [ ] API errors distinguished from function errors
- [ ] Similar updates for mutation/action functions

---

#### Task 3.7: Add Error Unification Tests

**File**: `packages/confect/src/api/error-unification.test.ts` (new)
**Estimated Time**: 60 minutes

**Tests to Add**:

```typescript
import { describe, expect, test } from "vitest";
import { Effect, Either, Schema } from "effect";
import * as ConfectApi from "./ConfectApi";

describe("Error Unification", () => {
  const UnauthorizedError = Schema.Struct({
    _tag: Schema.Literal("Unauthorized"),
    message: Schema.String
  });

  const RateLimitError = Schema.Struct({
    _tag: Schema.Literal("RateLimited"),
    retryAfter: Schema.Number
  });

  test("addError adds error to API", () => {
    const Api = ConfectApi.make("TestApi")
      .addError(UnauthorizedError, { status: 401 });

    expect(Api.errors.length).toBe(1);
    expect(Api.errors[0].status).toBe(401);
  });

  test("multiple errors create union", () => {
    const Api = ConfectApi.make("TestApi")
      .addError(UnauthorizedError, { status: 401 })
      .addError(RateLimitError, { status: 429 });

    expect(Api.errors.length).toBe(2);
  });

  test("unifyErrors creates union schema", () => {
    const Api = ConfectApi.make("TestApi")
      .addError(UnauthorizedError, { status: 401 })
      .addError(RateLimitError, { status: 429 });

    const errorSchema = ConfectApi.unifyErrors(Api);

    // Should validate both error types
    const result1 = Schema.decodeUnknownSync(errorSchema)({
      _tag: "Unauthorized",
      message: "Not logged in"
    });
    expect(result1._tag).toBe("Unauthorized");

    const result2 = Schema.decodeUnknownSync(errorSchema)({
      _tag: "RateLimited",
      retryAfter: 60
    });
    expect(result2._tag).toBe("RateLimited");
  });

  test("getErrorStatus returns correct status code", () => {
    const Api = ConfectApi.make("TestApi")
      .addError(UnauthorizedError, { status: 401 })
      .addError(RateLimitError, { status: 429 });

    const status1 = ConfectApi.getErrorStatus(Api, {
      _tag: "Unauthorized",
      message: "test"
    });
    expect(status1).toBe(401);

    const status2 = ConfectApi.getErrorStatus(Api, {
      _tag: "RateLimited",
      retryAfter: 60
    });
    expect(status2).toBe(429);
  });

  test("getErrorStatus returns 500 for unknown errors", () => {
    const Api = ConfectApi.make("TestApi")
      .addError(UnauthorizedError, { status: 401 });

    const status = ConfectApi.getErrorStatus(Api, { unknown: "error" } as any);
    expect(status).toBe(500);
  });

  test("handlers can return API errors", async () => {
    // This is a type-level test - just ensure it compiles
    type ApiError = { _tag: "Unauthorized"; message: string };

    const handler = (args: { id: string }): Effect.Effect<string, ApiError> =>
      Effect.fail({ _tag: "Unauthorized" as const, message: "Not allowed" });

    const result = await Effect.runPromiseExit(handler({ id: "123" }));

    expect(Exit.isFailure(result)).toBe(true);
  });
});
```

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] Error schema unification tested
- [ ] Status code mapping tested
- [ ] Type-level tests compile
- [ ] Edge cases covered

---

### Phase 3 Checklist

- [ ] Task 3.1: ConfectApi interface updated
- [ ] Task 3.2: Error unification utilities added
- [ ] Task 3.3: Function handler types updated
- [ ] Task 3.4: ConfectApiBuilder updated
- [ ] Task 3.5: ConfectApiWithDatabaseSchema updated
- [ ] Task 3.6: Server generation updated
- [ ] Task 3.7: Tests added and passing
- [ ] TypeScript compilation successful
- [ ] No breaking changes to Phase 1 code
- [ ] Code reviewed and approved

### Phase 3 Success Criteria

✅ **Must Have**:
- API can define errors with status codes
- Errors propagate to handlers
- Client types include all errors
- Tagged error handling works

### Phase 3 Deliverables

- Modified `ConfectApi.ts` (error support)
- Modified `ConfectApiFunction.ts` (error types)
- Modified `ConfectApiBuilder.ts` (error threading)
- Modified `ConfectApiWithDatabaseSchema.ts` (error parameter)
- Modified `ConfectApiServer.ts` (error handling)
- New `error-unification.test.ts` (tests)

---

## Phase 4: Schema Caching

**Priority**: 🟡 P1 - High Value
**Estimated Time**: 2 hours
**Dependencies**: Phase 1 (recommended)
**Status**: ⏸️ Not Started

### Overview

Implement WeakMap-based schema compilation caching for >50% performance improvement.

### Tasks

#### Task 4.1: Implement Schema Cache

**File**: `packages/confect/src/api/ConfectApiClient.ts`
**Estimated Time**: 30 minutes

**Code to Add**:

```typescript
import { globalValue } from "effect/GlobalValue";

// Global cache shared across all client instances
const schemaCache = globalValue(
  Symbol.for("@rjdellecese/confect/ConfectApiClient/schemaCache"),
  () =>
    new WeakMap<
      Schema.AST.AST,
      {
        encode: (a: any) => Effect.Effect<any, ParseResult.ParseError>;
        decode: (u: unknown) => Effect.Effect<any, ParseResult.ParseError>;
      }
    >()
);

/**
 * Gets or compiles a schema, caching the result.
 *
 * @param schema - Schema to compile
 * @returns Compiled encode/decode functions
 */
const getOrCompileSchema = <A, I>(
  schema: Schema.Schema<A, I>
): {
  encode: (a: A) => Effect.Effect<I, ParseResult.ParseError>;
  decode: (i: unknown) => Effect.Effect<A, ParseResult.ParseError>;
} => {
  const ast = schema.ast;

  // Check cache
  const cached = schemaCache.get(ast);
  if (cached) {
    return cached as any;
  }

  // Compile and cache
  const compiled = {
    encode: Schema.encodeUnknown(schema),
    decode: Schema.decodeUnknown(schema)
  };

  schemaCache.set(ast, compiled as any);

  return compiled as any;
};
```

**Acceptance Criteria**:
- [ ] Global cache created
- [ ] WeakMap used for automatic GC
- [ ] `getOrCompileSchema()` caches results
- [ ] Cache hits return cached version
- [ ] Cache misses compile and cache

---

#### Task 4.2: Update Client Generation

**File**: `packages/confect/src/api/ConfectApiClient.ts`
**Estimated Time**: 60 minutes

**Current Code**:

```typescript
export const make = <Api>(
  confectApi: Api,
  convexReactClient: ConvexReactClient
): ConfectApiClient<Api> =>
  Record.map(confectApi.groups, (group) =>
    Record.map(
      group.functions,
      (function_) => (args: unknown) =>
        Effect.gen(function* () {
          // ❌ Compiles on EVERY call
          const encodedArgs = yield* Schema.encodeUnknown(function_.args)(args);

          const path = ConfectApiFunctionPath.make(
            group.name,
            function_.name
          ) as unknown as FunctionReference<any, any>;

          const result = yield* Effect.promise(() =>
            convexReactClient.query(path, encodedArgs)
          );

          // ❌ Compiles on EVERY call
          const decodedResult = yield* Schema.decodeUnknown(function_.returns)(result);

          return decodedResult;
        })
    )
  ) as any;
```

**New Code**:

```typescript
export const make = <Api>(
  confectApi: Api,
  convexReactClient: ConvexReactClient
): ConfectApiClient<Api> =>
  Record.map(confectApi.groups, (group) =>
    Record.map(group.functions, (function_) => {
      // ✅ Compile ONCE per function definition
      const argsCompiled = getOrCompileSchema(function_.args);
      const returnsCompiled = getOrCompileSchema(function_.returns);

      // Return function that uses cached compiled schemas
      return (args: unknown) =>
        Effect.gen(function* () {
          const encodedArgs = yield* argsCompiled.encode(args);

          const path = ConfectApiFunctionPath.make(
            group.name,
            function_.name
          ) as unknown as FunctionReference<any, any>;

          const result = yield* Effect.promise(() =>
            convexReactClient.query(path, encodedArgs)
          );

          const decodedResult = yield* returnsCompiled.decode(result);

          return decodedResult;
        });
    })
  ) as any;
```

**Acceptance Criteria**:
- [ ] Schemas compiled at client creation time
- [ ] Cached schemas reused in function calls
- [ ] No observable behavior change
- [ ] TypeScript compilation successful
- [ ] Existing tests still pass

---

#### Task 4.3: Add Performance Tests

**File**: `packages/confect/src/api/schema-cache.test.ts` (new)
**Estimated Time**: 30 minutes

**Tests to Add**:

```typescript
import { describe, expect, test, vi } from "vitest";
import { Effect, Schema } from "effect";
import * as ConfectApiClient from "./ConfectApiClient";
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiFunction from "./ConfectApiFunction";
import { ConvexReactClient } from "convex/react";

describe("Schema Caching", () => {
  const TestSchema = Schema.Struct({
    id: Schema.String,
    value: Schema.Number
  });

  test("getOrCompileSchema compiles once", () => {
    const compileSpy = vi.spyOn(Schema, "encodeUnknown");

    const compiled1 = getOrCompileSchema(TestSchema);
    const compiled2 = getOrCompileSchema(TestSchema);

    expect(compileSpy).toHaveBeenCalledTimes(1);
    expect(compiled1).toBe(compiled2);
  });

  test("cache uses WeakMap for GC", () => {
    // Create schema, compile, verify cache
    const schema = Schema.Struct({ test: Schema.String });
    getOrCompileSchema(schema);

    expect(schemaCache.has(schema.ast)).toBe(true);
  });

  test("client compiles schemas at creation time", () => {
    const Group = ConfectApiGroup.make("group").add(
      ConfectApiFunction.make("Query")({
        name: "fn",
        args: TestSchema,
        returns: Schema.String
      })
    );

    const Api = ConfectApi.make("Api").add(Group);

    const compileSpy = vi.spyOn(Schema, "encodeUnknown");

    // Create client - should compile schemas
    const client = ConfectApiClient.make(
      Api,
      new ConvexReactClient("http://localhost:3000")
    );

    // Should have compiled args and returns
    expect(compileSpy.mock.calls.length).toBeGreaterThan(0);
  });

  test.skip("performance improvement >50%", async () => {
    // This test requires actual function calls
    // Skip in unit tests, run separately for benchmarking

    const iterations = 1000;

    // Setup mock client that returns immediately
    const mockClient = {
      query: vi.fn().mockResolvedValue({ id: "123", value: 42 })
    } as any;

    const Group = ConfectApiGroup.make("group").add(
      ConfectApiFunction.make("Query")({
        name: "fn",
        args: TestSchema,
        returns: TestSchema
      })
    );

    const Api = ConfectApi.make("Api").add(Group);
    const client = ConfectApiClient.make(Api, mockClient);

    // Warm up
    await Effect.runPromise(client.group.fn({ id: "1", value: 1 }));

    // Measure cached calls
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await Effect.runPromise(
        client.group.fn({ id: String(i), value: i })
      );
    }
    const duration = performance.now() - start;

    const avgDuration = duration / iterations;

    // With caching, should be <5ms per call
    expect(avgDuration).toBeLessThan(5);
  });
});
```

**Acceptance Criteria**:
- [ ] Cache compilation tested
- [ ] WeakMap behavior verified
- [ ] Client compilation timing tested
- [ ] Performance benchmark available (skip in CI)

---

### Phase 4 Checklist

- [ ] Task 4.1: Schema cache implemented
- [ ] Task 4.2: Client generation optimized
- [ ] Task 4.3: Performance tests added
- [ ] All existing tests pass
- [ ] No behavior changes observed
- [ ] Performance improvement verified
- [ ] Code reviewed and approved

### Phase 4 Success Criteria

✅ **Must Have**:
- Schemas compiled once
- >50% performance improvement
- WeakMap allows GC
- No behavior changes

### Phase 4 Deliverables

- Modified `ConfectApiClient.ts` (caching added)
- New `schema-cache.test.ts` (tests)
- Performance benchmark results

---

## Phase 5: Middleware System

**Priority**: 🟢 P2 - Medium Value
**Estimated Time**: 7 hours
**Dependencies**: Phase 1, Phase 3 (error unification helpful)
**Status**: ⏸️ Not Started

### Overview

Implement a complete middleware system with API/Group/Function level attachment points.

### Tasks

#### Task 5.1: Create Middleware Module

**File**: `packages/confect/src/api/ConfectApiMiddleware.ts` (new)
**Estimated Time**: 90 minutes

**Complete Module**:

```typescript
import { Context, Effect } from "effect";

/**
 * Middleware interface for wrapping handlers.
 *
 * @template Tag - Context tag type
 * @template Service - Service type provided by middleware
 * @template Error - Error type that middleware may introduce
 */
export interface ConfectApiMiddleware<Tag, Service, Error = never> {
  readonly tag: Context.Tag<Tag, Service>;

  readonly apply: <A, E, R>(
    handler: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | Error, R | Service>;
}

/**
 * Creates a middleware instance.
 *
 * @param config - Middleware configuration
 * @returns Middleware instance
 *
 * @example
 * ```typescript
 * const LoggingMiddleware = makeMiddleware({
 *   tag: LoggingService,
 *   apply: (handler) =>
 *     Effect.gen(function* () {
 *       const logger = yield* LoggingService;
 *       yield* logger.log("Starting");
 *       const result = yield* handler;
 *       yield* logger.log("Done");
 *       return result;
 *     })
 * });
 * ```
 */
export const makeMiddleware = <Tag, Service, Err = never>(config: {
  tag: Context.Tag<Tag, Service>;
  apply: <A, E, R>(
    handler: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | Err, R | Service>;
}): ConfectApiMiddleware<Tag, Service, Err> => config;

/**
 * Type utilities for extracting middleware information.
 */
export declare namespace ConfectApiMiddleware {
  export type Any = ConfectApiMiddleware<any, any, any>;

  export type Service<M> = M extends ConfectApiMiddleware<
    infer _Tag,
    infer Svc,
    infer _Err
  >
    ? Svc
    : never;

  export type Error<M> = M extends ConfectApiMiddleware<
    infer _Tag,
    infer _Svc,
    infer Err
  >
    ? Err
    : never;
}

/**
 * Compute combined requirements from multiple middleware.
 */
export type MiddlewareRequirements<
  Middleware extends ReadonlyArray<any>
> = Middleware extends readonly [infer Head, ...infer Tail]
  ? ConfectApiMiddleware.Service<Head> | MiddlewareRequirements<Tail>
  : never;

/**
 * Compute combined errors from multiple middleware.
 */
export type MiddlewareErrors<
  Middleware extends ReadonlyArray<any>
> = Middleware extends readonly [infer Head, ...infer Tail]
  ? ConfectApiMiddleware.Error<Head> | MiddlewareErrors<Tail>
  : never;

/**
 * Apply multiple middleware to a handler in order.
 *
 * @param handler - The handler to wrap
 * @param middleware - Array of middleware to apply
 * @returns Wrapped handler
 */
export const applyMiddleware = <A, E, R>(
  handler: Effect.Effect<A, E, R>,
  middleware: ReadonlyArray<ConfectApiMiddleware.Any>
): Effect.Effect<
  A,
  E | MiddlewareErrors<typeof middleware>,
  R | MiddlewareRequirements<typeof middleware>
> => {
  return Array.reduce(
    middleware,
    handler as Effect.Effect<any, any, any>,
    (acc, mid) => mid.apply(acc)
  );
};
```

**Acceptance Criteria**:
- [ ] Module created
- [ ] All types defined
- [ ] `makeMiddleware()` helper works
- [ ] `applyMiddleware()` composes correctly
- [ ] JSDoc comments complete
- [ ] TypeScript compilation successful

---

#### Task 5.2: Create Example Middleware

**File**: `packages/confect/src/api/ConfectApiMiddleware.ts` (add examples)
**Estimated Time**: 60 minutes

**Examples to Add**:

```typescript
// Example 1: Logging Middleware
export class LoggingService extends Context.Tag("@confect/LoggingService")<
  LoggingService,
  {
    readonly log: (
      message: string,
      meta?: Record<string, unknown>
    ) => Effect.Effect<void>;
  }
>() {}

export const LoggingMiddleware = makeMiddleware({
  tag: LoggingService,
  apply: <A, E, R>(handler: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const logger = yield* LoggingService;

      const start = Date.now();
      yield* logger.log("Handler starting");

      const result = yield* Effect.either(handler);

      const duration = Date.now() - start;

      if (Either.isLeft(result)) {
        yield* logger.log("Handler failed", { duration, error: result.left });
        return yield* Effect.fail(result.left);
      }

      yield* logger.log("Handler succeeded", { duration });
      return result.right;
    })
});

// Example 2: Auth Middleware
export class AuthService extends Context.Tag("@confect/AuthService")<
  AuthService,
  {
    readonly requireAuth: () => Effect.Effect<
      { userId: string },
      { _tag: "Unauthorized"; message: string }
    >;
  }
>() {}

export const AuthMiddleware = makeMiddleware({
  tag: AuthService,
  apply: <A, E, R>(handler: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const auth = yield* AuthService;
      yield* auth.requireAuth(); // Fails if not authenticated

      return yield* handler;
    })
});

// Example 3: Rate Limiting Middleware
export class RateLimitService extends Context.Tag("@confect/RateLimitService")<
  RateLimitService,
  {
    readonly checkLimit: (
      key: string
    ) => Effect.Effect<void, { _tag: "RateLimited"; retryAfter: number }>;
  }
>() {}

export const RateLimitMiddleware = makeMiddleware({
  tag: RateLimitService,
  apply: <A, E, R>(handler: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const limiter = yield* RateLimitService;
      yield* limiter.checkLimit("api-call");

      return yield* handler;
    })
});
```

**Acceptance Criteria**:
- [ ] Logging middleware implemented
- [ ] Auth middleware implemented
- [ ] Rate limit middleware implemented
- [ ] JSDoc comments added
- [ ] Examples compile

---

#### Task 5.3: Update API/Group/Function Interfaces

**Files**:
- `packages/confect/src/api/ConfectApi.ts`
- `packages/confect/src/api/ConfectApiGroup.ts`
- `packages/confect/src/api/ConfectApiFunction.ts`

**Estimated Time**: 120 minutes

**Changes for ConfectApi**:

```typescript
import * as ConfectApiMiddleware from "./ConfectApiMiddleware";

export interface ConfectApi<
  Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  Error = never,
  Middleware extends ReadonlyArray<ConfectApiMiddleware.ConfectApiMiddleware.Any> = []
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly groups: Record.ReadonlyRecord<string, Groups>;
  readonly errors: ReadonlyArray<ErrorConfig>;
  readonly middleware: Middleware;

  middleware<M extends ConfectApiMiddleware.ConfectApiMiddleware.Any>(
    m: M
  ): ConfectApi<
    Name,
    Groups,
    Error | ConfectApiMiddleware.ConfectApiMiddleware.Error<M>,
    [...Middleware, M]
  >;
}

const ConfectApiProto = {
  [TypeId]: TypeId,

  // ... existing methods

  middleware<M>(this: ConfectApi<any, any, any, any>, m: M) {
    return makeConfectApi({
      name: this.name,
      groups: this.groups,
      errors: this.errors,
      middleware: [...this.middleware, m]
    });
  }
};
```

**Similar changes for ConfectApiGroup and ConfectApiFunction**.

**Acceptance Criteria**:
- [ ] All interfaces updated
- [ ] Middleware property added
- [ ] `middleware()` method works
- [ ] Errors accumulate correctly
- [ ] TypeScript compilation successful

---

#### Task 5.4: Update Server Generation

**File**: `packages/confect/src/api/ConfectApiServer.ts`
**Estimated Time**: 90 minutes

**Changes Required**:

1. Collect middleware from all levels
2. Apply middleware to handlers
3. Verify execution order

**Implementation**:

```typescript
/**
 * Collects all middleware from API, Group, and Function levels.
 */
const getAllMiddleware = (
  api: ConfectApi.ConfectApi<any, any, any, any>,
  group: ConfectApiGroup.ConfectApiGroup.Any,
  fn: ConfectApiFunction.ConfectApiFunction.Any
): ReadonlyArray<ConfectApiMiddleware.ConfectApiMiddleware.Any> => {
  return [
    ...(api.middleware ?? []),
    ...(group.middleware ?? []),
    ...(fn.middleware ?? [])
  ];
};

// In confectQueryFunction
const confectQueryFunction = <...>({
  args,
  returns,
  handler,
  middleware // ← NEW
}: {
  args: Schema.Schema<...>;
  returns: Schema.Schema<...>;
  handler: (...) => Effect.Effect<...>;
  middleware: ReadonlyArray<ConfectApiMiddleware.ConfectApiMiddleware.Any>;
}) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (ctx, actualArgs) => {
    // Create handler effect
    const handlerEffect = pipe(
      actualArgs,
      Schema.decode(args),
      Effect.orDie,
      Effect.andThen(handler),
      Effect.andThen((result) => Schema.encodeUnknown(returns)(result))
    );

    // Apply all middleware
    const wrappedHandler = ConfectApiMiddleware.applyMiddleware(
      handlerEffect,
      middleware
    );

    return Effect.runPromise(wrappedHandler);
  }
});

// In make(), collect middleware
const middleware = getAllMiddleware(
  apiWithDatabaseSchema.api,
  group,
  fn
);

// Pass to function builder
confectQueryFunction(..., { middleware })
```

**Acceptance Criteria**:
- [ ] Middleware collected from all levels
- [ ] Middleware applied in correct order
- [ ] Handler wrapped properly
- [ ] Type safety maintained

---

#### Task 5.5: Add Middleware Tests

**File**: `packages/confect/src/api/middleware.test.ts` (new)
**Estimated Time**: 90 minutes

**Tests to Add**:

```typescript
import { describe, expect, test } from "vitest";
import { Context, Effect } from "effect";
import * as ConfectApiMiddleware from "./ConfectApiMiddleware";

describe("ConfectApiMiddleware", () => {
  test("makeMiddleware creates middleware", () => {
    const TestTag = Context.Tag<{}>();

    const middleware = ConfectApiMiddleware.makeMiddleware({
      tag: TestTag,
      apply: (handler) => handler
    });

    expect(middleware).toBeDefined();
    expect(middleware.tag).toBe(TestTag);
  });

  test("middleware can wrap handler", async () => {
    let executed = false;

    const TestTag = Context.Tag<{}>();
    const middleware = ConfectApiMiddleware.makeMiddleware({
      tag: TestTag,
      apply: (handler) =>
        Effect.gen(function* () {
          executed = true;
          return yield* handler;
        })
    });

    const handler = Effect.succeed(42);
    const wrapped = middleware.apply(handler);

    const result = await Effect.runPromise(
      Effect.provide(wrapped, Layer.succeed(TestTag, {}))
    );

    expect(result).toBe(42);
    expect(executed).toBe(true);
  });

  test("applyMiddleware executes in order", async () => {
    const executionOrder: string[] = [];

    const TestTag1 = Context.Tag<{}>();
    const TestTag2 = Context.Tag<{}>();

    const Middleware1 = ConfectApiMiddleware.makeMiddleware({
      tag: TestTag1,
      apply: (handler) =>
        Effect.gen(function* () {
          executionOrder.push("M1-before");
          const result = yield* handler;
          executionOrder.push("M1-after");
          return result;
        })
    });

    const Middleware2 = ConfectApiMiddleware.makeMiddleware({
      tag: TestTag2,
      apply: (handler) =>
        Effect.gen(function* () {
          executionOrder.push("M2-before");
          const result = yield* handler;
          executionOrder.push("M2-after");
          return result;
        })
    });

    const handler = Effect.sync(() => {
      executionOrder.push("HANDLER");
      return 42;
    });

    const wrapped = ConfectApiMiddleware.applyMiddleware(handler, [
      Middleware1,
      Middleware2
    ]);

    await Effect.runPromise(
      Effect.provide(
        wrapped,
        Layer.mergeAll(
          Layer.succeed(TestTag1, {}),
          Layer.succeed(TestTag2, {})
        )
      )
    );

    expect(executionOrder).toEqual([
      "M1-before",
      "M2-before",
      "HANDLER",
      "M2-after",
      "M1-after"
    ]);
  });

  test("middleware can fail handler", async () => {
    const TestTag = Context.Tag<{}>();

    const FailingMiddleware = ConfectApiMiddleware.makeMiddleware({
      tag: TestTag,
      apply: (handler) => Effect.fail({ _tag: "MiddlewareFailed" as const })
    });

    const handler = Effect.succeed(42);
    const wrapped = FailingMiddleware.apply(handler);

    const result = await Effect.runPromiseExit(
      Effect.provide(wrapped, Layer.succeed(TestTag, {}))
    );

    expect(Exit.isFailure(result)).toBe(true);
  });

  test("middleware types accumulate requirements", () => {
    // Type-level test
    const TestTag1 = Context.Tag<{ a: number }>();
    const TestTag2 = Context.Tag<{ b: string }>();

    const M1 = ConfectApiMiddleware.makeMiddleware({
      tag: TestTag1,
      apply: (h) => h
    });

    const M2 = ConfectApiMiddleware.makeMiddleware({
      tag: TestTag2,
      apply: (h) => h
    });

    type Requirements = ConfectApiMiddleware.MiddlewareRequirements<
      [typeof M1, typeof M2]
    >;

    // Should require both services
    const check: Requirements = { a: 1 } as any;
    expect(check).toBeDefined();
  });
});

describe("Middleware Integration", () => {
  test("API-level middleware applies to all functions", async () => {
    // Integration test with actual API
    const logs: string[] = [];

    const LoggingService = Context.Tag<{
      log: (msg: string) => Effect.Effect<void>;
    }>();

    const LoggingMiddleware = ConfectApiMiddleware.makeMiddleware({
      tag: LoggingService,
      apply: (handler) =>
        Effect.gen(function* () {
          const logger = yield* LoggingService;
          yield* logger.log("before");
          const result = yield* handler;
          yield* logger.log("after");
          return result;
        })
    });

    // Create API with middleware
    const Api = ConfectApi.make("Api").middleware(LoggingMiddleware);

    // ... rest of test
  });
});
```

**Acceptance Criteria**:
- [ ] All tests pass
- [ ] Middleware execution order tested
- [ ] Middleware errors tested
- [ ] Type-level tests compile
- [ ] Integration test passes

---

### Phase 5 Checklist

- [ ] Task 5.1: Middleware module created
- [ ] Task 5.2: Example middleware added
- [ ] Task 5.3: API/Group/Function updated
- [ ] Task 5.4: Server generation updated
- [ ] Task 5.5: Tests added and passing
- [ ] All existing tests pass
- [ ] Documentation complete
- [ ] Code reviewed and approved

### Phase 5 Success Criteria

✅ **Must Have**:
- Middleware can be defined
- Attach at API/Group/Function levels
- Executes in correct order
- Type system tracks requirements/errors
- Example middleware included

### Phase 5 Deliverables

- New `ConfectApiMiddleware.ts` (complete module)
- Modified `ConfectApi.ts` (middleware support)
- Modified `ConfectApiGroup.ts` (middleware support)
- Modified `ConfectApiFunction.ts` (middleware support)
- Modified `ConfectApiServer.ts` (middleware application)
- New `middleware.test.ts` (tests)
- Example middleware implementations

---

## Progress Tracking

### Overall Progress

| Phase | Status | Progress | Time Spent | Time Remaining |
|-------|--------|----------|------------|----------------|
| Phase 1: Critical Fixes | ⏸️ Not Started | 0% | 0h | 1h |
| Phase 2: Reflection API | ⏸️ Not Started | 0% | 0h | 2h |
| Phase 3: Error Unification | ⏸️ Not Started | 0% | 0h | 5h |
| Phase 4: Schema Caching | ⏸️ Not Started | 0% | 0h | 2h |
| Phase 5: Middleware System | ⏸️ Not Started | 0% | 0h | 7h |
| **Total** | ⏸️ Not Started | **0%** | **0h** | **17h** |

### Status Legend

- ⏸️ Not Started
- 🔄 In Progress
- ✅ Complete
- ⚠️ Blocked
- ❌ Failed

### Task Tracking Template

```markdown
## Current Task

**Phase**: [Phase Number]
**Task**: [Task Number]
**Description**: [Brief description]
**Started**: [Date/Time]
**Status**: [Status]

### Blockers
- None

### Notes
- [Any relevant notes]

### Next Steps
1. [Next action item]
2. [Next action item]
```

---

## Risk Mitigation

### Technical Risks

| Risk | Mitigation Strategy | Contingency Plan |
|------|---------------------|------------------|
| **Type system complexity causes slow compilation** | Monitor TS compile times, simplify types if >10s | Use simpler type utilities, accept some type safety loss |
| **WeakMap caching causes memory issues** | Use WeakMap for automatic GC, monitor memory | Add manual cache clearing API if needed |
| **Middleware ordering bugs** | Comprehensive tests, clear documentation | Provide debugging tools to inspect order |
| **Breaking changes affect users** | N/A - no backwards compat required | Document migration path anyway |
| **Effect version incompatibility** | Pin versions, test with Effect 3.17+ | Lock to specific Effect version |

### Implementation Risks

| Risk | Mitigation Strategy | Contingency Plan |
|------|---------------------|------------------|
| **Phase 1 takes longer than 1h** | Time-box to 2h max, simplify if needed | Defer non-critical fixes |
| **Tests fail unexpectedly** | Fix tests immediately, don't proceed | Investigate root cause, adjust plan |
| **Performance targets not met** | Profile and optimize hot paths | Adjust expectations, document actual perf |
| **Integration issues** | Run integration tests frequently | Revert changes, fix incrementally |

---

## Quality Gates

### Phase Completion Criteria

Each phase must meet these criteria before proceeding:

1. **All tasks complete**: Every task marked ✅
2. **All tests passing**: No failing tests
3. **TypeScript compiles**: No TS errors
4. **Code reviewed**: At least one review pass
5. **Documentation updated**: All JSDoc comments added
6. **Examples work**: Code examples compile and run

### Code Quality Standards

- **Test Coverage**: >90% for new code
- **Type Safety**: No `any` without justification
- **Performance**: No regressions >10%
- **Documentation**: All public APIs documented
- **Consistency**: Follows existing patterns

### Review Checklist

Before marking a phase complete:

- [ ] Code follows Effect patterns consistently
- [ ] Error handling is comprehensive
- [ ] Edge cases are tested
- [ ] Performance is acceptable
- [ ] Documentation is clear
- [ ] No console warnings
- [ ] Git commits are clean and descriptive

---

## Rollback Plan

### If Phase Fails

1. **Identify failure point**: Which task failed?
2. **Assess impact**: Does it block other phases?
3. **Revert changes**: Git revert to last working state
4. **Re-plan**: Adjust plan based on learnings
5. **Retry or defer**: Try again or move to next phase

### Safe Points

Create git tags at these points:

- `before-phase-1` - Before starting
- `after-phase-1` - After critical fixes
- `after-phase-2` - After reflection API
- `after-phase-3` - After error unification
- `after-phase-4` - After schema caching
- `after-phase-5` - Complete

### Rollback Commands

```bash
# View safe points
git tag -l "before-*" "after-*"

# Rollback to specific phase
git reset --hard after-phase-1

# Create new branch from safe point
git checkout -b retry-phase-2 after-phase-1
```

---

## Success Metrics

### Immediate Success (Phase 1)

- ✅ Handler collection works
- ✅ Server generation works
- ✅ Integration test passes
- ✅ No TypeScript errors
- ✅ Can build working Convex app

### Short-Term Success (Phases 2-4)

- ✅ All P0 + P1 requirements met
- ✅ Reflection API enables tooling
- ✅ Error unification improves DX
- ✅ Schema caching improves performance >50%
- ✅ All tests passing

### Long-Term Success (Phase 5)

- ✅ Complete middleware system
- ✅ Example middleware included
- ✅ Full feature parity with design
- ✅ Documentation complete
- ✅ Ready for production use

---

## Next Steps

**Current Status**: ⏸️ Ready to begin implementation

**To Start Phase 1**:

1. Create feature branch: `git checkout -b feature/api-builder-completion`
2. Create safe point: `git tag before-phase-1`
3. Begin Task 1.1: Fix handler collection
4. Update progress tracker
5. Run tests frequently

**Authorization Required**: ✋ **User approval needed to begin implementation (Phase 5 of spec process)**

---

**Previous Phase**: [design.md](./design.md)
**Next Phase**: Implementation (requires approval)
