# Confect API System

A type-safe, composable API system built on Effect that brings best practices from both Effect and Convex together.

## Table of Contents

- [Guiding Principles](#guiding-principles)
- [Core Concepts](#core-concepts)
- [Quick Start](#quick-start)
- [Detailed Usage](#detailed-usage)
- [Advanced Patterns](#advanced-patterns)
- [Architecture Benefits](#architecture-benefits)

## Guiding Principles

### 1. Close Over Dependencies (Effect Best Practice)

The fundamental pattern in this API system is **handlers close over their dependencies**. This means:

- Handlers are pure functions: `(args: Args) => Effect<Returns, E, never>`
- All dependencies are closed over during Layer construction
- No dependency propagation through handler signatures
- Clean separation between API definition and implementation

**Why this matters:**

```typescript
// ❌ Traditional approach - dependencies leak into handler signature
type Handler = (args: Args) => Effect<Returns, E, DB | Auth | Storage>
// Every caller must provide DB | Auth | Storage

// ✅ Confect approach - dependencies are closed over
type Handler = (args: Args) => Effect<Returns, E, never>
// Dependencies provided once at Layer construction, handlers are self-contained
```

This aligns with Effect's best practice of building layers that close over their context, creating services that are ready to use without requiring callers to manage dependencies.

### 2. Define Interfaces First, Implement Later

The API system separates **what** from **how**:

```typescript
// Step 1: Define the API contract (pure data)
const usersGroup = Group.group("users").pipe(
  Group.add(Function.query("getUser")
    .args(Schema.Struct({ id: Schema.String }))
    .returns(UserSchema))
)

// Step 2: Implement handlers (later, possibly in a different file)
const UsersLive = Layer.effect(
  Group.Tag(usersGroup),
  Effect.succeed({
    getUser: (args) => Effect.gen(function*() {
      const db = yield* QueryDB
      const auth = yield* ConfectAuth
      // Implementation details...
    })
  })
)
```

**Benefits:**

- API contracts are self-documenting
- Type safety between definition and implementation
- Easy to change implementations without touching API definitions
- Clear separation of concerns

### 3. No Separate Handlers Folder

Traditional Convex patterns often lead to this structure:

```
convex/
  functions/
    users.ts          // RegisteredQuery/Mutation
  handlers/
    users.ts          // Actual business logic
```

**Why separate folders exist in traditional patterns:**

Convex best practices say you shouldn't call `RegisteredQuery` from inside other `RegisteredQuery` functions due to transaction overhead. This forces developers to extract shared logic into separate "handler" functions.

**Confect eliminates this need:**

```typescript
// Everything in one place - no handlers folder needed
const usersGroup = Group.group("users").pipe(
  Group.add(Function.query("getUser")
    .args(Schema.Struct({ id: Schema.String }))
    .returns(UserSchema)),
  Group.add(Function.query("getUserWithPosts")
    .args(Schema.Struct({ id: Schema.String }))
    .returns(UserWithPostsSchema))
)

const UsersLive = Layer.effect(
  Group.Tag(usersGroup),
  Effect.gen(function*() {
    const db = yield* QueryDB
    const auth = yield* ConfectAuth

    // Shared logic - callable directly, no transaction overhead
    const getUser = (args: { id: string }) =>
      db.get("users", args.id)

    // Handlers compose the shared logic
    return {
      getUser,
      getUserWithPosts: (args) => Effect.gen(function*() {
        const user = yield* getUser(args)
        const posts = yield* db.query("posts")
          .withIndex("by_user", q => q.eq("userId", args.id))
          .collect()
        return { ...user, posts }
      })
    }
  })
)
```

### 4. Automatic Optimization for Reuse

**The problem with traditional Convex:**

```typescript
// users.ts - RegisteredQuery
export const getUser = query({ ... })

// posts.ts - RegisteredQuery
export const getUserPosts = query({
  handler: async (ctx, args) => {
    // ❌ Calling getUser creates a NEW transaction with overhead
    const user = await getUser(ctx, { id: args.userId })
    // ...
  }
})
```

**Confect solution - Tag-based architecture:**

```typescript
// Define API
const usersGroup = Group.group("users").pipe(
  Group.add(Function.query("getUser").args(...).returns(...))
)

const postsGroup = Group.group("posts").pipe(
  Group.add(Function.query("getUserPosts").args(...).returns(...))
)

// Implementation - posts can use users via Tag
const PostsLive = Layer.effect(
  Group.Tag(postsGroup),
  Effect.gen(function*() {
    const db = yield* QueryDB
    const users = yield* Group.Tag(usersGroup) // ✅ Direct access, no transaction overhead

    return {
      getUserPosts: (args) => Effect.gen(function*() {
        const user = yield* users.getUser({ id: args.userId }) // ✅ Optimized reuse
        const posts = yield* db.query("posts")
          .withIndex("by_user", q => q.eq("userId", args.userId))
          .collect()
        return { user, posts }
      })
    }
  })
)

// Serve with dependency injection
export default Api.serve(
  schemaDefinition,
  myApi,
  Layer.mergeAll(UsersLive, PostsLive) // ✅ All deps resolved at construction
)
```

**Why this is optimized:**

1. **Single Transaction Context**: When `getUserPosts` calls `users.getUser`, they share the same transaction context - no overhead
2. **Direct Function Calls**: Under the hood, it's just calling the handler function directly, not going through Convex's query system
3. **Type-Safe Composition**: TypeScript ensures all dependencies are satisfied at compile time
4. **No Runtime Lookup**: Tags resolve at Layer construction time, not at runtime

## Core Concepts

### Function (Atomic Building Block)

Functions are the smallest unit - a single Query, Mutation, or Action with typed arguments and returns.

```typescript
import * as Function from "./internal/Function"
import * as Schema from "effect/Schema"

// Query - read-only database access
const getUser = Function.query("getUser")
  .args(Schema.Struct({ id: Schema.String }))
  .returns(Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String
  }))

// Mutation - read-write database access
const createUser = Function.mutation("createUser")
  .args(Schema.Struct({
    name: Schema.String,
    email: Schema.String
  }))
  .returns(Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String
  }))

// Action - external API access
const sendEmail = Function.action("sendEmail")
  .args(Schema.Struct({
    to: Schema.String,
    subject: Schema.String,
    body: Schema.String
  }))
  .returns(Schema.Void)
```

**Function types:**

- `Query`: Read-only access to database (has `QueryDB`, `ConfectAuth`, `ConfectStorageReader`)
- `Mutation`: Read-write database access (has `MutationDB`, `QueryDB`, `ConfectAuth`, `ConfectScheduler`, `ConfectStorageWriter`)
- `Action`: External operations (has `ConfectActionRunner`, `ConfectMutationRunner`, `ConfectScheduler`, `ConfectStorageActionWriter`, `ConfectVectorSearch`)

### Group (Collection of Functions)

Groups organize related functions and act as Context.Tags for dependency injection.

```typescript
import * as Group from "./internal/Group"

const usersGroup = Group.group("users").pipe(
  Group.add(getUser),
  Group.add(createUser),
  Group.add(updateUser)
)

// Groups are Tags - use them in Effect and Layer
const users = yield* Group.Tag(usersGroup)
const result = yield* users.getUser({ id: "123" })
```

**Key features:**

- Groups are `Context.Tag` instances
- Use `Group.Tag(group)` to access handlers
- Compose via `.pipe(Group.add(fn))`
- Merge groups with `Group.merge(otherGroup)`

### Api (Top-Level Container)

APIs contain multiple groups and serve them to Convex.

```typescript
import * as Api from "./internal/Api"

const myApi = Api.api("myApp").pipe(
  Api.add(usersGroup),
  Api.add(postsGroup),
  Api.add(commentsGroup)
)
```

**Key features:**

- Pure data structure (metadata about groups)
- Use `Api.serve()` to convert to Convex functions
- Convert to Tag with `Api.Tag(myApi)` for DI

### Plugin (Layer Enhancement)

Plugins wrap services with additional behavior.

```typescript
import * as Plugin from "./internal/Plugin"

const withLogging = Plugin.forTag(MutationDB, (base) => ({
  insert: (table, value) =>
    Effect.gen(function*() {
      yield* Effect.logInfo(`Inserting into ${table}`)
      return yield* base.insert(table, value)
    })
}))

const Enhanced = Layer.empty.pipe(
  withLogging,
  Layer.provide(MutationDB.Default)
)
```

## Quick Start

### 1. Define Your API

```typescript
// api/users.ts
import * as Function from "@confect/api/internal/Function"
import * as Group from "@confect/api/internal/Group"
import * as Schema from "effect/Schema"

export const GetUserArgs = Schema.Struct({ id: Schema.String })
export const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String
})

export const usersGroup = Group.group("users").pipe(
  Group.add(Function.query("getUser")
    .args(GetUserArgs)
    .returns(UserSchema)),
  Group.add(Function.mutation("createUser")
    .args(Schema.Struct({ name: Schema.String, email: Schema.String }))
    .returns(UserSchema))
)
```

### 2. Implement Handlers

```typescript
// api/users.live.ts
import * as Layer from "effect/Layer"
import * as Effect from "effect/Effect"
import { QueryDB, MutationDB } from "@confect/server/database"
import { ConfectAuth } from "@confect/server/auth"
import { usersGroup } from "./users"
import * as Group from "@confect/api/internal/Group"

export const UsersLive = Layer.effect(
  Group.Tag(usersGroup),
  Effect.gen(function*() {
    // Close over dependencies
    const queryDb = yield* QueryDB
    const mutationDb = yield* MutationDB
    const auth = yield* ConfectAuth

    // Return handlers - dependencies are closed over
    return {
      getUser: (args) => Effect.gen(function*() {
        const userId = yield* auth.getUserIdentity()
        if (!userId) {
          return yield* Effect.fail(new Error("Unauthorized"))
        }
        return yield* queryDb.get("users", args.id)
      }),

      createUser: (args) => Effect.gen(function*() {
        const userId = yield* auth.getUserIdentity()
        if (!userId) {
          return yield* Effect.fail(new Error("Unauthorized"))
        }
        const id = yield* mutationDb.insert("users", args)
        return yield* queryDb.get("users", id)
      })
    }
  })
)
```

### 3. Compose and Serve

```typescript
// convex.ts
import * as Api from "@confect/api/internal/Api"
import * as Layer from "effect/Layer"
import { usersGroup, UsersLive } from "./api/users"
import { postsGroup, PostsLive } from "./api/posts"
import { schemaDefinition } from "./schema"

// Define complete API
const myApi = Api.api("myApp").pipe(
  Api.add(usersGroup),
  Api.add(postsGroup)
)

// Compose all implementations
const MyApiLive = Layer.mergeAll(
  UsersLive,
  PostsLive
)

// Serve to Convex
export default Api.serve(schemaDefinition, myApi, MyApiLive)
```

This generates a Convex API:

```typescript
{
  users: {
    getUser: RegisteredQuery,
    createUser: RegisteredMutation
  },
  posts: {
    getPosts: RegisteredQuery,
    createPost: RegisteredMutation
  }
}
```

## Detailed Usage

### Working with Functions

#### Type Extraction

```typescript
import * as Function from "@confect/api/internal/Function"

const getUser = Function.query("getUser")
  .args(Schema.Struct({ id: Schema.String }))
  .returns(UserSchema)

// Extract types
type Name = Function.GetName<typeof getUser> // "getUser"
type Args = Function.GetArgs<typeof getUser> // Schema<{ id: string }>
type ArgsType = Function.GetArgsType<typeof getUser> // { id: string }
type Returns = Function.GetReturns<typeof getUser> // typeof UserSchema
type ReturnsType = Function.GetReturnsType<typeof getUser> // User
```

#### Type Guards

```typescript
import * as Function from "@confect/api/internal/Function"

if (Function.isQuery(fn)) {
  // fn is ConfectApiQueryFunction
}
if (Function.isMutation(fn)) {
  // fn is ConfectApiMutationFunction
}
if (Function.isAction(fn)) {
  // fn is ConfectApiActionFunction
}
```

#### Renaming Functions

```typescript
import * as Function from "@confect/api/internal/Function"

const getUser = Function.query("getUser").args(...).returns(...)
const fetchUser = getUser.pipe(Function.rename("fetchUser"))
```

### Working with Groups

#### Building Groups

```typescript
import * as Group from "@confect/api/internal/Group"

const usersGroup = Group.group("users").pipe(
  Group.add(getUser),
  Group.add(createUser),
  Group.add(updateUser),
  Group.add(deleteUser)
)
```

#### Using Groups as Tags

```typescript
import * as Effect from "effect/Effect"
import * as Group from "@confect/api/internal/Group"

// In an Effect
const program = Effect.gen(function*() {
  const users = yield* Group.Tag(usersGroup)
  const user = yield* users.getUser({ id: "123" })
  return user
})
```

#### Cross-Group Dependencies

```typescript
import * as Layer from "effect/Layer"
import * as Group from "@confect/api/internal/Group"

// Posts depend on Users
const PostsLive = Layer.effect(
  Group.Tag(postsGroup),
  Effect.gen(function*() {
    const db = yield* QueryDB
    const users = yield* Group.Tag(usersGroup) // Depend on another group

    return {
      getPostWithAuthor: (args) => Effect.gen(function*() {
        const post = yield* db.get("posts", args.id)
        const author = yield* users.getUser({ id: post.authorId })
        return { ...post, author }
      })
    }
  })
)

// Provide both layers
const ApiLive = Layer.mergeAll(UsersLive, PostsLive)
```

#### Merging Groups

```typescript
import * as Group from "@confect/api/internal/Group"

const group1 = Group.group("api").pipe(
  Group.add(getUser)
)

const group2 = Group.group("api").pipe(
  Group.add(createUser)
)

const merged = group1.pipe(Group.merge(group2))
// merged has both getUser and createUser
```

### Working with APIs

#### Building APIs

```typescript
import * as Api from "@confect/api/internal/Api"

const myApi = Api.api("myApp").pipe(
  Api.add(usersGroup),
  Api.add(postsGroup),
  Api.add(commentsGroup)
)
```

#### Type Extraction

```typescript
import * as Api from "@confect/api/internal/Api"

type Name = Api.GetName<typeof myApi> // "myApp"
type Groups = Api.GetGroups<typeof myApi> // { users: ..., posts: ..., comments: ... }
type GroupNames = Api.GetGroupNames<typeof myApi> // "users" | "posts" | "comments"
type AllFunctions = Api.GetAllFunctions<typeof myApi> // Union of all functions
```

#### Navigating APIs

```typescript
import * as Api from "@confect/api/internal/Api"

const users = Api.getGroup(myApi, "users")
const getUser = Api.getFunction(myApi, "users", "getUser")
```

#### Merging APIs

```typescript
import * as Api from "@confect/api/internal/Api"

const api1 = Api.api("myApp").pipe(Api.add(usersGroup))
const api2 = Api.api("myApp").pipe(Api.add(postsGroup))

const merged = api1.pipe(Api.merge(api2))
// merged has both users and posts groups
```

#### Serving to Convex

```typescript
import * as Api from "@confect/api/internal/Api"
import * as Layer from "effect/Layer"

// The apiLayer must provide all group Tags
const MyApiLive = Layer.mergeAll(
  UsersLive,  // provides Group.Tag(usersGroup)
  PostsLive   // provides Group.Tag(postsGroup)
)

// Serve to Convex
export default Api.serve(schemaDefinition, myApi, MyApiLive)
```

**Layer signature:**

```typescript
Layer<ROut, never, ConfectBuildTimeServices | ConvexRuntimeServices<S>>
```

- **ROut**: All the group Tags (one Tag per group)
- **Requires**: Build-time services (QueryDB, MutationDB, etc.) + Convex runtime contexts
- **Errors**: Must be `never` (all errors handled internally)

The `serve` function:

1. Merges your `apiLayer` with default Confect service layers
2. For each function, creates a Convex registered function
3. Injects the Convex context (QueryCtx/MutationCtx/ActionCtx) at runtime
4. Returns a nested object: `{ [group]: { [function]: RegisteredFunction } }`

### Working with Plugins

#### Creating Plugins

```typescript
import * as Plugin from "@confect/api/internal/Plugin"
import * as Effect from "effect/Effect"
import { MutationDB } from "@confect/server/database"

// Synchronous plugin
const withLogging = Plugin.forTag(MutationDB, (base) => ({
  insert: (table, value) =>
    Effect.gen(function*() {
      yield* Effect.logInfo(`[DB] Inserting into ${table}`)
      const result = yield* base.insert(table, value)
      yield* Effect.logInfo(`[DB] Inserted ${result}`)
      return result
    })
}))

// Effectful plugin (with dependencies)
const withAudit = Plugin.effectForTag(MutationDB, (base) =>
  Effect.gen(function*() {
    const audit = yield* AuditLog

    return {
      insert: (table, value) =>
        Effect.gen(function*() {
          yield* audit.log(`Inserting into ${table}`, value)
          return yield* base.insert(table, value)
        })
    }
  })
)
```

#### Applying Plugins

```typescript
import * as Layer from "effect/Layer"
import * as Plugin from "@confect/api/internal/Plugin"
import { MutationDB } from "@confect/server/database"

// Single plugin
const Enhanced = Layer.empty.pipe(
  withLogging,
  Layer.provide(MutationDB.Default)
)

// Multiple plugins
const FullyEnhanced = Layer.empty.pipe(
  withLogging,
  withValidation,
  withAudit,
  Layer.provide(MutationDB.Default),
  Layer.provide(AuditLogLive)
)

// Or compose first
const allPlugins = Plugin.compose([
  withLogging,
  withValidation,
  withAudit
])

const Enhanced = Layer.empty.pipe(
  allPlugins,
  Layer.provide(MutationDB.Default),
  Layer.provide(AuditLogLive)
)
```

## Advanced Patterns

### Shared Logic Between Handlers

Since handlers close over dependencies, you can define shared logic within the Layer:

```typescript
const UsersLive = Layer.effect(
  Group.Tag(usersGroup),
  Effect.gen(function*() {
    const db = yield* QueryDB
    const auth = yield* ConfectAuth

    // Shared helper - not exposed via API
    const requireAuth = () => Effect.gen(function*() {
      const userId = yield* auth.getUserIdentity()
      if (!userId) {
        return yield* Effect.fail(new Error("Unauthorized"))
      }
      return userId
    })

    // Handlers use the shared logic
    return {
      getUser: (args) => Effect.gen(function*() {
        yield* requireAuth()
        return yield* db.get("users", args.id)
      }),

      updateUser: (args) => Effect.gen(function*() {
        const userId = yield* requireAuth()
        // Only allow updating own profile
        if (userId !== args.id) {
          return yield* Effect.fail(new Error("Forbidden"))
        }
        yield* db.patch("users", args.id, args.updates)
        return yield* db.get("users", args.id)
      })
    }
  })
)
```

### Layered Dependencies

Build complex dependency graphs by layering implementations:

```typescript
// Low-level: Database access
const UsersDbLive = Layer.effect(
  Group.Tag(usersDbGroup),
  Effect.gen(function*() {
    const db = yield* QueryDB
    return {
      getUser: (id: string) => db.get("users", id),
      listUsers: () => db.query("users").collect()
    }
  })
)

// Mid-level: Business logic (depends on DB)
const UsersServiceLive = Layer.effect(
  Group.Tag(usersServiceGroup),
  Effect.gen(function*() {
    const usersDb = yield* Group.Tag(usersDbGroup)
    const auth = yield* ConfectAuth

    return {
      getCurrentUser: () => Effect.gen(function*() {
        const userId = yield* auth.getUserIdentity()
        if (!userId) return yield* Effect.fail(new Error("Unauthorized"))
        return yield* usersDb.getUser(userId)
      })
    }
  })
)

// Top-level: API handlers (depends on service)
const UsersApiLive = Layer.effect(
  Group.Tag(usersGroup),
  Effect.gen(function*() {
    const service = yield* Group.Tag(usersServiceGroup)

    return {
      getMe: () => service.getCurrentUser()
    }
  })
)

// Compose the stack
const UsersStack = Layer.mergeAll(
  UsersDbLive,
  UsersServiceLive.pipe(Layer.provide(UsersDbLive)),
  UsersApiLive.pipe(Layer.provide(UsersServiceLive))
)
```

### Error Handling

Use Effect's error handling throughout:

```typescript
import * as Data from "effect/Data"

// Define error types
class UserNotFound extends Data.TaggedError("UserNotFound")<{
  userId: string
}> {}

class Unauthorized extends Data.TaggedError("Unauthorized")<{}> {}

// Use in handlers
const UsersLive = Layer.effect(
  Group.Tag(usersGroup),
  Effect.gen(function*() {
    const db = yield* QueryDB
    const auth = yield* ConfectAuth

    return {
      getUser: (args) => Effect.gen(function*() {
        const currentUserId = yield* auth.getUserIdentity().pipe(
          Effect.flatMap(Option.fromNullable),
          Effect.orElseFail(() => new Unauthorized())
        )

        const user = yield* db.get("users", args.id).pipe(
          Effect.flatMap(Option.fromNullable),
          Effect.orElseFail(() => new UserNotFound({ userId: args.id }))
        )

        return user
      })
    }
  })
)
```

### Testing

Test handlers independently of Convex runtime:

```typescript
import { describe, it, expect } from "vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { usersGroup } from "./users"
import { UsersLive } from "./users.live"
import * as Group from "@confect/api/internal/Group"

describe("Users API", () => {
  it("should get user by id", async () => {
    // Create test layer with mocked dependencies
    const TestLayer = Layer.mergeAll(
      QueryDB.Test,  // Mock database
      ConfectAuth.Test  // Mock auth
    )

    const program = Effect.gen(function*() {
      const users = yield* Group.Tag(usersGroup)
      return yield* users.getUser({ id: "123" })
    })

    const result = await program.pipe(
      Effect.provide(UsersLive),
      Effect.provide(TestLayer),
      Effect.runPromise
    )

    expect(result).toEqual({ id: "123", name: "Test User" })
  })
})
```

## Architecture Benefits

### Type Safety

- **End-to-end types**: From API definition through handlers to Convex
- **No any needed**: Proper generics eliminate need for type casts
- **Compile-time validation**: TypeScript catches mismatches between definitions and implementations

### Composability

- **Pipeable API**: All operations use `.pipe()` for clean composition
- **Layer composition**: Standard Effect Layer patterns for dependency injection
- **Plugin system**: Enhance services without modifying core implementations

### Performance

- **Zero transaction overhead**: Cross-function calls within same context are direct function calls
- **Tag resolution at construction**: Dependencies resolved once, not per-invocation
- **No runtime lookups**: TypeScript ensures correct wiring at compile time

### Maintainability

- **Separation of concerns**: API definition separate from implementation
- **Single source of truth**: Function definitions are the contract
- **No handler duplication**: Reuse via Tags, not by extracting separate handler functions
- **Plugin-based extensions**: Add cross-cutting concerns without modifying handlers

### Developer Experience

- **No separate folders**: Everything related to a feature lives together
- **Discoverable APIs**: Type system guides you to available functions
- **Effect ecosystem**: Full access to Effect's utilities (retry, timeout, logging, etc.)
- **Standard patterns**: Follows Effect best practices consistently

---

For more information on Effect patterns, see [CLAUDE.md](/packages/confect/CLAUDE.md) in the repository root.
