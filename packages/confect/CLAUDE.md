# Generic Type Design Principles

## Single Source of Truth: `GenericConfectSchema`

All functions that are generic over database definitions should **only be generic over `GenericConfectSchema`**, with all other types derived from it. This design principle dramatically improves and simplifies generic handling since we are only truly generic over one concept.

## Type Hierarchy

```typescript
GenericConfectSchema (S)
  ↓ user defines this
ConfectSchemaDefinition<S>
  ↓ type-level transformation
ConfectDataModel
  ↓ extract metadata
TableInfo, Document types, etc.
```

## The Problem with Over-Parametrization

**Bad - Multiple Independent Generics:**
```typescript
// DON'T: Too many unrelated generic parameters
export const makeOrderedQuery = <
  DM extends GenericConfectDataModel,
  TN extends TableNamesInConfectDataModel<DM>,
  A extends ConfectDocumentByName<DM, TN>,
  TableInfo extends GenericTableInfo,
  I = never,
  R = never
>(
  query: OrderedQuery<TableInfo>,
  tableName: TN,
  tableSchema: Schema.Schema<A, I, R> | undefined,
): ConfectOrderedQuery<TableInfo>
```

Problems:
- 6 generic parameters that should all be related
- `TableInfo` is independent of the schema, creating type drift
- `A` (document type) is separate from `TableInfo`
- `R` is always `never` (schemas are `AnyNoContext`) but parameterized anyway
- Requires extensive type casts (`as never`) to satisfy type checker

## The Solution: Derive Everything from Schema

**Good - Single Source Generic:**
```typescript
// DO: Single generic with everything derived
export const makeOrderedQuery = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
  I = never
>(
  query: OrderedQuery<TableInfoFromSchema<S, TN>>,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): ConfectOrderedQuery<TableInfoFromSchema<S, TN>>
```

Benefits:
- Only 2 meaningful generic parameters (`S` and `TN`)
- `I` is the encoded type, which varies per schema
- `TableInfo` is derived from `S` and `TN` - no type drift possible
- Document type is derived from `S` and `TN` automatically
- `R` is hardcoded to `never` (schemas have no context)
- No type casts needed - everything aligns perfectly

## Type Aliases for Clean Signatures

```typescript
// Primary aliases - parametrized on Schema (S)
export type TableNamesFromSchema<S extends GenericConfectSchema>
export type ConfectDocumentFromSchema<S, TN extends TableNamesFromSchema<S>>
export type TableInfoFromSchema<S, TN extends TableNamesFromSchema<S>>
export type DerivedTableSchema<S, TN, I = never> =
  Schema.Schema<ConfectDocumentFromSchema<S, TN>, I, never>
```

These aliases encapsulate the transformation:
- `S` → derive `ConfectSchemaDefinition<S>`
- `ConfectSchemaDefinition<S>` → extract table info
- All in one place, consistently

## Why `R = never`?

All Confect schemas use `Schema.Schema.AnyNoContext`, which means they have **no context requirements** by definition. Therefore, the context parameter `R` should always be `never`, not a variable generic parameter.

```typescript
// Schema definition constraint
export interface ConfectTableDefinition<
  TableSchema extends Schema.Schema.AnyNoContext,  // ← no context
  // ...
>

// Therefore, R is always never
export type DerivedTableSchema<S, TN, I = never> =
  Schema.Schema<ConfectDocumentFromSchema<S, TN>, I, never>
  //                                                   ^^^^^ always never
```

## Generic Type Guidelines

When writing functions that work with database types:

1. **Parametrize on `S extends GenericConfectSchema`** - the schema the user defines
2. **Parametrize on `TN extends TableNamesFromSchema<S>`** - table names derived from schema
3. **Parametrize on `I`** - the encoded type, if needed (varies per schema)
4. **Derive everything else:**
   - `ConfectSchemaDefinition<S>` - internally derived when needed
   - `ConfectDocumentFromSchema<S, TN>` - document type
   - `TableInfoFromSchema<S, TN>` - Convex-compatible metadata
   - `DerivedTableSchema<S, TN, I>` - the Effect Schema type
5. **Never parametrize on:**
   - `DataModel` - derive from `S`
   - `SchemaDefinition` - derive from `S`
   - `TableInfo` - derive from `S` and `TN`
   - `R` (context) - always `never`

## Example: Database Reader

```typescript
export interface ConfectDatabaseReader<
  S extends GenericConfectSchema = GenericConfectSchema,
> {
  readonly get: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    id: GenericId<TN>,
  ) => Effect.Effect<
    Option.Option<ConfectDocumentFromSchema<S, TN>>,
    DocumentDecodeError
  >;

  readonly table: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
  ) => Effect.Effect<ConfectQueryInitializer<TableInfoFromSchema<S, TN>>>;
}
```

Notice:
- Interface generic: `S` (the schema)
- Method generic: `TN` (table name)
- Everything else derived using type aliases
- No type casts needed
- Clean, readable signatures

## Migration Path

Existing code uses `SchemaDefinition`-based aliases. For backwards compatibility, we keep deprecated aliases:

```typescript
/** @deprecated Use TableNamesFromSchema instead */
export type TableNamesFromSchemaDefinition<SD extends GenericConfectSchemaDefinition>

/** @deprecated Use ConfectDocumentFromSchema instead */
export type ConfectDocumentFromSchemaDefinition<SD, TableName>
```

New code should use the `Schema`-based aliases exclusively.

## Key Insight

> **The schema the user writes (`GenericConfectSchema`) is the most primitive, concrete type in the system. Everything else is derived transformations. Making it the single generic parameter creates a clear hierarchy and eliminates type drift.**

This is analogous to how Convex uses structural generic types:
```typescript
// Convex pattern
export type GenericDocument = Record<string, Value>
export type GenericTableInfo = {
  document: GenericDocument;
  // ... everything derived from this base
}
```

We follow the same pattern: start with the primitive (the schema), derive everything else.

---

# Coding Style Guidelines

## Type Safety Rules

### 1. Never Use `any`

**Forbidden:**
```typescript
// DON'T: Using any defeats the type system
const processData = (data: any) => {
  return data.someField;
};
```

**Required:**
```typescript
// DO: Use proper types or generics
const processData = <T extends { someField: string }>(data: T) => {
  return data.someField;
};
```

- Use `unknown` if the type is truly unknown (requires type narrowing)
- Use generics with constraints to preserve type information
- Let TypeScript infer types when possible

### 2. Type Casting is Strictly Forbidden

Type casting (`as`, `as never`, etc.) indicates poor type design. If you need a cast, redesign your types.

**Forbidden:**
```typescript
// DON'T: Type casting indicates type drift
const result = convexDatabaseWriter.insert(tableName, encodedDocument as never);

// DON'T: Manual assertions hide type problems
const doc = data as ConfectDocument;
```

**Required:**
```typescript
// DO: Design types so they align naturally
type DerivedTableSchema<S, TN, I = never> =
  Schema.Schema<ConfectDocumentFromSchema<S, TN>, I, never>

// Types align perfectly - no casts needed
const encodedDocument = yield* encodeDocument(document, tableName, tableSchema);
yield* Effect.promise(() => convexDatabaseWriter.insert(tableName, encodedDocument));
```

**Exception:** Type assertions are allowed only when interfacing with third-party APIs where you have runtime guarantees:
```typescript
// Acceptable: Converting between compatible third-party types
const convexCtx = ctx as unknown as GenericActionCtx<DataModel>;
```

## Effect Code Style

### 3. Prefer Method Chaining with `.pipe()`

When working with Effect, prefer the method-style `.pipe()` over the function-style `pipe()`.

**Good:**
```typescript
// DO: Method-style pipe is more readable
Effect.promise(() => query.first()).pipe(
  Effect.map(Option.fromNullable),
  Effect.flatMap(
    Option.match({
      onNone: () => Effect.succeed(Option.none()),
      onSome: (doc) => decodeDocument(doc, tableName, tableSchema).pipe(
        Effect.map(Option.some),
      ),
    }),
  ),
)
```

**Less preferred:**
```typescript
// Works but less readable: function-style pipe
pipe(
  Effect.promise(() => query.first()),
  Effect.map(Option.fromNullable),
  Effect.flatMap(
    Option.match({
      onNone: () => Effect.succeed(Option.none()),
      onSome: (doc) => pipe(
        decodeDocument(doc, tableName, tableSchema),
        Effect.map(Option.some),
      ),
    }),
  ),
)
```

**When to use function-style `pipe()`:**
- When the starting value is not an Effect (e.g., plain data transformations)
- When importing from `effect/Function` for non-Effect pipelines

### 4. Keep Code Terse with High Signal-to-Noise Ratio

Write concise, functional code that maximizes meaning per line.

**Good:**
```typescript
// DO: Terse and clear
const decodeDocument = <S extends GenericConfectSchema, TN extends TableNamesFromSchema<S>, I>(
  doc: unknown,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): Effect.Effect<ConfectDocumentFromSchema<S, TN>, DocumentDecodeError, never> => {
  if (!tableSchema) return Effect.succeed(doc as ConfectDocumentFromSchema<S, TN>);

  return Schema.decodeUnknown(tableSchema)(doc).pipe(
    Effect.mapError((parseError) =>
      new DocumentDecodeError({
        tableName,
        id: (doc as { _id?: string })?._id ?? "unknown",
        parseError: ParseResult.TreeFormatter.formatErrorSync(parseError),
      }),
    ),
  );
};
```

**Avoid:**
```typescript
// DON'T: Overly verbose with unnecessary comments
const decodeDocument = <S extends GenericConfectSchema, TN extends TableNamesFromSchema<S>, I>(
  doc: unknown,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): Effect.Effect<ConfectDocumentFromSchema<S, TN>, DocumentDecodeError, never> => {
  // Check if we have a schema to validate against
  if (!tableSchema) {
    // No schema, just return the document as-is
    return Effect.succeed(doc as ConfectDocumentFromSchema<S, TN>);
  }

  // Decode the document using the schema
  const decodedEffect = Schema.decodeUnknown(tableSchema)(doc);

  // Map any parse errors to our custom error type
  const withErrorHandling = Effect.mapError(
    decodedEffect,
    (parseError) => {
      // Extract the document ID if available
      const docId = (doc as { _id?: string })?._id ?? "unknown";

      // Format the parse error
      const formattedError = ParseResult.TreeFormatter.formatErrorSync(parseError);

      // Create our custom error
      return new DocumentDecodeError({
        tableName,
        id: docId,
        parseError: formattedError,
      });
    },
  );

  return withErrorHandling;
};
```

**Guidelines:**
- Avoid obvious comments - code should be self-documenting
- Use descriptive names instead of comments
- Prefer expressions over statements
- Chain operations fluently
- Only comment when explaining *why*, not *what*

## Validation

### 5. Always Validate with TypeScript

Before committing changes, always run:

```bash
bunx tsc --noEmit
```

**Required:**
- Code must compile with zero TypeScript errors
- No warnings should be ignored
- Ensure `strict: true` in tsconfig.json

**When refactoring:**
```bash
# Check only the files you're working on
bunx tsc --noEmit 2>&1 | grep "src/server/database.ts"
```

## Summary

✅ **DO:**
- Use proper types, generics, and type inference
- Design types that align naturally (no casts needed)
- Use `.pipe()` method chaining for Effects
- Write terse, functional code with high signal-to-noise
- Validate all code with `bunx tsc --noEmit`

❌ **DON'T:**
- Use `any` type
- Use type casting (`as`, `as never`) except for third-party API boundaries
- Write verbose code with obvious comments
- Commit code with TypeScript errors

---

# Task Management Guidelines

## Writing Detailed Todos

Todos should be specific and actionable, describing both **what** to do and **how** to do it.

**Bad - Vague:**
```
- Integrate vector search
- Refactor database module
- Update types
```

**Good - Detailed:**
```
- Integrate vector search by creating ConfectVectorSearch service that wraps Convex vectorSearch API, avoiding direct context exposure
- Refactor database module by splitting into QueryDB and MutationDB services, following capability-based design pattern
- Update TableInfoFromSchema type to derive from S and TN parameters, avoiding independent TableInfo generic
```

**Guidelines:**
- Include the **action** (what to do)
- Include the **approach** (how to do it)
- Include **constraints** (what to avoid)
- Be specific about files, types, or patterns involved
- Break complex tasks into smaller, concrete steps
