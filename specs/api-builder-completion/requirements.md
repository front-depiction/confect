# Requirements: API Builder & Server Generation Completion

**Feature**: api-builder-completion
**Phase**: 2 - Requirements
**Status**: 🔴 Blocking Issues → 🟢 Full Feature Complete
**Derived From**: [instructions.md](./instructions.md)

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-26 | Claude | Initial requirements derived from instructions |

---

## Scope Statement

**In Scope**:
- ✅ Fix critical runtime bugs in handler collection and server generation
- ✅ Implement Effect-inspired enhancements (Reflection, Caching, Error Unification, Middleware)
- ✅ Breaking changes allowed for better design
- ✅ Complete feature parity with Effect's HttpApi/RPC patterns

**Out of Scope**:
- ❌ Backwards compatibility with current API
- ❌ Migration tooling from old API style
- ❌ Deprecation warnings or dual-mode support
- ❌ Streaming support (deferred to future release)

**Assumptions**:
- Effect ecosystem patterns are the gold standard
- Type safety is paramount, runtime overhead acceptable if needed
- Developer experience more important than migration concerns
- Tests can be updated to match new API

---

## Functional Requirements

### FR-1: Critical Fixes

#### FR-1.1: Handler Collection Must Work
**Priority**: 🔴 P0 - Blocking
**File**: `packages/confect/src/api/ConfectApiBuilder.ts`
**Lines**: 138-165

**Requirement**:
The `ConfectApiBuilder.group()` function MUST correctly collect handlers from the `build()` callback and populate the returned layer's service with those handlers.

**Current Behavior** (BROKEN):
```typescript
const handlers = Chunk.empty(); // Never populated
return Layer.succeed(GroupService, {
  handlers: build(makeHandlers({ group, handlers })) // build() result ignored
});
```

**Required Behavior**:
```typescript
const populatedHandlers = build(makeHandlers({
  group,
  handlers: Chunk.empty()
}));
return Layer.succeed(GroupService, {
  handlers: populatedHandlers
});
```

**Acceptance Criteria**:
1. ✅ `build()` callback receives empty handlers object
2. ✅ Fluent `.handle()` calls accumulate handlers into array
3. ✅ `build()` return value contains all registered handlers
4. ✅ Layer service provides populated handlers to downstream consumers
5. ✅ Type system ensures all functions are handled (ValidateReturn)

**Test Case**:
```typescript
const GroupLive = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "group",
  (handlers) =>
    handlers
      .handle("myFunction", (args) => Effect.succeed(`foo: ${args.foo}`))
      .handle("myFunction2", (args) => Effect.succeed(`foo: ${args.foo}`))
);

// GroupLive service MUST contain 2 handlers
const result = yield* ConfectApiGroupService({ apiName: "Api", group });
expect(result.handlers.length).toBe(2);
```

**Dependencies**: None (standalone fix)

---

#### FR-1.2: Server Generation Must Return Working Object
**Priority**: 🔴 P0 - Blocking
**File**: `packages/confect/src/api/ConfectApiServer.ts`
**Lines**: 93-189

**Requirement**:
The `ConfectApiServer.make()` function MUST return a properly typed server object containing all registered Convex functions, NOT a placeholder.

**Current Behavior** (BROKEN):
```typescript
const a = Record.map(groups, ...); // Correct structure
return hole<any>(); // ← Returns placeholder!
```

**Required Behavior**:
```typescript
const server = Record.map(groups, (group) =>
  // ... build group functions
);
return { [TypeId]: TypeId, ...server } as ConfectApiServer<Groups>;
```

**Acceptance Criteria**:
1. ✅ Returns object with TypeId for runtime type checking
2. ✅ Contains all groups as top-level properties
3. ✅ Each group contains all its functions as properties
4. ✅ Functions are RegisteredQuery/Mutation/Action types (Convex-compatible)
5. ✅ Nested groups maintain hierarchy (group4.group2.myFunction)
6. ✅ Type signature matches `ConfectApiServer<Groups>`

**Test Case**:
```typescript
const server = ConfectApiServer.make(ApiWithDatabaseSchema, ApiLive);

// Must have TypeId
expect(server[TypeId]).toBe(TypeId);

// Must have all groups
expect(server.group).toBeDefined();
expect(server.group4).toBeDefined();

// Must have all functions
expect(server.group.myFunction).toBeDefined();
expect(server.group.myFunction2).toBeDefined();

// Nested groups must work
expect(server.group4.group2.myFunction3).toBeDefined();
```

**Dependencies**: FR-1.1 (needs working handler collection)

---

### FR-2: Reflection API

#### FR-2.1: API Introspection
**Priority**: 🟡 P1 - High Value
**File**: `packages/confect/src/api/ConfectApi.ts` (new function)

**Requirement**:
The system MUST provide a `reflect()` function that enables introspection of the API structure, allowing programmatic access to all groups, functions, and their metadata.

**Inspired By**: `@effect/platform/HttpApi.reflect()`

**API Design**:
```typescript
export const reflect = <
  ApiName extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps
>(
  api: ConfectApi<ApiName, Groups>,
  callbacks: {
    onGroup?: (group: ConfectApiGroup.ConfectApiGroup.AnyWithProps) => void;
    onFunction?: (
      fn: ConfectApiFunction.ConfectApiFunction.AnyWithProps,
      groupName: string,
      path: string // e.g., "group4.group2"
    ) => void;
  }
): void;
```

**Acceptance Criteria**:
1. ✅ Iterates all top-level groups
2. ✅ Recursively traverses nested groups
3. ✅ Invokes `onGroup` callback for each group with metadata
4. ✅ Invokes `onFunction` callback for each function with:
   - Function definition (name, args schema, returns schema, type)
   - Parent group name
   - Full path (for nested groups)
5. ✅ Handles empty groups gracefully
6. ✅ Preserves group hierarchy in callbacks

**Use Cases**:
- OpenAPI/Swagger documentation generation
- TypeScript client generation
- Runtime validation tools
- Debugging and development tools
- API documentation websites

**Test Case**:
```typescript
const groups: string[] = [];
const functions: Array<{ name: string; path: string }> = [];

ConfectApi.reflect(Api, {
  onGroup: (group) => groups.push(group.name),
  onFunction: (fn, groupName, path) =>
    functions.push({ name: fn.name, path })
});

expect(groups).toContain("group");
expect(groups).toContain("group4");
expect(groups).toContain("group2");

expect(functions).toContainEqual({ name: "myFunction", path: "group" });
expect(functions).toContainEqual({ name: "myFunction3", path: "group4.group2" });
```

**Dependencies**: None (reads existing structure)

---

### FR-3: Error Unification

#### FR-3.1: API-Level Error Schema
**Priority**: 🟡 P1 - High Value
**File**: `packages/confect/src/api/ConfectApi.ts` (modify interface)

**Requirement**:
The `ConfectApi` interface MUST support defining API-wide error schemas that apply to all functions, with the ability to add additional errors incrementally.

**Inspired By**: `@effect/platform/HttpApi.addError()`

**API Design**:
```typescript
export interface ConfectApi<
  Name extends string,
  Groups extends ConfectApiGroup.ConfectApiGroup.AnyWithProps,
  Error = never  // ← NEW: Error type parameter
> {
  readonly name: Name;
  readonly groups: Record.ReadonlyRecord<string, Groups>;
  readonly errorSchema: Schema.Schema<Error>;  // ← NEW

  addError<E>(
    error: Schema.Schema<E>,
    options?: { status?: number }  // HTTP status code for API errors
  ): ConfectApi<Name, Groups, Error | E>;
}
```

**Acceptance Criteria**:
1. ✅ API can define zero or more error types
2. ✅ `addError()` creates union of existing + new error
3. ✅ Error schema includes status code mapping
4. ✅ All functions inherit API-level errors
5. ✅ Function-specific errors union with API errors
6. ✅ Client types reflect all possible errors

**Type Behavior**:
```typescript
const Api = ConfectApi.make("Api")
  .addError(Schema.Struct({ _tag: Schema.Literal("Unauthorized") }), { status: 401 })
  .addError(Schema.Struct({ _tag: Schema.Literal("RateLimited") }), { status: 429 });

// Error type becomes: Unauthorized | RateLimited

const handler = (args) => Effect.fail({ _tag: "Unauthorized" as const });
// ✅ Type-safe: handler can return API-level errors
```

**Test Case**:
```typescript
const ApiWithErrors = ConfectApi.make("Api")
  .addError(UnauthorizedError)
  .addError(RateLimitError);

const schema = ApiWithErrors.errorSchema;
const errors = Schema.decodeUnknownSync(schema)({ _tag: "Unauthorized" });
expect(errors._tag).toBe("Unauthorized");
```

**Dependencies**: None (additive feature)

---

#### FR-3.2: Error Propagation to Handlers
**Priority**: 🟡 P1 - High Value
**File**: `packages/confect/src/api/ConfectApiFunction.ts` (modify handler types)

**Requirement**:
Function handlers MUST automatically include API-level errors in their error channel, enabling type-safe error handling without manual propagation.

**Current Behavior**:
```typescript
handler: (a: Args) => Effect.Effect<Returns, E, Requirements>
// E is function-specific only
```

**Required Behavior**:
```typescript
handler: (a: Args) => Effect.Effect<Returns, E | ApiError, Requirements>
// E is function-specific + API-level errors
```

**Acceptance Criteria**:
1. ✅ Handler error type automatically includes API errors
2. ✅ Handlers can return API-level errors without casting
3. ✅ Client types show union of all error possibilities
4. ✅ Type errors if handler returns non-declared error
5. ✅ Effect.catchTag works with error discriminated unions

**Test Case**:
```typescript
const myFunction = ConfectApiFunction.make("Query")({
  name: "getUser",
  args: UserIdArgs,
  returns: UserSchema,
});

// Handler can return API-level errors
const handler = (args) =>
  Effect.gen(function* () {
    const user = yield* findUser(args.id);
    if (!user) {
      return yield* Effect.fail({
        _tag: "Unauthorized" as const  // API-level error
      });
    }
    return user;
  });

// Type-checks successfully
myFunction.handler = handler;
```

**Dependencies**: FR-3.1 (needs error schema)

---

### FR-4: Schema Caching

#### FR-4.1: Client-Side Schema Compilation Cache
**Priority**: 🟡 P1 - High Value
**File**: `packages/confect/src/api/ConfectApiClient.ts`

**Requirement**:
The client MUST cache compiled schemas using a WeakMap to avoid recompiling schemas on every function call, significantly improving performance.

**Inspired By**: `@effect/platform/HttpApiClient` schema caching

**Implementation Design**:
```typescript
const schemaCache = globalValue(
  Symbol.for("@rjdellecese/confect/ConfectApiClient/schemaCache"),
  () => new WeakMap<Schema.AST, {
    encode: (a: any) => Effect.Effect<any, ParseResult.ParseError>,
    decode: (u: unknown) => Effect.Effect<any, ParseResult.ParseError>
  }>()
);

const getOrCompileSchema = <A, I>(schema: Schema.Schema<A, I>) => {
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

**Acceptance Criteria**:
1. ✅ Schema compiled once per unique schema AST
2. ✅ WeakMap allows garbage collection of unused schemas
3. ✅ Cache is global (shared across client instances)
4. ✅ Both encode and decode operations cached
5. ✅ No observable behavior change (transparent optimization)
6. ✅ Performance improves by >50% for repeated calls

**Performance Test**:
```typescript
const client = ConfectApiClient.make(Api, convexClient);

// First call compiles schema
const start1 = performance.now();
await Effect.runPromise(client.group.myFunction({ foo: 1 }));
const duration1 = performance.now() - start1;

// Second call uses cache
const start2 = performance.now();
await Effect.runPromise(client.group.myFunction({ foo: 2 }));
const duration2 = performance.now() - start2;

expect(duration2).toBeLessThan(duration1 * 0.5); // >50% faster
```

**Dependencies**: None (optimization)

---

### FR-5: Middleware Support

#### FR-5.1: Middleware Definition
**Priority**: 🟢 P2 - Medium Value
**File**: `packages/confect/src/api/ConfectApiMiddleware.ts` (new file)

**Requirement**:
The system MUST support defining middleware as Effect Context tags that can wrap handlers to provide cross-cutting functionality.

**Inspired By**: `@effect/rpc/RpcMiddleware`

**API Design**:
```typescript
export interface ConfectApiMiddleware<Tag, Service, Error = never> {
  readonly tag: Tag;
  readonly apply: <A, E, R>(
    handler: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | Error, R | Service>;
}

// Example middleware
export class LoggingMiddleware extends Context.Tag("@confect/LoggingMiddleware")<
  LoggingMiddleware,
  {
    log: (message: string, meta?: Record<string, unknown>) => Effect.Effect<void>;
  }
>() {
  static middleware = (): ConfectApiMiddleware<
    typeof LoggingMiddleware,
    LoggingMiddleware
  > => ({
    tag: LoggingMiddleware,
    apply: (handler) =>
      Effect.gen(function* () {
        const logger = yield* LoggingMiddleware;
        yield* logger.log("Handler started");
        const result = yield* handler;
        yield* logger.log("Handler completed");
        return result;
      })
  });
}
```

**Acceptance Criteria**:
1. ✅ Middleware defined as Context tags
2. ✅ Middleware can wrap handler effects
3. ✅ Middleware can add requirements to handlers
4. ✅ Middleware can add errors to handlers
5. ✅ Multiple middleware compose in order
6. ✅ Type system tracks middleware requirements/errors

**Test Case**:
```typescript
const LoggingMiddleware = Context.Tag<{ log: (msg: string) => Effect.Effect<void> }>();

const loggingMiddleware = ConfectApiMiddleware.make({
  tag: LoggingMiddleware,
  apply: (handler) =>
    Effect.gen(function* () {
      const logger = yield* LoggingMiddleware;
      yield* logger.log("Starting");
      const result = yield* handler;
      yield* logger.log("Done");
      return result;
    })
});

// Middleware adds LoggingMiddleware to requirements
type MiddlewareRequires = ConfectApiMiddleware.Requirements<typeof loggingMiddleware>;
// MiddlewareRequires = LoggingMiddleware
```

**Dependencies**: None (new feature)

---

#### FR-5.2: Middleware Attachment Points
**Priority**: 🟢 P2 - Medium Value
**File**: Multiple (`ConfectApi.ts`, `ConfectApiGroup.ts`, `ConfectApiFunction.ts`)

**Requirement**:
The system MUST allow attaching middleware at three levels: API-wide, Group-wide, and Function-specific, with proper composition and inheritance.

**API Design**:
```typescript
// API-level
const Api = ConfectApi.make("Api")
  .middleware(LoggingMiddleware.middleware());

// Group-level (inherits API middleware + adds own)
const Group = ConfectApiGroup.make("group")
  .middleware(AuthMiddleware.middleware());

// Function-level (inherits API + Group + adds own)
const Fn = ConfectApiFunction.make("Query")({
  name: "fn",
  args: Schema.Struct({}),
  returns: Schema.String,
}).middleware(RateLimitMiddleware.middleware());
```

**Middleware Execution Order**:
1. API-level middleware (outermost)
2. Group-level middleware
3. Function-level middleware (innermost)
4. Handler execution

**Acceptance Criteria**:
1. ✅ API middleware applies to all functions
2. ✅ Group middleware applies to all functions in group
3. ✅ Function middleware applies to specific function only
4. ✅ Middleware composes in correct order
5. ✅ Type system accumulates requirements from all levels
6. ✅ Each level can have multiple middleware

**Test Case**:
```typescript
let executionOrder: string[] = [];

const TrackingMiddleware = (name: string) =>
  ConfectApiMiddleware.make({
    apply: (handler) =>
      Effect.gen(function* () {
        executionOrder.push(`${name}-before`);
        const result = yield* handler;
        executionOrder.push(`${name}-after`);
        return result;
      })
  });

const Api = ConfectApi.make("Api")
  .middleware(TrackingMiddleware("api"));

const Group = ConfectApiGroup.make("group")
  .middleware(TrackingMiddleware("group"))
  .add(
    ConfectApiFunction.make("Query")({
      name: "fn",
      args: Schema.Struct({}),
      returns: Schema.String,
    }).middleware(TrackingMiddleware("function"))
  );

// Execute handler
await executeHandler();

expect(executionOrder).toEqual([
  "api-before",
  "group-before",
  "function-before",
  "function-after",
  "group-after",
  "api-after"
]);
```

**Dependencies**: FR-5.1 (middleware definition)

---

### FR-6: Integration & End-to-End

#### FR-6.1: Complete API Workflow
**Priority**: 🔴 P0 - Blocking
**File**: Test file (`packages/confect/src/api/ConfectApi.test.ts`)

**Requirement**:
The entire API definition workflow MUST work end-to-end: define API → implement handlers → generate server → generate client → make calls.

**Workflow Steps**:
```typescript
// 1. Define API
const Api = ConfectApi.make("Api")
  .addError(UnauthorizedError, { status: 401 })
  .middleware(LoggingMiddleware.middleware())
  .add(
    ConfectApiGroup.make("users")
      .add(
        ConfectApiFunction.make("Query")({
          name: "getUser",
          args: Schema.Struct({ id: Schema.String }),
          returns: UserSchema,
        })
      )
  );

// 2. Implement handlers
const UsersGroupLive = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "users",
  (handlers) =>
    handlers.handle("getUser", (args) =>
      Effect.gen(function* () {
        const db = yield* ConfectDatabaseReader;
        return yield* db.table("users").get(args.id);
      })
    )
);

const ApiLive = ConfectApiBuilder.api(ApiWithDatabaseSchema)
  .pipe(Layer.provide(UsersGroupLive));

// 3. Generate server
const server = ConfectApiServer.make(ApiWithDatabaseSchema, ApiLive);

// 4. Generate client
const client = ConfectApiClient.make(Api, convexClient);

// 5. Make type-safe calls
const user = yield* client.users.getUser({ id: "123" });
```

**Acceptance Criteria**:
1. ✅ API definition compiles without errors
2. ✅ Handler implementation type-checks correctly
3. ✅ Server generation produces working Convex functions
4. ✅ Client generation produces type-safe API
5. ✅ Function calls execute successfully
6. ✅ Errors are properly typed and handled
7. ✅ Middleware executes in correct order
8. ✅ Nested groups work correctly

**Test Case**: See `ConfectApi.test.ts` - must pass all assertions

**Dependencies**: All critical fixes and core features

---

## Non-Functional Requirements

### NFR-1: Performance

#### NFR-1.1: Schema Compilation Overhead
**Requirement**: Schema compilation MUST NOT occur more than once per unique schema.

**Metrics**:
- First call: Compile + execute
- Subsequent calls: Execute only (cache hit)
- Cache hit rate: >95% in typical usage
- Performance improvement: >50% for repeated calls

**Test**:
```typescript
// Measure compilation overhead
const iterations = 1000;
const start = performance.now();
for (let i = 0; i < iterations; i++) {
  await Effect.runPromise(client.group.myFunction({ foo: i }));
}
const duration = performance.now() - start;
const avgDuration = duration / iterations;

// Should be <5ms per call after caching
expect(avgDuration).toBeLessThan(5);
```

---

#### NFR-1.2: Layer Composition Efficiency
**Requirement**: Layer composition MUST be efficient, not causing significant runtime overhead.

**Metrics**:
- Layer creation: <1ms per group
- Runtime lookup: <0.1ms per handler
- Memory overhead: <1MB for typical API (10 groups, 50 functions)

**Constraint**: Acceptable to prioritize correctness over extreme performance optimization.

---

### NFR-2: Type Safety

#### NFR-2.1: Compile-Time Guarantees
**Requirement**: All type errors MUST be caught at compile-time, not runtime.

**Coverage**:
- ✅ Unhandled functions show clear error messages
- ✅ Invalid group paths rejected by type system
- ✅ Handler signatures match function definitions
- ✅ Client calls type-check against API definition
- ✅ Error types propagate correctly

**Test**: TypeScript compilation must succeed with correct code, fail with incorrect code.

---

#### NFR-2.2: Error Message Quality
**Requirement**: Type errors MUST include helpful context about what's wrong and how to fix it.

**Examples**:
```typescript
// Good error message
`Function not handled: "getUser"`
// Not: "Type 'A' is not assignable to type 'B'"

// Good error message
`Invalid path: "group5.nonexistent". Did you mean "group4"?`
// Not: "Property 'nonexistent' does not exist"
```

**Coverage**: All major type validation points provide custom error messages.

---

### NFR-3: Developer Experience

#### NFR-3.1: API Discoverability
**Requirement**: Developers MUST be able to discover API capabilities through IDE autocomplete.

**Metrics**:
- IntelliSense shows all available groups
- Autocomplete suggests all functions in group
- Hover shows function signatures with JSDoc
- Error types visible in IDE

**Test**: Manual verification with VSCode/IntelliJ

---

#### NFR-3.2: Documentation Quality
**Requirement**: All public APIs MUST have JSDoc comments explaining purpose, parameters, and return values.

**Coverage**:
- All exported functions
- All interface methods
- Complex type utilities
- Example usage in comments

**Example**:
```typescript
/**
 * Builds handlers for a specific group in the API.
 *
 * @param apiWithDatabaseSchema - The API definition with database schema
 * @param groupPath - The path to the group (e.g., "users" or "admin.users")
 * @param build - Callback to implement handlers using fluent API
 * @returns Layer providing the group's handlers
 *
 * @example
 * ```typescript
 * const UsersLive = ConfectApiBuilder.group(
 *   ApiWithDb,
 *   "users",
 *   (handlers) => handlers
 *     .handle("getUser", (args) => Effect.succeed(user))
 *     .handle("listUsers", (args) => Effect.succeed(users))
 * );
 * ```
 */
export const group = <...>(...) => ...
```

---

### NFR-4: Testing

#### NFR-4.1: Test Coverage
**Requirement**: All critical paths MUST have automated tests.

**Coverage Requirements**:
- Handler collection: 100%
- Server generation: 100%
- Client generation: 100%
- Error handling: 100%
- Middleware execution: 100%
- Nested groups: 100%
- Schema caching: 100%

**Test Types**:
- Unit tests for individual functions
- Integration tests for workflows
- Type tests for compile-time guarantees

---

#### NFR-4.2: Test Maintainability
**Requirement**: Tests MUST be easy to understand and modify.

**Principles**:
- Clear test names describing behavior
- Arrange-Act-Assert structure
- Minimal test setup/teardown
- Reusable test fixtures

**Example**:
```typescript
test("handler collection accumulates all handlers", () => {
  // Arrange
  const group = makeTestGroup();
  const handlers = makeHandlers({ group, handlers: Chunk.empty() });

  // Act
  const result = handlers
    .handle("fn1", handler1)
    .handle("fn2", handler2);

  // Assert
  expect(result.handlers).toHaveLength(2);
  expect(result.handlers[0].function_.name).toBe("fn1");
  expect(result.handlers[1].function_.name).toBe("fn2");
});
```

---

### NFR-5: Maintainability

#### NFR-5.1: Code Organization
**Requirement**: Code MUST be organized logically with clear module boundaries.

**Structure**:
```
src/api/
  ├── ConfectApi.ts              # API root
  ├── ConfectApiGroup.ts         # Group definition
  ├── ConfectApiFunction.ts      # Function definition
  ├── ConfectApiBuilder.ts       # Handler building
  ├── ConfectApiServer.ts        # Server generation
  ├── ConfectApiClient.ts        # Client generation
  ├── ConfectApiMiddleware.ts    # Middleware system (NEW)
  └── ConfectApi.test.ts         # Integration tests
```

**Principles**:
- One primary export per file
- Related types in same file
- Internal utilities in `internal/` subdirectory
- Clear import/export boundaries

---

#### NFR-5.2: Pattern Consistency
**Requirement**: Code MUST follow consistent patterns throughout.

**Patterns**:
- Prototype-based object construction (like Effect)
- Context tags for services
- Layer composition for DI
- Schema-first validation
- Effect.gen for async flows
- Type-level computation for validation

**Anti-Patterns to Avoid**:
- Runtime type checking (use compile-time)
- Mutable state
- Promises instead of Effects
- Any-casting without comments

---

## Technical Requirements

### TR-1: Effect Integration

#### TR-1.1: Effect Core Patterns
**Requirement**: MUST use Effect patterns consistently throughout.

**Required Patterns**:
- `Effect.Effect<A, E, R>` for all async operations
- `Layer.Layer<Out, Err, In>` for dependency injection
- `Context.Tag` for service definitions
- `Schema.Schema<A, I>` for data validation
- `Effect.gen` for generator-style async
- `pipe()` for composition

**Forbidden Patterns**:
- Bare Promises (wrap in Effect.promise)
- Callbacks (convert to Effect)
- Throwing errors (use Effect.fail)
- Global mutable state

---

#### TR-1.2: Schema Usage
**Requirement**: MUST use `@effect/schema` for all data validation.

**Coverage**:
- Function arguments: ✅ Schema validation
- Function returns: ✅ Schema validation
- Error types: ✅ Schema validation
- Database models: ✅ Schema validation

**Pattern**:
```typescript
const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String.pipe(Schema.pattern(/^.+@.+$/))
});

// Encode/decode automatically in handlers
```

---

### TR-2: Convex Integration

#### TR-2.1: Function Registration
**Requirement**: Generated server MUST produce valid Convex functions.

**Requirements**:
- Query functions: `queryGeneric(...)`
- Mutation functions: `mutationGeneric(...)`
- Action functions: `actionGeneric(...)`
- Validators: Compiled from schemas
- Return types: RegisteredQuery/Mutation/Action

**Constraint**: Must work with Convex runtime (no unsupported features)

---

#### TR-2.2: Context Provision
**Requirement**: MUST provide all Convex context to handlers via layers.

**Provided Contexts**:
- `ConvexQueryCtx` - Query context
- `ConvexMutationCtx` - Mutation context
- `ConvexActionCtx` - Action context
- `ConfectDatabaseReader` - Read operations
- `ConfectDatabaseWriter` - Write operations
- `ConfectAuth` - Authentication
- `ConfectScheduler` - Scheduled functions
- `ConfectStorageReader/Writer` - File storage
- `ConfectQueryRunner/MutationRunner/ActionRunner` - Function runners

**Pattern**: `Layer.mergeAll(...)` to combine all contexts

---

### TR-3: TypeScript Configuration

#### TR-3.1: Strict Mode
**Requirement**: MUST compile with TypeScript strict mode enabled.

**Flags**:
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`

**No Exceptions**: Zero `// @ts-ignore` or `// @ts-expect-error` without justification

---

#### TR-3.2: Type Inference
**Requirement**: MUST maximize type inference, minimize explicit annotations.

**Good**:
```typescript
const Api = ConfectApi.make("Api"); // Name inferred
const Group = ConfectApiGroup.make("group"); // Name inferred
```

**Bad**:
```typescript
const Api: ConfectApi<"Api", typeof Group> = ConfectApi.make("Api"); // Redundant
```

**Exception**: Complex generic types may need annotations for clarity

---

### TR-4: Dependencies

#### TR-4.1: Effect Packages
**Requirement**: MUST use latest compatible Effect versions.

**Versions**:
- `effect`: ^3.17.6 (or latest 3.x)
- `@effect/platform`: ^0.90.0 (or latest 0.x)
- `@effect/rpc`: ^0.68.3 (for reference, may use patterns)

**Update Policy**: Keep up to date with Effect ecosystem

---

#### TR-4.2: Convex Compatibility
**Requirement**: MUST remain compatible with Convex backend.

**Versions**:
- `convex`: ^1.25.4 (or latest)

**Constraint**: Cannot use Node.js-specific features (Convex runtime limitations)

---

## Constraints & Assumptions

### Constraints

1. **No Backwards Compatibility**: Breaking changes acceptable
2. **TypeScript Only**: No JavaScript support required
3. **Convex Runtime**: Must work within Convex's execution environment
4. **Effect Dependency**: Committed to Effect ecosystem
5. **Schema-First**: All data must have schema definitions

### Assumptions

1. **Effect is Stable**: Effect-TS APIs won't change drastically
2. **Developer Skill**: Users understand Effect basics
3. **TypeScript Version**: Users on TypeScript 5.0+
4. **Build Tool**: Users have compatible bundler (esbuild, vite, etc.)
5. **Testing**: Users will write tests for their handlers

---

## Priority Matrix

| Requirement | Priority | Effort | Value | Dependencies |
|-------------|----------|--------|-------|--------------|
| **FR-1.1** Handler Collection | 🔴 P0 | 30 min | Critical | None |
| **FR-1.2** Server Generation | 🔴 P0 | 30 min | Critical | FR-1.1 |
| **FR-6.1** End-to-End Workflow | 🔴 P0 | 1 hour | Critical | FR-1.1, FR-1.2 |
| **FR-2.1** Reflection API | 🟡 P1 | 2 hours | High | None |
| **FR-3.1** Error Schema | 🟡 P1 | 3 hours | High | None |
| **FR-3.2** Error Propagation | 🟡 P1 | 2 hours | High | FR-3.1 |
| **FR-4.1** Schema Caching | 🟡 P1 | 2 hours | High | None |
| **FR-5.1** Middleware Definition | 🟢 P2 | 4 hours | Medium | None |
| **FR-5.2** Middleware Attachment | 🟢 P2 | 3 hours | Medium | FR-5.1 |

**Total Estimated Effort**: ~18 hours

**Implementation Order**:
1. Critical Fixes (1 hour) - FR-1.1, FR-1.2, FR-6.1
2. High-Value Enhancements (9 hours) - FR-2.1, FR-3.1, FR-3.2, FR-4.1
3. Middleware System (7 hours) - FR-5.1, FR-5.2

---

## Acceptance Criteria Summary

**Minimum Viable Product** (P0 - Critical Fixes):
- ✅ Handler collection works
- ✅ Server generation works
- ✅ Integration test passes
- ✅ No runtime errors in basic workflow

**Full Feature Set** (P0 + P1 - Critical + High Value):
- ✅ All P0 criteria
- ✅ Reflection API functional
- ✅ Error unification implemented
- ✅ Schema caching improves performance >50%
- ✅ OpenAPI generation possible
- ✅ All tests passing

**Complete Implementation** (P0 + P1 + P2 - All Features):
- ✅ All P1 criteria
- ✅ Middleware system functional
- ✅ Example middleware (logging, auth) included
- ✅ Documentation complete
- ✅ Performance benchmarks pass

---

## Traceability Matrix

| Requirement | User Story | Test Case | Design Doc |
|-------------|------------|-----------|------------|
| FR-1.1 | US-1 | ConfectApi.test.ts:65-72 | TBD |
| FR-1.2 | US-1 | ConfectApi.test.ts:106 | TBD |
| FR-2.1 | US-3 | reflection.test.ts (new) | TBD |
| FR-3.1 | US-4 | error-unification.test.ts (new) | TBD |
| FR-3.2 | US-4 | error-propagation.test.ts (new) | TBD |
| FR-4.1 | US-6 | schema-cache.test.ts (new) | TBD |
| FR-5.1 | US-5 | middleware.test.ts (new) | TBD |
| FR-5.2 | US-5 | middleware-attachment.test.ts (new) | TBD |
| FR-6.1 | US-1 | ConfectApi.test.ts (comprehensive) | TBD |

---

## Open Questions

### Resolved
- ✅ Backwards compatibility: **Not required** (user confirmed)
- ✅ Scope: **Fixes + Enhancements** (user confirmed)

### Pending Design Phase

1. **Error Unification Details**:
   - Should errors be tagged unions (discriminated)?
   - How to handle Convex-specific errors?
   - Status code mapping strategy?

2. **Middleware Execution**:
   - Should middleware be async or sync?
   - How to handle middleware failures?
   - Should middleware be able to short-circuit?

3. **Reflection API Format**:
   - Should it return data structure or use callbacks?
   - What metadata is most useful?
   - Should it support filtering?

4. **Performance Targets**:
   - What's acceptable overhead for middleware?
   - Schema cache eviction strategy?
   - Should we benchmark against raw Convex?

5. **Testing Strategy**:
   - Unit tests vs integration tests ratio?
   - Should we test type-level errors?
   - Performance test requirements?

---

**Next Phase**: [design.md](./design.md) - Technical design and implementation strategy

**Requires User Approval**: ✋ **Please review requirements and approve before proceeding to design phase**
