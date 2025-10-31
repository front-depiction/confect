# Type Design Reference

## Complete Refactoring Examples

### Example 1: Query Builder

**Before (6 generics, type drift):**
```typescript
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
): ConfectOrderedQuery<TableInfo> => {
  // Needs type casts like `as never` to satisfy compiler
  const encodedDocument = await Schema.encode(tableSchema)(doc);
  return query.withIndex(tableName, encodedDocument as never);
}
```

Problems:
- 6 independent generic parameters
- `TableInfo` separate from `DM` - can drift
- `A` (document type) separate from `TableInfo`
- `R` unnecessarily generic (always `never`)
- Requires type casts to align types

**After (2 generics, aligned):**
```typescript
export const makeOrderedQuery = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
  I = never
>(
  query: OrderedQuery<TableInfoFromSchema<S, TN>>,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): ConfectOrderedQuery<TableInfoFromSchema<S, TN>> => {
  // Types align naturally - no casts needed
  const encodedDocument = await Schema.encode(tableSchema)(doc);
  return query.withIndex(tableName, encodedDocument);
}
```

Benefits:
- Only 2 meaningful generics (S, TN)
- `TableInfo` derived from S and TN
- Document type automatically aligned
- `R` hardcoded to `never`
- No type casts

### Example 2: Database Writer

**Before:**
```typescript
interface DatabaseWriter<
  DataModel extends GenericDataModel,
  TableInfo extends GenericTableInfo,
> {
  insert<TableName extends string>(
    table: TableName,
    doc: any, // Had to use any!
  ): Promise<string>;
}
```

**After:**
```typescript
interface ConfectDatabaseWriter<
  S extends GenericConfectSchema = GenericConfectSchema,
> {
  insert<TN extends TableNamesFromSchema<S>>(
    tableName: TN,
    document: ConfectDocumentFromSchema<S, TN>,
  ): Effect.Effect<GenericId<TN>, DocumentEncodeError>;
}
```

### Example 3: Schema Function

**Before:**
```typescript
const encodeDocument = <
  A,
  I = never,
  R = never
>(
  doc: A,
  schema: Schema.Schema<A, I, R> | undefined,
): Effect.Effect<I, ParseError, R> => {
  // ...
}
```

**After:**
```typescript
const encodeDocument = <
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
  I
>(
  doc: ConfectDocumentFromSchema<S, TN>,
  tableName: TN,
  tableSchema: DerivedTableSchema<S, TN, I> | undefined,
): Effect.Effect<unknown, DocumentEncodeError> => {
  // R is hardcoded to never in DerivedTableSchema
  // I is the encoded form (unknown in practice)
}
```

## Why R = never?

All Confect schemas are `Schema.Schema.AnyNoContext`:

```typescript
export interface ConfectTableDefinition<
  TableSchema extends Schema.Schema.AnyNoContext,  // ← No context!
  // ...
>
```

Therefore:
- Schemas never require context (`R`)
- `R` should always be `never`, not a variable
- Using generic `R` adds unnecessary complexity

## Type Alias Definitions

```typescript
// Table names from schema
export type TableNamesFromSchema<S extends GenericConfectSchema> =
  TableNamesFromSchemaDefinition<ConfectSchemaDefinition<S>>;

// Document type from schema and table
export type ConfectDocumentFromSchema<
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
> = ConfectDocumentFromSchemaDefinition<ConfectSchemaDefinition<S>, TN>;

// TableInfo from schema and table
export type TableInfoFromSchema<
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
> = {
  document: ConfectDocumentFromSchema<S, TN>;
  fieldPaths: FieldPaths<ConfectDocumentFromSchema<S, TN>>;
  indexes: /* derived */;
  searchIndexes: /* derived */;
  vectorIndexes: /* derived */;
};

// Schema type with proper constraints
export type DerivedTableSchema<
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
  I = never,
> = Schema.Schema<ConfectDocumentFromSchema<S, TN>, I, never>;
//                                                        ^^^^^ always never!
```

## Migration Strategy

1. **Identify functions** with multiple generics
2. **Replace generics** with S-based pattern
3. **Update type constraints** to use derived aliases
4. **Remove type casts** - should no longer be needed
5. **Validate** with `bunx tsc --noEmit`

## Red Flags

These indicate non-schema-first design:

- ❌ More than 3 generic parameters
- ❌ `as` or `as never` type casts
- ❌ Generic `R` parameter (should be `never`)
- ❌ Independent `TableInfo` generic
- ❌ Independent `DataModel` generic
- ❌ Separate document type generic

## Validation

After refactoring, code should:
- ✅ Compile with zero errors
- ✅ Have 2-3 generic parameters max
- ✅ Have no type casts (except third-party APIs)
- ✅ Use derived type aliases
- ✅ Have clear S → TN → Everything hierarchy
