---
name: effect-patterns
description: Knowledge of idiomatic Effect TypeScript patterns including proper imports for tree-shaking, avoiding flow in Effect chains, using Predicate utilities, and functional programming style. Use when writing or modifying Effect code.
allowed-tools: Read, mcp__effect-docs__effect_docs_search, mcp__effect-docs__get_effect_doc
---

# Effect Code Patterns

This Skill provides idiomatic Effect patterns for writing clean, functional TypeScript code.

## Import Pattern (Critical for Tree-Shaking)

Always use namespace imports from submodules:

```typescript
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Predicate from "effect/Predicate";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
```

**Never** use barrel imports: `import { Effect } from "effect"`

Exception: `import { pipe } from "effect"` is acceptable.

## Effect Pipeline Patterns

### Method-Style Pipe (Preferred)

```typescript
Effect.promise(() => query.first()).pipe(
  Effect.map(Option.fromNullable),
  Effect.flatMap(/* ... */),
)
```

### Use Explicit `map` and `flatMap` - Never `andThen`

`Effect.andThen` magically switches between `map` and `flatMap` depending on what the callback returns. Use explicit `map` and `flatMap` instead.

```typescript
// ✅ DO - Explicit and clear
Effect.map((x) => x.value)      // Returns non-Effect → map
Effect.flatMap((x) => fetch(x)) // Returns Effect → flatMap

// ❌ DON'T - Magic behavior
Effect.andThen((x) => x.value)  // Unclear which operation
Effect.andThen((x) => fetch(x)) // Unclear which operation
```

### Avoid flow in Effect Chains

```typescript
// ❌ DON'T
Effect.flatMap(flow(Option.fromNullable, Option.match({...})))

// ✅ DO
Effect.map(Option.fromNullable),
Effect.flatMap(Option.match({...}))
```

### fromNullable + mapError Pattern

```typescript
Effect.promise(() => get(id)).pipe(
  Effect.flatMap(Option.fromNullable),
  Effect.mapError(() => new NotFoundError({ id })),
)
```

### Option vs Errors

- Use `Option` for valid absence
- Use errors for exceptional conditions

```typescript
// Valid absence → Option
readonly getUserIdentity: Effect.Effect<Option.Option<UserIdentity>>;

// Error condition → Error
readonly getFile: Effect.Effect<Blob, FileNotFoundError>;
```

### orDie for Unexpected Errors

```typescript
Effect.flatMap(Schema.decode(Schema.URL)),
Effect.orDie  // Programmer error if fails
```

## Predicate Utilities

Replace manual type guards:

```typescript
// ✅ Use Predicate
Predicate.hasProperty(doc, "_id") && Predicate.isString(doc._id)

// ❌ Don't manually check with type casts
typeof doc === "object" && doc !== null && "_id" in doc
```

Common utilities:
- `Predicate.hasProperty(obj, key)`
- `Predicate.isString(value)`
- `Predicate.isNumber(value)`
- `Predicate.isObject(value)`
- `Predicate.isNullable(value)`

## Type Signatures

Omit trailing `never`:

```typescript
// ✅ Clean
Effect.Effect<URL>
Effect.Effect<T, MyError>

// ❌ Verbose
Effect.Effect<URL, never>
Effect.Effect<T, MyError, never>
```

## Resources

- Effect docs MCP: `mcp__effect-docs__effect_docs_search`
- See `reference.md` for more patterns
