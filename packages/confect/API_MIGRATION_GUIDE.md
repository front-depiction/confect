# Confect API Migration Guide

This guide helps you migrate existing Confect APIs to the new schema-first type architecture.

## Overview

The new architecture introduces `src/api/data_model.d.ts` as the single source of truth for API types, following the same pattern as `src/server/data_model.d.ts`.

**Key Changes:**
- ✅ Schema is now part of API definition (not bolted on via `ConfectApiWithDatabaseSchema`)
- ✅ All type utilities moved to `data_model.d.ts` (discoverable in one place)
- ✅ Branded type extraction instead of loose string parameters
- ✅ Consistent generic ordering: `Api → Group → Function`

## Migration Checklist

For each existing API:

- [ ] Update `ConfectApi.make()` to include schema parameter
- [ ] Remove `ConfectApiWithDatabaseSchema` wrapper
- [ ] Import type utilities from `api/data_model` instead of implementation files
- [ ] Update handler types to use `FunctionHandler<Fn>`
- [ ] Update client/server type imports
- [ ] Run `bunx tsc --noEmit` to validate types
- [ ] Update tests

## Step-by-Step Migration

### Step 1: Update API Definition

**Before:**
```typescript
import { ConfectApi, ConfectApiGroup, ConfectApiFunction } from "confect/api"
import { ConfectApiWithDatabaseSchema } from "confect/api"
import { schemaDefinition } from "./schema"

const api = ConfectApi.make("myApi")
  .add(
    ConfectApiGroup.make("users")
      .add(
        ConfectApiFunction.query("list")
          .args(Schema.Struct({ limit: Schema.Number }))
          .returns(Schema.Array(UserSchema))
      )
  )

// Schema bolted on separately
const apiWithSchema = ConfectApiWithDatabaseSchema.make(schemaDefinition, api)
```

**After:**
```typescript
import { ConfectApi, ConfectApiGroup, ConfectApiFunction } from "confect/api"
import { schemaDefinition } from "./schema"

// Schema integrated from the start
const api = ConfectApi.make("myApi", schemaDefinition)
  .add(
    ConfectApiGroup.make<typeof schemaDefinition>("users")
      .add(
        ConfectApiFunction.query("list")
          .args(Schema.Struct({ limit: Schema.Number }))
          .returns(Schema.Array(UserSchema))
      )
  )
```

**Changes:**
1. Add schema as second parameter to `ConfectApi.make()`
2. Pass schema type to `ConfectApiGroup.make<Schema>()`
3. Remove `ConfectApiWithDatabaseSchema` wrapper

### Step 2: Update Type Imports

**Before:**
```typescript
import {
  ConfectApiFunctionName,
  ConfectApiFunctionArgs,
  Handler
} from "confect/api/ConfectApiFunction"
import { ConfectApiGroupName } from "confect/api/ConfectApiGroup"
```

**After:**
```typescript
import type {
  FunctionName,
  FunctionArgs,
  FunctionHandler,
  ApiGroupNames
} from "confect/api/data_model"
```

**Changes:**
- Import all type-level utilities from `data_model`
- Use shorter, clearer names (no `Confect` prefix needed)
- Type imports use `import type` for tree-shaking

### Step 3: Update Handler Definitions

**Before:**
```typescript
import { Handler } from "confect/api/ConfectApiFunction"
import type { MySchema } from "./schema"

type ListUsersHandler = Handler<
  MySchema,
  typeof api.groups.users.functions.list
>

const listUsers: ListUsersHandler = (args) =>
  Effect.gen(function* () {
    // Implementation
  })
```

**After:**
```typescript
import type { FunctionHandler } from "confect/api/data_model"

type ListUsersHandler = FunctionHandler<
  typeof api.groups.users.functions.list
>

const listUsers: ListUsersHandler = (args) =>
  Effect.gen(function* () {
    // Implementation
  })
```

**Changes:**
1. Use `FunctionHandler<Fn>` instead of `Handler<Schema, Fn>`
2. Schema no longer needed as separate parameter (it's in the API)

### Step 4: Update Client Code

**Before:**
```typescript
import { ConfectApiClient } from "confect/api/ConfectApiClient"
import type { ConfectApi } from "confect/api/ConfectApi"

const client = ConfectApiClient.make(
  api as ConfectApi<string, any>,
  convexClient
)
```

**After:**
```typescript
import { ConfectApiClient } from "confect/api/ConfectApiClient"
// Types are inferred correctly now, no manual annotation needed

const client = ConfectApiClient.make(api, convexClient)
```

**Changes:**
- Remove type casts (types now align naturally)
- Client type is fully inferred from API definition

### Step 5: Update Server Code

**Before:**
```typescript
import { ConfectApiServer } from "confect/api/ConfectApiServer"
import { ConfectApiBuilder } from "confect/api/ConfectApiBuilder"

const server = ConfectApiServer.make(
  apiWithSchema,  // Wrapped with schema
  handlerLayer
)
```

**After:**
```typescript
import { ConfectApiServer } from "confect/api/ConfectApiServer"
import { ConfectApiBuilder } from "confect/api/ConfectApiBuilder"

const server = ConfectApiServer.make(
  api,  // Schema already integrated
  handlerLayer
)
```

**Changes:**
- Pass `api` directly (no `apiWithSchema` wrapper needed)

### Step 6: Update Tests

**Before:**
```typescript
import { describe, it, expect } from "vitest"

describe("Users API", () => {
  it("lists users", async () => {
    const result = await client.users.list({ limit: 10 })
    expect(result).toBeDefined()
  })
})
```

**After:**
```typescript
import { describe, it, expect } from "vitest"
import * as Effect from "effect/Effect"

describe("Users API", () => {
  it("lists users", async () => {
    const result = await client.users.list({ limit: 10 }).pipe(
      Effect.runPromise
    )
    expect(result).toBeDefined()
  })
})
```

**Changes:**
- Client methods now return `Effect` (more explicit)
- Use `Effect.runPromise` to execute

## Common Patterns

### Pattern 1: Extract Function by Name

**Before:**
```typescript
type ListFn = ConfectApiFunctionWithName<
  typeof api.groups.users.functions,
  "list"
>
```

**After:**
```typescript
import type { GroupFunctionByName } from "confect/api/data_model"

type ListFn = GroupFunctionByName<
  typeof api.groups.users,
  "list"
>
```

### Pattern 2: Get All Function Names

**Before:**
```typescript
type Names = keyof typeof api.groups.users.functions & string
```

**After:**
```typescript
import type { GroupFunctionNames } from "confect/api/data_model"

type Names = GroupFunctionNames<typeof api.groups.users>
```

### Pattern 3: Navigate Nested Groups

**Before:**
```typescript
// Manual path traversal with type casts
const adminGroup = api.groups.users.groups.admin as ConfectApiGroup<...>
```

**After:**
```typescript
import type { ApiGroupAtPath } from "confect/api/data_model"

type AdminGroup = ApiGroupAtPath<typeof api, "users.admin">
const adminGroup = api.groups.users.groups.admin
```

## Breaking Changes

### Removed APIs

1. **`ConfectApiWithDatabaseSchema`**
   - **Reason:** Schema now integrated in `ConfectApi`
   - **Migration:** Pass schema to `ConfectApi.make()` directly

2. **`Handler<Schema, Function>`**
   - **Reason:** Schema parameter redundant (in API definition)
   - **Migration:** Use `FunctionHandler<Function>`

3. **Scattered type utilities**
   - **Reason:** Consolidated in `data_model.d.ts`
   - **Migration:** Import from `confect/api/data_model`

### Changed APIs

1. **`ConfectApi.make(name)`**
   - **Before:** `make(name: string)`
   - **After:** `make(name: string, schema: SchemaDefinition)`
   - **Migration:** Add schema as second parameter

2. **`ConfectApiGroup.make(name)`**
   - **Before:** `make<Schema>(name: string)` (schema generic rarely used)
   - **After:** `make<Schema>(name: string)` (schema generic required)
   - **Migration:** Add schema type parameter

## Validation

After migrating, validate your changes:

```bash
# Type check
bunx tsc --noEmit

# Run tests
bun test

# Build (if applicable)
bun run build
```

## Troubleshooting

### Error: "Type 'string' is not assignable to type 'never'"

**Cause:** Schema parameter missing or wrong generic type.

**Fix:**
```typescript
// ❌ Before (missing schema)
const group = ConfectApiGroup.make("users")

// ✅ After (with schema)
const group = ConfectApiGroup.make<typeof schemaDefinition>("users")
```

### Error: "Property 'schema' does not exist on type 'ConfectApi'"

**Cause:** Using old `ConfectApi` definition.

**Fix:** Update to latest Confect version where `ConfectApi` includes `schema` field.

### Error: "Cannot find module 'confect/api/data_model'"

**Cause:** Using old Confect version without `data_model.d.ts`.

**Fix:** Update Confect to version with new type architecture.

### Type inference not working

**Cause:** Type parameters not flowing through correctly.

**Fix:**
```typescript
// ❌ Explicit types everywhere (loses inference)
const api: ConfectApi<"myApi", typeof schema, ...> = ...

// ✅ Let TypeScript infer
const api = ConfectApi.make("myApi", schema)
  .add(...)
```

## Example: Complete Migration

**Before (Old Pattern):**

```typescript
// schema.ts
import { defineSchema } from "confect/server"
import { Schema } from "effect"

export const schemaDefinition = defineSchema({
  users: {
    withoutSystemFields: Schema.Struct({
      name: Schema.String,
      email: Schema.String
    })
  }
})

// api.ts
import { ConfectApi, ConfectApiGroup, ConfectApiFunction } from "confect/api"
import { ConfectApiWithDatabaseSchema } from "confect/api"
import { schemaDefinition } from "./schema"
import { Schema } from "effect"

const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String
})

const api = ConfectApi.make("myApi")
  .add(
    ConfectApiGroup.make("users")
      .add(
        ConfectApiFunction.query("list")
          .args(Schema.Struct({ limit: Schema.Number }))
          .returns(Schema.Array(UserSchema))
      )
      .add(
        ConfectApiFunction.mutation("create")
          .args(Schema.Struct({ name: Schema.String, email: Schema.String }))
          .returns(UserSchema)
      )
  )

export const apiWithSchema = ConfectApiWithDatabaseSchema.make(
  schemaDefinition,
  api
)

// handlers.ts
import { Handler } from "confect/api/ConfectApiFunction"
import type { schemaDefinition } from "./schema"
import { Effect } from "effect"

type CreateUserHandler = Handler<
  typeof schemaDefinition,
  typeof api.groups.users.functions.create
>

export const createUser: CreateUserHandler = (args) =>
  Effect.gen(function* () {
    // Implementation
  })
```

**After (New Pattern):**

```typescript
// schema.ts
import { defineSchema } from "confect/server"
import { Schema } from "effect"

export const schemaDefinition = defineSchema({
  users: {
    withoutSystemFields: Schema.Struct({
      name: Schema.String,
      email: Schema.String
    })
  }
})

// api.ts
import { ConfectApi, ConfectApiGroup, ConfectApiFunction } from "confect/api"
import { schemaDefinition } from "./schema"
import { Schema } from "effect"

const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String
})

export const api = ConfectApi.make("myApi", schemaDefinition)
  .add(
    ConfectApiGroup.make<typeof schemaDefinition>("users")
      .add(
        ConfectApiFunction.query("list")
          .args(Schema.Struct({ limit: Schema.Number }))
          .returns(Schema.Array(UserSchema))
      )
      .add(
        ConfectApiFunction.mutation("create")
          .args(Schema.Struct({ name: Schema.String, email: Schema.String }))
          .returns(UserSchema)
      )
  )

// handlers.ts
import type { FunctionHandler } from "confect/api/data_model"
import * as Effect from "effect/Effect"

type CreateUserHandler = FunctionHandler<
  typeof api.groups.users.functions.create
>

export const createUser: CreateUserHandler = (args) =>
  Effect.gen(function* () {
    // Implementation
  })
```

## Benefits After Migration

1. **Type Safety**: Schema integrated at API definition time
2. **Discoverability**: All types in one place (`data_model.d.ts`)
3. **Less Boilerplate**: No need for `ConfectApiWithDatabaseSchema` wrapper
4. **Better Inference**: Types flow naturally without casts
5. **Consistency**: Same pattern as server layer

## Need Help?

- Review `API_ARCHITECTURE.md` for design rationale
- Check `src/api/data_model.d.ts` for type reference
- See examples in `test/api/` directory
- Consult CLAUDE.md for Confect development patterns

## Version Support

- **Old pattern** (deprecated): Supported until v2.0.0
- **New pattern** (recommended): Available from v1.x.0
- **Migration period**: v1.x.0 - v2.0.0 (both patterns work)
- **Old pattern removed**: v2.0.0+
