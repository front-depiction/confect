# Dependency Management with Effect Layers

Welcome to the documentation for Confect's Layer-based dependency management system. This guide explains how to structure your API handlers with proper dependency injection using Effect's Layer system.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Pure Definitions](#pure-definitions)
  - [Handlers with Dependencies](#handlers-with-dependencies)
  - [Layer Composition](#layer-composition)
  - [Services and Tags](#services-and-tags)
- [API Reference](#api-reference)
  - [Group.build()](#groupbuild)
  - [Group.buildScoped()](#groupbuildscoped)
  - [Group.buildMock()](#groupbuildmock)
  - [Api.build()](#apibuild)
- [Common Patterns](#common-patterns)
  - [Single Dependency](#single-dependency)
  - [Multiple Dependencies](#multiple-dependencies)
  - [Handler Reuse](#handler-reuse)
  - [Testing with Mocks](#testing-with-mocks)
  - [Scoped Resources](#scoped-resources)
- [Complete Example](#complete-example)
- [Type Helpers](#type-helpers)
- [Design Principles](#design-principles)

## Overview

Confect's dependency management follows the Effect HTTP pattern: **API definitions remain pure (R = never), while handlers are provided separately via Layer builders**. This separation provides:

- **Type Safety**: Dependencies are tracked at compile time through Effect's type system
- **Testability**: Easy to swap implementations for testing with mocks
- **Composability**: Standard Effect Layer composition patterns
- **Flexibility**: Mix and match real and mock implementations

### Key Principle

> "Service functions should avoid requiring dependencies directly. In practice, service operations should have the Requirements parameter set to never."
>
> — Effect Documentation

**What this means for Confect:**

1. Function/Group/Api **definitions** are pure data structures (R = never always)
2. **Handlers** are provided separately via Layer builders (`Group.build()`, etc.)
3. Requirements flow from **handler implementations**, not definitions
4. Dependencies are captured at Layer construction time; handlers **close over** them

## Quick Start

Here's a minimal "Hello World" example:

```typescript
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Function from "./Function";
import * as Group from "./Group";
import * as Api from "./Api";

// Step 1: Define your API (pure data, no handlers)
const helloWorldQuery = Function.query("hello-world")
  .args(Schema.Struct({}))
  .returns(Schema.String);

const greetingsGroup = Group.group("Greetings").pipe(
  Group.add("hello-world", helloWorldQuery)
);

const myApi = Api.api("MyApi").pipe(
  Api.add(greetingsGroup)
);

// Step 2: Implement handlers (no dependencies needed yet)
const GreetingsLive = Group.build(
  greetingsGroup,
  Effect.succeed({
    "hello-world": () => Effect.succeed("Hello, World!")
  })
);

// Step 3: Build the complete API Layer
const MyApiLive = Api.build(myApi).pipe(
  Layer.provide(GreetingsLive)
);

// Step 4: Use your API
const program = Effect.gen(function* () {
  const { api } = yield* Api.ApiService;
  console.log(`API ready: ${api.name}`);
});

Effect.runPromise(program.pipe(Effect.provide(MyApiLive)));
// Output: "API ready: MyApi"
```

## Core Concepts

### Pure Definitions

API definitions in Confect are **pure data structures** with no runtime behavior:

```typescript
// Function definitions: pure data
const getUser = Function.query("getUser")
  .args(Schema.Struct({ id: Schema.String }))
  .returns(Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
  }));

// Group definitions: compose functions (still pure)
const usersGroup = Group.group("users").pipe(
  Group.add("getUser", getUser),
  Group.add("createUser", createUser)
);

// Api definitions: compose groups (still pure)
const myApi = Api.api("myApp").pipe(
  Api.add(usersGroup),
  Api.add(filesGroup)
);
```

At this stage:
- No handlers are attached
- No dependencies are required
- R = never for all definitions
- These are just type-safe descriptions of your API shape

### Handlers with Dependencies

Handlers are implemented separately using **Layer builders**. This is where dependencies enter the picture:

```typescript
import * as Context from "effect/Context";

// Define a service tag for your dependency
class Database extends Context.Tag("Database")<
  Database,
  {
    readonly get: (table: string, id: string) => Effect.Effect<unknown, Error>
    readonly insert: (table: string, doc: unknown) => Effect.Effect<string, Error>
  }
>() {}

// Implement handlers that use the dependency
const UsersLive = Group.build(
  usersGroup,
  Effect.gen(function* () {
    // ↓ Dependency acquired here (Effect level, R includes Database)
    const db = yield* Database;

    return {
      // ↓ Handler closes over 'db', so R = never
      getUser: (args) => db.get("users", args.id),
      createUser: (args) => db.insert("users", args)
    };
  })
);
// Type: Layer<GroupService<"users">, Error, Database>
//                                              ^^^^^^^^
//                                              Requirement flows from handler Effect
```

**Critical insight**: The Effect that **creates** the handlers can have requirements (R), but the handler functions themselves **must have R = never** because they close over dependencies from the outer scope.

```typescript
// Handler Effect (outer): R can include dependencies
Effect.gen(function* () {
  const db = yield* Database;  // ← R includes Database here

  return {
    // Handler function (inner): R = never
    getUser: (args) => db.get("users", args.id)
    //       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //       Type: (args) => Effect<User, Error, never>
    //                                            ^^^^^
  };
})
```

### Layer Composition

Layers compose using standard Effect patterns:

```typescript
// 1. Build group layers with their dependencies
const UsersLive = Group.build(usersGroup, Effect.gen(function* () {
  const db = yield* Database;
  const auth = yield* Auth;
  return { /* handlers */ };
}));
// Layer<GroupService<"users">, Error, Database | Auth>

const FilesLive = Group.build(filesGroup, Effect.gen(function* () {
  const storage = yield* Storage;
  return { /* handlers */ };
}));
// Layer<GroupService<"files">, Error, Storage>

// 2. Build the API layer (requires all GroupServices)
const MyApiLayer = Api.build(myApi);
// Layer<ApiService, never, GroupService<"users"> | GroupService<"files">>

// 3. Provide group implementations
const MyApiWithGroups = MyApiLayer.pipe(
  Layer.provide(UsersLive),
  Layer.provide(FilesLive)
);
// Layer<ApiService, Error, Database | Auth | Storage>

// 4. Provide all dependencies
const MyApiLive = MyApiWithGroups.pipe(
  Layer.provide(DatabaseLive),
  Layer.provide(AuthLive),
  Layer.provide(StorageLive)
);
// Layer<ApiService, Error, never>
//                          ^^^^^
//                          All requirements satisfied!
```

### Services and Tags

Confect uses Effect's `Context.Tag` system to identify services:

**GroupService**: A tag for a group's handler implementations

```typescript
// Created automatically by Group.build()
class GroupService<Name extends string> extends Context.Tag(
  `@confect/GroupService/${Name}`
)<
  GroupService<Name>,
  HandlersFor<ConfectApiGroup<Name, any>>
>() {}
```

**ApiService**: A tag for an API instance

```typescript
// Provided by Api.build()
class ApiService extends Context.Tag("@confect/ApiService")<
  ApiService,
  {
    readonly api: ConfectApi<string, Record<string, AnyConfectApiGroup>, any>
    readonly context: Context.Context<never>
  }
>() {}
```

You typically don't create these tags manually; they're created by the builders.

## API Reference

### Group.build()

Creates a Layer that provides a `GroupService` by executing an Effect that produces handlers.

**Signature:**

```typescript
export const build: {
  // Curried form
  <Name extends string, Functions extends Record<string, Function.ConfectApiFunction>>(
    group: ConfectApiGroup<Name, Functions>
  ): <E, R>(
    effect: Effect.Effect<HandlersFor<ConfectApiGroup<Name, Functions>>, E, R>
  ) => Layer.Layer<GroupService<Name>, E, R>

  // Direct form
  <Name extends string, Functions extends Record<string, Function.ConfectApiFunction>, E, R>(
    group: ConfectApiGroup<Name, Functions>,
    effect: Effect.Effect<HandlersFor<ConfectApiGroup<Name, Functions>>, E, R>
  ): Layer.Layer<GroupService<Name>, E, R>
}
```

**Parameters:**
- `group`: The group definition (pure data)
- `effect`: An Effect that produces handler implementations

**Returns:**
- A Layer that provides `GroupService<Name>` and requires whatever `effect` requires

**Examples:**

Direct form:
```typescript
const UsersLive = Group.build(
  usersGroup,
  Effect.gen(function* () {
    const db = yield* Database;
    return {
      getUser: (args) => db.get("users", args.id),
      createUser: (args) => db.insert("users", args)
    };
  })
);
```

Curried form:
```typescript
const buildUsers = Group.build(usersGroup);

const UsersLive = buildUsers(
  Effect.gen(function* () {
    const db = yield* Database;
    return {
      getUser: (args) => db.get("users", args.id)
    };
  })
);
```

No dependencies:
```typescript
const GreetingsLive = Group.build(
  greetingsGroup,
  Effect.succeed({
    hello: () => Effect.succeed("Hello!")
  })
);
```

### Group.buildScoped()

Creates a Layer using `Layer.scoped()`, which automatically manages resource acquisition and cleanup.

**Signature:**

```typescript
export const buildScoped: {
  // Curried form
  <Name extends string, Functions extends Record<string, Function.ConfectApiFunction>>(
    group: ConfectApiGroup<Name, Functions>
  ): <E, R>(
    effect: Effect.Effect<HandlersFor<ConfectApiGroup<Name, Functions>>, E, R>
  ) => Layer.Layer<GroupService<Name>, E, Exclude<R, Scope.Scope>>

  // Direct form
  <Name extends string, Functions extends Record<string, Function.ConfectApiFunction>, E, R>(
    group: ConfectApiGroup<Name, Functions>,
    effect: Effect.Effect<HandlersFor<ConfectApiGroup<Name, Functions>>, E, R>
  ): Layer.Layer<GroupService<Name>, E, Exclude<R, Scope.Scope>>
}
```

**Parameters:**
- `group`: The group definition
- `effect`: A scoped Effect that produces handlers

**Returns:**
- A Layer that provides `GroupService<Name>` and requires whatever `effect` requires (excluding `Scope`)

**Example:**

```typescript
// Define a scoped resource (e.g., database connection pool)
class DbPool extends Context.Tag("DbPool")<
  DbPool,
  { readonly query: (sql: string) => Effect.Effect<unknown[], Error> }
>() {}

const DbPoolLive = Layer.scoped(
  DbPool,
  Effect.gen(function* () {
    // Acquire connection with automatic cleanup
    const connection = yield* Effect.acquireRelease(
      Effect.sync(() => createConnection()),
      (conn) => Effect.sync(() => conn.close())
    );

    return {
      query: (sql) => Effect.sync(() => connection.execute(sql))
    };
  })
);

// Use the scoped resource in handlers
const UsersLive = Group.buildScoped(
  usersGroup,
  Effect.gen(function* () {
    const pool = yield* DbPool;  // Scoped dependency

    return {
      getUser: (args) => pool.query(`SELECT * FROM users WHERE id = ${args.id}`)
    };
  })
);
// Layer<GroupService<"users">, Error, DbPool>
// Note: Scope is excluded from requirements automatically
```

### Group.buildMock()

Creates a Layer using `Layer.mock()` for testing with partial implementations.

**Signature:**

```typescript
export const buildMock: {
  // Curried form
  <Name extends string, Functions extends Record<string, Function.ConfectApiFunction>>(
    group: ConfectApiGroup<Name, Functions>
  ): (
    handlers: Partial<HandlersFor<ConfectApiGroup<Name, Functions>>>
  ) => Layer.Layer<GroupService<Name>>

  // Direct form
  <Name extends string, Functions extends Record<string, Function.ConfectApiFunction>>(
    group: ConfectApiGroup<Name, Functions>,
    handlers: Partial<HandlersFor<ConfectApiGroup<Name, Functions>>>
  ): Layer.Layer<GroupService<Name>>
}
```

**Parameters:**
- `group`: The group definition
- `handlers`: A partial record of handler implementations

**Returns:**
- A Layer that provides `GroupService<Name>` with no requirements

**Behavior:**
- Implemented handlers work normally
- Missing handlers throw `UnimplementedError` if called

**Examples:**

Partial mock:
```typescript
const UsersMock = Group.buildMock(usersGroup, {
  getUser: (args) => Effect.succeed({
    id: args.id,
    name: "Mock User",
    email: "mock@example.com"
  })
  // createUser not implemented - throws if called
});
```

Full mock:
```typescript
const UsersMock = Group.buildMock(usersGroup, {
  getUser: (args) => Effect.succeed({ id: args.id, name: "Mock", email: "test@example.com" }),
  createUser: (args) => Effect.succeed({ id: "mock-123", ...args })
});
```

Empty mock (all handlers throw):
```typescript
const UsersEmptyMock = Group.buildMock(usersGroup, {});
```

### Api.build()

Creates a Layer that provides `ApiService` by capturing all `GroupService` dependencies.

**Signature:**

```typescript
export const build: <
  Name extends string,
  Groups extends Record<string, AnyConfectApiGroup>,
  R
>(
  api: ConfectApi<Name, Groups, R>
) => Layer.Layer<
  ApiService,
  never,
  UnionOfGroupServices<Groups>
>
```

**Parameters:**
- `api`: The API definition

**Returns:**
- A Layer that provides `ApiService` and requires all `GroupService<Name>` for each group in the API

**Example:**

```typescript
const myApi = Api.api("myApp").pipe(
  Api.add(usersGroup),
  Api.add(filesGroup)
);

const MyApiLayer = Api.build(myApi);
// Type: Layer<ApiService, never, GroupService<"users"> | GroupService<"files">>

// Provide group implementations
const MyApiLive = MyApiLayer.pipe(
  Layer.provide(UsersLive),
  Layer.provide(FilesLive)
);
```

## Common Patterns

### Single Dependency

The simplest case: handlers need just one service.

```typescript
import * as Context from "effect/Context";

// Define dependency
class Database extends Context.Tag("Database")<
  Database,
  {
    readonly get: (table: string, id: string) => Effect.Effect<unknown, Error>
  }
>() {}

// Define API
const usersGroup = Group.group("users").pipe(
  Group.add(
    "getUser",
    Function.query("getUser")
      .args(Schema.Struct({ id: Schema.String }))
      .returns(UserSchema)
  )
);

// Implement with dependency
const UsersLive = Group.build(
  usersGroup,
  Effect.gen(function* () {
    const db = yield* Database;

    return {
      getUser: (args) => db.get("users", args.id)
    };
  })
);
// Layer<GroupService<"users">, Error, Database>
```

### Multiple Dependencies

Handlers often need several services.

```typescript
class Database extends Context.Tag("Database")<Database, {
  readonly get: (table: string, id: string) => Effect.Effect<unknown, Error>
  readonly insert: (table: string, doc: unknown) => Effect.Effect<string, Error>
}>() {}

class Auth extends Context.Tag("Auth")<Auth, {
  readonly getUserId: () => Effect.Effect<string, Error>
  readonly hasPermission: (perm: string) => Effect.Effect<boolean, Error>
}>() {}

const usersGroup = Group.group("users").pipe(
  Group.add("getUser", Function.query("getUser").args(UserArgsSchema).returns(UserSchema)),
  Group.add("createUser", Function.mutation("createUser").args(CreateUserArgsSchema).returns(UserSchema))
);

const UsersLive = Group.build(
  usersGroup,
  Effect.gen(function* () {
    // Acquire multiple dependencies
    const db = yield* Database;
    const auth = yield* Auth;

    return {
      getUser: (args) => db.get("users", args.id),

      createUser: (args) =>
        Effect.gen(function* () {
          // Handler can also use generator syntax
          const userId = yield* auth.getUserId();
          const hasPermission = yield* auth.hasPermission("users:create");

          if (!hasPermission) {
            return yield* Effect.fail(new Error("Permission denied"));
          }

          const id = yield* db.insert("users", {
            ...args,
            createdBy: userId
          });

          return { id, ...args };
        })
    };
  })
);
// Layer<GroupService<"users">, Error, Database | Auth>
```

### Handler Reuse

Handlers can reuse each other's logic:

```typescript
const usersGroup = Group.group("users").pipe(
  Group.add("getUser", Function.query("getUser").args(UserArgsSchema).returns(UserSchema)),
  Group.add("getUserWithPrefix", Function.query("getUserWithPrefix").args(UserArgsSchema).returns(UserSchema))
);

const UsersLive = Group.build(
  usersGroup,
  Effect.gen(function* () {
    const db = yield* Database;

    // Define reusable handler logic
    const getUser = (args: { id: string }) =>
      db.get("users", args.id);

    const getUserWithPrefix = (args: { id: string }) =>
      getUser(args).pipe(
        Effect.map((user: any) => ({
          ...user,
          name: `Mr. ${user.name}`
        }))
      );

    return {
      getUser,
      getUserWithPrefix
    };
  })
);
```

### Testing with Mocks

Mock entire groups or mix real and mock implementations:

**Mocking a group:**

```typescript
import { describe, test, expect } from "vitest";

describe("User handlers", () => {
  test("getUser returns mock data", () => {
    const UsersMock = Group.buildMock(usersGroup, {
      getUser: (args) => Effect.succeed({
        id: args.id,
        name: "Test User",
        email: "test@example.com"
      })
    });

    const TestApiLive = Api.build(myApi).pipe(
      Layer.provide(UsersMock),
      Layer.provide(FilesLive)  // Real implementation
    );

    const program = Effect.gen(function* () {
      const { api } = yield* Api.ApiService;
      // Test your API...
    });

    Effect.runSync(program.pipe(Effect.provide(TestApiLive)));
  });
});
```

**Mixing real and mock:**

```typescript
const TestApi = Api.build(myApi).pipe(
  Layer.provide(UsersLive),       // Real implementation (requires Database)
  Layer.provide(FilesMock),       // Mock implementation (no requirements)
  Layer.provide(DatabaseTestLive) // Test database
);
// All requirements satisfied, ready for testing
```

### Scoped Resources

Use `buildScoped()` when handlers need resources with lifecycle management:

```typescript
import * as Scope from "effect/Scope";

// Scoped database pool
class DbPool extends Context.Tag("DbPool")<
  DbPool,
  { readonly query: (sql: string) => Effect.Effect<unknown[], Error> }
>() {}

const DbPoolLive = Layer.scoped(
  DbPool,
  Effect.gen(function* () {
    console.log("Opening database connection pool");

    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => ({ connections: [] })),
      (pool) => Effect.sync(() => {
        console.log("Closing database connection pool");
      })
    );

    return {
      query: (sql) => Effect.succeed([{ result: "data" }])
    };
  })
);

// Use scoped resource in handlers
const UsersLive = Group.buildScoped(
  usersGroup,
  Effect.gen(function* () {
    const pool = yield* DbPool;

    return {
      getUser: (args) => pool.query(`SELECT * FROM users WHERE id = '${args.id}'`)
    };
  })
);

// When you provide UsersLive, the pool will be acquired and automatically released
```

## Complete Example

Here's a full end-to-end example showing definition, implementation, composition, and usage:

```typescript
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import * as Function from "./Function";
import * as Group from "./Group";
import * as Api from "./Api";

// ============================================================================
// Step 1: Define Services (Dependencies)
// ============================================================================

class Database extends Context.Tag("Database")<
  Database,
  {
    readonly get: (table: string, id: string) => Effect.Effect<unknown, Error>
    readonly insert: (table: string, doc: unknown) => Effect.Effect<string, Error>
  }
>() {}

class Auth extends Context.Tag("Auth")<
  Auth,
  {
    readonly getUserId: () => Effect.Effect<string, Error>
  }
>() {}

class Storage extends Context.Tag("Storage")<
  Storage,
  {
    readonly getUrl: (storageId: string) => Effect.Effect<string, Error>
    readonly store: (file: string) => Effect.Effect<string, Error>
  }
>() {}

// Service implementations
const DatabaseLive = Layer.succeed(Database, {
  get: (table, id) => Effect.succeed({ id, table, data: "example" }),
  insert: (table, doc) => Effect.succeed("new-id-123")
});

const AuthLive = Layer.succeed(Auth, {
  getUserId: () => Effect.succeed("current-user-456")
});

const StorageLive = Layer.succeed(Storage, {
  getUrl: (id) => Effect.succeed(`https://cdn.example.com/${id}`),
  store: (file) => Effect.succeed("stored-file-789")
});

// ============================================================================
// Step 2: Define API Schemas
// ============================================================================

const UserArgsSchema = Schema.Struct({
  id: Schema.String,
});

const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
});

const CreateUserArgsSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
});

const FileArgsSchema = Schema.Struct({
  file: Schema.String,
});

const FileResultSchema = Schema.Struct({
  url: Schema.String,
});

// ============================================================================
// Step 3: Define API (Pure Data)
// ============================================================================

const getUserQuery = Function.query("getUser")
  .args(UserArgsSchema)
  .returns(UserSchema);

const createUserMutation = Function.mutation("createUser")
  .args(CreateUserArgsSchema)
  .returns(UserSchema);

const uploadAction = Function.action("upload")
  .args(FileArgsSchema)
  .returns(FileResultSchema);

const usersGroup = Group.group("users").pipe(
  Group.add("getUser", getUserQuery),
  Group.add("createUser", createUserMutation)
);

const filesGroup = Group.group("files").pipe(
  Group.add("upload", uploadAction)
);

const myApi = Api.api("myApp").pipe(
  Api.add(usersGroup),
  Api.add(filesGroup)
);

// ============================================================================
// Step 4: Implement Handlers
// ============================================================================

const UsersLive = Group.build(
  usersGroup,
  Effect.gen(function* () {
    const db = yield* Database;
    const auth = yield* Auth;

    return {
      getUser: (args) => db.get("users", args.id),

      createUser: (args) =>
        Effect.gen(function* () {
          const userId = yield* auth.getUserId();
          const id = yield* db.insert("users", {
            ...args,
            createdBy: userId
          });
          return { id, ...args };
        })
    };
  })
);

const FilesLive = Group.build(
  filesGroup,
  Effect.gen(function* () {
    const storage = yield* Storage;

    return {
      upload: (args) =>
        storage.store(args.file).pipe(
          Effect.flatMap((storageId) =>
            storage.getUrl(storageId).pipe(
              Effect.map((url) => ({ url }))
            )
          )
        )
    };
  })
);

// ============================================================================
// Step 5: Compose Layers
// ============================================================================

const MyApiLive = Api.build(myApi).pipe(
  // Provide group implementations
  Layer.provide(UsersLive),
  Layer.provide(FilesLive),
  // Provide all dependencies
  Layer.provide(DatabaseLive),
  Layer.provide(AuthLive),
  Layer.provide(StorageLive)
);
// Type: Layer<ApiService, Error, never>
// All requirements satisfied!

// ============================================================================
// Step 6: Use the API
// ============================================================================

const program = Effect.gen(function* () {
  const { api, context } = yield* Api.ApiService;

  console.log(`API initialized: ${api.name}`);
  console.log(`Groups: ${Object.keys(api.groups).join(", ")}`);

  // Access handlers via context
  const usersService = Context.get(context, new Group.GroupService("users"));
  const user = yield* usersService.getUser({ id: "user-123" });
  console.log("User:", user);
});

// Run the program
Effect.runPromise(program.pipe(Effect.provide(MyApiLive)))
  .then(() => console.log("Program completed successfully"))
  .catch((error) => console.error("Program failed:", error));
```

## Type Helpers

Confect provides several type utilities for working with the dependency system:

### Function Type Helpers

```typescript
import type * as Function from "./Function";

// Extract argument type from function
type GetArgsType<F extends Function.ConfectApiFunction> =
  F extends Function.ConfectApiFunction<any, infer Args, any>
    ? Schema.Schema.Type<Args>
    : never;

// Extract return type from function
type GetReturnsType<F extends Function.ConfectApiFunction> =
  F extends Function.ConfectApiFunction<any, any, infer Returns>
    ? Schema.Schema.Type<Returns>
    : never;

// Example usage
const getUserQuery = Function.query("getUser")
  .args(Schema.Struct({ id: Schema.String }))
  .returns(UserSchema);

type Args = Function.GetArgsType<typeof getUserQuery>;
// { id: string }

type Returns = Function.GetReturnsType<typeof getUserQuery>;
// { id: string; name: string; email: string }
```

### Group Type Helpers

```typescript
import type * as Group from "./Group";

// Extract group name
type GetName<G extends Group.ConfectApiGroup<any, any>> =
  G extends Group.ConfectApiGroup<infer Name, any> ? Name : never;

// Extract functions record
type GetFunctions<G extends Group.ConfectApiGroup<any, any>> =
  G extends Group.ConfectApiGroup<any, infer Functions> ? Functions : never;

// Extract function names (keys)
type GetFunctionNames<G extends Group.ConfectApiGroup<any, any>> =
  keyof GetFunctions<G>;

// Example usage
const usersGroup = Group.group("users").pipe(
  Group.add("getUser", getUserQuery),
  Group.add("createUser", createUserMutation)
);

type Name = Group.GetName<typeof usersGroup>;
// "users"

type Functions = Group.GetFunctions<typeof usersGroup>;
// { getUser: ConfectApiFunction<...>, createUser: ConfectApiFunction<...> }

type FunctionNames = Group.GetFunctionNames<typeof usersGroup>;
// "getUser" | "createUser"
```

### HandlersFor Type

The most important type for implementing handlers:

```typescript
import type * as Group from "./Group";

type HandlersFor<G extends Group.ConfectApiGroup<any, any>> = {
  [K in Group.GetFunctionNames<G>]: (
    args: Function.GetArgsType<Group.GetFunctions<G>[K]>
  ) => Effect.Effect<
    Function.GetReturnsType<Group.GetFunctions<G>[K]>,
    any,   // Error type is open
    never  // Requirements must be never (handlers close over deps)
  >
}

// Example usage
const usersGroup = Group.group("users").pipe(
  Group.add("getUser", getUserQuery)
);

type Handlers = Group.HandlersFor<typeof usersGroup>;
// {
//   getUser: (args: { id: string }) => Effect.Effect<User, any, never>
// }
```

### Service Tags

```typescript
// GroupService: Tag for a group's handlers
class GroupService<Name extends string> extends Context.Tag(
  `@confect/GroupService/${Name}`
)<
  GroupService<Name>,
  HandlersFor<ConfectApiGroup<Name, any>>
>() {}

// ApiService: Tag for an API instance
class ApiService extends Context.Tag("@confect/ApiService")<
  ApiService,
  {
    readonly api: ConfectApi<string, Record<string, AnyConfectApiGroup>, any>
    readonly context: Context.Context<never>
  }
>() {}

// Example: Manually creating a GroupService tag
const usersTag = new Group.GroupService<"users">("users");

// Example: Using ApiService
const program = Effect.gen(function* () {
  const { api, context } = yield* Api.ApiService;

  // Access a specific group service
  const usersService = Context.get(
    context,
    new Group.GroupService<"users">("users")
  );
});
```

## Design Principles

### 1. Pure Definitions (R = never)

API definitions are pure data structures with no runtime behavior or dependencies:

```typescript
// ✅ Correct: Pure definition
const getUser = Function.query("getUser")
  .args(UserArgsSchema)
  .returns(UserSchema);
// R = never (no dependencies)

// ❌ Wrong: Attaching handlers to definitions
const getUser = Function.query("getUser")
  .args(UserArgsSchema)
  .returns(UserSchema)
  .handler((args) => { /* ... */ });  // DON'T DO THIS
```

### 2. Dependencies at Layer Level

Dependencies are acquired when building the Layer, not when defining functions:

```typescript
// ✅ Correct: Dependencies acquired at Layer construction
const UsersLive = Group.build(
  usersGroup,
  Effect.gen(function* () {
    const db = yield* Database;  // ← Dependency here
    return {
      getUser: (args) => db.get("users", args.id)  // ← Closes over db
    };
  })
);

// ❌ Wrong: Dependencies in function definition
const getUser = Function.query("getUser")
  .args(UserArgsSchema)
  .returns(UserSchema)
  .requires(Database);  // DON'T DO THIS
```

### 3. Handlers Close Over Dependencies

Handler functions must have R = never. They close over dependencies from the outer scope:

```typescript
Effect.gen(function* () {
  const db = yield* Database;  // R includes Database (Effect level)

  return {
    // Handler has R = never (closes over db from outer scope)
    getUser: (args) => db.get("users", args.id)
    //       Type: (args) => Effect<User, Error, never>
    //                                             ^^^^^
  };
})
```

### 4. Builders are Thin Wrappers

The builders are simple wrappers around Effect's Layer constructors:

```typescript
// Group.build() → Layer.effect()
Group.build(group, effect) === Layer.effect(new GroupService(group.name), effect)

// Group.buildScoped() → Layer.scoped()
Group.buildScoped(group, effect) === Layer.scoped(new GroupService(group.name), effect)

// Group.buildMock() → Layer.mock()
Group.buildMock(group, handlers) === Layer.mock(new GroupService(group.name), handlers)

// Api.build() → Layer.effect() + Effect.context()
Api.build(api) === Layer.effect(ApiService, Effect.map(Effect.context(), ctx => ({ api, context: ctx })))
```

### 5. Standard Layer Composition

Confect Layers compose using standard Effect patterns:

```typescript
// ✅ Use Layer.provide() to satisfy requirements
const MyApiLive = Api.build(myApi).pipe(
  Layer.provide(UsersLive),
  Layer.provide(DatabaseLive)
);

// ✅ Use Layer.merge() to combine independent layers
const ServicesLive = Layer.merge(DatabaseLive, AuthLive, StorageLive);

// ✅ Use Layer.provideMerge() for convenience
const MyApiLive = Api.build(myApi).pipe(
  Layer.provide(UsersLive),
  Layer.provideMerge(ServicesLive)
);
```

## References

- **Effect HTTP Architecture**: The inspiration for this system
  - Source: https://github.com/Effect-TS/effect/blob/main/packages/platform/src/HttpApi.ts
  - Docs: https://effect.website/docs/guides/platform/http-api

- **Effect Layer Documentation**: Core Layer concepts
  - https://effect.website/docs/layers

- **Effect Context Management**: Understanding services and tags
  - https://effect.website/docs/context-management/services

- **Implementation Plan**: Original design document
  - `/tmp/confect-dependency-management-plan.md`

---

**Questions or Issues?**

If you encounter issues or have questions about the dependency management system, check:

1. Are your definitions pure (R = never)?
2. Do handlers close over dependencies (not require them directly)?
3. Are you using the builders correctly?
4. Have you provided all required Layers?

For more examples, see the test file: `src/api/internal/dependency-tracking.test.ts`
