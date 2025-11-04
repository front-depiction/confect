# Desired Pipeable API Pattern

This document showcases the desired API pattern for Confect's internal API modules (Function, Group, Api).

## Core Principle: Pipeable, Functional API

Following Effect's HttpApi pattern, all operations should be:
1. **Pipeable** - work with `.pipe()`
2. **Functional** - pure functions, not methods
3. **Immutable** - never mutate, always return new instances

## Pattern: Group Module

### Before (Constructor-based)
```typescript
const group = Group.group("users").functions({
  getUser: Function.query("getUser").args(...).returns(...),
  createUser: Function.mutation("createUser").args(...).returns(...)
});
```

### After (Pipeable)
```typescript
const group = Group.group("users").pipe(
  Group.add("getUser", Function.query("getUser").args(...).returns(...)),
  Group.add("createUser", Function.mutation("createUser").args(...).returns(...))
);
```

### API Surface

```typescript
// Constructor - creates empty group
Group.group(name: string): ConfectApiGroup<Name, {}>

// Pipeable functions
Group.add<K, Fn>(key: K, fn: Fn): (group) => ConfectApiGroup<Name, Functions & Record<K, Fn>>
Group.rename(oldKey: string, newKey: string): (group) => ConfectApiGroup<Name, RenamedFunctions>
Group.merge(other: ConfectApiGroup): (group) => ConfectApiGroup<Name, MergedFunctions>
```

## Pattern: Api Module

### Before (Constructor-based)
```typescript
const api = Api.api("myApp").groups({
  users: usersGroup,
  posts: postsGroup
});
```

### After (Pipeable)
```typescript
const api = Api.api("myApp").pipe(
  Api.add(usersGroup),
  Api.add(postsGroup)
);
```

### API Surface

```typescript
// Constructor - creates empty API
Api.api(name: string): ConfectApi<Name, {}>

// Pipeable functions
Api.add<G>(group: G): (api) => ConfectApi<Name, Groups & { [G.name]: G }>
Api.remove(groupName: string): (api) => ConfectApi<Name, OmitGroup>
Api.merge(other: ConfectApi): (api) => ConfectApi<Name, MergedGroups>
```

## Benefits

1. **More composable** - can easily create reusable transformation pipelines
2. **Better type inference** - incremental type building through pipe
3. **Consistent with Effect** - matches HttpApi patterns
4. **Extension friendly** - users can add their own pipeable utilities
5. **Tree-shakeable** - functions can be imported individually

## Implementation Notes

### Pipeable Functions Signature
```typescript
// A pipeable function takes the arguments and returns a function that transforms the object
export const add = <K extends string, Fn extends ConfectApiFunction>(
  key: K,
  fn: Fn
) => <Name extends string, Functions extends Record<string, ConfectApiFunction>>(
  group: ConfectApiGroup<Name, Functions>
): ConfectApiGroup<Name, Functions & Record<K, Fn>> => {
  return {
    [GroupTypeId]: groupVariance,
    name: group.name,
    functions: { ...group.functions, [key]: fn },
    pipe(this: ConfectApiGroup<Name, Functions & Record<K, Fn>>) {
      return pipeArguments(this, arguments);
    },
  };
};
```

### Constructor Signature
```typescript
// Constructor creates minimal empty instance
export const group = <Name extends string>(
  name: Name
): ConfectApiGroup<Name, {}> => ({
  [GroupTypeId]: groupVariance,
  name,
  functions: {},
  pipe(this: ConfectApiGroup<Name, {}>) {
    return pipeArguments(this, arguments);
  },
});
```

## Examples from Tests

### Creating a group with functions
```typescript
const userGroup = Group.group("users").pipe(
  Group.add("getUser", getUserFn),
  Group.add("createUser", createUserFn),
  Group.add("deleteUser", deleteUserFn)
);
```

### Merging groups
```typescript
const group1 = Group.group("api").pipe(
  Group.add("fn1", fn1)
);

const group2 = Group.group("api").pipe(
  Group.add("fn2", fn2)
);

const merged = group1.pipe(Group.merge(group2));
// merged has both fn1 and fn2
```

### Creating an API
```typescript
const myApi = Api.api("myApp").pipe(
  Api.add(usersGroup),
  Api.add(postsGroup),
  Api.add(commentsGroup)
);
```

### Composable transformations
```typescript
// Define reusable transformation
const addStandardFunctions = <G extends ConfectApiGroup<any, any>>(group: G) =>
  group.pipe(
    Group.add("health", healthCheckFn),
    Group.add("version", versionFn)
  );

// Use it
const myGroup = Group.group("api").pipe(
  Group.add("custom", customFn),
  addStandardFunctions
);
```
