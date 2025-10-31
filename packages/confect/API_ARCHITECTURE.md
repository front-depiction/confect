# Confect API Architecture

**Status:** Design Document
**Date:** 2025-10-31
**Author:** Architecture Analysis Agent

## Executive Summary

This document proposes a comprehensive redesign of Confect's API layer type hierarchy to follow a **schema-first, single-source-of-truth** pattern, inspired by Effect HTTP/RPC and consistent with the existing `src/server/data_model.d.ts` architecture.

**Key Goals:**
1. Eliminate type drift by deriving all API types from a single generic source
2. Replace loose string types with explicit branded type extraction
3. Establish clear separation between definition-time and runtime types
4. Create `src/api/data_model.d.ts` as the type authority for the API layer

---

## Table of Contents

1. [Research: Effect HTTP/RPC Patterns](#research-effect-httprpc-patterns)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Proposed Type Hierarchy](#proposed-type-hierarchy)
4. [Implementation Plan](#implementation-plan)
5. [Migration Strategy](#migration-strategy)
6. [Decision Log](#decision-log)

---

## Research: Effect HTTP/RPC Patterns

### Effect's Architecture

Effect's HTTP API system demonstrates a clear **hierarchical type flow**:

```typescript
// Effect's pattern: Single source → all derived
HttpApi<Id, Groups, E, R>
  ↓
HttpApiGroup<Id, Endpoints, E, R>
  ↓
HttpApiEndpoint<Name, Method, Path, UrlParams, Payload, Headers, Success, Error, R, RE>
```

**Key Design Principles:**

1. **Single Generic Source**: `HttpApi` is parameterized once, all nested types derive from it
2. **Schema-Driven Types**: Every request/response uses `Schema.Schema.Any` for type-safe serialization
3. **Branded Type Extraction**: Names are extracted via conditional types, not accepted as raw strings
4. **Separation of Concerns**:
   - Definition types (`HttpApi`, `HttpApiGroup`, `HttpApiEndpoint`)
   - Derived service types (`HttpApiBuilder.Handlers`, `HttpApiClient.Client`)
   - Runtime types (validated/encoded values)

### Effect RPC's Pattern

```typescript
Rpc<Tag, Payload, Success, Error, Middleware>
  - Tag: Branded string literal (the RPC name)
  - Payload: Schema.Schema.Any (request schema)
  - Success: Schema.Schema.Any (success response schema)
  - Error: Schema.Schema.Any (error schema)
  - Middleware: Tagged middleware services
```

**Notable Features:**
- Type-level brand enforcement (can't pass arbitrary strings)
- Schema-based encode/decode for wire format
- Context requirements (`R = never`) propagated through type system
- Explicit `I` parameter for encoded types

### Lessons for Confect

1. **Generic cascading**: Top-level generic (`GenericConfectApi`) should flow down
2. **Schema integration**: All args/returns should be `Schema.Schema.AnyNoContext`
3. **Branded extraction**: Function/group names should be extracted, not parameterized separately
4. **Context propagation**: `R = never` constraint enforced, `I` varies per schema

---

## Current Architecture Analysis

### Server-Side Architecture (GOOD EXAMPLE)

File: `src/server/data_model.d.ts`

**Pattern:**
```typescript
// Single source of truth
export type GenericConfectSchema = ...

// All types derive from S
export type TableNamesFromSchema<S extends GenericConfectSchema> = ...
export type ConfectDocumentFromSchema<S, TN extends TableNamesFromSchema<S>> = ...
export type TableInfoFromSchema<S, TN> = ...
export type DerivedTableSchema<S, TN, I = never> = ...
```

**Characteristics:**
- ✅ Single generic `S extends GenericConfectSchema` as root
- ✅ All type aliases extract from `S` (no independent generics)
- ✅ Explicit `I = never` for encoded type parameter
- ✅ Clear `R = never` constraint on schemas
- ✅ Legacy types marked as deprecated with migration path

### Current API Architecture (NEEDS IMPROVEMENT)

Files: `src/api/ConfectApi*.ts`

**Pattern:**
```typescript
// Multiple independent generics
ConfectApi<Name extends string, Groups extends ConfectApiGroupAny>
ConfectApiGroup<ConfectSchema, Name, Functions, Groups>
ConfectApiFunction<FunctionType, Name, Args, Returns>
```

**Issues Identified:**

1. **Type Drift**: Types are independently parameterized
   - `Name extends string` - too loose, accepts any string
   - `Groups extends ConfectApiGroupAny` - doesn't derive from API definition
   - `ConfectSchema` appears in Group but not Api

2. **Schema Disconnection**:
   - `ConfectApiWithDatabaseSchema` bolts schema on after the fact
   - Schema isn't part of the core API type hierarchy
   - Type safety gap between API definition and database operations

3. **String Types Everywhere**:
   ```typescript
   // Current: Accepts any string at compile time
   type ConfectApiFunctionName<Function> = Function extends ... ? Name : never

   // No enforcement that Name is actually in the API
   type HandlerWithName<Schema, Function, Name extends string>
   ```

4. **Inconsistent Generic Ordering**:
   - Sometimes `<ConfectSchema, Name, ...>`
   - Sometimes `<Name, Groups, ...>`
   - No clear "root generic flows down" pattern

5. **Missing Data Model File**:
   - Server has `src/server/data_model.d.ts`
   - API has no `src/api/data_model.d.ts`
   - Type aliases scattered across implementation files

### Type Flow Comparison

**Current (Problematic):**
```
User defines API structure
  ↓
Independent type parameters at each level
  ↓
Type casting needed in implementation
  ↓
Runtime string matching to connect pieces
```

**Desired (Like server/):**
```
GenericConfectApi (single source)
  ↓
Extract: ApiGroups<Api>, GroupFunctions<Group>, FunctionName<Function>
  ↓
All derived types reference the source
  ↓
Type system prevents mismatches
```

---

## Proposed Type Hierarchy

### Core Principle: Schema-First API Design

```typescript
// Single source of truth for API layer
type GenericConfectApi = ConfectApi<
  string,                           // API name
  GenericConfectSchema,             // Database schema
  ConfectApiGroupAnyWithProps       // Groups union
>

// All API types derive from this root
```

### Proposed `src/api/data_model.d.ts`

```typescript
import type { Schema } from "effect";
import type { ReadonlyRecord } from "effect/Record";
import type { GenericConfectSchema } from "../server/schema";

// ===========================
// Core Generic Types (Single Source)
// ===========================

/**
 * Generic API type - the single source of truth for the API layer.
 * All other API types derive from this.
 */
export type GenericConfectApi = {
  readonly name: string;
  readonly schema: GenericConfectSchema;
  readonly groups: ReadonlyRecord<string, GenericConfectApiGroup>;
};

/**
 * Generic API Group type.
 */
export type GenericConfectApiGroup = {
  readonly name: string;
  readonly functions: ReadonlyRecord<string, GenericConfectApiFunction>;
  readonly groups: ReadonlyRecord<string, GenericConfectApiGroup>;
};

/**
 * Generic API Function type.
 */
export type GenericConfectApiFunction = {
  readonly functionType: "Query" | "Mutation" | "Action";
  readonly name: string;
  readonly args: Schema.Schema.AnyNoContext;
  readonly returns: Schema.Schema.AnyNoContext;
};

// ===========================
// Type Extraction Aliases (All Derived)
// ===========================

/**
 * Extract the API name from an API definition.
 * This is a branded extraction - the name comes FROM the API, not parameterized.
 */
export type ApiName<Api extends GenericConfectApi> = Api["name"];

/**
 * Extract the database schema from an API definition.
 */
export type ApiSchema<Api extends GenericConfectApi> = Api["schema"];

/**
 * Extract all group names from an API.
 * Returns a union of literal string types.
 */
export type ApiGroupNames<Api extends GenericConfectApi> = keyof Api["groups"] & string;

/**
 * Extract a specific group by name from an API.
 */
export type ApiGroupByName<
  Api extends GenericConfectApi,
  GroupName extends ApiGroupNames<Api>
> = Api["groups"][GroupName];

/**
 * Extract all groups from an API as a union type.
 */
export type ApiGroups<Api extends GenericConfectApi> = Api["groups"][keyof Api["groups"]];

/**
 * Extract function names from a group.
 * Returns a union of literal string types.
 */
export type GroupFunctionNames<Group extends GenericConfectApiGroup> =
  keyof Group["functions"] & string;

/**
 * Extract a specific function by name from a group.
 */
export type GroupFunctionByName<
  Group extends GenericConfectApiGroup,
  FunctionName extends GroupFunctionNames<Group>
> = Group["functions"][FunctionName];

/**
 * Extract all functions from a group as a union type.
 */
export type GroupFunctions<Group extends GenericConfectApiGroup> =
  Group["functions"][keyof Group["functions"]];

/**
 * Extract nested group names from a group.
 */
export type GroupNestedGroupNames<Group extends GenericConfectApiGroup> =
  keyof Group["groups"] & string;

/**
 * Extract nested groups from a group.
 */
export type GroupNestedGroups<Group extends GenericConfectApiGroup> =
  Group["groups"][keyof Group["groups"]];

/**
 * Recursively generate all valid group paths in an API.
 * Returns unions like "users" | "users.admin" | "posts"
 */
export type ApiGroupPaths<Api extends GenericConfectApi> =
  ApiGroupPathsFromGroup<ApiGroups<Api>>;

type ApiGroupPathsFromGroup<Group extends GenericConfectApiGroup> =
  | Group["name"]
  | (GroupNestedGroups<Group> extends never
      ? never
      : `${Group["name"]}.${ApiGroupPathsFromGroup<GroupNestedGroups<Group>>}`);

/**
 * Extract a group at a specific path (e.g., "users.admin").
 */
export type ApiGroupAtPath<
  Api extends GenericConfectApi,
  Path extends string
> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends ApiGroupNames<Api>
    ? ApiGroupAtPath<ApiGroupByName<Api, Head>, Tail>
    : never
  : Path extends ApiGroupNames<Api>
    ? ApiGroupByName<Api, Path>
    : never;

// ===========================
// Function Type Extraction
// ===========================

/**
 * Extract function type (Query/Mutation/Action) from a function.
 */
export type FunctionType<Fn extends GenericConfectApiFunction> = Fn["functionType"];

/**
 * Extract function name from a function.
 */
export type FunctionName<Fn extends GenericConfectApiFunction> = Fn["name"];

/**
 * Extract args schema from a function.
 */
export type FunctionArgs<Fn extends GenericConfectApiFunction> = Fn["args"];

/**
 * Extract returns schema from a function.
 */
export type FunctionReturns<Fn extends GenericConfectApiFunction> = Fn["returns"];

/**
 * Extract the TypeScript type for function arguments (decoded).
 */
export type FunctionArgsType<Fn extends GenericConfectApiFunction> =
  Schema.Schema.Type<FunctionArgs<Fn>>;

/**
 * Extract the TypeScript type for function return value (decoded).
 */
export type FunctionReturnsType<Fn extends GenericConfectApiFunction> =
  Schema.Schema.Type<FunctionReturns<Fn>>;

/**
 * Extract the encoded type for function arguments (wire format).
 */
export type FunctionArgsEncoded<Fn extends GenericConfectApiFunction> =
  Schema.Schema.Encoded<FunctionArgs<Fn>>;

/**
 * Extract the encoded type for function return value (wire format).
 */
export type FunctionReturnsEncoded<Fn extends GenericConfectApiFunction> =
  Schema.Schema.Encoded<FunctionReturns<Fn>>;

// ===========================
// Handler Type Construction
// ===========================

/**
 * Extract the Effect requirements (services) for a function handler.
 * Varies by function type (Query/Mutation/Action).
 */
export type FunctionHandlerRequirements<
  Fn extends GenericConfectApiFunction
> = FunctionType<Fn> extends "Query"
  ? QueryRequirements
  : FunctionType<Fn> extends "Mutation"
    ? MutationRequirements
    : FunctionType<Fn> extends "Action"
      ? ActionRequirements
      : never;

// Service requirement types (imported from server)
import type {
  ConfectAuth,
  ConfectStorageReader,
  ConfectStorageWriter,
  ConfectStorageActionWriter,
  ConfectScheduler,
  ConfectVectorSearch,
  ConfectQueryRunner,
  ConfectMutationRunner,
  ConfectActionRunner,
  ConvexQueryCtx,
  ConvexMutationCtx,
  ConvexActionCtx,
  QueryDB,
  MutationDB,
} from "../server";

export type QueryRequirements =
  | typeof QueryDB
  | ConfectAuth
  | ConfectStorageReader
  | typeof ConfectQueryRunner
  | typeof ConvexQueryCtx;

export type MutationRequirements =
  | typeof QueryDB
  | typeof MutationDB
  | ConfectAuth
  | ConfectScheduler
  | ConfectStorageReader
  | ConfectStorageWriter
  | typeof ConfectQueryRunner
  | typeof ConfectMutationRunner
  | typeof ConvexMutationCtx;

export type ActionRequirements =
  | ConfectScheduler
  | ConfectAuth
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectStorageActionWriter
  | typeof ConfectQueryRunner
  | typeof ConfectMutationRunner
  | typeof ConfectActionRunner
  | typeof ConfectVectorSearch
  | typeof ConvexActionCtx;

/**
 * Handler type for a specific function.
 * Returns an Effect that takes decoded args and returns decoded result.
 */
export type FunctionHandler<Fn extends GenericConfectApiFunction> = <E>(
  args: FunctionArgsType<Fn>
) => Effect.Effect<
  FunctionReturnsType<Fn>,
  E,
  FunctionHandlerRequirements<Fn>
>;

/**
 * Handler map for all functions in a group.
 */
export type GroupHandlers<
  Group extends GenericConfectApiGroup
> = {
  readonly [FnName in GroupFunctionNames<Group>]: FunctionHandler<
    GroupFunctionByName<Group, FnName>
  >;
};

// ===========================
// Client Type Construction
// ===========================

/**
 * Client method for calling a single function.
 * Takes decoded args, returns Effect with decoded result or ParseError.
 */
export type FunctionClientMethod<Fn extends GenericConfectApiFunction> = (
  args: FunctionArgsType<Fn>
) => Effect.Effect<
  FunctionReturnsType<Fn>,
  ParseResult.ParseError
>;

/**
 * Client interface for a group (all its functions as callable methods).
 */
export type GroupClient<Group extends GenericConfectApiGroup> = {
  readonly [FnName in GroupFunctionNames<Group>]: FunctionClientMethod<
    GroupFunctionByName<Group, FnName>
  >;
};

/**
 * Full API client (all groups as properties with their callable functions).
 */
export type ApiClient<Api extends GenericConfectApi> = {
  readonly [GroupName in ApiGroupNames<Api>]: GroupClient<
    ApiGroupByName<Api, GroupName>
  >;
};

// ===========================
// Builder/Server Types
// ===========================

/**
 * Registered Convex function type for a Confect API function.
 */
export type RegisteredFunction<Fn extends GenericConfectApiFunction> =
  RegisteredQuery<
    "public",
    FunctionArgsEncoded<Fn>,
    FunctionReturnsEncoded<Fn>
  >;

/**
 * Server implementation for a group (all functions as registered Convex functions).
 */
export type GroupServer<Group extends GenericConfectApiGroup> = {
  readonly [FnName in GroupFunctionNames<Group>]: RegisteredFunction<
    GroupFunctionByName<Group, FnName>
  >;
};

/**
 * Full API server (all groups with their registered functions).
 */
export type ApiServer<Api extends GenericConfectApi> = {
  readonly [GroupName in ApiGroupNames<Api>]: GroupServer<
    ApiGroupByName<Api, GroupName>
  >;
};

// ===========================
// Validation & Constraints
// ===========================

/**
 * Validate that all function schemas in an API have R = never (no context).
 * This is a compile-time check.
 */
export type ValidateApiSchemas<Api extends GenericConfectApi> =
  ApiGroups<Api> extends infer Group
    ? Group extends GenericConfectApiGroup
      ? GroupFunctions<Group> extends infer Fn
        ? Fn extends GenericConfectApiFunction
          ? [Schema.Schema.Context<Fn["args"]>] extends [never]
            ? [Schema.Schema.Context<Fn["returns"]>] extends [never]
              ? true
              : { error: "Returns schema must have R = never"; function: Fn }
            : { error: "Args schema must have R = never"; function: Fn }
          : never
        : never
      : never
    : never;

// ===========================
// Legacy Compatibility (Deprecated)
// ===========================

/**
 * @deprecated Use ApiGroupNames instead
 */
export type ConfectApiGroupName<Group> = GroupFunctionNames<
  Group extends GenericConfectApiGroup ? Group : never
>;

/**
 * @deprecated Use FunctionHandler instead
 */
export type Handler<
  Schema extends GenericConfectSchema,
  Function extends GenericConfectApiFunction
> = FunctionHandler<Function>;
```

### Type Hierarchy Diagram

```
GenericConfectApi (root)
├── name: string
├── schema: GenericConfectSchema (links to server types)
└── groups: Record<string, GenericConfectApiGroup>
    │
    ├── GenericConfectApiGroup
    │   ├── name: string
    │   ├── functions: Record<string, GenericConfectApiFunction>
    │   │   │
    │   │   └── GenericConfectApiFunction
    │   │       ├── functionType: "Query" | "Mutation" | "Action"
    │   │       ├── name: string
    │   │       ├── args: Schema.Schema.AnyNoContext
    │   │       └── returns: Schema.Schema.AnyNoContext
    │   │
    │   └── groups: Record<string, GenericConfectApiGroup> (recursive)
    │
    └── Derived Types (all extract from GenericConfectApi):
        ├── ApiName<Api>
        ├── ApiSchema<Api>
        ├── ApiGroupNames<Api>
        ├── ApiGroups<Api>
        ├── GroupFunctions<Group>
        ├── FunctionHandler<Fn>
        ├── GroupHandlers<Group>
        ├── ApiClient<Api>
        └── ApiServer<Api>
```

---

## Current vs. Proposed: Side-by-Side

### Function Name Extraction

**Current (Too Loose):**
```typescript
// Accepts ANY string - no branding
type HandlerWithName<
  ConfectSchema extends GenericConfectSchema,
  Function extends ConfectApiFunctionAnyWithProps,
  Name extends string  // ❌ Can be any string literal
>
```

**Proposed (Branded Extraction):**
```typescript
// Name is EXTRACTED from Function, not parameterized
type FunctionName<Fn extends GenericConfectApiFunction> = Fn["name"]

// Usage enforces name comes from API definition
type HandlerForFunction<Fn extends GenericConfectApiFunction> =
  FunctionHandler<Fn>  // Name is implicit via Fn
```

### Group Path Types

**Current (String-Based):**
```typescript
// Runtime string matching with type casts
type ConfectApiGroupWithPath<Group, Path extends string> =
  Path extends `${infer Head}.${infer Tail}`
    ? // Complex conditional with multiple casts
    : never
```

**Proposed (Type-Extracted):**
```typescript
// Paths generated from API structure
type ApiGroupPaths<Api extends GenericConfectApi> =
  ApiGroupPathsFromGroup<ApiGroups<Api>>

// Extract group at path with full type safety
type ApiGroupAtPath<Api, Path extends ApiGroupPaths<Api>>
```

### Client Type Generation

**Current (Manual Mapping):**
```typescript
export type ConfectApiClient<Api> = {
  [GroupName in keyof Api["groups"]]: {
    [FunctionName in keyof Api["groups"][GroupName]["functions"]]: (
      args: Api["groups"][GroupName]["functions"][FunctionName]["args"]["Type"]
    ) => Effect.Effect<...>
  }
}
```

**Proposed (Derived from data_model.d.ts):**
```typescript
// All in data_model.d.ts as type aliases
export type ApiClient<Api extends GenericConfectApi> = {
  readonly [GroupName in ApiGroupNames<Api>]: GroupClient<
    ApiGroupByName<Api, GroupName>
  >
}

export type GroupClient<Group extends GenericConfectApiGroup> = {
  readonly [FnName in GroupFunctionNames<Group>]: FunctionClientMethod<
    GroupFunctionByName<Group, FnName>
  >
}
```

---

## Implementation Plan

### Phase 1: Create `src/api/data_model.d.ts` (Week 1)

**Goal:** Establish type authority without breaking existing code.

**Tasks:**
1. Create file with all type aliases (see full definition above)
2. Export from `src/api/index.ts`
3. Add comprehensive JSDoc comments
4. Write type tests to validate extraction logic

**Validation:**
```typescript
// test/api/data_model.test.ts
import { describe, it, expectTypeOf } from "vitest"
import type { GenericConfectApi, ApiGroupNames, FunctionHandler } from "../src/api/data_model"

describe("API Type Extraction", () => {
  it("extracts group names as literal union", () => {
    type TestApi = GenericConfectApi & {
      groups: {
        users: { name: "users"; functions: {}; groups: {} }
        posts: { name: "posts"; functions: {}; groups: {} }
      }
    }

    expectTypeOf<ApiGroupNames<TestApi>>().toEqualTypeOf<"users" | "posts">()
  })

  // More tests...
})
```

### Phase 2: Refactor Core API Types (Week 2)

**Goal:** Update `ConfectApi`, `ConfectApiGroup`, `ConfectApiFunction` to align with data model.

**Changes:**

**Before:**
```typescript
// ConfectApi.ts
export interface ConfectApi<
  Name extends string,
  Groups extends ConfectApiGroupAny = never
>
```

**After:**
```typescript
// ConfectApi.ts
import type { GenericConfectApi, ApiGroups } from "./data_model"

export interface ConfectApi<
  Name extends string,
  Schema extends GenericConfectSchema,
  Groups extends ConfectApiGroupAny = never
> {
  readonly name: Name
  readonly schema: Schema  // NEW: schema is part of API
  readonly groups: { [GN in Groups["name"]]: Extract<Groups, { name: GN }> }

  add<Group extends ConfectApiGroupAny>(
    group: Group
  ): ConfectApi<Name, Schema, Groups | Group>
}

// Align with data model
export type ConfectApiAnyWithProps = ConfectApi<
  string,
  GenericConfectSchema,
  ConfectApiGroupAnyWithProps
>
```

**Migration:**
- Add `schema` field to `ConfectApi` interface
- Update `make()` to require schema parameter
- Deprecate `ConfectApiWithDatabaseSchema` (merge into `ConfectApi`)

### Phase 3: Add Branded Type Helpers (Week 3)

**Goal:** Replace string-based lookups with branded type extraction.

**Add to implementation files:**
```typescript
// ConfectApiFunction.ts
import type { FunctionName, FunctionArgs, FunctionReturns } from "./data_model"

// Replace scattered utility types with imports from data_model.d.ts
export type ConfectApiFunctionName<Fn> = FunctionName<
  Fn extends GenericConfectApiFunction ? Fn : never
>
```

**Pattern:**
- Keep runtime implementations in `.ts` files
- Import all type-level utilities from `data_model.d.ts`
- Mark old type aliases as `@deprecated` with migration instructions

### Phase 4: Update Handler/Client/Server Types (Week 4)

**Goal:** Align handler, client, and server type generation with data model.

**Changes to `ConfectApiServer.ts`:**
```typescript
import type {
  ApiServer,
  GroupServer,
  RegisteredFunction
} from "./data_model"

// Simplify - types come from data_model.d.ts
export type ConfectApiServer<Api extends GenericConfectApi> = ApiServer<Api>
```

**Changes to `ConfectApiClient.ts`:**
```typescript
import type { ApiClient } from "./data_model"

// Simplify - types come from data_model.d.ts
export type ConfectApiClient<Api extends GenericConfectApi> = ApiClient<Api>
```

### Phase 5: Validation & Testing (Week 5)

**Goal:** Ensure type safety and catch regressions.

**Type Tests:**
```typescript
// test/api/type_safety.test.ts
describe("API Type Safety", () => {
  it("prevents accessing non-existent groups", () => {
    const api = ConfectApi.make("test", schema)
      .add(ConfectApiGroup.make("users"))

    type Client = ApiClient<typeof api>

    // Should compile
    expectTypeOf<Client>().toHaveProperty("users")

    // Should NOT compile
    // @ts-expect-error - "posts" group doesn't exist
    expectTypeOf<Client>().toHaveProperty("posts")
  })

  it("enforces function argument types", () => {
    // Test that client methods require correct args
  })

  it("validates schema R = never constraint", () => {
    // Test that schemas with context fail validation
  })
})
```

**Compile Test:**
```bash
bunx tsc --noEmit
```

### Phase 6: Documentation & Examples (Week 6)

**Goal:** Help developers understand and use the new patterns.

**Documentation:**
1. Update CLAUDE.md with API layer patterns
2. Add inline JSDoc to all data_model.d.ts types
3. Create migration guide for existing APIs
4. Write example showing old vs new patterns

**Example Migration:**
```typescript
// OLD PATTERN (before)
const api = ConfectApi.make("myApi")
const apiWithSchema = ConfectApiWithDatabaseSchema.make(schemaDefinition, api)

// NEW PATTERN (after)
const api = ConfectApi.make("myApi", schema)  // Schema integrated
```

---

## Migration Strategy

### Compatibility Approach: Non-Breaking

**Strategy:** Deprecate-then-remove over 2 major versions.

**Version N (Current):**
- Add new `data_model.d.ts`
- Add schema parameter to `ConfectApi.make()` as optional
- Mark `ConfectApiWithDatabaseSchema` as deprecated
- All old types still work

**Version N+1 (Next Major):**
- Make schema parameter required
- Remove `ConfectApiWithDatabaseSchema`
- Keep deprecated type aliases with migration hints
- Update all examples to new pattern

**Version N+2 (Future Major):**
- Remove all deprecated type aliases
- Pure data_model.d.ts-based types only

### Migration Checklist for Users

When migrating an existing API:

- [ ] Add `import type { ... } from "confect/api/data_model"` for type-level code
- [ ] Change `ConfectApi.make("name")` to `ConfectApi.make("name", schema)`
- [ ] Remove `ConfectApiWithDatabaseSchema` wrapping
- [ ] Update handler type imports to use `FunctionHandler<Fn>` from data_model
- [ ] Replace string-based group/function lookups with branded extractors
- [ ] Run `bunx tsc --noEmit` to catch type errors
- [ ] Update tests to use new client/server types

### Deprecation Messages

```typescript
/**
 * @deprecated Use ConfectApi.make(name, schema) instead.
 *
 * Migration:
 * ```typescript
 * // Before:
 * const api = ConfectApi.make("myApi")
 * const apiWithSchema = ConfectApiWithDatabaseSchema.make(schema, api)
 *
 * // After:
 * const api = ConfectApi.make("myApi", schema)
 * ```
 */
export type ConfectApiWithDatabaseSchema<...> = ...
```

---

## Decision Log

### Decision 1: Why a Separate `data_model.d.ts`?

**Rationale:**
- Mirrors successful `server/data_model.d.ts` pattern
- Separates type-level code (`.d.ts`) from runtime code (`.ts`)
- Makes type hierarchy discoverable in one place
- Prevents circular dependencies between implementation files

**Alternatives Considered:**
- Inline types in implementation files → Rejected (scattered, hard to find)
- Single `api.d.ts` file → Rejected (conflicts with `ConfectApi.ts`)
- Namespace types → Rejected (less ergonomic than direct imports)

### Decision 2: Why Include Schema in ConfectApi?

**Rationale:**
- Database operations need schema for type safety
- Currently bolted on via `ConfectApiWithDatabaseSchema` (awkward)
- API and database are tightly coupled in Confect's design
- Enables deriving table types from API definition

**Alternatives Considered:**
- Keep separate → Rejected (current approach is clunky)
- Make schema optional → Rejected (defeats purpose of type safety)
- Infer schema from handlers → Rejected (circular dependency)

### Decision 3: Why Branded Extraction vs. Parameterization?

**Rationale:**
- Prevents passing arbitrary strings as function/group names
- Aligns with Effect HTTP/RPC pattern
- Makes "name must exist in API" a compile-time guarantee
- Reduces need for type casts in implementation

**Example:**
```typescript
// Parameterized (current) - unsafe
function getHandler<Name extends string>(name: Name) {
  return handlers[name]  // No guarantee "name" exists
}

// Extracted (proposed) - safe
function getHandler<Fn extends GroupFunctions<MyGroup>>(fn: Fn) {
  return handlers[FunctionName<Fn>]  // Guaranteed to exist
}
```

### Decision 4: Why R = never Constraint?

**Rationale:**
- Confect doesn't support schema context requirements
- Aligns with `Schema.Schema.AnyNoContext` pattern
- Simplifies layer composition (no dynamic context threading)
- Matches server-side schema constraints

**Implication:**
- All API schemas must be self-contained
- External context passed via handler requirements, not schema R

### Decision 5: Separate I Parameter vs. Encoded Type Aliases?

**Rationale:**
- Follow Effect Schema pattern: `Schema<A, I, R>`
- `I` varies per schema (user-defined)
- `R = never` is constant (enforced)
- Separate type aliases for `Type` and `Encoded` are clearer than one generic

**Pattern:**
```typescript
// Clear separation
type FunctionArgsType<Fn> = Schema.Schema.Type<FunctionArgs<Fn>>
type FunctionArgsEncoded<Fn> = Schema.Schema.Encoded<FunctionArgs<Fn>>

// vs. Combined (rejected)
type FunctionArgsFormat<Fn, Format extends "Type" | "Encoded"> = ...
```

---

## Comparison to Effect HTTP

### Similarities (What We Adopt)

1. **Hierarchical Type Flow**
   - Effect: `HttpApi` → `HttpApiGroup` → `HttpApiEndpoint`
   - Confect: `ConfectApi` → `ConfectApiGroup` → `ConfectApiFunction`

2. **Schema-Driven Serialization**
   - Effect: All requests/responses use `Schema.Schema.Any`
   - Confect: All args/returns use `Schema.Schema.AnyNoContext`

3. **Single Definition, Multiple Uses**
   - Effect: API def → server + client + docs
   - Confect: API def → server + client (+ future: docs)

4. **Type-Level Name Extraction**
   - Effect: `HttpApiEndpoint.Name<E>`
   - Confect: `FunctionName<Fn>`

### Differences (Intentional)

1. **Database Integration**
   - Effect: HTTP-first, no built-in DB
   - Confect: DB-first (Convex), schema integrated in API

2. **Context Requirements**
   - Effect: `R` propagates through HTTP middleware
   - Confect: `R = never` (services via Layer, not schema context)

3. **Function Types**
   - Effect: HTTP methods (GET, POST, etc.)
   - Confect: Convex semantics (Query, Mutation, Action)

4. **Path Handling**
   - Effect: Rich path DSL with params, templates
   - Confect: Flat groups + function names (no URL paths)

### What We Don't Need from Effect HTTP

- HTTP-specific types (method, headers, status codes)
- Path parameter parsing
- Middleware system (Confect uses Layer)
- Multi-status response schemas

---

## Next Steps

1. **Review & Approve**: Stakeholder review of this document
2. **Prototype**: Create `src/api/data_model.d.ts` in a branch
3. **Validate**: Write type tests to prove the concept
4. **Implement**: Follow 6-week plan above
5. **Document**: Update CLAUDE.md and write migration guide
6. **Release**: Ship as minor version with deprecation warnings

---

## Appendix: Full Type Reference

See proposed `src/api/data_model.d.ts` content above for complete type definitions.

---

**Document Version:** 1.0
**Last Updated:** 2025-10-31
