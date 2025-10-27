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
