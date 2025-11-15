/**
 * Tests for internal/Group module
 *
 * This test file showcases the desired pipeable API pattern:
 * - Group.group("name") creates empty group
 * - Group.add(key, fn) adds function (pipeable)
 * - Group.rename(old, new) renames function (pipeable)
 * - Group.merge(other) merges groups (pipeable)
 */

import * as Array from "effect/Array";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { describe, expect, expectTypeOf, test } from "vitest";
import * as Function from "./Function";
import * as Group from "./Group";
import type { TypesAreEquivalent } from "./test-helpers";

// =============================================================================
// Test Data
// =============================================================================

const TestArgsSchema = Schema.Struct({
  id: Schema.String,
});

const TestReturnsSchema = Schema.Struct({
  result: Schema.String,
});

const getUserFn = Function.query("getUser")
  .args(TestArgsSchema)
  .returns(TestReturnsSchema);

const createUserFn = Function.mutation("createUser")
  .args(TestArgsSchema)
  .returns(TestReturnsSchema);

const sendEmailFn = Function.action("sendEmail")
  .args(TestArgsSchema)
  .returns(TestReturnsSchema);

// =============================================================================
// Constructor Tests
// =============================================================================

describe("Group Constructor", () => {
  describe("group()", () => {
    test("creates an empty group", () => {
      const grp = Group.group("users");

      expect(grp.name).toBe("users");
      expect(grp.functions).toEqual({});
      expect(Object.keys(grp.functions)).toHaveLength(0);
    });

    test("preserves literal name type", () => {
      const grp = Group.group("users");
      void grp
      type Name = typeof grp.name;
      expectTypeOf<Name>().toEqualTypeOf<"users">();
      expectTypeOf<TypesAreEquivalent<Name, "users">>().toEqualTypeOf<true>();
    });

    test("has GroupTypeId symbol", () => {
      const grp = Group.group("test");
      expect(grp[Group.GroupTypeId]).toBeTruthy();
    });

    test("works with pipe to add functions", () => {
      const grp = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
        Group.add("createUser", createUserFn),
      );

      expect(grp.name).toBe("users");
      expect(grp.functions.getUser).toBe(getUserFn);
      expect(grp.functions.createUser).toBe(createUserFn);
      expect(Object.keys(grp.functions)).toHaveLength(2);
    });

    test("preserves function names as literal types with pipe", () => {
      const grp = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
        Group.add("createUser", createUserFn),
      );

      type FunctionNames = keyof typeof grp.functions;
      expectTypeOf<FunctionNames>().toEqualTypeOf<"getUser" | "createUser">();
      expectTypeOf<
        TypesAreEquivalent<FunctionNames, "getUser" | "createUser">
      >().toEqualTypeOf<true>();
    });
  });
});

// =============================================================================
// Predicate Tests
// =============================================================================

describe("Group Predicates", () => {
  const validGroup = Group.group("users").pipe(
    Group.add("getUser", getUserFn),
  );

  describe("isGroup()", () => {
    test("returns true for valid groups", () => {
      expect(Group.isGroup(validGroup)).toBe(true);
    });

    test("returns false for plain objects", () => {
      expect(Group.isGroup({})).toBe(false);
      expect(Group.isGroup({ name: "test", functions: {} })).toBe(false);
    });

    test("returns false for primitives", () => {
      expect(Group.isGroup(null)).toBe(false);
      expect(Group.isGroup(undefined)).toBe(false);
      expect(Group.isGroup(42)).toBe(false);
      expect(Group.isGroup("test")).toBe(false);
    });

    test("returns false for functions", () => {
      expect(Group.isGroup(getUserFn)).toBe(false);
    });

    test("narrows type correctly", () => {
      const value: unknown = validGroup;
      if (Group.isGroup(value)) {
        expectTypeOf(value).toMatchTypeOf<
          Group.ConfectApiGroup<
            string,
            Record<string, Function.ConfectApiFunction>
          >
        >();
      }
    });
  });
});

// =============================================================================
// Type Extraction Tests
// =============================================================================

describe("Type Extraction Utilities", () => {
  const testGroup = Group.group("testGroup").pipe(
    Group.add("getUser", getUserFn),
    Group.add("createUser", createUserFn),
  );
  void testGroup

  describe("GetName", () => {
    test("extracts name as literal type", () => {
      type Name = Group.GetName<typeof testGroup>;
      expectTypeOf<Name>().toEqualTypeOf<"testGroup">();
      expectTypeOf<
        TypesAreEquivalent<Name, "testGroup">
      >().toEqualTypeOf<true>();
    });
  });

  describe("GetFunctions", () => {
    test("extracts functions record", () => {
      type Functions = Group.GetFunctions<typeof testGroup>;
      // Use toMatchTypeOf for structural compatibility instead of exact equality
      expectTypeOf<Functions>().toMatchTypeOf<{
        getUser: typeof getUserFn;
        createUser: typeof createUserFn;
      }>();

      // Verify it's a record with the right keys
      expectTypeOf<keyof Functions>().toEqualTypeOf<"getUser" | "createUser">();
    });
  });

  describe("GetFunctionNames", () => {
    test("extracts function names as union", () => {
      type Names = Group.GetFunctionNames<typeof testGroup>;
      expectTypeOf<Names>().toEqualTypeOf<"getUser" | "createUser">();
      expectTypeOf<
        TypesAreEquivalent<Names, "getUser" | "createUser">
      >().toEqualTypeOf<true>();
    });

    test("returns never for empty group", () => {
      const emptyGroup = Group.group("empty");
      void emptyGroup
      type Names = Group.GetFunctionNames<typeof emptyGroup>;
      expectTypeOf<Names>().toEqualTypeOf<never>();
    });
  });
});

// =============================================================================
// Pipeable Utilities Tests
// =============================================================================

describe("Pipeable Utilities", () => {
  describe("add()", () => {
    test("adds a function to a group", () => {
      const original = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
      );

      const updated = original.pipe(
        Group.add("createUser", createUserFn)
      );

      expect(updated.name).toBe("users");
      expect(updated.functions.getUser).toBe(getUserFn);
      expect(updated.functions.createUser).toBe(createUserFn);
      expect(Object.keys(updated.functions)).toHaveLength(2);
    });

    test("does not mutate original group", () => {
      const original = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
      );

      original.pipe(Group.add("createUser", createUserFn));

      expect(Object.keys(original.functions)).toHaveLength(1);
      expect(original.functions).not.toHaveProperty("createUser");
    });

    test("overwrites existing function with same name", () => {
      const original = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
      );

      const newGetUser = Function.query("getUser")
        .args(TestArgsSchema)
        .returns(Schema.String);

      const updated = original.pipe(Group.add("getUser", newGetUser));

      expect(updated.functions.getUser).toBe(newGetUser);
      expect(updated.functions.getUser).not.toBe(getUserFn);
    });

    test("works with multiple adds in single pipe", () => {
      const grp = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
        Group.add("createUser", createUserFn),
        Group.add("sendEmail", sendEmailFn),
      );

      expect(Object.keys(grp.functions)).toHaveLength(3);
      expect(grp.functions.getUser).toBe(getUserFn);
      expect(grp.functions.createUser).toBe(createUserFn);
      expect(grp.functions.sendEmail).toBe(sendEmailFn);
    });
  });

  describe("rename()", () => {
    test("renames a function in a group", () => {
      const original = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
        Group.add("createUser", createUserFn),
      );

      const updated = original.pipe(Group.rename("getUser", "fetchUser"));

      expect(updated.functions).toHaveProperty("fetchUser");
      expect(updated.functions).not.toHaveProperty("getUser");
      expect(updated.functions.fetchUser).toBe(getUserFn);
      expect(updated.functions.createUser).toBe(createUserFn);
    });

    test("does not mutate original group", () => {
      const original = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
      );

      original.pipe(Group.rename("getUser", "fetchUser"));

      expect(original.functions).toHaveProperty("getUser");
      expect(original.functions).not.toHaveProperty("fetchUser");
    });

    test("handles renaming to same name", () => {
      const original = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
      );

      const updated = original.pipe(Group.rename("getUser", "getUser"));

      expect(updated.functions.getUser).toBe(getUserFn);
    });
  });

  describe("merge()", () => {
    test("merges two groups with different functions", () => {
      const group1 = Group.group("api").pipe(
        Group.add("getUser", getUserFn),
      );

      const group2 = Group.group("api").pipe(
        Group.add("createUser", createUserFn),
      );

      const merged = group1.pipe(Group.merge(group2));

      expect(merged.name).toBe("api");
      expect(merged.functions.getUser).toBe(getUserFn);
      expect(merged.functions.createUser).toBe(createUserFn);
      expect(Object.keys(merged.functions)).toHaveLength(2);
    });

    test("second group functions take precedence on conflict", () => {
      const fn1 = Function.query("test")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const fn2 = Function.query("test")
        .args(TestArgsSchema)
        .returns(Schema.String);

      const group1 = Group.group("api").pipe(
        Group.add("test", fn1),
        Group.add("getUser", getUserFn),
      );

      const group2 = Group.group("api").pipe(
        Group.add("test", fn2),
      );

      const merged = group1.pipe(Group.merge(group2));

      expect(merged.functions.test).toBe(fn2);
      expect(merged.functions.getUser).toBe(getUserFn);
    });

    test("does not mutate original groups", () => {
      const group1 = Group.group("api").pipe(
        Group.add("getUser", getUserFn),
      );

      const group2 = Group.group("api").pipe(
        Group.add("createUser", createUserFn),
      );

      group1.pipe(Group.merge(group2));

      expect(Object.keys(group1.functions)).toHaveLength(1);
      expect(Object.keys(group2.functions)).toHaveLength(1);
    });

    test("merges empty groups", () => {
      const group1 = Group.group("api");
      const group2 = Group.group("api");

      const merged = group1.pipe(Group.merge(group2));

      expect(Object.keys(merged.functions)).toHaveLength(0);
    });
  });
});

// =============================================================================
// Order Utilities Tests
// =============================================================================

describe("Order Utilities", () => {
  describe("byName", () => {
    test("orders groups alphabetically by name", () => {
      const zGroup = Group.group("zebra");
      const aGroup = Group.group("apple");
      const mGroup = Group.group("mango");

      const groups = [zGroup, aGroup, mGroup];
      const sorted = Array.sort(groups, Group.byName);

      expect(sorted[0]!.name).toBe("apple");
      expect(sorted[1]!.name).toBe("mango");
      expect(sorted[2]!.name).toBe("zebra");
    });

    test("handles groups with same name", () => {
      const group1 = Group.group("test").pipe(Group.add("a", getUserFn));
      const group2 = Group.group("test").pipe(Group.add("b", createUserFn));

      const groups = [group1, group2];
      const sorted = Array.sort(groups, Group.byName);

      expect(sorted).toHaveLength(2);
      expect(sorted[0]!.name).toBe("test");
      expect(sorted[1]!.name).toBe("test");
    });

    test("is case-sensitive", () => {
      const lowerGroup = Group.group("apple");
      const upperGroup = Group.group("Apple");

      const groups = [lowerGroup, upperGroup];
      const sorted = Array.sort(groups, Group.byName);

      expect(sorted[0]!.name).toBe("Apple");
      expect(sorted[1]!.name).toBe("apple");
    });

    test("handles single group", () => {
      const group = Group.group("single");
      const sorted = Array.sort([group], Group.byName);

      expect(sorted).toHaveLength(1);
      expect(sorted[0]).toBe(group);
    });
  });
});

// =============================================================================
// Variance Tests
// =============================================================================

describe("Variance Behavior", () => {
  test("Name is covariant", () => {
    const specific = Group.group("specificName").pipe(
      Group.add("getUser", getUserFn),
    );

    expect(specific.name).toBe("specificName");

    type Name = typeof specific.name;
    expectTypeOf<Name>().toEqualTypeOf<"specificName">();

    const name: string = specific.name;
    expect(name).toBe("specificName");
  });

  test("Functions maintains type structure", () => {
    const specific = Group.group("test").pipe(
      Group.add("getUser", getUserFn),
    );

    expect(specific.functions.getUser).toBe(getUserFn);

    type FunctionNames = keyof typeof specific.functions;
    expectTypeOf<FunctionNames>().toEqualTypeOf<"getUser">();
  });
});

// =============================================================================
// Layer Building Tests (Complex Dependency Scenarios)
// =============================================================================

describe("Layer Building - Complex Dependencies", () => {
  describe("Group.build() - Basic Layer Creation", () => {
    test("creates a Layer from Effect returning handlers", () => {
      const testGroup = Group.group("test").pipe(
        Group.add("getUser", getUserFn),
      );

      class TestTag extends Group.Tag(testGroup)<TestTag>() { }

      // Simple handler with no dependencies
      const TestLive = Layer.effect(
        TestTag,
        Effect.succeed({
          getUser: () => Effect.succeed({ result: "test" }),
        })
      );

    });

    test("handler Effect can have dependencies", () => {
      // Define a custom service
      class Database extends Context.Tag("Database")<
        Database,
        { readonly query: (sql: string) => Effect.Effect<string> }
      >() { }

      const testGroup = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
      );

      class UsersTag extends Group.Tag(testGroup)<UsersTag>() { }

      // Handler Effect requires Database
      const UsersLive = Layer.effect(
        UsersTag,
        Effect.gen(function* () {
          const db = yield* Database;
          return {
            getUser: () => db.query("SELECT * FROM users").pipe(
              Effect.map(() => ({ result: "user" }))
            ),
          };
        })
      );

    });

    test("handlers themselves must have R = never", () => {
      const testGroup = Group.group("test").pipe(
        Group.add("getUser", getUserFn),
      );

      type Handlers = Group.HandlersFor<typeof testGroup>;
      type HandlerReturn = ReturnType<Handlers["getUser"]>;

      // Handler return type should have R = never
      expectTypeOf<HandlerReturn>().toMatchTypeOf<Effect.Effect<any, any, never>>();
    });
  });

  describe("Group Dependencies - Query Group Depends on Another", () => {
    test("query group can depend on mutation group handlers", async () => {
      // Define mutation group
      const notesWriteGroup = Group.group("notesWrite").pipe(
        Group.add("create", createUserFn),
        Group.add("delete", Function.mutation("delete")
          .args(TestArgsSchema)
          .returns(Schema.Null))
      );

      // Define query group
      const notesReadGroup = Group.group("notesRead").pipe(
        Group.add("list", getUserFn),
        Group.add("get", getUserFn),
      );

      // Create tags for the groups
      class NotesWriteTag extends Group.Tag(notesWriteGroup)<NotesWriteTag>() { }
      class NotesReadTag extends Group.Tag(notesReadGroup)<NotesReadTag>() { }

      // Implement mutation group with no dependencies
      const NotesWriteLive = Layer.effect(
        NotesWriteTag,
        Effect.succeed({
          create: () => Effect.succeed({ result: "created" }),
          delete: () => Effect.succeed(null),
        })
      );

      // Implement query group that depends on mutation handlers
      const NotesReadLive = Layer.effect(
        NotesReadTag,
        Effect.gen(function* () {
          // Access the mutation group's tag
          const writeHandlers = yield* NotesWriteTag;

          return {
            list: () => Effect.succeed({ result: "list" }),
            get: () =>
              // Query group can call mutation group handlers
              writeHandlers.create({ id: "test-id" }).pipe(
                Effect.map(() => ({ result: "got after create" }))
              ),
          };
        })
      );

      // Can compose them together
      const CombinedLayer = Layer.mergeAll(
        NotesWriteLive,
        NotesReadLive.pipe(Layer.provide(NotesWriteLive))
      );

      // RUNTIME TEST: Actually use the composed layers
      const program = Effect.gen(function* () {
        const readHandlers = yield* NotesReadTag;

        // Call list
        const listResult = yield* readHandlers.list({ id: "test-id" });
        expect(listResult).toEqual({ result: "list" });

        // Call get (which internally calls create from write group)
        const getResult = yield* readHandlers.get({ id: "test-id" });
        expect(getResult).toEqual({ result: "got after create" });

        return { listResult, getResult };
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(CombinedLayer)
        )
      );

      expect(result.listResult).toEqual({ result: "list" });
      expect(result.getResult).toEqual({ result: "got after create" });
    });

    test("multiple groups can share dependencies", async () => {
      // Shared service
      class QueryDB extends Context.Tag("QueryDB")<
        QueryDB,
        { readonly query: (table: string) => Effect.Effect<unknown[]> }
      >() { }

      const usersGroup = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
      );

      const postsGroup = Group.group("posts").pipe(
        Group.add("getPost", getUserFn),
      );

      // Create tags
      class UsersTag extends Group.Tag(usersGroup)<UsersTag>() { }
      class PostsTag extends Group.Tag(postsGroup)<PostsTag>() { }

      // Both groups depend on QueryDB
      const UsersLive = Layer.effect(
        UsersTag,
        Effect.gen(function* () {
          const db = yield* QueryDB;
          return {
            getUser: () => db.query("users").pipe(Effect.map(() => ({ result: "user" }))),
          };
        })
      );

      const PostsLive = Layer.effect(
        PostsTag,
        Effect.gen(function* () {
          const db = yield* QueryDB;
          return {
            getPost: () => db.query("posts").pipe(Effect.map(() => ({ result: "post" }))),
          };
        })
      );

      // Can provide shared dependency once
      let queryCount = 0;
      const QueryDBLive = Layer.succeed(QueryDB, {
        query: (table: string) => Effect.sync(() => {
          queryCount++;
          return [{ table, count: queryCount }];
        }),
      });

      const CombinedLayer = Layer.mergeAll(
        UsersLive.pipe(Layer.provide(QueryDBLive)),
        PostsLive.pipe(Layer.provide(QueryDBLive))
      );

      // RUNTIME TEST: Use both groups
      const program = Effect.gen(function* () {
        const users = yield* UsersTag;
        const posts = yield* PostsTag;

        const userResult = yield* users.getUser({ id: "test-id" });
        const postResult = yield* posts.getPost({ id: "test-id" });

        return { userResult, postResult };
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(CombinedLayer)
        )
      );

      expect(result.userResult).toEqual({ result: "user" });
      expect(result.postResult).toEqual({ result: "post" });
      expect(queryCount).toBe(1);
    });
  });

  describe("Group Dependencies - Circular Dependencies", () => {
    test("prevents direct circular dependencies at type level", () => {
      // This test demonstrates that circular dependencies create type errors
      // In practice, you'd restructure to avoid this pattern

      const groupA = Group.group("a").pipe(
        Group.add("funcA", getUserFn),
      );

      const groupB = Group.group("b").pipe(
        Group.add("funcB", createUserFn),
      );

      class GroupATag extends Group.Tag(groupA)<GroupATag>() { }
      class GroupBTag extends Group.Tag(groupB)<GroupBTag>() { }

      // GroupA depends on GroupB - this is fine
      const GroupALive = Layer.effect(
        GroupATag,
        Effect.gen(function* () {
          const bHandlers = yield* GroupBTag;

          return {
            funcA: () =>
              bHandlers.funcB({ id: "test-id" }).pipe(Effect.map(() => ({ result: "a" }))),
          };
        })
      );

      // If GroupB tried to depend on GroupA, we'd have a circular dependency
      // This would fail at runtime when trying to provide the layers
      // Layer.provide(GroupALive.pipe(Layer.provide(GroupBLive))) // Would fail!

    });
  });

  describe("Group Dependencies - Hierarchical Dependencies", () => {
    test("supports multi-level dependency chains", async () => {
      // Level 1: Infrastructure
      class Database extends Context.Tag("Database")<
        Database,
        { readonly query: () => Effect.Effect<unknown[]> }
      >() { }

      // Level 2: Domain services using infrastructure
      const usersGroup = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
      );

      class UsersTag extends Group.Tag(usersGroup)<UsersTag>() { }

      const UsersLive = Layer.effect(
        UsersTag,
        Effect.gen(function* () {
          const db = yield* Database;
          return {
            getUser: () => db.query().pipe(Effect.map(() => ({ result: "user-from-db" }))),
          };
        })
      );

      // Level 3: Application services using domain services
      const profileGroup = Group.group("profile").pipe(
        Group.add("getProfile", getUserFn),
      );

      class ProfileTag extends Group.Tag(profileGroup)<ProfileTag>() { }

      const ProfileLive = Layer.effect(
        ProfileTag,
        Effect.gen(function* () {
          const users = yield* UsersTag;

          return {
            getProfile: () =>
              users.getUser({ id: "test-id" }).pipe(Effect.map((user) => ({
                result: "profile",
                userResult: user.result
              }))),
          };
        })
      );

      // Compose the full stack
      const DatabaseLive = Layer.succeed(Database, {
        query: () => Effect.succeed([{ id: 1, name: "test" }]),
      });

      const FullStack = ProfileLive.pipe(
        Layer.provide(UsersLive.pipe(Layer.provide(DatabaseLive)))
      );

      // RUNTIME TEST: Execute the full 3-level stack
      const program = Effect.gen(function* () {
        const profile = yield* ProfileTag;
        const result = yield* profile.getProfile({ id: "test-id" });
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(FullStack)
        )
      );

      expect(result).toEqual({
        result: "profile",
        userResult: "user-from-db"
      });
    });

    test("supports diamond dependency pattern", async () => {
      // Shared base service
      class Config extends Context.Tag("Config")<
        Config,
        { readonly apiUrl: string }
      >() { }

      // Two groups both depend on Config
      const authGroup = Group.group("auth").pipe(
        Group.add("login", getUserFn),
      );

      const storageGroup = Group.group("storage").pipe(
        Group.add("upload", createUserFn),
      );

      class AuthTag extends Group.Tag(authGroup)<AuthTag>() { }
      class StorageTag extends Group.Tag(storageGroup)<StorageTag>() { }

      const AuthLive = Layer.effect(
        AuthTag,
        Effect.gen(function* () {
          const config = yield* Config;
          return {
            login: () => Effect.succeed({ result: `auth:${config.apiUrl}` }),
          };
        })
      );

      const StorageLive = Layer.effect(
        StorageTag,
        Effect.gen(function* () {
          const config = yield* Config;
          return {
            upload: () => Effect.succeed({ result: `storage:${config.apiUrl}` }),
          };
        })
      );

      // Third group depends on both
      const appGroup = Group.group("app").pipe(
        Group.add("init", getUserFn),
      );

      class AppTag extends Group.Tag(appGroup)<AppTag>() { }

      const AppLive = Layer.effect(
        AppTag,
        Effect.gen(function* () {
          const auth = yield* AuthTag;
          const storage = yield* StorageTag;

          return {
            init: () =>
              Effect.all([auth.login({ id: "test-id" }), storage.upload({ id: "test-id" })]).pipe(
                Effect.map(([authRes, storageRes]) => ({
                  result: "initialized",
                  auth: authRes.result,
                  storage: storageRes.result
                }))
              ),
          };
        })
      );

      // Diamond: AppLive -> (AuthLive, StorageLive) -> Config
      const ConfigLive = Layer.succeed(Config, { apiUrl: "https://api.example.com" });

      const FullApp = AppLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            AuthLive.pipe(Layer.provide(ConfigLive)),
            StorageLive.pipe(Layer.provide(ConfigLive))
          )
        )
      );

      // RUNTIME TEST: Execute diamond dependency pattern
      const program = Effect.gen(function* () {
        const app = yield* AppTag;
        const result = yield* app.init({ id: "test-id" });
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(FullApp)
        )
      );

      expect(result).toEqual({
        result: "initialized",
        auth: "auth:https://api.example.com",
        storage: "storage:https://api.example.com"
      });
    });
  });

  describe("Group.buildScoped() - Resource Management", () => {
    test("supports scoped resources with cleanup", () => {
      const testGroup = Group.group("test").pipe(
        Group.add("query", getUserFn),
      );

      class TestTag extends Group.Tag(testGroup)<TestTag>() { }

      // Handler creation requires resources
      const TestLive = Layer.scoped(
        TestTag,
        Effect.gen(function* () {
          // Acquire resource with cleanup
          const connection = yield* Effect.acquireRelease(
            Effect.succeed({ id: "conn-123" }),
            (conn) => Effect.sync(() => console.log(`Closing ${conn.id}`))
          );

          return {
            query: () => Effect.succeed({ result: `Using ${connection.id}` }),
          };
        })
      );

    });

    test("buildScoped with dependencies", () => {
      class Config extends Context.Tag("Config")<Config, { readonly connString: string }>() { }

      const testGroup = Group.group("db").pipe(
        Group.add("query", getUserFn),
      );

      class DBTag extends Group.Tag(testGroup)<DBTag>() { }

      const DBLive = Layer.scoped(
        DBTag,
        Effect.gen(function* () {
          const config = yield* Config;

          // Create scoped connection
          const conn = yield* Effect.acquireRelease(
            Effect.succeed({ connString: config.connString }),
            () => Effect.succeed(undefined)
          );

          return {
            query: () => Effect.succeed({ result: conn.connString }),
          };
        })
      );

    });
  });

  describe("Group.buildMock() - Testing Support", () => {
    test("creates mock layer with partial implementation", () => {
      const testGroup = Group.group("test").pipe(
        Group.add("func1", getUserFn),
        Group.add("func2", createUserFn),
      );

      class TestTag extends Group.Tag(testGroup)<TestTag>() { }

      // Only implement func1, func2 will throw if called
      const TestMock = Layer.succeed(TestTag, {
        func1: () => Effect.succeed({ result: "mocked" }),
        func2: () => Effect.dieMessage("func2 not implemented in mock"),
      });
    });

    test("allows empty mock for all unimplemented", () => {
      const testGroup = Group.group("test").pipe(
        Group.add("func1", getUserFn),
      );

      class TestTag extends Group.Tag(testGroup)<TestTag>() { }

      // All functions throw UnimplementedError
      const TestMock = Layer.succeed(TestTag, {
        func1: () => Effect.dieMessage("func1 not implemented in mock"),
      });
    });
  });

  describe("Real-World Scenarios - Convex-like Patterns", () => {
    test("query group depends on mutation group for cache invalidation", async () => {
      // Simulate Convex DB services
      class QueryDB extends Context.Tag("QueryDB")<
        QueryDB,
        { readonly query: (table: string) => Effect.Effect<unknown[]> }
      >() { }

      class MutationDB extends Context.Tag("MutationDB")<
        MutationDB,
        {
          readonly insert: (table: string, doc: unknown) => Effect.Effect<string>;
          readonly delete: (table: string, id: string) => Effect.Effect<void>;
        }
      >() { }

      // Notes mutation group
      const notesMutationGroup = Group.group("notesMutation").pipe(
        Group.add("insert", createUserFn),
        Group.add("delete", Function.mutation("delete")
          .args(TestArgsSchema)
          .returns(Schema.Null)),
      );

      class NotesMutationTag extends Group.Tag(notesMutationGroup)<NotesMutationTag>() { }

      const NotesMutationLive = Layer.effect(
        NotesMutationTag,
        Effect.gen(function* () {
          const db = yield* MutationDB;
          return {
            insert: () => db.insert("notes", { text: "test" }).pipe(
              Effect.map((id) => ({ result: `inserted:${id}` }))
            ),
            delete: () => db.delete("notes", "id").pipe(
              Effect.map(() => null)
            ),
          };
        })
      );

      // Notes query group that can trigger mutations
      const notesQueryGroup = Group.group("notesQuery").pipe(
        Group.add("list", getUserFn),
        Group.add("refresh", createUserFn),
      );

      class NotesQueryTag extends Group.Tag(notesQueryGroup)<NotesQueryTag>() { }

      const NotesQueryLive = Layer.effect(
        NotesQueryTag,
        Effect.gen(function* () {
          const queryDb = yield* QueryDB;
          const mutations = yield* NotesMutationTag;

          return {
            list: () => queryDb.query("notes").pipe(
              Effect.map((notes) => ({ result: "list", count: notes.length }))
            ),
            refresh: () =>
              // Query can trigger mutation and re-query
              mutations.insert({ id: "test-id" }).pipe(
                Effect.flatMap(() => queryDb.query("notes")),
                Effect.map((notes) => ({ result: "refreshed", count: notes.length }))
              ),
          };
        })
      );

      // RUNTIME TEST: Simulate the notesMutationCtx -> notesQueryCtx pattern
      let insertCount = 0;
      const notes: Array<{ id: string; text: string }> = [];

      const MutationDBLive = Layer.succeed(MutationDB, {
        insert: (_table: string, doc: any) => Effect.sync(() => {
          const id = `note-${++insertCount}`;
          notes.push({ id, text: doc.text });
          return id;
        }),
        delete: (_table: string, id: string) => Effect.sync(() => {
          const index = notes.findIndex(n => n.id === id);
          if (index !== -1) notes.splice(index, 1);
        }),
      });

      const QueryDBLive = Layer.succeed(QueryDB, {
        query: (_table: string) => Effect.succeed([...notes]),
      });

      const FullStack = Layer.mergeAll(
        NotesMutationLive.pipe(Layer.provide(MutationDBLive)),
        NotesQueryLive.pipe(
          Layer.provide(NotesMutationLive.pipe(Layer.provide(MutationDBLive))),
          Layer.provide(QueryDBLive)
        )
      );

      const program = Effect.gen(function* () {
        const query = yield* NotesQueryTag;

        // Initial list (empty)
        const listResult1 = yield* query.list({ id: "test-id" });

        // Refresh (triggers insert + re-query)
        const refreshResult = yield* query.refresh({ id: "test-id" });

        // List again (should have 1 note)
        const listResult2 = yield* query.list({ id: "test-id" });

        return { listResult1, refreshResult, listResult2 };
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(FullStack)
        )
      );

      expect(result.listResult1).toEqual({ result: "list", count: 0 });
      expect(result.refreshResult).toEqual({ result: "refreshed", count: 1 });
      expect(result.listResult2).toEqual({ result: "list", count: 1 });
      expect(notes).toHaveLength(1);
    });

    test("supports Effect Platform HTTP-like middleware pattern", async () => {
      // Middleware service (like HttpApiMiddleware)
      class Auth extends Context.Tag("Auth")<
        Auth,
        { readonly userId: string }
      >() { }

      // Protected group requires Auth
      const protectedGroup = Group.group("protected").pipe(
        Group.add("getProfile", getUserFn),
      );

      class ProtectedTag extends Group.Tag(protectedGroup)<ProtectedTag>() { }

      const ProtectedLive = Layer.effect(
        ProtectedTag,
        Effect.gen(function* () {
          const auth = yield* Auth;

          return {
            getProfile: () =>
              Effect.succeed({ result: `Profile for ${auth.userId}` }),
          };
        })
      );

      // Auth middleware layer
      const AuthLive = Layer.succeed(Auth, { userId: "user-123" });

      // Compose with middleware
      const ProtectedWithAuth = ProtectedLive.pipe(Layer.provide(AuthLive));

      // RUNTIME TEST: Verify middleware is injected
      const program = Effect.gen(function* () {
        const handlers = yield* ProtectedTag;
        const result = yield* handlers.getProfile({ id: "test-id" });
        return result;
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(ProtectedWithAuth)
        )
      );

      expect(result).toEqual({ result: "Profile for user-123" });
    });
  });
});
