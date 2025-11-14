# Type Issues Report: Group Layer Composition

## Status: EXPOSED - All Type Safety Workarounds Removed

All type casts (`as any`), result type assertions (`as { ... }`), and useless Layer type checks have been removed from `Group.test.ts`. The tests **pass at runtime (45/45)** but **fail at compile time (6 errors)**, exposing the fundamental type system issues.

## Summary

After removing all type safety workarounds from `Group.test.ts`, 6 type errors emerged. All errors follow the same pattern: **the Tag classes created in tests are not being recognized as the same type as the Tags created internally by `Group.build()`**.

## Core Issue

The fundamental problem is that `Group.build()` returns:
```typescript
Layer.Layer<ReturnType<ReturnType<typeof Tag<typeof group>>>, E, R>
```

This creates a **fresh Tag instance** at runtime via `Tag(group)()`. However, when tests create Tag classes like:
```typescript
class NotesReadTag extends Group.Tag(notesGroup)<NotesReadTag>() {}
```

These are **different Tag instances** than what `Group.build()` creates internally. TypeScript sees them as distinct types, even though they represent the same service.

## Error Pattern

All 6 errors follow this pattern:

```
Error: Argument of type 'Effect<A, E, TagX | TagY>' is not assignable to
       parameter of type 'Effect<A, E, never>'.
Type 'TagX | TagY' is not assignable to type 'never'.
```

This occurs when calling `Effect.runPromise(program.pipe(Effect.provide(CombinedLayer)))`.

### Why This Happens

1. **Program requires services**: `program` has type `Effect<A, E, TagX | TagY>` because it `yield*`s multiple Tag classes
2. **Layer provides services**: `CombinedLayer` has type `Layer<TagX' | TagY', E, never>` where `TagX'` and `TagY'` are the Tags created internally by `Group.build()`
3. **TypeScript can't unify them**: Even though `TagX` and `TagX'` represent the same service conceptually, they're different types
4. **Effect.provide fails**: TypeScript thinks the Layer doesn't provide what the program needs, so R stays as `TagX | TagY` instead of becoming `never`
5. **Effect.runPromise rejects**: `Effect.runPromise` requires `Effect<A, E, never>` but gets `Effect<A, E, TagX | TagY>`

## Affected Tests

All tests that compose multiple group layers:

### 1. Query group depends on mutation group (line 578)
```typescript
// NotesWriteTag and NotesReadTag created by test
const program = Effect.gen(function* () {
  const readHandlers = yield* NotesReadTag;  // Uses test's Tag class
  // ...
});

// CombinedLayer built from Group.build() which creates its own Tag instances
const CombinedLayer = Layer.mergeAll(
  NotesWriteLive,  // provides Tag created by Group.build(notesWriteGroup)
  NotesReadLive.pipe(Layer.provide(NotesWriteLive))
);

// Error: NotesReadTag !== internal Tag, so R doesn't resolve to never
Effect.runPromise(program.pipe(Effect.provide(CombinedLayer)))
```

**Error**: `Effect<..., NotesWriteTag | NotesReadTag>` is not assignable to `Effect<..., never>`

### 2. Multiple groups share dependencies (line 653)
Same issue with `UsersTag | PostsTag`

### 3. Multi-level dependency chains (line 763)
Same issue with `UsersTag | ProfileTag`

### 4. Diamond dependency pattern (line 859)
Same issue with `AuthTag | StorageTag | AppTag`

### 5. Convex-like cache invalidation (line 1067)
Same issue with `NotesMutationTag | NotesQueryTag`

### 6. Middleware pattern (line 1120)
Same issue with `ProtectedTag`

## Root Cause Analysis

### The Tag Identity Problem

When you write:
```typescript
const group = Group.group("notes").pipe(/* ... */);
class Notes extends Group.Tag(group)<Notes>() {}
```

You're creating a **specific Tag class** that gets stored in the `Notes` identifier.

But when `Group.build()` runs:
```typescript
export const build = dual(2, (group: any, effect: any) => {
  const tag = Tag(group)();  // Creates a NEW Tag instance
  return Layer.effect(tag, effect);
});
```

It creates a **different Tag instance** via `Tag(group)()`, even though it's built from the same group.

### Why Context.Tag Doesn't Have This Problem in Effect Platform

In Effect Platform's HTTP API, they don't have this issue because:

1. **Single Tag instance**: They export the Tag itself, not a factory
   ```typescript
   export const HttpRouter: Tag<HttpRouter, HttpRouter> = Context.GenericTag("@effect/platform/HttpRouter")
   ```

2. **Consistent reference**: Everyone uses the same exported Tag instance
   ```typescript
   // Definition
   export const HttpRouter = Context.GenericTag("...")

   // Layer building
   const layer = Layer.effect(HttpRouter, implementation)

   // Usage
   yield* HttpRouter  // Same instance
   ```

3. **No factory pattern**: No `HttpRouter(config)` that creates different instances

### Why Confect Has This Problem

Confect uses a **factory pattern** where:
- `Group.Tag(group)` returns a factory function
- Each call to the factory `()` creates a **new Tag instance**
- Test code calls factory once: `class NotesTag extends Group.Tag(group)<NotesTag>(){}`
- `Group.build()` calls factory again: `const tag = Tag(group)()`
- These are **different instances** with different identities

## Type System Perspective

TypeScript's type system sees:

```typescript
// Test creates
type TestTag = ReturnType<ReturnType<typeof Group.Tag<typeof notesGroup>>>

// Group.build returns
type BuildTag = ReturnType<ReturnType<typeof Group.Tag<typeof notesGroup>>>
```

Even though these **look the same**, TypeScript treats each `ReturnType<ReturnType<...>>` invocation as a **fresh type**. The group object `typeof notesGroup` is widened to a structural type, losing the specific instance identity.

This is similar to how:
```typescript
type A = { x: number } & { y: string }
type B = { x: number } & { y: string }
```
Are structurally identical but not the same type for type narrowing purposes.

## Implications

This reveals a **fundamental architectural issue**:

1. **Tests can't properly type-check Layer composition** without `as any`
2. **Tag identity is not stable** across `Group.build()` boundaries
3. **The factory pattern breaks type-level service identification**
4. **Real application code would have the same issue** if it tried to use Tag classes in multiple places

## Why Tests Pass at Runtime

The tests pass at runtime because Effect's Context.Tag implementation uses **nominal identity based on the tag's key (the group name)**. So even though TypeScript sees different types, at runtime:

```typescript
Tag(group)() // Creates tag with key "notes"
class Notes extends Group.Tag(group)<Notes>(){} // Also creates tag with key "notes"
```

Both resolve to the same service at runtime because they have the same string key.

## Potential Solutions

### Option 1: Single Tag Instance Per Group
Store the Tag on the group itself, ensuring everyone uses the same instance:
```typescript
// During group creation, attach the Tag
const group = Group.group("notes")
group[TagSymbol] = Tag(group)() // Store singleton

// Group.build uses the stored Tag
const tag = group[TagSymbol]

// Tests use the stored Tag
const notesTag = notesGroup[TagSymbol]
```

### Option 2: Make Group Itself a Tag
Remove the factory pattern and make ConfectApiGroup extend Context.Tag directly:
```typescript
interface ConfectApiGroup<Name, Functions> extends Context.Tag<Name, HandlersFor<...>> {
  // ...
}
```

### Option 3: Type-Level Tag Unification
Use TypeScript's type system to unify Tags based on the group's name as a unique symbol:
```typescript
type TagFor<G extends ConfectApiGroup<any, any>> = Context.Tag<GetName<G>, HandlersFor<G>>
```

Then ensure `Group.build()` and test Tag classes resolve to the exact same type.

### Option 4: Accept the Limitation
Document that Tag classes should only be created once per group and exported, never created inline in tests or multiple times.

## Recommended Next Steps

1. **Decide on architecture**: Choose between making Groups be Tags (Option 2) or storing Tags on Groups (Option 1)
2. **Update Group.ts**: Implement the chosen solution
3. **Remove `as any` workarounds**: Verify types compose correctly
4. **Add negative tests**: Ensure TypeScript catches actual type errors
5. **Document the pattern**: Update examples to show the correct Tag usage pattern
