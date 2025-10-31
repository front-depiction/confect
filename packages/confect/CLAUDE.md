# Confect Development Guide

This guide provides a quick reference for developing with Confect. For detailed knowledge and automated assistance, see the `.claude/` directory which contains specialized agents and skills.

## Quick Start

### Specialized Agents Available

The `.claude/agents/` directory contains specialized AI assistants:

- **type-refactor** - Refactors generic types to follow schema-first design
- **effect-refactor** - Refactors Effect code to idiomatic patterns
- **code-reviewer** - Reviews code against project standards
- **schema-expert** - Handles schema compilation and validation

These agents are **automatically invoked** when you work on relevant tasks, or you can request them explicitly.

### Knowledge Skills Available

The `.claude/skills/` directory contains reusable knowledge:

- **effect-patterns** - Idiomatic Effect TypeScript patterns
- **type-design** - Schema-first type design principles
- **validation** - TypeScript compilation validation

Skills are **automatically loaded** and used when relevant.

### Resources

- **Effect docs MCP** - Available for querying Effect documentation
- **`.claude/README.md`** - Complete configuration documentation

## Core Principles

### 1. Single Source of Truth: Schema-First Types

All generic types derive from `GenericConfectSchema` (S):

```typescript
// ✅ Correct: Everything derives from S
<S extends GenericConfectSchema, TN extends TableNamesFromSchema<S>>

// ❌ Wrong: Independent generics cause type drift
<DM extends DataModel, TableInfo extends GenericTableInfo>
```

**Type aliases to use:**
- `TableNamesFromSchema<S>`
- `ConfectDocumentFromSchema<S, TN>`
- `TableInfoFromSchema<S, TN>`
- `DerivedTableSchema<S, TN, I = never>`

**Never parametrize on:**
- `DataModel` - derive from S
- `SchemaDefinition` - derive from S
- `TableInfo` - derive from S and TN
- `R` (context) - always `never`

> 📖 **Details:** See `type-design` skill or `type-refactor` agent

### 2. Effect Code Patterns

**Import style (critical for tree-shaking):**
```typescript
// ✅ Namespace imports from submodules
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// ❌ Barrel imports prevent tree-shaking
import { Effect, Option } from "effect";
```

**Key patterns:**
- Avoid `flow` in Effect chains - use explicit pipe stages
- Use `Effect.map` and `Effect.flatMap` explicitly - avoid `Effect.andThen` (it magically switches between map/flatMap)
- Use `Predicate` utilities instead of manual type guards
- Prefer `Option` for valid absence, errors for problems
- Use `Effect.orDie` for programmer errors
- Omit trailing `never` in type signatures

> 📖 **Details:** See `effect-patterns` skill or `effect-refactor` agent

### 3. Type Safety

**Forbidden:**
- `any` type - use `unknown` or proper generics
- Type casting (`as`, `as never`) - redesign types to align naturally
- Exception: Third-party API boundaries only

**Required:**
- Proper generic constraints
- Natural type alignment (no casts needed)
- Strict TypeScript compilation

> 📖 **Details:** See `validation` skill or `code-reviewer` agent

### 4. Schema Operations

Effect Schema is central to Confect:

```typescript
// Encoding/decoding with error handling
Schema.encode(schema)(value).pipe(
  Effect.mapError((parseError) => new MyError({
    parseError: ParseResult.TreeFormatter.formatErrorSync(parseError),
  })),
)

// Schema compilation to Convex validators
compileTableSchema(schema) // See src/server/schema_to_validator.ts
```

**Key constraints:**
- All schemas are `Schema.Schema.AnyNoContext` (R = never)
- `I` parameter varies per schema (encoded type)
- Always handle parse errors explicitly

> 📖 **Details:** See `schema-expert` agent

## Validation Workflow

Before every commit:

```bash
bunx tsc --noEmit
```

**Requirements:**
- Zero TypeScript errors
- Strict mode enabled
- All imports resolve

> 📖 **Details:** See `validation` skill

## Common Tasks

### Refactoring Generic Types

Task: Types have too many generics or need type casts

**Solution:** Use `type-refactor` agent
```
"Use the type-refactor agent to update makeOrderedQuery"
```

### Refactoring Effect Code

Task: Code uses barrel imports or non-idiomatic patterns

**Solution:** Use `effect-refactor` agent
```
"Use the effect-refactor agent to clean up storage.ts"
```

### Code Review

Task: Review changes before committing

**Solution:** Use `code-reviewer` agent
```
"Use the code-reviewer agent to check my recent changes"
```

### Schema Work

Task: Compile schemas, add validation, handle encoding/decoding

**Solution:** Use `schema-expert` agent
```
"Use the schema-expert agent to add support for Date schemas"
```

## Coding Style

### Do ✅

- Use namespace imports from submodules
- Design types that align naturally (no casts)
- Use `.pipe()` method chaining for Effects
- Use `Predicate` utilities for type guards
- Use `Option` for valid absence states
- Write terse, functional code with high signal-to-noise
- Validate with `bunx tsc --noEmit` before commits

### Don't ❌

- Use `any` type
- Use type casting (except third-party API boundaries)
- Use barrel imports (`from "effect"`)
- Use `flow` within Effect pipelines
- Use `Effect.andThen` (prefer explicit `map`/`flatMap`)
- Write manual type guards
- Write verbose code with obvious comments
- Commit code with TypeScript errors

## Effect Documentation

The Effect docs MCP server provides access to Effect documentation:

```typescript
// Search docs
mcp__effect-docs__effect_docs_search({ query: "Effect.flatMap" })

// Get specific doc
mcp__effect-docs__get_effect_doc({ documentId: 123 })
```

All agents and skills have access to Effect docs for up-to-date API information.

## Directory Structure

```
.claude/
├── README.md              # Configuration documentation
├── agents/                # Specialized task handlers
│   ├── type-refactor.md
│   ├── effect-refactor.md
│   ├── code-reviewer.md
│   └── schema-expert.md
└── skills/                # Reusable knowledge
    ├── effect-patterns/
    ├── type-design/
    └── validation/
```

## Migration Note

This document is being streamlined. Detailed knowledge has been moved to:

- **Agents** (`.claude/agents/`) for task-specific expertise
- **Skills** (`.claude/skills/`) for reusable patterns

Agents are automatically invoked when you work on relevant tasks, providing specialized assistance without cluttering the main conversation.

## Getting Help

- **Agent list:** Run `/agents` to see and manage agents
- **Claude Code docs:** https://docs.claude.com/en/docs/claude-code/
- **Sub-agents guide:** https://docs.claude.com/en/docs/claude-code/sub-agents
- **Skills guide:** https://docs.claude.com/en/docs/claude-code/skills
- **Configuration:** See `.claude/README.md`

## Summary

The Confect codebase uses:

1. **Schema-first type design** - Single generic S, all types derived
2. **Idiomatic Effect patterns** - Proper imports, no flow, Predicate utilities
3. **Strict type safety** - No any, no casts (except API boundaries)
4. **Modular assistance** - Specialized agents handle specific tasks

For detailed knowledge, patterns, and examples, the agents and skills system provides focused, discoverable expertise exactly when you need it.
