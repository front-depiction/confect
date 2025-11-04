# Pipeable API Refactoring - Complete! ✅

## Summary

Successfully refactored the Confect API modules (Function, Group, Api) to use a pipeable, functional API pattern following Effect's HttpApi design principles.

## Changes Made

### 1. Group Module (/src/api/internal/Group.ts)

**Before:**
```typescript
const userGroup = Group.group("users").functions({
  getUser: getUserFn,
  createUser: createUserFn
});
```

**After:**
```typescript
const userGroup = Group.group("users").pipe(
  Group.add("getUser", getUserFn),
  Group.add("createUser", createUserFn)
);
```

**New API:**
- `Group.group(name)` - Creates empty group
- `Group.add(key, fn)` - Adds function (pipeable)
- `Group.rename(oldKey, newKey)` - Renames function (pipeable)
- `Group.merge(otherGroup)` - Merges groups (pipeable)

### 2. Api Module (/src/api/internal/Api.ts)

**Before:**
```typescript
const myApi = Api.api("myApp").groups({
  users: usersGroup,
  posts: postsGroup
});
```

**After:**
```typescript
const myApi = Api.api("myApp").pipe(
  Api.add(usersGroup),
  Api.add(postsGroup)
);
```

**New API:**
- `Api.api(name)` - Creates empty API
- `Api.add(group)` - Adds group (extracts name from group.name)
- `Api.remove(groupName)` - Removes group (pipeable)
- `Api.merge(otherApi)` - Merges APIs (pipeable)

### 3. Function Module (/src/api/internal/Function.ts)

**No changes** - Already used builder pattern:
```typescript
Function.query("name").args(schema).returns(schema)
```

## Test Results

✅ **All 117 tests passing**
- 31 tests for Group module
- 50 tests for Function module
- 36 tests for Api module

### Test Coverage

**Group.test.ts:**
- ✅ Constructor tests
- ✅ Predicate tests
- ✅ Type extraction tests
- ✅ Pipeable utilities (add, rename, merge)
- ✅ Order utilities
- ✅ Variance behavior

**Api.test.ts:**
- ✅ Constructor tests
- ✅ Predicate tests
- ✅ Type extraction tests
- ✅ Pipeable utilities (add, remove, merge)
- ✅ Order utilities
- ✅ Path navigation
- ✅ Variance behavior

**Function.test.ts:**
- ✅ All existing tests pass
- ✅ Symbol property checks fixed

## Benefits

### 1. More Composable
```typescript
// Create reusable transformations
const addStandardFunctions = <G extends ConfectApiGroup<any, any>>(g: G) =>
  g.pipe(
    Group.add("health", healthFn),
    Group.add("version", versionFn)
  );

// Use anywhere
const myGroup = Group.group("api").pipe(
  Group.add("custom", customFn),
  addStandardFunctions
);
```

### 2. Better Type Inference
Types build incrementally through the pipe:
```typescript
const g1 = Group.group("users");              // ConfectApiGroup<"users", {}>
const g2 = g1.pipe(Group.add("get", getFn));  // ConfectApiGroup<"users", {get: ...}>
const g3 = g2.pipe(Group.add("create", createFn)); // ConfectApiGroup<"users", {get: ..., create: ...}>
```

### 3. Consistent with Effect
Matches Effect's HttpApi patterns exactly:
```typescript
// Effect HttpApi
HttpApiGroup.make("users").pipe(
  HttpApiGroup.add(endpoint1),
  HttpApiGroup.add(endpoint2)
)

// Confect API (same pattern!)
Group.group("users").pipe(
  Group.add("fn1", fn1),
  Group.add("fn2", fn2)
)
```

### 4. Extension Friendly
Users can create custom pipeable utilities:
```typescript
const MyGroup = {
  addCrud: (entity: string) => (group: ConfectApiGroup<any, any>) =>
    group.pipe(
      Group.add(`get${entity}`, ...),
      Group.add(`create${entity}`, ...),
      Group.add(`update${entity}`, ...),
      Group.add(`delete${entity}`, ...)
    )
};

Group.group("api").pipe(MyGroup.addCrud("User"));
```

### 5. Tree-Shakeable
Functions can be imported individually:
```typescript
import { group, add, rename } from "./internal/Group";
// Only these functions are bundled
```

## Type Safety

### Literal Type Preservation
```typescript
const g = Group.group("users").pipe(
  Group.add("getUser", fn)
);

type Name = typeof g.name;        // "users" (not string)
type Keys = keyof typeof g.functions;  // "getUser" (not string)
```

### Error and Context Tracking
```typescript
const g1: ConfectApiGroup<"a", F1, E1, R1> = ...;
const g2: ConfectApiGroup<"b", F2, E2, R2> = ...;

const merged = g1.pipe(Group.merge(g2));
// Type: ConfectApiGroup<"a", F1 & F2, E1 | E2, R1 | R2>
//                                     ^^^^^^^^  ^^^^^^^^
//                                     Errors    Contexts
//                                     are       are
//                                     unioned   unioned
```

### No Type Casts
All implementations use natural type alignment - zero `as` casts!

## Documentation

All documentation updated:
- ✅ Module-level JSDoc with new patterns
- ✅ Function-level JSDoc with examples
- ✅ DESIRED_API_PATTERN.md - comprehensive guide
- ✅ This summary document

## Breaking Changes

### Migration Guide

**Old Group API:**
```typescript
const group = Group.group("users").functions({
  getUser: getUserFn,
  createUser: createUserFn
});
```

**New Group API:**
```typescript
const group = Group.group("users").pipe(
  Group.add("getUser", getUserFn),
  Group.add("createUser", createUserFn)
);
```

**Old Api API:**
```typescript
const api = Api.api("myApp").groups({
  users: usersGroup,
  posts: postsGroup
});
```

**New Api API:**
```typescript
const api = Api.api("myApp").pipe(
  Api.add(usersGroup),
  Api.add(postsGroup)
);
```

## Files Modified

1. `/src/api/internal/Group.ts` - Complete refactor to pipeable API
2. `/src/api/internal/Group.test.ts` - Rewritten with new patterns
3. `/src/api/internal/Api.ts` - Complete refactor to pipeable API
4. `/src/api/internal/Api.test.ts` - Rewritten with new patterns
5. `/src/api/internal/Function.test.ts` - Minor fixes (symbol checks)
6. `DESIRED_API_PATTERN.md` - New documentation
7. This summary document

## Validation

```bash
bunx vitest run src/api/internal/*.test.ts
# Result: 117 passed (117) ✅
```

## Next Steps

The pipeable API is now complete and ready for:
1. Integration into ConfectApiBuilder
2. Documentation updates in main README
3. Migration of existing examples
4. Release notes preparation

---

**Refactoring completed successfully!** 🎉

All core type system improvements (E/R parameters, variance, Pipeable interface) are preserved.
All functional utilities work with the new pipeable pattern.
Zero regressions - all tests passing.
