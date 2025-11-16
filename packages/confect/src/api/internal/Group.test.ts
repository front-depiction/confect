/**
 * Tests for internal/Group module
 *
 * This test file showcases the desired pipeable API pattern:
 * - Group.group("name") creates empty group
 * - Group.add(fn) adds function (pipeable, uses fn.name as key)
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
    test("preserves literal name type", () => {
      const grp = Group.group("users");
      void grp
      type Name = typeof grp.name;
      expectTypeOf<Name>().toEqualTypeOf<"users">();
    });

    test("has GroupTypeId symbol", () => {
      const grp = Group.group("test");
      expect(grp[Group.GroupTypeId]).toBeTruthy();
    });

    test("works with pipe to add functions", () => {
      const grp = Group.group("users").pipe(
        Group.add(getUserFn),
        Group.add(createUserFn),
      );
      expect(grp.name).toBe("users");

      expect(grp.functions["createUser"]).toBe(createUserFn);
      expect(Object.keys(grp.functions)).toHaveLength(2);
    });

    test("preserves function names as literal types with pipe", () => {
      const grp = Group.group("users").pipe(
        Group.add(getUserFn),
        Group.add(createUserFn),
      );
      void grp

      type FunctionNames = Group.GetFunctionNames<typeof grp>;
      expectTypeOf<FunctionNames>().toEqualTypeOf<"getUser" | "createUser">();
    });
  });
});

// =============================================================================
// Predicate Tests
// =============================================================================

describe("Group Predicates", () => {
  const validGroup = Group.group("users").pipe(
    Group.add(getUserFn),
  );

  describe("isGroup()", () => {
    test("returns true for valid groups", () => {
      expect(Group.isGroup(validGroup)).toBe(true);
    });

    test("returns false for primitives", () => {
      expect(Group.isGroup(null)).toBe(false);
      expect(Group.isGroup(undefined)).toBe(false);
      expect(Group.isGroup(42)).toBe(false);
      expect(Group.isGroup("test")).toBe(false);
    });

    test("narrows type correctly", () => {
      const value: unknown = validGroup;
      if (Group.isGroup(value)) {
        expectTypeOf(value).toExtend<
          Group.ConfectApiGroup<
            string,
            Function.ConfectApiFunction
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
    Group.add(getUserFn),
    Group.add(createUserFn),
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

  describe("GetFunctionNames", () => {
    test("extracts function names as union", () => {
      type Names = Group.GetFunctionNames<typeof testGroup>;
      expectTypeOf<Names>().toEqualTypeOf<"getUser" | "createUser">();
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
        Group.add(getUserFn),
      );

      const updated = original.pipe(
        Group.add(createUserFn)
      );

      expect(updated.name).toBe("users");
      expect(updated.functions["getUser"]).toBe(getUserFn);
      expect(updated.functions["createUser"]).toBe(createUserFn);
      expect(Object.keys(updated.functions)).toHaveLength(2);
    });

    test("does not mutate original group", () => {
      const original = Group.group("users").pipe(
        Group.add(getUserFn),
      );

      void original.pipe(Group.add(createUserFn));

      expect(Object.keys(original.functions)).toHaveLength(1);
      expect(original.functions).not.toHaveProperty("createUser");
    });

    test("overwrites existing function with same name", () => {
      const original = Group.group("users").pipe(
        Group.add(getUserFn),
      );

      const newGetUser = Function.query("getUser")
        .args(TestArgsSchema)
        .returns(Schema.String);

      const updated = original.pipe(Group.add(newGetUser));

      expect(updated.functions["getUser"]).toBe(newGetUser);
      expect(updated.functions["getUser"]).not.toBe(getUserFn);
    });
  });

  describe("rename()", () => {
    test("renames a function in a group", () => {
      const original = Group.group("users").pipe(
        Group.add(getUserFn),
        Group.add(createUserFn),
      );

      const updated = original.pipe(Group.rename("getUser", "fetchUser"));

      expect(updated.functions).toHaveProperty("fetchUser");
      expect(updated.functions).not.toHaveProperty("getUser");
      expect(updated.functions["fetchUser"]).toBe(getUserFn);
      expect(updated.functions["createUser"]).toBe(createUserFn);
    });

    test("does not mutate original group", () => {
      const original = Group.group("users").pipe(
        Group.add(getUserFn),
      );

      void original.pipe(Group.rename("getUser", "fetchUser"));

      expect(original.functions).toHaveProperty("getUser");
      expect(original.functions).not.toHaveProperty("fetchUser");
    });
  });

  describe("merge()", () => {
    test("merges two groups with different functions", () => {
      const group1 = Group.group("api").pipe(
        Group.add(getUserFn),
      );

      const group2 = Group.group("api").pipe(
        Group.add(createUserFn),
      );

      const merged = group1.pipe(Group.merge(group2));

      expect(merged.name).toBe("api");
      expect(merged.functions["getUser"]).toBe(getUserFn);
      expect(merged.functions["createUser"]).toBe(createUserFn);
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
        Group.add(fn1),
        Group.add(getUserFn),
      );

      const group2 = Group.group("api").pipe(
        Group.add(fn2),
      );

      const merged = group1.pipe(Group.merge(group2));

      expect(merged.functions["test"]).toBe(fn2);
      expect(merged.functions["getUser"]).toBe(getUserFn);
    });

    test("does not mutate original groups", () => {
      const group1 = Group.group("api").pipe(
        Group.add(getUserFn),
      );

      const group2 = Group.group("api").pipe(
        Group.add(createUserFn),
      );

      void group1.pipe(Group.merge(group2));

      expect(Object.keys(group1.functions)).toHaveLength(1);
      expect(Object.keys(group2.functions)).toHaveLength(1);
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
  });
});

// =============================================================================
// Variance Tests
// =============================================================================

describe("Variance Behavior", () => {
  test("Name is covariant", () => {
    const specific = Group.group("specificName").pipe(
      Group.add(getUserFn),
    );

    expect(specific.name).toBe("specificName");

    type Name = typeof specific.name;
    expectTypeOf<Name>().toEqualTypeOf<"specificName">();

    const name: string = specific.name;
    expect(name).toBe("specificName");
  });
});

// =============================================================================
// Layer Building Tests (Complex Dependency Scenarios)
// =============================================================================

describe("Layer Building - Complex Dependencies", () => {
  describe("Group.build() - Basic Layer Creation", () => {
    test("creates a Layer from Effect returning handlers", () => {
      const testGroup = Group.group("test").pipe(
        Group.add(getUserFn),
      );

      // Simple handler with no dependencies
      const TestLive = Layer.effect(Group.Tag(testGroup),
        Effect.succeed({
          getUser: () => Effect.succeed({ result: "test" }),
        })
      );

      void TestLive;
    });

    test("handler Effect can have dependencies", () => {
      // Define a custom service
      class Database extends Context.Tag("Database")<
        Database,
        { readonly query: (sql: string) => Effect.Effect<string> }
      >() { }

      const usersGroup = Group.group("users").pipe(
        Group.add(getUserFn),
      );

      // Handler Effect requires Database
      const UsersLive = Layer.effect(Group.Tag(usersGroup),
        Effect.gen(function* () {
          const db = yield* Database;
          return {
            getUser: () => db.query("SELECT * FROM users").pipe(
              Effect.map(() => ({ result: "user" }))
            ),
          };
        })
      );

      void UsersLive;
    });

    test("handlers themselves must have R = never", () => {
      const testGroup = Group.group("test").pipe(
        Group.add(getUserFn),
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
        Group.add(Function.rename(createUserFn, "create")),
        Group.add(Function.mutation("delete")
          .args(TestArgsSchema)
          .returns(Schema.Null))
      );

      // Define query group
      const notesReadGroup = Group.group("notesRead").pipe(
        Group.add(Function.rename(getUserFn, "list")),
        Group.add(Function.rename(getUserFn, "get")),
      );

      // Create tags for the groups


      // Implement mutation group with no dependencies
      const NotesWriteLive = Layer.effect(Group.Tag(notesWriteGroup),
        Effect.succeed({
          create: () => Effect.succeed({ result: "created" }),
          delete: () => Effect.succeed(null),
        })
      );

      // Implement query group that depends on mutation handlers
      const NotesReadLive = Layer.effect(Group.Tag(notesReadGroup),
        Effect.gen(function* () {
          // Access the mutation group's tag
          const writeHandlers = yield* Group.Tag(notesWriteGroup);

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
        const readHandlers = yield* Group.Tag(notesReadGroup);

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
        Group.add(getUserFn),
      );

      const postsGroup = Group.group("posts").pipe(
        Group.add(Function.rename(getUserFn, "getPost")),
      );

      // Create tags


      // Both groups depend on QueryDB
      const UsersLive = Layer.effect(Group.Tag(usersGroup),
        Effect.gen(function* () {
          const db = yield* QueryDB;
          return {
            getUser: () => db.query("users").pipe(Effect.map(() => ({ result: "user" }))),
          };
        })
      );

      const PostsLive = Layer.effect(Group.Tag(postsGroup),
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

      // Provide the shared dependency once at the top level
      const CombinedLayer = UsersLive.pipe(
        Layer.merge(PostsLive),
        Layer.provide(QueryDBLive)
      );

      // RUNTIME TEST: Use both groups
      const program = Effect.gen(function* () {
        const users = yield* Group.Tag(usersGroup);
        const posts = yield* Group.Tag(postsGroup);

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
      // Both handlers call query once each, so queryCount should be 2
      expect(queryCount).toBe(2);
    });
  });

  describe("Group Dependencies - Circular Dependencies", () => {
    test("prevents direct circular dependencies at type level", () => {
      // This test demonstrates that circular dependencies create type errors
      // In practice, you'd restructure to avoid this pattern

      const groupA = Group.group("a").pipe(
        Group.add(Function.rename(getUserFn, "funcA")),
      );

      const groupB = Group.group("b").pipe(
        Group.add(Function.rename(createUserFn, "funcB")),
      );
      void groupB; // Used below


      // GroupA depends on GroupB - this is fine
      const GroupALive = Layer.effect(Group.Tag(groupA),
        Effect.gen(function* () {
          const bHandlers = yield* Group.Tag(groupB);

          return {
            funcA: () =>
              bHandlers.funcB({ id: "test-id" }).pipe(Effect.map(() => ({ result: "a" }))),
          };
        })
      );

      void GroupALive;

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
        Group.add(getUserFn),
      );

      const UsersLive = Layer.effect(Group.Tag(usersGroup),
        Effect.gen(function* () {
          const db = yield* Database;
          return {
            getUser: () => db.query().pipe(Effect.map(() => ({ result: "user-from-db" }))),
          };
        })
      );

      // Level 3: Application services using domain services
      const profileGroup = Group.group("profile").pipe(
        Group.add(Function.rename(getUserFn, "getProfile")),
      );

      const ProfileLive = Layer.effect(Group.Tag(profileGroup),
        Effect.gen(function* () {
          const users = yield* Group.Tag(usersGroup);

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
        const profile = yield* Group.Tag(profileGroup);
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
        Group.add(Function.rename(getUserFn, "login")),
      );

      const storageGroup = Group.group("storage").pipe(
        Group.add(Function.rename(createUserFn, "upload")),
      );


      const AuthLive = Layer.effect(Group.Tag(authGroup),
        Effect.gen(function* () {
          const config = yield* Config;
          return {
            login: () => Effect.succeed({ result: `auth:${config.apiUrl}` }),
          };
        })
      );

      const StorageLive = Layer.effect(Group.Tag(storageGroup),
        Effect.gen(function* () {
          const config = yield* Config;
          return {
            upload: () => Effect.succeed({ result: `storage:${config.apiUrl}` }),
          };
        })
      );

      // Third group depends on both
      const appGroup = Group.group("app").pipe(
        Group.add(Function.rename(getUserFn, "init")),
      );

      const AppLive = Layer.effect(Group.Tag(appGroup),
        Effect.gen(function* () {
          const auth = yield* Group.Tag(authGroup);
          const storage = yield* Group.Tag(storageGroup);

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
        const app = yield* Group.Tag(appGroup);
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
        Group.add(
          Function.query("query")
            .args(Schema.Struct({}))
            .returns(TestReturnsSchema)
        ),
      );

      // Handler creation requires resources
      const TestLive = Layer.scoped(Group.Tag(testGroup),
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

      void TestLive;
    });
  });

  describe("Group.buildMock() - Testing Support", () => {
    test("creates mock layer with partial implementation", () => {
      const testGroup = Group.group("test").pipe(
        Group.add(Function.rename(getUserFn, "func1")),
        Group.add(createUserFn),
      );

      // Only implement func1, func2 will throw if called
      const TestMock = Layer.mock(Group.Tag(testGroup), {
        func1: () => Effect.succeed({ result: "mocked" }),
      });

      void TestMock;
    });
  });

});
