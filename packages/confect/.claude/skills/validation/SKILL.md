---
name: validation
description: Always validate TypeScript code changes with tsc before committing. Use when code has been modified to ensure it compiles with zero errors and follows strict type checking.
allowed-tools: Bash, Read
---

# TypeScript Validation

This Skill ensures all code changes pass strict TypeScript compilation before committing.

## Validation Command

**Always run before committing:**
```bash
bunx tsc --noEmit
```

## Requirements

- ✅ Zero TypeScript errors
- ✅ Strict mode enabled (`strict: true`)
- ✅ No warnings ignored
- ✅ All imports resolve

## File-Specific Validation

When working on specific files:

```bash
bunx tsc --noEmit 2>&1 | grep "src/server/database.ts"
```

## Common Issues

### Import Errors

If you see import errors after refactoring:
- Check that all imported types exist
- Verify import paths are correct
- Ensure namespace imports are used

### Type Errors

If types don't align:
- Review the type hierarchy (see `type-design` skill)
- Check that types derive from schema properly
- Don't add type casts - fix the type design

### Generic Constraint Errors

If generics don't satisfy constraints:
- Ensure `S extends GenericConfectSchema`
- Verify `TN extends TableNamesFromSchema<S>`
- Check that derived types use correct parameters

## Integration with Git

Should be run:
1. After any code changes
2. Before creating commits
3. Before pushing to remote
4. In CI/CD pipelines

## Failure Response

If validation fails:
1. **Read the errors carefully** - TypeScript errors are precise
2. **Fix the root cause** - Don't suppress with type casts
3. **Re-validate** - Ensure fix didn't introduce new errors
4. **Consider refactoring** - Multiple errors may indicate design issues

## Success Criteria

```bash
$ bunx tsc --noEmit
# No output = success
```

Zero output means:
- All types align correctly
- No errors or warnings
- Code is ready to commit
