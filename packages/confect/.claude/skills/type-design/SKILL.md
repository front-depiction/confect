---
name: type-design
description: Knowledge of schema-first type design principles where all types derive from GenericConfectSchema. Use when designing or refactoring generic types, especially for database operations, to eliminate type drift and avoid type casting.
allowed-tools: Read, Grep, Glob
---

# Schema-First Type Design

This Skill provides the **Single Source of Truth** principle for generic type design in Confect.

## Core Principle

All types derive from `GenericConfectSchema` (S). Never parametrize on intermediate derived types like DataModel or TableInfo.

## Type Hierarchy

```typescript
GenericConfectSchema (S)           ← User defines this (ONLY generic parameter)
  ↓
ConfectSchemaDefinition<S>        ← Derived internally
  ↓
ConfectDataModel                  ← Derived for Convex
  ↓
TableInfo, Document types, etc.   ← All derived from S
```

## Generic Parameters

**ALWAYS:**
1. `S extends GenericConfectSchema` - The schema
2. `TN extends TableNamesFromSchema<S>` - Table names from schema
3. `I` - Encoded type (varies per schema)

**NEVER:**
- `DM extends DataModel` - Derive from S
- `SD extends SchemaDefinition` - Derive from S
- `TableInfo extends GenericTableInfo` - Derive from S and TN
- `R` - Always `never` (schemas are AnyNoContext)

## Type Aliases

Use these aliases to derive types:

```typescript
TableNamesFromSchema<S extends GenericConfectSchema>
ConfectDocumentFromSchema<S, TN extends TableNamesFromSchema<S>>
TableInfoFromSchema<S, TN extends TableNamesFromSchema<S>>
DerivedTableSchema<S, TN, I = never> =
  Schema.Schema<ConfectDocumentFromSchema<S, TN>, I, never>
```

## Example: Database Reader Interface

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

  readonly query: <TN extends TableNamesFromSchema<S>>(
    tableName: TN,
  ) => Effect.Effect<QueryInitializer<TableInfoFromSchema<S, TN>>>;
}
```

Notice:
- Interface generic: `S` only
- Method generic: `TN` (constrained by S)
- Everything else derived from S and TN
- No type casts needed

## Why This Works

By parametrizing only on S:
- TypeScript can derive all relationships
- No independent generics to drift apart
- No type casts needed - types align naturally
- Clear hierarchy: primitive → derived

## Benefits

1. **No type drift** - All types stay synchronized
2. **No type casts** - Proper derivation eliminates need
3. **Simpler signatures** - Only 2-3 generics instead of 6+
4. **Better inference** - TypeScript can infer relationships
5. **Easier refactoring** - Single source to update

## Resources

See `reference.md` for detailed examples and migration patterns.
