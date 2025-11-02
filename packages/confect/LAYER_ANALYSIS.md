# Layer Management Patterns Analysis

## Executive Summary

The codebase has **three distinct patterns** for layer management that need to be unified:

1. **Effect.Service with `.Default` layer** - Used by most services (ConfectAuth, ConfectScheduler, ConfectStorageReader, etc.)
2. **Effect.Service with `.TypedDefault<S>()` method** - Only used by ConfectQueryRunner (incomplete pattern)
3. **Manual `layer*` factory functions** - Used by services that need runtime context (database, storage, runners)

The current state has **inconsistencies and bugs**:
- `layerQueryDB()` doesn't accept parameters but uses them in the implementation
- Services in `http.ts` reference missing `layer*` functions (layerAuth, layerScheduler, layerQueryRunner, etc.)
- `functions.ts` calls functions with incorrect signatures (lines 253-261 pass context but functions don't accept it)
- `layerConfectActionCtx` is referenced but doesn't exist
- Database layers need schema definition context but can't get it

---

## 1. Services Using Effect.Service with .Default

These services use the standard Effect.Service pattern with automatic `.Default` layer generation:

### ConfectAuth (auth.ts)
```typescript
export class ConfectAuth extends Effect.Service<ConfectAuth>()("@rjdellecese/confect/ConfectAuth", {
  effect: Effect.gen(function* () {
    const auth = yield* ConvexAuth;  // Gets from context
    return make(auth);
  }),
  accessors: true,
}) {}
```
- **Pattern**: Depends on `ConvexAuth` context tag
- **Layer provision**: `.Default` automatically created
- **Usage**: `ConfectAuth.Default` in layer merges
- **Status**: CORRECT

### ConfectScheduler (scheduler.ts)
```typescript
export class ConfectScheduler extends Effect.Service<ConfectScheduler>()("@rjdellecese/confect/ConfectScheduler", {
  effect: Effect.gen(function* () {
    const scheduler = yield* ConvexScheduler;
    return make(scheduler);
  }),
  accessors: true,
}) {}
```
- **Pattern**: Same as ConfectAuth
- **Status**: CORRECT

### ConfectStorageReader & ConfectStorageWriter (storage.ts)
```typescript
export class ConfectStorageReader extends Effect.Service<ConfectStorageReader>()(...) {}
export class ConfectStorageWriter extends Effect.Service<ConfectStorageWriter>()(...) {}
export class ConfectStorageActionWriter extends Effect.Service<ConfectStorageActionWriter>()(...) {}
```
- **Pattern**: Same as above
- **Status**: CORRECT, BUT...
- **Issue**: `layerStorageWriter()` and `layerStorageActionWriter()` exist as factory functions that override `.Default`
  - These are used in `functions.ts` (line 258, 259) to inject specific storage instances
  - But they use `as any` casts (lines 103, 145) - type-unsafe

### ConfectQueryRunner & ConfectMutationRunner & ConfectActionRunner (runners.ts)
```typescript
export class ConfectQueryRunner extends Effect.Service<ConfectQueryRunner>()(...) {
  static TypedDefault<S extends GenericConfectSchema>() {
    return this.Default as Layer.Layer<ConfectQueryRunner, never, ConvexQueryRunner<S>>
  }
}
```
- **Pattern**: Has both `.Default` AND `.TypedDefault<S>()`
- **Status**: INCOMPLETE - only ConfectQueryRunner has TypedDefault

---

## 2. Services with .TypedDefault<S>() Methods (Target Pattern)

### ConfectQueryRunner - THE MODEL TO FOLLOW
```typescript
export class ConfectQueryRunner extends Effect.Service<ConfectQueryRunner>()(...) {
  static TypedDefault<S extends GenericConfectSchema>() {
    return this.Default as Layer.Layer<
      ConfectQueryRunner,
      never,
      ConvexQueryRunner<S>
    >;
  }
}
```

**What this does:**
1. Keeps `.Default` for untyped usage
2. Adds `.TypedDefault<S>()` that specifies schema-specific requirements
3. Returns the same layer with properly typed requirements

**Why this pattern?**
- Allows code to be schema-aware without breaking existing code
- Enables proper type checking of layer dependencies
- Makes the schema constraint visible at the layer level

**Services that NEED TypedDefault:**
- ConfectMutationRunner (needs schema for its requirements)
- ConfectActionRunner (needs schema for its requirements)

---

## 3. Database Layers - The Problem

### Current Implementation Issues

#### layerQueryDB (database.ts:188)
```typescript
export const layerQueryDB = <S extends GenericConfectSchema>() =>
  Layer.effect(
    QueryDB<S>(),
    Effect.gen(function* () {
      const ctx = yield* ConvexQueryCtx<S>();
      const schemaDefinition = yield* ConfectSchemaDefinitionTag<S>();
      return makeQueryDB(schemaDefinition, ctx.db);
    }),
  );
```

**Current Issues:**
1. ✅ Correctly typed with generic S
2. ✅ Provides its own schema definition context
3. ❌ BUT in `functions.ts:140`, called as `layerQueryDB<ConfectSchema>()` with NO parameters
4. ❌ BUT in `functions.ts:253`, called as `layerQueryDB<ConfectSchema>(confectSchemaDefinition, ctx.db)` with parameters it doesn't accept

**The function has wrong signature** - it should either:
- **Option A**: Accept parameters: `layerQueryDB<S>(schemaDefinition, db)`
- **Option B**: Get everything from context (current design)

**Current design is Option B** (get from context), but `functions.ts` tries to use Option A.

#### layerMutationDB (database.ts:332)
```typescript
export const layerMutationDB = <S extends GenericConfectSchema>() =>
  Layer.effect(
    MutationDB<S>(),
    Effect.gen(function* () {
      const ctx = yield* ConvexMutationCtx<S>();
      const schemaDefinition = yield* ConfectSchemaDefinitionTag<S>();
      return makeMutationDB(schemaDefinition, ctx.db);
    }),
  ).pipe(Layer.provideMerge(layerQueryDB<S>()));
```

**Same issues as layerQueryDB**

### How Schemas Get Provided

In `functions.ts`, the schema definition needs to be provided to the database layers. Currently:

```typescript
// Line 252-262 (mutation handler)
const layers: Layer.Layer<any> = Layer.mergeAll(
  layerQueryDB<ConfectSchema>(confectSchemaDefinition, ctx.db),  // WRONG SIGNATURE
  layerMutationDB<ConfectSchema>(confectSchemaDefinition, ctx.db),  // WRONG SIGNATURE
  // ...
);
```

But `layerQueryDB` and `layerMutationDB` don't accept these parameters. The schema needs to be provided via:
```typescript
layerConfectSchemaDefinition<ConfectSchema>(confectSchemaDefinition)
```

This tag was created for exactly this purpose (database.ts:351).

---

## 4. Context Layers Pattern (convex_ctx.ts)

These convert raw Convex contexts into Effect context tags:

```typescript
export const layerQueryCtx = <S extends GenericConfectSchema>(
  ctx: GenericQueryCtx<DataModelFromConfectSchema<S>>
) => Layer.succeed(ConvexQueryCtx<S>(), ctx).pipe(
  Layer.merge(Layer.succeed(ConvexAuth, ctx.auth)),
  Layer.merge(Layer.succeed(ConvexStorageReader, ctx.storage))
);
```

**Pattern**:
1. Takes raw Convex context
2. Provides it to context tags (ConvexQueryCtx, ConvexAuth, ConvexStorageReader, etc.)
3. Returns merged layer that other services depend on

**Status**: CORRECT - these work well

---

## 5. Missing layer*() Factory Functions

The `http.ts` file references these factory functions that don't exist:

```typescript
// http.ts lines 79-86
layerQueryRunner<any>(),      // ❌ DOESN'T EXIST - should use ConfectQueryRunner.Default or .TypedDefault<S>()
layerMutationRunner<any>(),   // ❌ DOESN'T EXIST
layerActionRunner<any>(),     // ❌ DOESN'T EXIST
layerScheduler<any>(),        // ❌ DOESN'T EXIST
layerAuth<any>(),             // ❌ DOESN'T EXIST
```

These should either:
1. Be created as simple factory functions that return `.Default`
2. Be removed and use `.Default` directly

Looking at the pattern from `vector_search.ts` (line 65):
```typescript
export const layer = ConfectVectorSearch.Default;
```

This suggests they should be simple exports, not factory functions.

---

## 6. Functions.ts Layer Assembly Issues

### Query Handler (lines 139-145)
```typescript
const layers = Layer.mergeAll(
  layerQueryDB<ConfectSchema>(),          // ✅ OK
  ConfectAuth.Default,                    // ✅ OK
  ConfectStorageReader.Default,           // ✅ OK (but no context provided)
  ConfectQueryRunner.TypedDefault<ConfectSchema>(),  // ✅ OK - GOOD EXAMPLE
  ConfectStorageReader.Default            // ❌ DUPLICATE! Listed twice
);
```

**Issues:**
1. `ConfectStorageReader.Default` is listed twice (line 142, 144)
2. No context is provided for storage, auth, or scheduler

### Mutation Handler (lines 252-262)
```typescript
const layers: Layer.Layer<any> = Layer.mergeAll(
  layerQueryDB<ConfectSchema>(confectSchemaDefinition, ctx.db),           // ❌ WRONG SIGNATURE
  layerMutationDB<ConfectSchema>(confectSchemaDefinition, ctx.db),        // ❌ WRONG SIGNATURE
  layerAuth(ctx.auth),                    // ❌ DOESN'T EXIST
  layerScheduler(ctx.scheduler),          // ❌ DOESN'T EXIST
  layerStorageReader(ctx.storage),        // ❌ DOESN'T EXIST
  layerStorageWriter(ctx.storage),        // ✅ EXISTS (with type casts)
  layerQueryRunner(ctx.runQuery),         // ❌ DOESN'T EXIST
  layerMutationRunner(ctx.runMutation),   // ❌ DOESN'T EXIST
  layerMutationCtx(ctx)                   // ✅ EXISTS
);
```

**Major Issues:**
1. Database layers called with wrong signatures
2. Many factory functions don't exist
3. Should use `layerMutationCtx(ctx)` which already provides all the context tags

### Action Handler (lines 371-375)
```typescript
const layers = Layer.mergeAll(
  ConfectAuth,              // ❌ WRONG - should be ConfectAuth.Default
  ConfectScheduler,         // ❌ WRONG - should be ConfectScheduler.Default
);
const layer = Layer.provideMerge(layerConfectActionCtx, layerActionCtx(ctx));  // ❌ WRONG - layerConfectActionCtx doesn't exist
```

**Major Issues:**
1. Service classes used instead of `.Default` layers
2. References non-existent `layerConfectActionCtx`
3. Incorrect layer construction

---

## 7. Summary of Issues

### Type Safety Issues
- Storage layers use `as any` casts (storage.ts:103, 145)
- ConfectStorageReader has no TypedDefault for schema-aware usage
- No QueryDB.TypedDefault or MutationDB.TypedDefault

### Missing Functions
- `layerAuth()` - referenced but doesn't exist
- `layerScheduler()` - referenced but doesn't exist
- `layerQueryRunner()` - referenced but doesn't exist
- `layerMutationRunner()` - referenced but doesn't exist
- `layerActionRunner()` - referenced but doesn't exist
- `layerConfectActionCtx()` - referenced but doesn't exist
- `layerStorageReader()` - referenced but doesn't exist

### Signature Mismatches
- `layerQueryDB()` called with parameters it doesn't accept
- `layerMutationDB()` called with parameters it doesn't accept
- Services used as layers instead of `.Default`

### Architectural Issues
- No consistent way to inject runtime Convex context (db, auth, storage, scheduler)
- Database layers can't access schema definition from mutation context
- Query handler doesn't provide context for services (auth, storage)
- Action handler is fundamentally broken

---

## Correct Patterns to Follow

### 1. Services with .Default Layer Only
```typescript
export class ConfectAuth extends Effect.Service<ConfectAuth>()(...) {}
// Usage: ConfectAuth.Default
```

### 2. Services with TypedDefault
```typescript
export class ConfectQueryRunner extends Effect.Service<ConfectQueryRunner>()(...) {
  static TypedDefault<S extends GenericConfectSchema>() {
    return this.Default as Layer.Layer<
      ConfectQueryRunner,
      never,
      ConvexQueryRunner<S>
    >;
  }
}
// Usage: ConfectQueryRunner.TypedDefault<S>()
```

### 3. Factory Functions for Runtime Context
```typescript
// For services that need specific instances provided at runtime
export const layerStorageWriter = (storageWriter: StorageWriter) =>
  Layer.succeed(ConfectStorageWriter, makeStorageWriter(storageWriter));
```

### 4. Context Layers
```typescript
// Converts raw Convex contexts into Effect context tags
export const layerMutationCtx = <S extends GenericConfectSchema>(
  ctx: GenericMutationCtx<DataModelFromConfectSchema<S>>
) => Layer.succeed(ConvexMutationCtx<S>(), ctx).pipe(
  // ... provides all sub-context tags
);
```

### 5. Proper Layer Assembly in Handlers
```typescript
// Query handler - simple, provides minimal context
const layers = Layer.mergeAll(
  layerQueryCtx(ctx),          // Provides all Convex context tags
  layerConfectSchemaDefinition(schemaDefinition),  // Provides schema
);

// Mutation handler - uses context layer
const layers = Layer.mergeAll(
  layerMutationCtx(ctx),       // Provides ALL Convex context and tags
  layerConfectSchemaDefinition(schemaDefinition),  // Provides schema
);

// Action handler - uses action context layer
const layers = Layer.mergeAll(
  layerActionCtx(ctx),         // Provides ALL action context and tags
);
```

---

## What Needs to Be Fixed

### High Priority (Breaks compilation/functionality)
1. **functions.ts mutation handler** - Fix layer assembly to use correct signatures
2. **functions.ts action handler** - Completely broken, needs rewrite
3. **Missing factory functions** - Create or remove references

### Medium Priority (Type safety, consistency)
1. **Add TypedDefault to MutationDB and QueryDB** - If needed for schema awareness
2. **Add TypedDefault to MutationRunner and ActionRunner** - For consistency
3. **Remove type casts from storage factories** - Make them type-safe

### Low Priority (Code quality)
1. **Remove duplicate ConfectStorageReader.Default** in query handler
2. **Export simple `layer` exports** from service modules (like vector_search does)
3. **Document the pattern** in code comments

---

## Implementation Order

1. **Fix layer assembly in functions.ts** (most critical)
   - Query: Add context provision, remove duplicate
   - Mutation: Use `layerMutationCtx()` to provide all Convex context
   - Action: Use `layerActionCtx()` to provide all action context

2. **Fix missing factory functions** (if needed)
   - Determine if `http.ts` should use `.Default` directly
   - Create or remove factory function references

3. **Add TypedDefault where needed**
   - Query/MutationRunner (for consistency)
   - Storage (for schema awareness)

4. **Remove type casts**
   - Storage factory functions

5. **Add exports for simple layers**
   - `export const layer = ConfectAuth.Default` in auth.ts, etc.
