# Getting Started with Confect's Claude Code Setup

This is a best-in-class Claude Code configuration for the Confect project. Here's how to use it effectively.

## What You Get

### 🤖 4 Specialized Agents

Agents are AI assistants that handle specific tasks with their own expertise:

1. **type-refactor** - Refactors generic types to schema-first design
2. **effect-refactor** - Refactors Effect code to idiomatic patterns
3. **code-reviewer** - Reviews code against Confect standards
4. **schema-expert** - Handles schema compilation and validation

### 📚 3 Knowledge Skills

Skills provide reusable knowledge that Claude uses automatically:

1. **effect-patterns** - Idiomatic Effect TypeScript patterns
2. **type-design** - Schema-first type design principles
3. **validation** - TypeScript compilation validation

### 🔌 Effect Documentation MCP

Direct access to Effect documentation for up-to-date API information.

## Quick Start

### Automatic Mode (Recommended)

Just work normally! Agents are invoked automatically when you:

- Make type changes → `type-refactor` activates
- Write Effect code → `effect-refactor` and `effect-patterns` activate
- Commit changes → `code-reviewer` activates
- Work with schemas → `schema-expert` activates

**No need to think about it** - the system recognizes what you're doing and provides specialized help.

### Manual Mode

You can also request agents explicitly:

```
"Use the type-refactor agent to update the database module"
"Have the code-reviewer agent check my recent changes"
"Ask the schema-expert agent about schema compilation"
```

### Interactive Mode

Run `/agents` to:
- View all available agents
- Create new agents
- Edit existing agents
- See agent descriptions

## Common Workflows

### 1. Refactoring Types

**Scenario:** Function has too many generic parameters or needs type casts

**What happens:**
1. You start refactoring
2. `type-refactor` agent automatically activates
3. Provides schema-first redesign
4. Validates with TypeScript compiler

**Or manually:**
```
"Use the type-refactor agent to simplify makeOrderedQuery"
```

### 2. Writing Effect Code

**Scenario:** Writing new Effect-based functionality

**What happens:**
1. You write Effect code
2. `effect-patterns` skill provides idiomatic patterns
3. Code uses proper imports, no flow, Predicate utilities
4. Natural, functional style

**Or manually:**
```
"Use the effect-refactor agent to clean up this code"
```

### 3. Code Review

**Scenario:** Ready to commit changes

**What happens:**
1. You prepare to commit
2. `code-reviewer` agent automatically reviews
3. Provides structured feedback (CRITICAL/WARNING/SUGGESTION)
4. `validation` skill ensures TypeScript compilation

**Or manually:**
```
"Use the code-reviewer agent to review my changes"
```

### 4. Schema Work

**Scenario:** Adding new schema support or fixing schema issues

**What happens:**
1. You work on schemas
2. `schema-expert` agent activates
3. Provides compilation guidance
4. Can query Effect Schema docs via MCP

**Or manually:**
```
"Use the schema-expert agent to add Date schema support"
```

## Key Features

### Context Efficiency

Each agent has its own context window, so:
- Main conversation stays clean
- Agents gather needed information independently
- No context pollution between tasks

### Progressive Disclosure

Skills use two-tier documentation:
- `SKILL.md` - Quick reference (always loaded)
- `reference.md` - Detailed examples (loaded when needed)

This keeps context usage optimal.

### Tool Restrictions

Agents specify exactly which tools they need:
```yaml
tools: Read, Edit, Grep, Glob, Bash
```

Skills can be even more restrictive:
```yaml
allowed-tools: Read, Grep, Glob
```

This prevents overreach and keeps agents focused.

### Effect Documentation Access

All agents/skills can query Effect docs:
- `mcp__effect-docs__effect_docs_search` - Search docs
- `mcp__effect-docs__get_effect_doc` - Get specific pages

Always up-to-date with latest Effect API.

## Best Practices

### Let Agents Work Automatically

The "PROACTIVELY USE" directive means agents activate when appropriate. **Trust the system** - you'll get specialized help when you need it.

### Use Explicit Invocation for Complex Tasks

For multi-step refactoring or reviews, explicitly request agents:
```
"Use the type-refactor agent to refactor the entire database module"
```

### Check Agent Descriptions

Run `/agents` to see what each agent does and when it activates.

### Provide Context

When manually invoking agents, provide context:
```
"Use the code-reviewer agent to review the auth changes with focus on security"
```

### Validate Before Committing

The `validation` skill runs `bunx tsc --noEmit` automatically, but you can also run it manually:
```bash
bunx tsc --noEmit
```

## Understanding the System

### Agents vs Skills

| Aspect | Agents | Skills |
|--------|--------|--------|
| **Purpose** | Handle specific tasks | Provide knowledge |
| **Invocation** | Task-based (automatic or manual) | Context-based (automatic) |
| **Context** | Separate window | Loaded into current context |
| **Tools** | Full tool access (restricted) | Read-only or limited |
| **Examples** | code-reviewer, type-refactor | effect-patterns, type-design |

### When Each Activates

**Agents activate when:**
- Task matches their description (automatic)
- User requests them (manual)
- Complex, multi-step work needed

**Skills activate when:**
- Context matches their description
- Knowledge is needed for current work
- Quick reference required

## Customization

### Adding New Agents

```bash
# Create new agent
touch .claude/agents/my-agent.md
```

Then add YAML frontmatter:
```yaml
---
name: my-agent
description: PROACTIVELY USE when [condition]. Does [purpose].
tools: Read, Edit, Bash
model: sonnet
---

Agent system prompt here...
```

### Adding New Skills

```bash
# Create new skill
mkdir .claude/skills/my-skill
touch .claude/skills/my-skill/SKILL.md
```

Add YAML frontmatter:
```yaml
---
name: my-skill
description: Knowledge of [what] for use when [when].
allowed-tools: Read, Grep
---

Skill content here...
```

### Modifying Existing

Just edit the markdown files! Changes take effect immediately.

## Troubleshooting

### Agent Not Activating

1. Check description has "PROACTIVELY USE"
2. Verify description matches your task
3. Try explicit invocation
4. Check YAML syntax

### Skill Not Loading

1. Verify `SKILL.md` exists
2. Check YAML frontmatter format
3. Make description more specific
4. Run `claude --debug` for errors

### Types Not Aligning

1. Use `type-refactor` agent
2. Check `type-design` skill reference
3. Ensure schema-first design
4. Run `bunx tsc --noEmit`

### Effect Patterns Unclear

1. Check `effect-patterns` skill
2. Query Effect docs MCP
3. Use `effect-refactor` agent
4. See reference.md for examples

## Resources

- **`.claude/README.md`** - Complete configuration docs
- **`CLAUDE.md`** - Quick reference guide (streamlined)
- **Claude Code docs** - https://docs.claude.com/en/docs/claude-code/
- **Sub-agents guide** - https://docs.claude.com/en/docs/claude-code/sub-agents
- **Skills guide** - https://docs.claude.com/en/docs/claude-code/skills

## Team Collaboration

This configuration is checked into git, so:
- ✅ Everyone gets the same agents/skills
- ✅ Agents evolve with the codebase
- ✅ Knowledge is shared automatically
- ✅ Consistent standards across team

### Contributing Improvements

1. Test new agents/skills locally
2. Verify descriptions trigger correctly
3. Document in agent/skill markdown
4. Commit and share with team

## Examples

### Example 1: Refactoring a Function

You:
```
"I need to refactor makeOrderedQuery - it has too many generics"
```

What happens:
1. `type-refactor` agent automatically activates
2. Analyzes current implementation
3. Provides schema-first redesign
4. Removes type casts
5. Validates with TypeScript

Result: Clean, maintainable code with 2-3 generics instead of 6+

### Example 2: Writing New Feature

You:
```
"Add support for scheduled jobs"
```

What happens:
1. `effect-patterns` skill provides Effect patterns
2. Proper imports used automatically
3. Idiomatic Effect code generated
4. `validation` skill checks compilation
5. `code-reviewer` can review when ready

Result: High-quality, idiomatic code following all patterns

### Example 3: Schema Changes

You:
```
"Add validation for user email schema"
```

What happens:
1. `schema-expert` agent activates
2. Provides schema compilation guidance
3. Can query Effect Schema docs via MCP
4. Handles encoding/decoding properly
5. `validation` skill ensures it compiles

Result: Proper schema validation with error handling

## Why This Setup Is Best-in-Class

### 1. Modular Knowledge

Instead of monolithic CLAUDE.md:
- Knowledge split into focused modules
- Automatic discovery and loading
- Progressive disclosure (reference.md)

### 2. Specialized Expertise

Each agent is an expert in its domain:
- Focused system prompts
- Relevant tool access only
- Separate context windows

### 3. Automatic Assistance

"PROACTIVELY USE" means:
- Help when you need it
- No manual invocation needed
- Natural workflow integration

### 4. Effect MCP Integration

Direct documentation access:
- Always up-to-date
- Searchable Effect docs
- Available to all agents/skills

### 5. Version Controlled

Checked into git:
- Team shares configuration
- Evolves with codebase
- Knowledge doesn't drift

### 6. Context Efficient

Smart design minimizes token usage:
- Skills use SKILL.md + reference.md
- Agents have separate contexts
- Progressive loading

## Getting Help

Questions? Check:
1. `.claude/README.md` for configuration details
2. `CLAUDE.md` for quick reference
3. Individual agent/skill files for specifics
4. Claude Code documentation for general info

Or just ask - the agents and skills will guide you!

---

**Enjoy your best-in-class development experience! 🚀**
