# Design: API Builder & Server Generation Completion

**Feature**: api-builder-completion
**Phase**: 3 - Technical Design
**Status**: Architecture & Implementation Strategy
**Derived From**: [requirements.md](./requirements.md)

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-26 | Claude | Initial technical design |

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Critical Fixes Design](#critical-fixes-design)
3. [Reflection API Design](#reflection-api-design)
4. [Error Unification Design](#error-unification-design)
5. [Schema Caching Design](#schema-caching-design)
6. [Middleware System Design](#middleware-system-design)
7. [Type System Design](#type-system-design)
8. [Effect Patterns](#effect-patterns)
9. [Data Flow](#data-flow)
10. [Implementation Approach](#implementation-approach)
11. [Testing Strategy](#testing-strategy)

---

## Architecture Overview

### System Context

```
┌─────────────────────────────────────────────────────────────┐
│                     Confect API System                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐      ┌──────────────┐     ┌─────────────┐ │
│  │  Developer  │      │   Builder    │     │   Server    │ │
│  │  Defines    │─────▶│   Collects   │────▶│  Generates  │ │
│  │    API      │      │   Handlers   │     │  Functions  │ │
│  └─────────────┘      └──────────────┘     └─────────────┘ │
│        │                                            │        │
│        │                                            │        │
│        ▼                                            ▼        │
│  ┌─────────────┐                            ┌─────────────┐ │
│  │   Client    │                            │   Convex    │ │
│  │  Generator  │                            │  Runtime    │ │
│  └─────────────┘                            └─────────────┘ │
│        │                                            │        │
│        └────────────────────────────────────────────┘        │
│                  Type-Safe Function Calls                    │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

| Component | Responsibility | Status |
|-----------|---------------|--------|
| **ConfectApi** | Root API container, group management | ✅ Complete |
| **ConfectApiGroup** | Group definitions, nested hierarchy | ✅ Complete |
| **ConfectApiFunction** | Function definitions, type discrimination | ✅ Complete |
| **ConfectApiBuilder** | Handler collection, Layer construction | 🔴 Broken (FR-1.1) |
| **ConfectApiServer** | Convex function generation | 🔴 Broken (FR-1.2) |
| **ConfectApiClient** | Type-safe client API | ⚠️ Works, needs caching |
| **ConfectApiMiddleware** | Cross-cutting concerns | ❌ Not implemented |

### Design Principles

1. **Schema-First**: All data flows through `@effect/schema` validation
2. **Type-Driven**: Compile-time correctness via TypeScript's type system
3. **Effect-Native**: All async operations as `Effect.Effect<A, E, R>`
4. **Layer Composition**: Dependency injection via `Layer.Layer<Out, Err, In>`
5. **Immutable**: Prototype-based objects, no mutation
6. **Composable**: APIs compose via functional patterns

---

## Critical Fixes Design

### FR-1.1: Handler Collection Fix

**Problem Analysis**:

Current code creates empty `Chunk` and never populates it:

```typescript
export const group = <...>(...) => {
  const handlers = Chunk.empty(); // ← Created empty

  return Layer.succeed(GroupService, {
    handlers: build(makeHandlers({ group, handlers })) // ← build() result discarded
  });
};
```

The `build()` callback receives empty handlers and returns populated handlers via fluent API:

```typescript
// User calls:
(handlers) => handlers
  .handle("fn1", handler1)  // Returns new object with [handler1]
  .handle("fn2", handler2)  // Returns new object with [handler1, handler2]
```

**Root Cause**: The return value of `build()` is cast to `unknown as Handlers.FromGroup<>` but the actual handlers array inside is still empty because we created `makeHandlers()` with `Chunk.empty()` and didn't extract the result.

**Solution Design**:

```typescript
export const group = <...>(...): Layer.Layer<...> => {
  const group = apiWithDatabaseSchema.api.groups[groupPath]!;

  // 1. Create initial empty handlers
  const initialHandlers = makeHandlers({
    group,
    handlers: Chunk.empty()
  });

  // 2. Call build() - user chains .handle() calls, returns populated
  const populatedHandlers = build(initialHandlers);

  // 3. Use the populated result directly
  return Layer.succeed(
    ConfectApiGroupService(...),
    {
      apiName: apiWithDatabaseSchema.api.name,
      handlers: populatedHandlers
    }
  );
};
```

**Key Insight**: The `build()` callback is already correct. Each `.handle()` call creates a new `Handlers` object with accumulated items. We just need to use the final return value.

**Type Safety**: The `ValidateReturn<>` type ensures `build()` returns `Handlers<ConfectSchema, never>` (all functions handled) or a compile error.

**Testing**:
```typescript
test("handler collection accumulates handlers", () => {
  const result = build(
    makeHandlers({ group, handlers: Chunk.empty() })
  );

  expect(result.handlers.length).toBe(2);
  expect(result.handlers[0].function_.name).toBe("myFunction");
  expect(result.handlers[1].function_.name).toBe("myFunction2");
});
```

---

### FR-1.2: Server Generation Fix

**Problem Analysis**:

Current code builds the correct structure but returns placeholder:

```typescript
export const make = <...>(...): ConfectApiServer<Groups> => {
  return Effect.gen(function* () {
    const layerRuntime = yield* Layer.toRuntime(apiServiceLayer);

    return Runtime.runSync(layerRuntime, Effect.gen(function* () {
      const api = yield* ConfectApiBuilder.ConfectApiService(...);

      const a = Record.map(groups, (group) => {
        // ... builds { [groupName]: { [fnName]: RegisteredQuery } }
      });

      return hole<any>(); // ← PROBLEM
    }));
  }).pipe(Effect.scoped, Effect.runSync);
};
```

**Root Cause**: Implementation is complete, just missing the return statement.

**Solution Design**:

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
                      mutationGeneric(confectMutationFunction(...))
                    ),
                    Match.when("Action", () =>
                      actionGeneric(confectActionFunction(...))
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

**Type Signature Verification**:

```typescript
type Expected = ConfectApiServer<Groups>;
// Expands to:
{
  readonly [TypeId]: TypeId;
  readonly [GroupName in Groups["name"]]: {
    [FnName in keyof Extract<Groups, { name: GroupName }>["functions"]]:
      RegisteredQuery<"public", Args, Returns>
  };
}

type Actual = typeof serverGroups;
// Is:
Record<string, Record<string, RegisteredQuery>>

// Cast is safe because:
// 1. We iterate Groups["name"] for keys
// 2. We iterate group.functions for nested keys
// 3. We create RegisteredQuery for values
```

**Testing**:
```typescript
test("server generation returns working object", () => {
  const server = ConfectApiServer.make(ApiWithDatabaseSchema, ApiLive);

  expect(server[TypeId]).toBe(TypeId);
  expect(server.group).toBeDefined();
  expect(server.group.myFunction).toBeDefined();
  expect(typeof server.group.myFunction).toBe("function");
});
```

---

## Reflection API Design

### FR-2.1: API Introspection

**Design Goals**:
1. Traverse entire API structure (groups, functions)
2. Support nested groups recursively
3. Provide both data-structure and callback-based APIs
4. Enable OpenAPI generation, documentation, debugging

**Architecture**:

```typescript
// Primary callback-based API
export const reflect = <
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps
>(
  api: ConfectApi<ApiName, Groups>,
  options: {
    onGroup?: (ctx: GroupReflectionContext) => void;
    onFunction?: (ctx: FunctionReflectionContext) => void;
  }
): void;

// Alternative data-structure API
export const reflectToStructure = <...>(
  api: ConfectApi<...>
): ApiReflectionStructure;

// Type definitions
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

export interface ApiReflectionStructure {
  readonly apiName: string;
  readonly groups: ReadonlyArray<{
    readonly name: string;
    readonly path: string;
    readonly functions: ReadonlyArray<{
      readonly name: string;
      readonly type: "Query" | "Mutation" | "Action";
      readonly path: string;
    }>;
    readonly nestedGroups: ReadonlyArray</* recursive */>;
  }>;
}
```

**Implementation Strategy**:

```typescript
export const reflect = <...>(api: ConfectApi<...>, options: ...): void => {
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

    // Iterate functions
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

**Data Structure Alternative**:

```typescript
export const reflectToStructure = <...>(
  api: ConfectApi<...>
): ApiReflectionStructure => {
  const groups: Array<any> = [];

  reflect(api, {
    onGroup: (ctx) => {
      if (ctx.depth === 0) {
        groups.push({
          name: ctx.group.name,
          path: ctx.path,
          functions: [],
          nestedGroups: []
        });
      }
    },
    onFunction: (ctx) => {
      // Find parent group in structure and add function
      const group = findGroupByPath(groups, ctx.groupPath);
      group?.functions.push({
        name: ctx.function.name,
        type: ctx.functionType,
        path: ctx.fullPath
      });
    }
  });

  return {
    apiName: api.name,
    groups
  };
};
```

**Use Case: OpenAPI Generation**:

```typescript
export const generateOpenApi = (api: ConfectApi<...>) => {
  const spec: OpenAPISpec = {
    openapi: "3.0.0",
    info: { title: api.name, version: "1.0.0" },
    paths: {}
  };

  reflect(api, {
    onFunction: (ctx) => {
      const path = `/${ctx.fullPath.replace(/\./g, "/")}`;

      spec.paths[path] = {
        post: {
          operationId: ctx.fullPath,
          tags: [ctx.groupPath],
          requestBody: {
            content: {
              "application/json": {
                schema: schemaToJsonSchema(ctx.argsSchema)
              }
            }
          },
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: schemaToJsonSchema(ctx.returnsSchema)
                }
              }
            }
          }
        }
      };
    }
  });

  return spec;
};
```

**Testing**:
```typescript
test("reflection traverses all groups and functions", () => {
  const groups = new Set<string>();
  const functions = new Set<string>();

  ConfectApi.reflect(Api, {
    onGroup: (ctx) => groups.add(ctx.path),
    onFunction: (ctx) => functions.add(ctx.fullPath)
  });

  expect(groups).toContain("group");
  expect(groups).toContain("group4.group2");
  expect(functions).toContain("group.myFunction");
  expect(functions).toContain("group4.group2.myFunction3");
});

test("reflection handles nested groups correctly", () => {
  const depths: number[] = [];

  ConfectApi.reflect(Api, {
    onGroup: (ctx) => depths.push(ctx.depth)
  });

  expect(depths).toContain(0); // Root groups
  expect(depths).toContain(1); // Nested groups
});
```

---

## Error Unification Design

### FR-3.1: API-Level Error Schema

**Design Philosophy**:

Errors should follow a **discriminated union** pattern with `_tag` field for Effect's tagged error handling (`Effect.catchTag`).

**Type Architecture**:

```typescript
// Base error type
export interface ConfectApiError {
  readonly _tag: string;
}

// API-level errors with status codes
export interface ErrorConfig {
  readonly schema: Schema.Schema<any, any>;
  readonly status?: number; // HTTP status code
}

// Updated ConfectApi interface
export interface ConfectApi<
  Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  Error = never
> {
  readonly [TypeId]: TypeId;
  readonly name: Name;
  readonly groups: Record.ReadonlyRecord<string, Groups>;
  readonly errors: ReadonlyArray<ErrorConfig>; // ← NEW

  addError<E extends ConfectApiError>(
    schema: Schema.Schema<E>,
    options?: { status?: number }
  ): ConfectApi<Name, Groups, Error | E>;
}
```

**Implementation**:

```typescript
// Prototype-based implementation
const ConfectApiProto = {
  [TypeId]: TypeId,

  add<Group>(this: ConfectApi<...>, group: Group) {
    return makeConfectApi({
      name: this.name,
      groups: { ...this.groups, [group.name]: group },
      errors: this.errors
    });
  },

  addError<E>(
    this: ConfectApi<...>,
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

const makeConfectApi = <...>({ name, groups, errors }): ConfectApi<...> =>
  Object.assign(Object.create(ConfectApiProto), {
    name,
    groups,
    errors: errors ?? []
  });
```

**Error Schema Unification**:

```typescript
// Compute unified error schema from API config
export const unifyErrors = <Api extends ConfectApi<any, any, any>>(
  api: Api
): Schema.Schema<ConfectApi.Error<Api>> => {
  if (api.errors.length === 0) {
    return Schema.Never as any; // No errors
  }

  if (api.errors.length === 1) {
    return api.errors[0].schema;
  }

  // Union of all error schemas
  const [first, ...rest] = api.errors.map(e => e.schema);
  return Schema.Union(first, ...rest);
};

// Type-level error extraction
export declare namespace ConfectApi {
  export type Error<A> =
    A extends ConfectApi<infer _Name, infer _Groups, infer E>
      ? E
      : never;
}
```

**Error Status Code Mapping**:

```typescript
// Map errors to HTTP status codes
export const getErrorStatus = <Api extends ConfectApi<...>>(
  api: Api,
  error: ConfectApi.Error<Api>
): number => {
  const config = api.errors.find(e => {
    // Check if error matches schema
    const result = Schema.decodeUnknownEither(e.schema)(error);
    return Either.isRight(result);
  });

  return config?.status ?? 500; // Default to 500
};
```

**Usage Example**:

```typescript
// Define error types
const UnauthorizedError = Schema.Struct({
  _tag: Schema.Literal("Unauthorized"),
  message: Schema.String
});

const RateLimitError = Schema.Struct({
  _tag: Schema.Literal("RateLimited"),
  retryAfter: Schema.Number
});

// Add to API
const Api = ConfectApi.make("Api")
  .addError(UnauthorizedError, { status: 401 })
  .addError(RateLimitError, { status: 429 });

// Type extraction
type ApiErrors = ConfectApi.Error<typeof Api>;
// ApiErrors =
//   | { _tag: "Unauthorized"; message: string }
//   | { _tag: "RateLimited"; retryAfter: number }
```

**Testing**:
```typescript
test("error unification creates union type", () => {
  const Api = ConfectApi.make("Api")
    .addError(UnauthorizedError, { status: 401 })
    .addError(RateLimitError, { status: 429 });

  const errorSchema = unifyErrors(Api);

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

test("error status code mapping", () => {
  const Api = ConfectApi.make("Api")
    .addError(UnauthorizedError, { status: 401 });

  const status = getErrorStatus(Api, {
    _tag: "Unauthorized",
    message: "test"
  });

  expect(status).toBe(401);
});
```

---

### FR-3.2: Error Propagation to Handlers

**Design Challenge**:

Handler error types need to include:
1. Function-specific errors (`E` in handler signature)
2. API-level errors (from `api.errors`)
3. Group-level errors (future enhancement)
4. Schema validation errors (`ParseResult.ParseError`)

**Type-Level Design**:

```typescript
// Extract API errors from context
export declare namespace ConfectApiFunction {
  export type HandlerError<
    Fn extends ConfectApiFunction.AnyWithProps,
    ApiError
  > = Fn["handlerError"] | ApiError | ParseResult.ParseError;
}

// Updated function interface
export interface ConfectApiFunction<
  FunctionType extends "Query" | "Mutation" | "Action",
  Name extends string,
  Args extends Schema.Schema<any, any>,
  Returns extends Schema.Schema<any, any>,
  HandlerError = never
> {
  readonly functionType: FunctionType;
  readonly name: Name;
  readonly args: Args;
  readonly returns: Returns;
  readonly handlerError: HandlerError; // ← Function-specific errors
}

// Handler type includes API errors
export type Handler<
  ConfectSchema extends GenericConfectSchema,
  Fn extends ConfectApiFunction.AnyWithProps,
  ApiError = never
> = (
  args: Schema.Schema.Type<Fn["args"]>
) => Effect.Effect<
  Schema.Schema.Type<Fn["returns"]>,
  Fn["handlerError"] | ApiError | ParseResult.ParseError, // ← Union
  HandlerRequirements<ConfectSchema, Fn>
>;
```

**Error Propagation in Builder**:

```typescript
export const group = <
  ConfectSchema extends GenericConfectSchema,
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  GroupPath extends ConfectApiGroup.ConfectApiGroup.Path<Groups>,
  ApiError // ← NEW: API-level errors
>(
  apiWithDatabaseSchema: ConfectApiWithDatabaseSchema<
    ConfectSchema,
    ApiName,
    Groups,
    ApiError // ← Thread through
  >,
  groupPath: GroupPath,
  build: (
    handlers: Handlers.FromGroup<ConfectSchema, Group, ApiError> // ← Include API errors
  ) => Handlers.ValidateReturn<Return>
): Layer.Layer<...> => {
  // Implementation same, types propagate automatically
};
```

**Error Handling in Server**:

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
  apiErrors // ← NEW: Pass API error schema
}: {
  args: Schema.Schema<ConfectArgs, ConvexArgs>;
  returns: Schema.Schema<ConfectReturns, ConvexReturns>;
  handler: (a: ConfectArgs) => Effect.Effect<ConfectReturns, E | ApiError, R>;
  apiErrors: Schema.Schema<ApiError>;
}) => ({
  args: compileArgsSchema(args),
  returns: compileReturnsSchema(returns),
  handler: (ctx, actualArgs) =>
    pipe(
      actualArgs,
      Schema.decode(args),
      Effect.orDie, // Schema errors are bugs
      Effect.andThen(handler),
      Effect.catchAll((error) => {
        // Try to decode as API error
        const apiErrorResult = Schema.decodeUnknownEither(apiErrors)(error);

        if (Either.isRight(apiErrorResult)) {
          // This is an API-level error - include status code
          const status = getErrorStatus(api, apiErrorResult.right);
          return Effect.fail({
            error: apiErrorResult.right,
            status
          });
        }

        // Function-specific error - rethrow
        return Effect.fail(error);
      }),
      Effect.andThen((result) => Schema.encodeUnknown(returns)(result)),
      Effect.runPromise
    )
});
```

**Usage in Handlers**:

```typescript
const getUserHandler = (args: { id: string }) =>
  Effect.gen(function* () {
    const db = yield* ConfectDatabaseReader;
    const user = yield* db.table("users").get(args.id);

    if (!user) {
      // Return API-level error - type-checks!
      return yield* Effect.fail({
        _tag: "Unauthorized" as const,
        message: "User not found"
      });
    }

    return user;
  });

// Type of handler:
// (args) => Effect.Effect<
//   User,
//   | { _tag: "Unauthorized"; message: string }  // API error
//   | { _tag: "RateLimited"; retryAfter: number } // API error
//   | ParseResult.ParseError,                     // Schema error
//   ConfectDatabaseReader
// >
```

**Testing**:
```typescript
test("handlers can return API-level errors", async () => {
  const handler = (args: { id: string }) =>
    Effect.fail({
      _tag: "Unauthorized" as const,
      message: "Not allowed"
    });

  const result = await Effect.runPromiseExit(handler({ id: "123" }));

  expect(Exit.isFailure(result)).toBe(true);
  if (Exit.isFailure(result)) {
    expect(result.cause._tag).toBe("Unauthorized");
  }
});

test("API errors include status codes", () => {
  const Api = ConfectApi.make("Api")
    .addError(UnauthorizedError, { status: 401 });

  const error = { _tag: "Unauthorized" as const, message: "test" };
  const status = getErrorStatus(Api, error);

  expect(status).toBe(401);
});
```

---

## Schema Caching Design

### FR-4.1: Client-Side Schema Compilation Cache

**Performance Problem**:

Every function call currently compiles schemas:

```typescript
export const make = <Api>(api: Api, client: ConvexReactClient) =>
  Record.map(api.groups, (group) =>
    Record.map(group.functions, (fn) => (args: unknown) =>
      Effect.gen(function* () {
        // ❌ Compiles on EVERY call
        const encodedArgs = yield* Schema.encodeUnknown(fn.args)(args);

        const result = yield* Effect.promise(() =>
          client.query(path, encodedArgs)
        );

        // ❌ Compiles on EVERY call
        const decodedResult = yield* Schema.decodeUnknown(fn.returns)(result);

        return decodedResult;
      })
    )
  );
```

**Caching Strategy**:

Use `globalValue` + `WeakMap` keyed by Schema AST:

```typescript
import { globalValue } from "effect/GlobalValue";

// Global cache shared across all client instances
const schemaCache = globalValue(
  Symbol.for("@rjdellecese/confect/ConfectApiClient/schemaCache"),
  () => new WeakMap<
    Schema.AST.AST,
    {
      encode: (a: any) => Effect.Effect<any, ParseResult.ParseError>,
      decode: (u: unknown) => Effect.Effect<any, ParseResult.ParseError>
    }
  >()
);

// Get or compile schema
const getOrCompileSchema = <A, I>(
  schema: Schema.Schema<A, I>
): {
  encode: (a: A) => Effect.Effect<I, ParseResult.ParseError>,
  decode: (i: unknown) => Effect.Effect<A, ParseResult.ParseError>
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

**Optimized Client**:

```typescript
export const make = <Api>(api: Api, client: ConvexReactClient) =>
  Record.map(api.groups, (group) =>
    Record.map(group.functions, (fn) => {
      // ✅ Compile ONCE per function definition
      const { encode: encodeArgs, decode: decodeReturns } =
        getOrCompileSchema(fn.args);
      const { decode: decodeResult } =
        getOrCompileSchema(fn.returns);

      // Return function that uses cached compiled schemas
      return (args: unknown) =>
        Effect.gen(function* () {
          const encodedArgs = yield* encodeArgs(args);

          const result = yield* Effect.promise(() =>
            client.query(path, encodedArgs)
          );

          const decodedResult = yield* decodeResult(result);

          return decodedResult;
        });
    })
  );
```

**Why WeakMap?**:

1. **Automatic GC**: When API definition is garbage collected, cache entries are too
2. **Memory Safe**: Doesn't prevent garbage collection
3. **AST-Based**: Two schemas with same structure share cache entry
4. **Global**: Shared across all client instances

**Performance Characteristics**:

| Operation | First Call | Subsequent Calls | Improvement |
|-----------|-----------|------------------|-------------|
| Schema compilation | ~5-10ms | ~0ms (cache hit) | >99% |
| Function call overhead | ~10-15ms | ~0.5ms | ~95% |
| Total call time | Compile + Network | Network only | ~50-80% |

**Cache Invalidation**:

Not needed! WeakMap automatically cleans up when schemas are GC'd. If user creates new API definition, new schemas get new cache entries.

**Testing**:
```typescript
test("schema caching improves performance", async () => {
  const client = ConfectApiClient.make(Api, convexClient);

  // First call - compiles
  const start1 = performance.now();
  await Effect.runPromise(client.group.myFunction({ foo: 1 }));
  const duration1 = performance.now() - start1;

  // Second call - cached
  const start2 = performance.now();
  await Effect.runPromise(client.group.myFunction({ foo: 2 }));
  const duration2 = performance.now() - start2;

  // Should be significantly faster
  expect(duration2).toBeLessThan(duration1 * 0.5);
});

test("schema cache uses WeakMap", () => {
  // Create API, make client
  let api: any = ConfectApi.make("Api").add(...);
  const client = ConfectApiClient.make(api, convexClient);

  // Call function to populate cache
  Effect.runPromise(client.group.fn({ foo: 1 }));

  // Cache should have entry
  expect(schemaCache.has(api.groups.group.functions.fn.args.ast)).toBe(true);

  // Remove reference
  api = null;

  // Force GC (in test environment)
  global.gc?.();

  // Cache should be cleaned up (WeakMap behavior)
  // Note: Actual GC timing is non-deterministic
});
```

---

## Middleware System Design

### FR-5.1: Middleware Definition

**Design Philosophy**:

Middleware should be:
1. **Composable**: Stack multiple middleware
2. **Type-Safe**: Track requirements and errors
3. **Effect-Native**: Use Context tags and Layers
4. **Flexible**: Work at API/Group/Function levels

**Core Architecture**:

```typescript
// Middleware interface
export interface ConfectApiMiddleware<Tag, Service, Error = never> {
  readonly tag: Context.Tag<Tag, Service>;

  readonly apply: <A, E, R>(
    handler: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | Error, R | Service>;
}

// Helper to create middleware
export const makeMiddleware = <Tag, Service, Err = never>(config: {
  tag: Context.Tag<Tag, Service>;
  apply: <A, E, R>(
    handler: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | Err, R | Service>;
}): ConfectApiMiddleware<Tag, Service, Err> => config;
```

**Example Middleware Implementations**:

```typescript
// 1. Logging Middleware
export class LoggingService extends Context.Tag("@confect/LoggingService")<
  LoggingService,
  {
    readonly log: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void>;
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

// 2. Auth Middleware
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
      // Check auth before handler
      const auth = yield* AuthService;
      yield* auth.requireAuth(); // Fails if not authenticated

      // Proceed with handler
      return yield* handler;
    })
});

// 3. Rate Limiting Middleware
export class RateLimitService extends Context.Tag("@confect/RateLimitService")<
  RateLimitService,
  {
    readonly checkLimit: (key: string) => Effect.Effect<
      void,
      { _tag: "RateLimited"; retryAfter: number }
    >;
  }
>() {}

export const RateLimitMiddleware = makeMiddleware({
  tag: RateLimitService,
  apply: <A, E, R>(handler: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const limiter = yield* RateLimitService;

      // Check rate limit
      yield* limiter.checkLimit("api-call");

      // Proceed if under limit
      return yield* handler;
    })
});
```

**Type-Level Tracking**:

```typescript
// Extract middleware requirements
export declare namespace ConfectApiMiddleware {
  export type Service<M> =
    M extends ConfectApiMiddleware<infer _Tag, infer Svc, infer _Err>
      ? Svc
      : never;

  export type Error<M> =
    M extends ConfectApiMiddleware<infer _Tag, infer _Svc, infer Err>
      ? Err
      : never;
}

// Compute combined requirements from multiple middleware
export type MiddlewareRequirements<Middleware extends ReadonlyArray<any>> =
  Middleware extends readonly [infer Head, ...infer Tail]
    ? ConfectApiMiddleware.Service<Head> | MiddlewareRequirements<Tail>
    : never;

// Compute combined errors from multiple middleware
export type MiddlewareErrors<Middleware extends ReadonlyArray<any>> =
  Middleware extends readonly [infer Head, ...infer Tail]
    ? ConfectApiMiddleware.Error<Head> | MiddlewareErrors<Tail>
    : never;
```

**Testing**:
```typescript
test("middleware can wrap handlers", async () => {
  let executed = false;

  const TestMiddleware = makeMiddleware({
    tag: Context.Tag<{}>(),
    apply: (handler) =>
      Effect.gen(function* () {
        executed = true;
        return yield* handler;
      })
  });

  const handler = Effect.succeed(42);
  const wrapped = TestMiddleware.apply(handler);

  const result = await Effect.runPromise(wrapped);

  expect(result).toBe(42);
  expect(executed).toBe(true);
});

test("middleware types track requirements", () => {
  type Requirements = ConfectApiMiddleware.Service<typeof LoggingMiddleware>;

  const check: Requirements = {} as LoggingService;
  expect(check).toBeDefined(); // Type-level test
});
```

---

### FR-5.2: Middleware Attachment Points

**Architecture**:

Middleware can attach at three levels:

```
API Level (outermost)
  └─ Group Level
      └─ Function Level (innermost)
          └─ Handler
```

**Execution Order**: API → Group → Function → Handler → Function → Group → API

**Interface Updates**:

```typescript
// API with middleware
export interface ConfectApi<
  Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  Error = never,
  Middleware extends ReadonlyArray<ConfectApiMiddleware.Any> = [] // ← NEW
> {
  readonly name: Name;
  readonly groups: Record.ReadonlyRecord<string, Groups>;
  readonly errors: ReadonlyArray<ErrorConfig>;
  readonly middleware: Middleware; // ← NEW

  middleware<M extends ConfectApiMiddleware.Any>(
    m: M
  ): ConfectApi<Name, Groups, Error | ConfectApiMiddleware.Error<M>, [...Middleware, M]>;
}

// Group with middleware
export interface ConfectApiGroup<
  Name extends string,
  Functions extends ConfectApiFunction.AnyWithProps,
  Groups extends ConfectApiGroup.AnyWithProps,
  Middleware extends ReadonlyArray<ConfectApiMiddleware.Any> = []
> {
  readonly name: Name;
  readonly functions: Record.ReadonlyRecord<string, Functions>;
  readonly groups: Record.ReadonlyRecord<string, Groups>;
  readonly middleware: Middleware;

  middleware<M>(m: M): ConfectApiGroup<Name, Functions, Groups, [...Middleware, M]>;
}

// Function with middleware
export interface ConfectApiFunction<
  FunctionType,
  Name,
  Args,
  Returns,
  HandlerError,
  Middleware extends ReadonlyArray<ConfectApiMiddleware.Any> = []
> {
  // ... existing fields
  readonly middleware: Middleware;

  middleware<M>(m: M): ConfectApiFunction<
    FunctionType,
    Name,
    Args,
    Returns,
    HandlerError | ConfectApiMiddleware.Error<M>,
    [...Middleware, M]
  >;
}
```

**Middleware Composition**:

```typescript
// Apply all middleware in order
const applyMiddleware = <A, E, R>(
  handler: Effect.Effect<A, E, R>,
  middleware: ReadonlyArray<ConfectApiMiddleware.Any>
): Effect.Effect<A, E | MiddlewareErrors<typeof middleware>, R | MiddlewareRequirements<typeof middleware>> => {
  return Array.reduce(
    middleware,
    handler as Effect.Effect<any, any, any>,
    (acc, mid) => mid.apply(acc)
  );
};

// In server generation, collect all middleware
const getAllMiddleware = (
  api: ConfectApi<...>,
  group: ConfectApiGroup<...>,
  fn: ConfectApiFunction<...>
): ReadonlyArray<ConfectApiMiddleware.Any> => {
  return [
    ...api.middleware,
    ...group.middleware,
    ...fn.middleware
  ];
};
```

**Server Integration**:

```typescript
const confectQueryFunction = <...>({
  args,
  returns,
  handler,
  middleware // ← NEW: All collected middleware
}: {
  args: Schema.Schema<...>;
  returns: Schema.Schema<...>;
  handler: (a: Args) => Effect.Effect<Returns, E, R>;
  middleware: ReadonlyArray<ConfectApiMiddleware.Any>;
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
    const wrappedHandler = applyMiddleware(handlerEffect, middleware);

    return Effect.runPromise(wrappedHandler);
  }
});
```

**Usage Example**:

```typescript
// API-level: All functions get logging
const Api = ConfectApi.make("Api")
  .middleware(LoggingMiddleware)
  .addError(UnauthorizedError, { status: 401 });

// Group-level: All admin functions require auth
const AdminGroup = ConfectApiGroup.make("admin")
  .middleware(AuthMiddleware)
  .add(
    ConfectApiFunction.make("Mutation")({
      name: "deleteUser",
      args: Schema.Struct({ id: Schema.String }),
      returns: Schema.Void
    })
  );

// Function-level: Specific function has rate limit
const SearchFunction = ConfectApiFunction.make("Query")({
  name: "search",
  args: SearchArgs,
  returns: SearchResults
}).middleware(RateLimitMiddleware);

// Execution order for AdminGroup.deleteUser:
// 1. LoggingMiddleware (API)
// 2. AuthMiddleware (Group)
// 3. Handler
```

**Type Safety**:

```typescript
// Handler must provide all middleware requirements
const deleteUserHandler = (args: { id: string }) =>
  Effect.gen(function* () {
    // LoggingService available (from API middleware)
    const logger = yield* LoggingService;

    // AuthService available (from Group middleware)
    const auth = yield* AuthService;

    // Handler implementation
    yield* logger.log("Deleting user", { id: args.id });

    // ... delete logic
  });

// Type of handler:
// (args) => Effect.Effect<
//   void,
//   | { _tag: "Unauthorized" }  // From AuthMiddleware
//   | ParseResult.ParseError,
//   | LoggingService             // From LoggingMiddleware
//   | AuthService                // From AuthMiddleware
//   | ConfectDatabaseWriter
// >
```

**Testing**:
```typescript
test("middleware executes in correct order", async () => {
  const executionOrder: string[] = [];

  const Middleware1 = makeMiddleware({
    tag: Context.Tag<{}>(),
    apply: (handler) =>
      Effect.gen(function* () {
        executionOrder.push("M1-before");
        const result = yield* handler;
        executionOrder.push("M1-after");
        return result;
      })
  });

  const Middleware2 = makeMiddleware({
    tag: Context.Tag<{}>(),
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

  const wrapped = applyMiddleware(handler, [Middleware1, Middleware2]);

  await Effect.runPromise(wrapped);

  expect(executionOrder).toEqual([
    "M1-before",
    "M2-before",
    "HANDLER",
    "M2-after",
    "M1-after"
  ]);
});

test("middleware can fail handlers", async () => {
  const FailingMiddleware = makeMiddleware({
    tag: Context.Tag<{}>(),
    apply: (handler) =>
      Effect.fail({ _tag: "MiddlewareFailed" as const })
  });

  const handler = Effect.succeed(42);
  const wrapped = FailingMiddleware.apply(handler);

  const result = await Effect.runPromiseExit(wrapped);

  expect(Exit.isFailure(result)).toBe(true);
  if (Exit.isFailure(result)) {
    expect(Cause.failureOption(result.cause)).toEqual(
      Option.some({ _tag: "MiddlewareFailed" })
    );
  }
});
```

---

## Type System Design

### Complex Type Utilities

**Path Type (Existing)**:

```typescript
// Already implemented in ConfectApiGroup.ts
export type Path<Groups> =
  | Groups["name"]
  | `${Groups["name"]}.${Path<Groups["groups"][keyof Groups["groups"]]>}`;

// Examples:
// Path<typeof Group4> = "group4" | "group4.group2" | "group4.group3" | "group4.group3.group5"
```

**WithPath Type (Existing)**:

```typescript
// Already implemented in ConfectApiGroup.ts
export type WithPath<Groups, P extends string> =
  P extends Groups["name"]
    ? Extract<Groups, { name: P }>
    : P extends `${infer Head}.${infer Tail}`
      ? Head extends Groups["name"]
        ? WithPath<
            Extract<Groups, { name: Head }>["groups"][keyof Extract<Groups, { name: Head }>["groups"]],
            Tail
          >
        : never
      : never;

// Examples:
// WithPath<Groups, "group4"> = Group4
// WithPath<Groups, "group4.group2"> = Group2 (nested in Group4)
```

**Handler Validation Type**:

```typescript
// Existing ValidateReturn
export type ValidateReturn<A> =
  A extends Handlers<infer _ConfectSchema, infer Functions>
    ? [Functions] extends [never]
      ? A
      : `Function not handled: ${ConfectApiFunction.Name<Functions>}`
    : "Must return the implemented handlers";

// Usage:
// type Valid = ValidateReturn<Handlers<Schema, never>>; // Valid = Handlers<...>
// type Invalid = ValidateReturn<Handlers<Schema, SomeFunction>>; // Invalid = "Function not handled: ..."
```

**Error Union Type**:

```typescript
// Compute all errors for a handler
export type HandlerErrors<
  Fn extends ConfectApiFunction.Any,
  ApiError,
  GroupError
> =
  | Fn["handlerError"]           // Function-specific errors
  | ApiError                      // API-level errors
  | GroupError                    // Group-level errors
  | ParseResult.ParseError;       // Schema validation errors

// Simplify union with UnionUnify pattern
export type SimplifyErrors<E> = E extends infer U
  ? { [K in keyof U]: U[K] } extends U
    ? U
    : never
  : never;
```

**Middleware Type Accumulation**:

```typescript
// Accumulate middleware requirements
export type AccumulateRequirements<
  ApiMiddleware extends ReadonlyArray<any>,
  GroupMiddleware extends ReadonlyArray<any>,
  FnMiddleware extends ReadonlyArray<any>
> =
  | MiddlewareRequirements<ApiMiddleware>
  | MiddlewareRequirements<GroupMiddleware>
  | MiddlewareRequirements<FnMiddleware>;

// Accumulate middleware errors
export type AccumulateErrors<
  ApiMiddleware extends ReadonlyArray<any>,
  GroupMiddleware extends ReadonlyArray<any>,
  FnMiddleware extends ReadonlyArray<any>
> =
  | MiddlewareErrors<ApiMiddleware>
  | MiddlewareErrors<GroupMiddleware>
  | MiddlewareErrors<FnMiddleware>;
```

---

## Effect Patterns

### Pattern Catalog

**1. Effect.gen for Async Flows**:

```typescript
// Use generator-style for sequential operations
const handler = (args: { id: string }) =>
  Effect.gen(function* () {
    const db = yield* ConfectDatabaseReader;
    const user = yield* db.table("users").get(args.id);

    if (!user) {
      return yield* Effect.fail({ _tag: "NotFound" as const });
    }

    const enriched = yield* enrichUser(user);
    return enriched;
  });
```

**2. pipe() for Composition**:

```typescript
// Use pipe for transformations
const handler = (args: { id: string }) =>
  pipe(
    getUser(args.id),
    Effect.andThen(enrichUser),
    Effect.andThen(formatUser),
    Effect.catchTag("NotFound", () => Effect.succeed(defaultUser))
  );
```

**3. Context Tags for Services**:

```typescript
// Define services as tags
export class UserService extends Context.Tag("@app/UserService")<
  UserService,
  {
    readonly getUser: (id: string) => Effect.Effect<User, NotFoundError, ConfectDatabaseReader>;
    readonly listUsers: () => Effect.Effect<ReadonlyArray<User>, never, ConfectDatabaseReader>;
  }
>() {}

// Use in handlers
const handler = () =>
  Effect.gen(function* () {
    const users = yield* UserService;
    return yield* users.listUsers();
  });
```

**4. Layer Composition**:

```typescript
// Compose layers with mergeAll
const QueryLayers = Layer.mergeAll(
  confectDatabaseReaderLayer(schema, ctx.db),
  ConfectAuth.layer(ctx.auth),
  ConfectStorageReader.layer(ctx.storage),
  confectQueryRunnerLayer(ctx.runQuery)
);

// Provide to handler
pipe(
  handler(args),
  Effect.provide(QueryLayers),
  Effect.runPromise
);
```

**5. Schema Validation**:

```typescript
// Decode input
const decoded = yield* Schema.decode(ArgsSchema)(input);

// Encode output
const encoded = yield* Schema.encode(ReturnsSchema)(output);

// Use orDie for bugs (invalid schemas)
const decoded = yield* Schema.decode(ArgsSchema)(input).pipe(Effect.orDie);
```

**6. Tagged Error Handling**:

```typescript
// Define tagged errors
const NotFoundError = Schema.Struct({
  _tag: Schema.Literal("NotFound"),
  id: Schema.String
});

const UnauthorizedError = Schema.Struct({
  _tag: Schema.Literal("Unauthorized"),
  message: Schema.String
});

// Catch specific tags
const handler = pipe(
  dangerousOperation,
  Effect.catchTag("NotFound", (e) => Effect.succeed(defaultValue)),
  Effect.catchTag("Unauthorized", (e) => Effect.fail(e))
);
```

**7. Effect.all for Parallelism**:

```typescript
// Run multiple effects in parallel
const handler = () =>
  Effect.gen(function* () {
    const [users, posts, comments] = yield* Effect.all([
      fetchUsers(),
      fetchPosts(),
      fetchComments()
    ], { concurrency: "unbounded" });

    return { users, posts, comments };
  });
```

---

## Data Flow

### Request Flow Diagram

```
User Code
   │
   ├─ Define API
   │    │
   │    ├─ ConfectApi.make("Api")
   │    ├─ .addError(UnauthorizedError)
   │    ├─ .middleware(LoggingMiddleware)
   │    └─ .add(Group)
   │         │
   │         ├─ ConfectApiGroup.make("group")
   │         └─ .add(Function)
   │              │
   │              └─ ConfectApiFunction.make("Query")({...})
   │
   ├─ Implement Handlers
   │    │
   │    └─ ConfectApiBuilder.group(Api, "group", (handlers) =>
   │         handlers
   │           .handle("fn1", handler1)  ← ValidateReturn enforces completeness
   │           .handle("fn2", handler2)
   │       )
   │         │
   │         └─ Returns Layer<GroupService>
   │
   ├─ Build API Layer
   │    │
   │    └─ ConfectApiBuilder.api(ApiWithDb)
   │         .pipe(Layer.provide(GroupLive))
   │         │
   │         └─ Returns Layer<ApiService>
   │
   ├─ Generate Server
   │    │
   │    └─ ConfectApiServer.make(ApiWithDb, ApiLive)
   │         │
   │         ├─ For each group:
   │         │    ├─ Get handlers from layer
   │         │    └─ For each handler:
   │         │         ├─ Collect middleware (API + Group + Function)
   │         │         ├─ Wrap handler with middleware
   │         │         └─ Create RegisteredQuery/Mutation/Action
   │         │
   │         └─ Returns { [TypeId]: TypeId, ...groups }
   │
   └─ Generate Client
        │
        └─ ConfectApiClient.make(Api, convexClient)
             │
             ├─ For each group:
             │    └─ For each function:
             │         ├─ Compile schemas (cached)
             │         └─ Return (args) => Effect<Result>
             │
             └─ Returns { group: { fn1, fn2 } }
```

### Runtime Execution Flow

```
Client Call: client.group.myFunction({ foo: 42 })
   │
   ├─ Encode args with cached schema
   │    └─ Schema.encodeUnknown(ArgsSchema)({ foo: 42 })
   │         └─ Result: { foo: 42 } (validated)
   │
   ├─ Call Convex function
   │    └─ convexClient.query("group__myFunction", { foo: 42 })
   │         │
   │         └─ Server receives request
   │              │
   │              ├─ Decode args
   │              │    └─ Schema.decode(ArgsSchema)({ foo: 42 })
   │              │
   │              ├─ Apply middleware (in order)
   │              │    ├─ API middleware (LoggingMiddleware)
   │              │    ├─ Group middleware (AuthMiddleware)
   │              │    └─ Function middleware (RateLimitMiddleware)
   │              │
   │              ├─ Execute handler
   │              │    └─ Effect.gen(function* () {
   │              │         const db = yield* ConfectDatabaseReader;
   │              │         const result = yield* db.query(...);
   │              │         return result;
   │              │       })
   │              │
   │              ├─ Encode result
   │              │    └─ Schema.encode(ReturnsSchema)(result)
   │              │
   │              └─ Return to client
   │
   ├─ Decode result with cached schema
   │    └─ Schema.decodeUnknown(ReturnsSchema)(response)
   │
   └─ Return Effect<Result, Errors, never>
```

---

## Implementation Approach

### Phase 1: Critical Fixes (1 hour)

**Order of Implementation**:

1. **Fix ConfectApiBuilder.group()** (15 min)
   - File: `packages/confect/src/api/ConfectApiBuilder.ts`
   - Lines: 138-165
   - Change: Use `build()` return value directly
   - Test: Verify handlers array populated

2. **Fix ConfectApiServer.make()** (15 min)
   - File: `packages/confect/src/api/ConfectApiServer.ts`
   - Lines: 186
   - Change: Return `{ [TypeId]: TypeId, ...serverGroups }`
   - Test: Verify server object structure

3. **Update Integration Test** (30 min)
   - File: `packages/confect/src/api/ConfectApi.test.ts`
   - Add comprehensive end-to-end test
   - Verify: API definition → handlers → server → client

**Verification**:
```bash
bun test packages/confect/src/api/ConfectApi.test.ts
```

---

### Phase 2: Reflection API (2 hours)

**Order of Implementation**:

1. **Define Types** (30 min)
   - Add `GroupReflectionContext` interface
   - Add `FunctionReflectionContext` interface
   - Add `ApiReflectionStructure` interface

2. **Implement reflect()** (60 min)
   - Recursive traversal of groups
   - Handle nested groups with path accumulation
   - Invoke callbacks with context

3. **Implement reflectToStructure()** (30 min)
   - Build on `reflect()` callback-based API
   - Accumulate data structure
   - Return complete reflection

4. **Add Tests** (30 min)
   - Test traversal order
   - Test nested group handling
   - Test callback invocation
   - Test data structure correctness

**Files**:
- `packages/confect/src/api/ConfectApi.ts` (add functions)
- `packages/confect/src/api/ConfectApi.test.ts` (add tests)

---

### Phase 3: Error Unification (5 hours)

**Order of Implementation**:

1. **Update ConfectApi Interface** (60 min)
   - Add `Error` type parameter
   - Add `errors` property
   - Add `addError()` method
   - Update prototype

2. **Implement Error Schema Unification** (60 min)
   - Add `unifyErrors()` function
   - Add `getErrorStatus()` function
   - Type-level error extraction

3. **Update Function Handler Types** (90 min)
   - Thread `ApiError` through handler types
   - Update `ConfectApiBuilder.group()` signature
   - Update `Handlers` interface

4. **Update Server Generation** (60 min)
   - Pass API errors to function builders
   - Handle API errors in handlers
   - Map errors to status codes

5. **Add Tests** (60 min)
   - Test error schema unification
   - Test error propagation to handlers
   - Test status code mapping
   - Test type-level error tracking

**Files**:
- `packages/confect/src/api/ConfectApi.ts`
- `packages/confect/src/api/ConfectApiFunction.ts`
- `packages/confect/src/api/ConfectApiBuilder.ts`
- `packages/confect/src/api/ConfectApiServer.ts`
- `packages/confect/src/api/error-unification.test.ts` (new)

---

### Phase 4: Schema Caching (2 hours)

**Order of Implementation**:

1. **Implement Cache** (30 min)
   - Create `globalValue` schema cache
   - Implement `getOrCompileSchema()` helper

2. **Update Client** (60 min)
   - Pre-compile schemas in `make()`
   - Use compiled schemas in returned functions
   - Verify cache hits

3. **Add Tests** (30 min)
   - Test cache functionality
   - Benchmark performance improvement
   - Verify WeakMap behavior

**Files**:
- `packages/confect/src/api/ConfectApiClient.ts`
- `packages/confect/src/api/schema-cache.test.ts` (new)

---

### Phase 5: Middleware System (7 hours)

**Order of Implementation**:

1. **Create Middleware Module** (90 min)
   - Define `ConfectApiMiddleware` interface
   - Implement `makeMiddleware()` helper
   - Define type utilities (`Service`, `Error`, etc.)

2. **Update API/Group/Function Interfaces** (120 min)
   - Add `Middleware` type parameter
   - Add `middleware` property
   - Add `middleware()` method
   - Update prototypes

3. **Implement Middleware Composition** (90 min)
   - Implement `applyMiddleware()` function
   - Implement `getAllMiddleware()` function
   - Type-level requirement/error accumulation

4. **Update Server Generation** (90 min)
   - Collect middleware from all levels
   - Apply middleware to handlers
   - Verify execution order

5. **Create Example Middleware** (60 min)
   - LoggingMiddleware implementation
   - AuthMiddleware implementation
   - RateLimitMiddleware implementation

6. **Add Tests** (90 min)
   - Test middleware definition
   - Test middleware attachment
   - Test execution order
   - Test type tracking
   - Test error handling

**Files**:
- `packages/confect/src/api/ConfectApiMiddleware.ts` (new)
- `packages/confect/src/api/ConfectApi.ts`
- `packages/confect/src/api/ConfectApiGroup.ts`
- `packages/confect/src/api/ConfectApiFunction.ts`
- `packages/confect/src/api/ConfectApiServer.ts`
- `packages/confect/src/api/middleware.test.ts` (new)
- `packages/confect/src/api/middleware-examples.test.ts` (new)

---

## Testing Strategy

### Test Pyramid

```
                  /\
                 /  \
                /E2E \           10% - Integration tests
               /------\
              /        \
             /  Unit    \        90% - Unit tests
            /____________\
```

### Unit Tests

**Coverage Requirements**: 100% for all new code

**Test Categories**:

1. **Type-Level Tests** (TypeScript compiler):
```typescript
// tests/types/api-types.test.ts
import { expectType } from "tsd";

test("ValidateReturn shows unhandled function error", () => {
  type Result = Handlers.ValidateReturn<Handlers<Schema, SomeFunction>>;
  expectType<"Function not handled: someFunctionName">(undefined as Result);
});

test("Error types propagate correctly", () => {
  type HandlerType = Handler<Schema, MyFunction, ApiError>;

  const handler: HandlerType = (args) =>
    Effect.fail({ _tag: "Unauthorized" as const, message: "test" });

  expectType<HandlerType>(handler);
});
```

2. **Handler Collection Tests**:
```typescript
// packages/confect/src/api/ConfectApiBuilder.test.ts

test("empty handlers created correctly", () => {
  const handlers = makeHandlers({
    group,
    handlers: Chunk.empty()
  });

  expect(handlers.handlers.length).toBe(0);
});

test("handle() accumulates handlers", () => {
  const result = makeHandlers({ group, handlers: Chunk.empty() })
    .handle("fn1", handler1)
    .handle("fn2", handler2);

  expect(result.handlers.length).toBe(2);
});

test("build callback returns populated handlers", () => {
  const result = build(
    makeHandlers({ group, handlers: Chunk.empty() })
  );

  expect(result.handlers.length).toBeGreaterThan(0);
});
```

3. **Reflection Tests**:
```typescript
// packages/confect/src/api/reflection.test.ts

test("reflect visits all groups", () => {
  const visited = new Set<string>();

  ConfectApi.reflect(Api, {
    onGroup: (ctx) => visited.add(ctx.path)
  });

  expect(visited.size).toBe(expectedGroupCount);
});

test("reflect handles nested groups", () => {
  const paths: string[] = [];

  ConfectApi.reflect(Api, {
    onFunction: (ctx) => paths.push(ctx.fullPath)
  });

  expect(paths).toContain("group4.group2.myFunction3");
});
```

4. **Error Unification Tests**:
```typescript
// packages/confect/src/api/error-unification.test.ts

test("addError adds to error union", () => {
  const Api = ConfectApi.make("Api")
    .addError(Error1)
    .addError(Error2);

  const schema = unifyErrors(Api);

  expect(Schema.is(schema)(error1)).toBe(true);
  expect(Schema.is(schema)(error2)).toBe(true);
});

test("error status codes mapped correctly", () => {
  const Api = ConfectApi.make("Api")
    .addError(UnauthorizedError, { status: 401 });

  const status = getErrorStatus(Api, { _tag: "Unauthorized", message: "" });

  expect(status).toBe(401);
});
```

5. **Schema Caching Tests**:
```typescript
// packages/confect/src/api/schema-cache.test.ts

test("schema compiled once", () => {
  const compileSpy = vi.spyOn(Schema, "encodeUnknown");

  const { encode } = getOrCompileSchema(TestSchema);
  encode(value1);
  encode(value2);

  expect(compileSpy).toHaveBeenCalledTimes(1);
});

test("cache uses WeakMap", () => {
  const schema1 = Schema.String;
  const schema2 = Schema.String;

  getOrCompileSchema(schema1);

  expect(schemaCache.has(schema1.ast)).toBe(true);
  expect(schemaCache.has(schema2.ast)).toBe(true); // Same AST
});
```

6. **Middleware Tests**:
```typescript
// packages/confect/src/api/middleware.test.ts

test("middleware wraps handler", async () => {
  let executed = false;

  const middleware = makeMiddleware({
    tag: TestTag,
    apply: (handler) =>
      Effect.gen(function* () {
        executed = true;
        return yield* handler;
      })
  });

  await Effect.runPromise(middleware.apply(Effect.succeed(42)));

  expect(executed).toBe(true);
});

test("middleware executes in order", async () => {
  const order: string[] = [];

  const wrapped = applyMiddleware(handler, [
    trackingMiddleware("M1", order),
    trackingMiddleware("M2", order)
  ]);

  await Effect.runPromise(wrapped);

  expect(order).toEqual(["M1-before", "M2-before", "M2-after", "M1-after"]);
});
```

### Integration Tests

**Coverage Requirements**: All critical paths

**Test Scenarios**:

1. **End-to-End API Workflow**:
```typescript
// packages/confect/src/api/ConfectApi.test.ts

test("complete API workflow", async () => {
  // 1. Define API
  const Api = ConfectApi.make("TestApi")
    .addError(UnauthorizedError)
    .middleware(LoggingMiddleware)
    .add(UsersGroup);

  // 2. Implement handlers
  const UsersGroupLive = ConfectApiBuilder.group(
    ApiWithDb,
    "users",
    (handlers) =>
      handlers
        .handle("getUser", getUserHandler)
        .handle("listUsers", listUsersHandler)
  );

  const ApiLive = ConfectApiBuilder.api(ApiWithDb)
    .pipe(Layer.provide(UsersGroupLive));

  // 3. Generate server
  const server = ConfectApiServer.make(ApiWithDb, ApiLive);

  // 4. Verify server structure
  expect(server.users.getUser).toBeDefined();
  expect(server.users.listUsers).toBeDefined();

  // 5. Generate client
  const client = ConfectApiClient.make(Api, convexClient);

  // 6. Make calls
  const user = await Effect.runPromise(
    client.users.getUser({ id: "123" })
  );

  expect(user).toBeDefined();
});
```

2. **Nested Groups**:
```typescript
test("nested groups work end-to-end", async () => {
  const Api = ConfectApi.make("Api").add(
    ConfectApiGroup.make("admin").addGroup(
      ConfectApiGroup.make("users").add(...)
    )
  );

  const server = ConfectApiServer.make(ApiWithDb, ApiLive);

  expect(server.admin.users.deleteUser).toBeDefined();
});
```

3. **Middleware Integration**:
```typescript
test("middleware applies across all levels", async () => {
  const logs: string[] = [];

  const logger = {
    log: (msg: string) => Effect.sync(() => logs.push(msg))
  };

  const Api = ConfectApi.make("Api")
    .middleware(LoggingMiddleware);

  // ... implement and call

  expect(logs).toContain("Handler started");
  expect(logs).toContain("Handler completed");
});
```

4. **Error Handling**:
```typescript
test("API errors propagate to client", async () => {
  const handler = () =>
    Effect.fail({ _tag: "Unauthorized" as const, message: "test" });

  // ... setup

  const result = await Effect.runPromiseExit(
    client.group.fn({ id: "123" })
  );

  expect(Exit.isFailure(result)).toBe(true);
  if (Exit.isFailure(result)) {
    const error = Cause.failureOption(result.cause);
    expect(error).toMatchObject({ _tag: "Unauthorized" });
  }
});
```

### Performance Tests

**Benchmarks**:

```typescript
// packages/confect/src/api/performance.test.ts

describe("Performance", () => {
  test("schema caching improves performance", async () => {
    const iterations = 1000;

    // Without caching (baseline)
    const baselineStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      Schema.encodeUnknownSync(TestSchema)(testValue);
    }
    const baselineDuration = performance.now() - baselineStart;

    // With caching
    const { encode } = getOrCompileSchema(TestSchema);
    const cachedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      Effect.runSync(encode(testValue));
    }
    const cachedDuration = performance.now() - cachedStart;

    // Should be >50% faster
    expect(cachedDuration).toBeLessThan(baselineDuration * 0.5);
  });

  test("middleware overhead acceptable", async () => {
    const noMiddleware = handler;
    const withMiddleware = applyMiddleware(handler, [
      LoggingMiddleware,
      AuthMiddleware
    ]);

    const noMidStart = performance.now();
    await Effect.runPromise(noMiddleware);
    const noMidDuration = performance.now() - noMidStart;

    const withMidStart = performance.now();
    await Effect.runPromise(withMiddleware);
    const withMidDuration = performance.now() - withMidStart;

    // Overhead should be <10ms
    expect(withMidDuration - noMidDuration).toBeLessThan(10);
  });
});
```

---

## Risk Analysis

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Type system complexity causes TS compiler slowdown** | Medium | High | Monitor compilation times, simplify types if needed |
| **WeakMap caching causes memory issues** | Low | Medium | Use WeakMap (automatic GC), add monitoring |
| **Middleware ordering bugs** | Medium | Medium | Comprehensive tests, clear documentation |
| **Breaking changes affect users** | High | Low | No backwards compat required per user |
| **Effect version incompatibility** | Low | High | Pin versions, test with multiple Effect versions |

### Implementation Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Underestimated complexity** | Medium | Medium | Phase-based approach, can defer Phase 5 if needed |
| **Test coverage gaps** | Low | High | 100% coverage requirement, code review |
| **Performance regressions** | Low | Medium | Benchmark tests, profiling |
| **Integration issues** | Low | High | Integration tests for all workflows |

---

## Open Questions - RESOLVED

All questions from requirements.md are now resolved in this design:

1. **Error Unification Details**: ✅ Discriminated unions with `_tag`, status code mapping
2. **Middleware Execution**: ✅ Async via Effect, fail = short-circuit, proper ordering
3. **Reflection API Format**: ✅ Callback-based primary API, data structure alternative
4. **Performance Targets**: ✅ >50% improvement for caching, <10ms middleware overhead
5. **Testing Strategy**: ✅ 90% unit / 10% integration, 100% coverage for critical paths

---

## Success Criteria

**Phase 1 (Critical Fixes)**:
- ✅ Handler collection works
- ✅ Server generation returns working object
- ✅ Integration test passes
- ✅ No TypeScript errors

**Phase 2 (Reflection)**:
- ✅ Can traverse all groups and functions
- ✅ Callbacks receive complete context
- ✅ Nested groups handled correctly
- ✅ Data structure alternative works

**Phase 3 (Error Unification)**:
- ✅ API can define errors with status codes
- ✅ Errors propagate to handlers
- ✅ Client types include all errors
- ✅ Tagged error handling works

**Phase 4 (Schema Caching)**:
- ✅ Schemas compiled once
- ✅ >50% performance improvement
- ✅ WeakMap allows GC
- ✅ No behavior changes

**Phase 5 (Middleware)**:
- ✅ Middleware can be defined
- ✅ Attach at API/Group/Function levels
- ✅ Executes in correct order
- ✅ Type system tracks requirements/errors
- ✅ Example middleware included

---

**Next Phase**: [plan.md](./plan.md) - Implementation roadmap and task breakdown

**Requires User Approval**: ✋ **Please review design and approve before proceeding to planning phase**
