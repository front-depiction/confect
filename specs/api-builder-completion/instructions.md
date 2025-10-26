# API Builder & Server Generation Completion

**Feature Status**: 🟡 In Progress (effect-contexts branch)
**Completion**: ~70%
**Created**: 2025-10-26
**Context**: Deep dive analysis of Effect RPC/HttpApi patterns for Confect optimization

---

## Executive Summary

The Confect API definition system (`ConfectApi*`) is architecturally sound with excellent type-level design, but has **two critical runtime implementation gaps** preventing the system from working end-to-end. Additionally, analysis of Effect's `@effect/rpc` and `@effect/platform` reveals several high-value patterns that could significantly enhance the developer experience.

### Critical Issues Blocking Completion

1. **ConfectApiBuilder.group()** (Line 138-165) - Handler collection incomplete
2. **ConfectApiServer.make()** (Line 186) - Server assembly returns placeholder

### What's Working Well

- ✅ Type system for nested groups with path syntax (`"group.subgroup.nested"`)
- ✅ Function type discrimination (Query/Mutation/Action)
- ✅ Client generation with Effect-based API
- ✅ Schema validation throughout
- ✅ Layer composition for dependency injection
- ✅ Compile-time handler validation with `ValidateReturn`

---

## Current State Analysis

### Architecture Overview

The API definition system consists of:

```
ConfectApi                    # Root API container
  └─ ConfectApiGroup          # Grouping with nested support
      └─ ConfectApiFunction   # Individual functions (Query/Mutation/Action)

ConfectApiBuilder             # Layer-based handler registration
ConfectApiServer              # Convex function generation
ConfectApiClient              # Effect-based client
```

### File-by-File Status

| File | Lines | Status | Issues |
|------|-------|--------|--------|
| **ConfectApi.ts** | 1-66 | ✅ Complete | None |
| **ConfectApiGroup.ts** | 1-201 | ✅ Complete | None (complex Path types working) |
| **ConfectApiFunction.ts** | 1-221 | ✅ Complete | None |
| **ConfectApiBuilder.ts** | 1-290 | 🟡 95% | **Lines 138, 142** - Empty handlers not populated |
| **ConfectApiServer.ts** | 1-397 | 🟡 30% | **Line 186** - Returns `hole<any>()` |
| **ConfectApiClient.ts** | 1-57 | ✅ Complete | Could add caching optimization |

### Recent Commits (effect-contexts branch)

- `be49550` - "Almost complete nested group support" ✅
- `63a180e` - "Beginnings of support for different function/handler types" ✅
- `3a4ef85` - "ConfectApi* draft" ✅

---

## Problem Deep Dive

### Problem 1: Handler Collection Not Working

**File**: `packages/confect/src/api/ConfectApiBuilder.ts`
**Lines**: 138-165

**Current Code**:
```typescript
export const group = <...>(...): Layer.Layer<...> => {
  // TODO
  const group = apiWithDatabaseSchema.api.groups[groupPath]!;
  const handlers = Chunk.empty(); // ← PROBLEM: Never populated!

  return Layer.succeed(
    ConfectApiGroupService(...),
    {
      apiName: apiWithDatabaseSchema.api.name,
      handlers: build(
        makeHandlers({ group, handlers }) // ← build() returns populated, but we ignore it
      ) as unknown as Handlers.FromGroup<...>,
    }
  );
};
```

**Why It's Broken**:
1. Creates `Chunk.empty()` handlers
2. Calls `build()` which should populate handlers via fluent `.handle()` calls
3. But doesn't capture the return value properly
4. The `build()` callback RETURNS the populated handlers object

**Test That Should Work** (ConfectApi.test.ts:65-72):
```typescript
const GroupLive = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "group",
  (handlers) =>
    handlers
      .handle("myFunction", (args) => Effect.succeed(`foo: ${args.foo}`))
      .handle("myFunction2", (args) => Effect.succeed(`foo: ${args.foo}`))
);
```

**Type System**: ✅ Working perfectly! The fluent API types narrow correctly.
**Runtime**: ❌ Handlers array stays empty.

---

### Problem 2: Server Generation Returns Placeholder

**File**: `packages/confect/src/api/ConfectApiServer.ts`
**Lines**: 93-189

**Current Code**:
```typescript
export const make = <...>(...): ConfectApiServer<Groups> => {
  return Effect.gen(function* () {
    const layerRuntime = yield* Layer.toRuntime(apiServiceLayer);

    return Runtime.runSync(layerRuntime, Effect.gen(function* () {
      const api = yield* ConfectApiBuilder.ConfectApiService(...);

      // TODO
      const a = Record.map(
        apiWithDatabaseSchema.api.groups,
        (group) => Effect.runSync(Effect.gen(function* () {
          const groupHandler = yield* api.groupHandler(group.name);

          return pipe(
            groupHandler.handlers,
            Array.map(({ function_: { functionType, name, args, returns }, handler }) => {
              // Creates RegisteredQuery/Mutation/Action correctly
              const registeredFunction = Match.value(functionType).pipe(...);
              return [name, registeredFunction] as const;
            }),
            Record.fromEntries
          );
        }))
      );

      return hole<any>(); // ← PROBLEM: Should return `{ [TypeId]: TypeId, ...a }`
    }));
  }).pipe(Effect.scoped, Effect.runSync);
};
```

**Why It's Broken**:
1. The variable `a` contains the correctly structured server object
2. But the function returns `hole<any>()` instead of the actual object
3. Simply needs to return `{ [TypeId]: TypeId, ...a } as ConfectApiServer<Groups>`

**Expected Return Type**:
```typescript
ConfectApiServer<Groups> = {
  [TypeId]: TypeId;
  group: {
    myFunction: RegisteredQuery<...>;
    myFunction2: RegisteredQuery<...>;
  };
  group4: {
    group2: { myFunction3: RegisteredQuery<...> };
    group3: { myFunction4: RegisteredQuery<...> };
  };
}
```

---

## Effect Pattern Analysis

### Patterns Studied

Deep dive into Effect-TS source code:
- `@effect/rpc/src/Rpc.ts` - RPC definition patterns
- `@effect/rpc/src/RpcServer.ts` - Server construction
- `@effect/platform/src/HttpApi.ts` - API composition
- `@effect/platform/src/HttpApiBuilder.ts` - Handler collection
- `@effect/platform/src/HttpApiClient.ts` - Client generation

### Key Patterns Discovered

#### 1. Handler Collection Pattern (HttpApiBuilder.ts)

**Effect's Approach**:
```typescript
const group = (build: (handlers: Handlers<...>) => Handlers.ValidateReturn) => {
  // Call build with empty handlers
  const result = build(makeHandlers({ endpoints: Chunk.empty() }));
  // result IS the populated handlers (via fluent .handle() calls)
  return Layer.succeed(GroupService, { handlers: result });
};
```

**Key Insight**: Trust the return value of `build()`. The fluent `.handle()` calls create a new handlers object each time with accumulated items.

**Confect's HandlersProto** (ConfectApiBuilder.ts:66-91):
```typescript
const HandlersProto = {
  handle(this: Handlers<...>, name: string, handler: ...) {
    const function_ = this.group.functions[name];
    return makeHandlers({
      group: this.group,
      handlers: [...this.handlers, { function_, handler }] as any, // ← Accumulates!
    });
  },
};
```

✅ **Already correct!** Just need to use the return value.

---

#### 2. Server Assembly Pattern (HttpApiBuilder.ts)

**Effect's Approach**:
```typescript
const serve = () => {
  const routes = Record.map(groups, (group) =>
    Array.map(group.handlers, (item) =>
      makeRoute(item.endpoint, item.handler)
    )
  );

  return {
    [TypeId]: TypeId,
    ...routes
  };
};
```

**Confect Already Has This Structure**: Variable `a` in ConfectApiServer.make() is correctly built. Just needs to be returned.

---

#### 3. Reflection API Pattern (HttpApi.ts)

**Effect's Approach**:
```typescript
export const reflect = <Api>(
  api: Api,
  callbacks: {
    onGroup?: (group: HttpApiGroup) => void;
    onEndpoint?: (endpoint: HttpApiEndpoint) => void;
  }
): void => {
  Record.forEach(api.groups, (group) => {
    callbacks.onGroup?.(group);
    Record.forEach(group.endpoints, (endpoint) => {
      callbacks.onEndpoint?.(endpoint);
    });
  });
};
```

**Use Cases**:
- OpenAPI/Swagger generation
- TypeScript client generation
- Runtime validation
- Debugging tools

**Confect Status**: ❌ Not implemented

---

#### 4. Error Unification Pattern (HttpApi.ts)

**Effect's Approach**:
```typescript
export interface HttpApi<Endpoints, Error> {
  readonly errorSchema: Schema.Schema<Error>;

  addError<E>(
    error: Schema.Schema<E>,
    options: { status: number }
  ): HttpApi<Endpoints, Error | E>;
}

// Combines: API errors + Group errors + Endpoint errors
const unifiedError = HttpApiSchema.UnionUnify()(
  Schema.Union(apiError, groupError, endpointError)
);
```

**Benefits**:
- Type-safe error handling across entire API
- Client knows all possible error types
- HTTP status code mapping
- Better error documentation

**Confect Status**: ⚠️ Partial - each handler has error type `E`, but no unification

---

#### 5. Middleware Pattern (RpcServer.ts)

**Effect RPC Approach**:
```typescript
export interface Rpc<...> {
  readonly middleware: HashSet<RpcMiddleware.TagClassAny>;

  middleware<M>(middleware: M): Rpc<...>;
}

// Server applies middleware sequentially
const applyMiddleware = (rpc: Rpc, handler: Effect) => {
  return HashSet.reduce(
    rpc.middleware,
    handler,
    (acc, mid) => mid.apply(acc)
  );
};
```

**Use Cases**:
- Authentication/authorization
- Logging and monitoring
- Rate limiting
- Request/response transformation

**Confect Status**: ❌ No middleware support

---

#### 6. Schema Caching Pattern (HttpApiClient.ts)

**Effect's Approach**:
```typescript
const schemaCache = globalValue(
  Symbol.for("@effect/platform/HttpApiClient/schemaCache"),
  () => new WeakMap<Schema.AST, CompiledSchema>()
);

const getOrCompile = (schema: Schema.Schema) => {
  const cached = schemaCache.get(schema.ast);
  if (cached) return cached;

  const compiled = {
    encode: Schema.encodeUnknown(schema),
    decode: Schema.decodeUnknown(schema)
  };
  schemaCache.set(schema.ast, compiled);
  return compiled;
};
```

**Benefits**:
- Avoid recompiling schemas on every call
- Significant performance improvement
- Memory efficient (WeakMap allows GC)

**Confect Status**: ❌ No caching in client

---

#### 7. Streaming Support Pattern (Rpc.ts)

**Effect RPC Approach**:
```typescript
export interface Rpc<...> {
  readonly stream: boolean;
}

// Different return types based on streaming flag
type Returns<R> = R extends { stream: true }
  ? Stream.Stream<SuccessType, Error>
  : Effect.Effect<SuccessType, Error>;
```

**Confect Application**:
- Convex supports streaming queries
- Could enable real-time subscriptions
- Stream-aware error handling

**Confect Status**: ❌ Not implemented (future feature)

---

## Comparison Matrix: Effect vs Confect

| Feature | Effect HttpApi | Effect RPC | Confect Status | Priority |
|---------|---------------|-----------|----------------|----------|
| **Handler Collection** | ✅ Chunk accumulation | ✅ Context storage | 🟡 Type ✅, Runtime ❌ | 🔴 **CRITICAL** |
| **Server Assembly** | ✅ Router generation | ✅ Tag-based lookup | 🟡 Logic ✅, Return ❌ | 🔴 **CRITICAL** |
| **Type Validation** | ✅ ValidateReturn | ✅ Handler typing | ✅ Complete | ✅ Done |
| **Nested Groups** | ✅ Hierarchical | N/A | ✅ Complete | ✅ Done |
| **Context Layers** | ✅ Layer system | ✅ Context merge | ✅ Layer.mergeAll | ✅ Done |
| **Reflection API** | ✅ reflect() | N/A | ❌ Missing | 🟡 High |
| **Error Unification** | ✅ UnionUnify | ✅ exitSchema | ⚠️ Per-handler only | 🟡 High |
| **Schema Caching** | ✅ WeakMap cache | N/A | ❌ No caching | 🟡 High |
| **Middleware** | ✅ Tag-based | ✅ HashSet | ❌ No support | 🟢 Medium |
| **Streaming** | N/A | ✅ Stream flag | ❌ No support | 🟢 Low (future) |

**Legend**:
- 🔴 Critical - Blocks basic functionality
- 🟡 High - Significantly improves DX
- 🟢 Medium/Low - Nice to have

---

## User Stories & Acceptance Criteria

### US-1: Basic API Definition Works End-to-End

**As a** Confect user
**I want to** define an API with groups and functions declaratively
**So that** I can generate both server and client code from a single source of truth

**Acceptance Criteria**:
1. ✅ Define API with nested groups using dot-path syntax
2. ✅ Define functions with type discrimination (Query/Mutation/Action)
3. ❌ Implement handlers using fluent builder API
4. ❌ Generate working Convex server functions
5. ✅ Generate type-safe Effect-based client
6. ❌ Handler validation enforces all functions are implemented

**Current Blockers**: Problems #1 and #2

---

### US-2: Developer Gets Helpful Compile-Time Errors

**As a** Confect developer
**I want to** see clear TypeScript errors when I forget to handle a function
**So that** I don't accidentally deploy incomplete APIs

**Acceptance Criteria**:
1. ✅ Unhandled functions show: `Function not handled: ${name}`
2. ✅ Type system prevents accessing non-existent functions
3. ✅ Nested group paths are validated at compile-time
4. ✅ Handler types match function requirements

**Status**: ✅ Complete (ValidateReturn pattern working)

---

### US-3: OpenAPI Documentation Auto-Generation

**As a** API maintainer
**I want to** automatically generate OpenAPI/Swagger docs
**So that** external consumers can integrate with my API

**Acceptance Criteria**:
1. ❌ Reflection API can iterate all groups/functions
2. ❌ Extract schemas for args/returns
3. ❌ Generate OpenAPI 3.0 specification
4. ❌ Include function types in documentation

**Status**: ❌ Blocked by missing Reflection API

---

### US-4: Unified Error Handling

**As a** API consumer
**I want to** know all possible errors an API can return
**So that** I can handle them appropriately

**Acceptance Criteria**:
1. ❌ API-level errors defined once, apply to all functions
2. ❌ Group-level errors scoped to group
3. ❌ Function-level errors most specific
4. ❌ Client types include all error possibilities
5. ❌ HTTP status codes mapped to error types

**Status**: ❌ Not implemented

---

### US-5: Cross-Cutting Concerns via Middleware

**As a** API developer
**I want to** apply authentication, logging, etc. across multiple functions
**So that** I don't repeat code in every handler

**Acceptance Criteria**:
1. ❌ Define middleware as Context tags
2. ❌ Attach middleware to API/Group/Function level
3. ❌ Middleware executes in defined order
4. ❌ Middleware can provide additional context to handlers
5. ❌ Type system tracks middleware requirements

**Status**: ❌ Not implemented

---

### US-6: High-Performance Client

**As a** API consumer
**I want to** make API calls without performance overhead
**So that** my application remains responsive

**Acceptance Criteria**:
1. ❌ Schemas compiled once, cached for reuse
2. ❌ No unnecessary schema recompilation on each call
3. ❌ WeakMap ensures memory efficiency
4. ✅ Effect-based API for composability

**Status**: ⚠️ Functional but not optimized

---

## Technical Constraints

### Must Maintain
1. **Effect-First Design**: All APIs return `Effect.Effect<A, E, R>`
2. **Type Safety**: Compile-time guarantees for all operations
3. **Convex Compatibility**: Generated functions work with Convex runtime
4. **Layer Composition**: Use Effect's Layer system for DI
5. **Schema Validation**: `@effect/schema` for all data validation

### Cannot Break
1. Existing `confectQuery`, `confectMutation`, `confectAction` APIs
2. Current database schema definition system
3. HTTP API integration (`/src/server/http.ts`)
4. Test suite must continue passing

### Performance Requirements
1. Schema compilation should be cached
2. No runtime overhead for type-level operations
3. Layer composition should be efficient

---

## Dependencies

### External Packages
- ✅ `effect`: ^3.17.6 (core runtime)
- ✅ `@effect/platform`: ^0.90.0 (HTTP API)
- ✅ `@effect/rpc`: ^0.68.3 (installed but unused)
- ✅ `convex`: ^1.25.4 (backend)

### Internal Dependencies
- `../server/schema.ts` - Schema definitions
- `../server/database.ts` - Database layers
- `../server/functions.ts` - Function handlers
- `../server/auth.ts` - Auth layer
- `../server/storage.ts` - Storage layer
- `../server/runners.ts` - Function runners

### Type Dependencies
- Nested group path resolution (`ConfectApiGroup.Path<>`)
- Function type discrimination (`Query | Mutation | Action`)
- Handler validation (`Handlers.ValidateReturn<>`)

---

## Questions & Clarifications Needed

### Critical Questions

1. **Handler Collection Design**:
   - Should we trust the `build()` callback return value as-is?
   - Or do we need additional validation/transformation?
   - Current assumption: Trust it (matches Effect pattern)

2. **Server Return Type**:
   - Should nested groups be flattened or maintain hierarchy?
   - Current: Maintains hierarchy (`server.group4.group2.myFunction`)
   - Alternative: Flatten to single level?

3. **Error Handling Strategy**:
   - Should we implement Effect's error unification now or later?
   - How should Convex errors map to Effect errors?
   - Should we maintain backward compatibility with current error handling?

### Enhancement Scope Questions

4. **Reflection API Priority**:
   - Is OpenAPI generation a must-have or nice-to-have?
   - Should reflection support nested groups immediately?
   - What other use cases should reflection support?

5. **Middleware Scope**:
   - Should middleware be function-level only or also API/Group level?
   - How should middleware interact with Convex's auth system?
   - Should we support async middleware?

6. **Caching Strategy**:
   - Is WeakMap-based schema caching acceptable?
   - Should we expose cache invalidation API?
   - Any concerns about memory usage?

7. **Streaming Support**:
   - Is this needed for initial release?
   - How should Convex streaming queries map to Effect Streams?
   - Should we support both polling and streaming?

### Backward Compatibility

8. **Migration Path**:
   - Should old `confectQuery()` style continue to work?
   - Or should we provide migration guide only?
   - How do we handle projects using both styles?

9. **Breaking Changes**:
   - Are we willing to accept breaking changes for better design?
   - What's the versioning strategy (major bump)?
   - Need deprecation period?

---

## Success Metrics

### Immediate (Critical Fixes)
- [ ] `ConfectApiServer.make()` returns working server object
- [ ] Handlers are correctly collected from builder
- [ ] Integration test passes (ConfectApi.test.ts line 106)
- [ ] No TypeScript errors in API definition workflow

### Short-Term (High-Value Enhancements)
- [ ] Reflection API implemented and tested
- [ ] Schema caching improves client performance by 50%+
- [ ] Error unification provides single source of error types
- [ ] OpenAPI documentation auto-generated

### Long-Term (Full Feature Parity)
- [ ] Middleware system supports common use cases
- [ ] Streaming support for real-time features
- [ ] Developer documentation complete
- [ ] Migration guide from old API style

---

## Related Documentation

### Effect-TS Documentation
- [Effect RPC](https://effect-ts.github.io/effect/rpc/Rpc.ts.html)
- [HttpApi Module](https://effect-ts.github.io/effect/platform/HttpApi.ts.html)
- [Schema Documentation](https://effect-ts.github.io/effect/schema/)

### Confect Existing Docs
- `/packages/confect/README.md` - Package overview
- `/apps/docs/` - GitBook documentation
- `/apps/example/` - Example application

### Source Code References
- `packages/confect/src/api/` - API definition system
- `packages/confect/src/server/` - Server infrastructure
- `packages/confect/test/` - Test suite

---

## Implementation Notes

### Quick Wins (Estimated: 30 minutes)
1. Fix `ConfectApiBuilder.group()` - Use `build()` return value
2. Fix `ConfectApiServer.make()` - Return assembled object

### Medium Complexity (Estimated: 2-4 hours each)
3. Add Reflection API
4. Add Schema Caching
5. Add Error Unification

### High Complexity (Estimated: 4-8 hours each)
6. Add Middleware System
7. Add Streaming Support
8. OpenAPI Generation

### Architecture Decisions to Make
- Error handling strategy (unification vs current)
- Middleware attachment points (API/Group/Function)
- Caching invalidation strategy
- Streaming integration approach

---

## Appendix: Code Snippets

### Current Test Case (ConfectApi.test.ts)

```typescript
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

const server = ConfectApiServer.make(ApiWithDatabaseSchema, ApiLive);
// ^ Currently returns hole<any>(), should return working server
```

### Expected Server Type

```typescript
{
  [TypeId]: TypeId;
  group: {
    myFunction: RegisteredQuery<
      "public",
      { foo: number },
      string
    >;
    myFunction2: RegisteredQuery<...>;
  };
  group4: {
    group2: { myFunction3: RegisteredQuery<...> };
    group3: { myFunction4: RegisteredQuery<...> };
  };
}
```

### Handler Collection Flow

```typescript
// 1. Start with empty handlers
makeHandlers({ group, handlers: Chunk.empty() })

// 2. Call build() callback
build(handlers) // User calls .handle() multiple times

// 3. Each .handle() returns new object
handlers.handle("fn1", ...) // Returns makeHandlers({ handlers: [item1] })
  .handle("fn2", ...) // Returns makeHandlers({ handlers: [item1, item2] })

// 4. Final result has all handlers
// Result: { handlers: [item1, item2], ... }
```

---

**Next Steps**: After review, proceed to `requirements.md` to structure these findings into formal requirements.
