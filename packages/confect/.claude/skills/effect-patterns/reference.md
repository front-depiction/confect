# Effect Patterns Reference

## Complete Pattern Catalog

### Error Handling

**Convert nullable to Effect:**
```typescript
Effect.flatMap(Option.fromNullable),
Effect.mapError(() => new MyError())
```

**Convert exception to Error:**
```typescript
Effect.tryPromise({
  try: () => dangerousOperation(),
  catch: () => new MyError(),
})
```

**Die on programmer error:**
```typescript
Effect.orDie  // Unrecoverable defect
```

### Option Combinators

**Match on Option:**
```typescript
Option.match({
  onNone: () => Effect.fail(error),
  onSome: (value) => Effect.succeed(value),
})
```

**fromNullable:**
```typescript
Effect.map(Option.fromNullable)  // T | null → Effect<Option<T>>
```

### Service Patterns

**Define service:**
```typescript
export interface MyService {
  readonly [MyServiceTypeId]: MyServiceTypeId;
  readonly operation: Effect.Effect<Result, Error>;
}

export const MyService = Context.GenericTag<MyService>("my-service");
```

**Create layer:**
```typescript
export const layer = (deps: Deps): Layer.Layer<MyService> =>
  Layer.succeed(MyService, makeService(deps));
```

**Use service:**
```typescript
Effect.flatMap(MyService, (service) => service.operation)
```

### Schema Patterns

**Decode with error handling:**
```typescript
Schema.decodeUnknown(schema)(value).pipe(
  Effect.mapError((parseError) =>
    new MyError({
      message: ParseResult.TreeFormatter.formatErrorSync(parseError),
    }),
  ),
)
```

**Encode:**
```typescript
Schema.encode(schema)(value).pipe(
  Effect.mapError(/* custom error */),
)
```

## Anti-Patterns to Avoid

1. **Barrel imports** - Breaks tree-shaking
2. **flow in Effect chains** - Obscures data flow
3. **Manual type guards** - Use Predicate utilities
4. **Custom errors for absence** - Use Option
5. **Explicit never in signatures** - Keep types clean
6. **Type casts in Effect code** - Design types to align

## Common Effect Operations

```typescript
Effect.succeed(value)           // Pure success
Effect.fail(error)              // Pure failure
Effect.promise(() => async)     // Wrap promise
Effect.tryPromise({ try, catch }) // Promise with error mapping
Effect.map(fn)                  // Transform success
Effect.flatMap(fn)              // Chain Effects
Effect.mapError(fn)             // Transform error
Effect.catchAll(fn)             // Handle all errors
Effect.catchTag("Tag", fn)      // Handle specific error
Effect.orDie                    // Convert to defect
Effect.andThen(effect)          // Sequence Effects
Effect.all([...])               // Parallel execution
Effect.gen(function* () {})     // Generator style
```
