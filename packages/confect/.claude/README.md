# Claude Code Configuration

This directory contains the Claude Code configuration for the Confect project, organized following best practices for sub-agents and skills.

## Structure

```
.claude/
├── README.md                    # This file
├── settings.local.json          # Local permissions
├── agents/                      # Specialized task handlers
│   ├── type-refactor.md        # Generic type refactoring
│   ├── effect-refactor.md      # Effect code refactoring
│   ├── code-reviewer.md        # Code review against standards
│   └── schema-expert.md        # Schema compilation and validation
└── skills/                      # Reusable knowledge modules
    ├── effect-patterns/        # Effect code patterns
    │   ├── SKILL.md
    │   └── reference.md
    ├── type-design/            # Schema-first type design
    │   ├── SKILL.md
    │   └── reference.md
    └── validation/             # TypeScript validation
        └── SKILL.md
```

## Agents

Agents are specialized AI assistants invoked for specific task types. They operate with separate context windows and custom prompts.

### Available Agents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| **type-refactor** | Refactor generic types to follow schema-first design | When types have too many generics, type drift, or need type casts |
| **effect-refactor** | Refactor Effect code to follow idiomatic patterns | When code uses barrel imports, flow, or manual type guards |
| **code-reviewer** | Review code against Confect standards | After significant changes or before commits |
| **schema-expert** | Handle schema compilation and validation | For schema-related tasks or Effect Schema questions |

### Using Agents

**Automatic (Recommended):**
Claude automatically invokes agents when tasks match their expertise thanks to "PROACTIVELY USE" in descriptions.

**Manual:**
```
"Use the type-refactor agent to update the database module"
"Have the code-reviewer agent check my recent changes"
```

**Interactive:**
```
/agents
```

## Skills

Skills are reusable knowledge modules that Claude invokes automatically based on context.

### Available Skills

| Skill | Purpose | Triggers |
|-------|---------|----------|
| **effect-patterns** | Idiomatic Effect TypeScript patterns | Writing/modifying Effect code |
| **type-design** | Schema-first type design principles | Designing/refactoring generic types |
| **validation** | TypeScript compilation validation | Before committing code changes |

Skills are automatically loaded and Claude uses them when relevant to the task.

## Resources

### Effect Documentation MCP

The Effect docs MCP server is available with these tools:
- `mcp__effect-docs__effect_docs_search` - Search Effect documentation
- `mcp__effect-docs__get_effect_doc` - Get specific documentation pages

Agents and skills can query Effect docs directly for up-to-date API information.

### Reference Documentation

- **CLAUDE.md** - Comprehensive style guide and principles (being phased out in favor of agents/skills)
- **Agent/Skill reference.md files** - Detailed examples and patterns

## Design Principles

### 1. Single Responsibility

Each agent/skill focuses on one specific capability:
- ✅ `type-refactor` only handles generic type refactoring
- ✅ `effect-patterns` only provides Effect code patterns
- ❌ Don't create "general purpose" agents

### 2. Clear Descriptions

Descriptions are critical for automatic invocation:
- Include what the agent/skill does
- Include when to use it (trigger phrases)
- Use "PROACTIVELY USE" for automatic invocation

### 3. Tool Restrictions

Agents specify only the tools they need:
```yaml
tools: Read, Edit, Grep, Glob, Bash
```

Skills can be even more restrictive:
```yaml
allowed-tools: Read, Grep, Glob
```

### 4. Progressive Disclosure

- Skills use `SKILL.md` for quick reference
- `reference.md` provides detailed examples (loaded only when needed)
- Keeps context window clean while providing depth

## Best Practices

### For Agents

- Use `model: sonnet` unless task requires opus/haiku
- List tools explicitly - don't rely on inheritance
- Include "PROACTIVELY USE" in description
- Provide clear examples in the prompt
- Reference skills and other resources

### For Skills

- Keep `SKILL.md` concise (< 500 lines)
- Move detailed examples to `reference.md`
- Specify `allowed-tools` to prevent overreach
- Make descriptions specific with trigger words
- Test discoverability with team members

### For All

- Version control everything in `.claude/`
- Keep prompts up-to-date with codebase changes
- Use consistent formatting (YAML frontmatter + Markdown)
- Cross-reference related agents/skills
- Document the Effect MCP availability

## Maintenance

### Adding New Agents

1. Create `.claude/agents/new-agent.md`
2. Add YAML frontmatter with name, description, tools, model
3. Write focused system prompt
4. Test with sample tasks
5. Commit to repository

### Adding New Skills

1. Create `.claude/skills/skill-name/SKILL.md`
2. Add YAML frontmatter with name, description
3. Write concise knowledge content
4. Optionally add `reference.md` for examples
5. Test discoverability
6. Commit to repository

### Updating Existing

- Keep descriptions accurate to trigger conditions
- Update examples when patterns change
- Sync with CLAUDE.md during transition period
- Validate YAML syntax (opening/closing `---`)

## Migration from CLAUDE.md

We're transitioning from a monolithic `CLAUDE.md` to modular agents/skills:

**Phase 1 (Current):**
- Agents and skills created
- CLAUDE.md still exists as reference
- Both systems work in parallel

**Phase 2 (Future):**
- All knowledge moved to agents/skills
- CLAUDE.md becomes thin overview
- Points to specific agents/skills

**Phase 3 (Goal):**
- CLAUDE.md deprecated or removed
- Pure agent/skill based system
- Discoverable, modular, maintainable

## Troubleshooting

### Agent Not Invoked

- Check description specificity
- Verify file path is correct
- Validate YAML syntax
- Try explicit invocation: "Use the X agent"

### Skill Not Used

- Make description more specific
- Include trigger terms user would mention
- Verify `SKILL.md` exists and has frontmatter
- Run `claude --debug` to check loading

### Type/Import Errors

- All agents can access Effect MCP docs
- Use `validation` skill before commits
- Check `effect-patterns` for correct imports

## Questions?

See the [Claude Code documentation](https://docs.claude.com/en/docs/claude-code/) for:
- Sub-agents guide: https://docs.claude.com/en/docs/claude-code/sub-agents
- Skills guide: https://docs.claude.com/en/docs/claude-code/skills
