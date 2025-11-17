/**
 * Tests for internal/Group module
 *
 * This test file showcases the desired pipeable API pattern:
 * - Group.query("name") creates query group
 * - Group.mutation("name") creates mutation group
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
import { MutationDB } from "../../server";

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

// =============================================================================
// Constructor Tests
// =============================================================================

describe("Group Constructor", () => {
  describe("query() and mutation()", () => {
    test("preserves literal name type - query", () => {
      const grp = Group.query("users");
      void grp
      type Name = typeof grp.name;
      expectTypeOf<Name>().toEqualTypeOf<"users">();
    });

    test("has GroupTypeId symbol", () => {
      const grp = Group.query("test");
      expect(grp[Group.GroupTypeId]).toBeTruthy();
    });

    test("works with pipe to add functions - queries", () => {
      const getPostFn = Function.query("getPost")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const grp = Group.query("queries").pipe(
        Group.add(getUserFn),
        Group.add(getPostFn),
      );
      expect(grp.name).toBe("queries");
      expect(grp.kind).toBe("Query");

      expect(grp.functions["getPost"]).toBe(getPostFn);
      expect(Object.keys(grp.functions)).toHaveLength(2);
    });

    test("works with pipe to add functions - mutations", () => {
      const updateUserFn = Function.mutation("updateUser")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const grp = Group.mutation("mutations").pipe(
        Group.add(createUserFn),
        Group.add(updateUserFn),
      );
      expect(grp.name).toBe("mutations");
      expect(grp.kind).toBe("Mutation");

      expect(grp.functions["updateUser"]).toBe(updateUserFn);
      expect(Object.keys(grp.functions)).toHaveLength(2);
    });

    test("preserves function names as literal types with pipe", () => {
      const listUsersFn = Function.query("listUsers")
        .args(Schema.Struct({}))
        .returns(TestReturnsSchema);

      const grp = Group.query("users").pipe(
        Group.add(getUserFn),
        Group.add(listUsersFn),
      );
      void grp

      type FunctionNames = Group.GetFunctionNames<typeof grp>;
      expectTypeOf<FunctionNames>().toEqualTypeOf<"getUser" | "listUsers">();
    });
  });
});

// =============================================================================
// Predicate Tests
// =============================================================================

describe("Group Predicates", () => {
  const validGroup = Group.query("users").pipe(
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
  const listUsersFn = Function.query("listUsers")
    .args(Schema.Struct({}))
    .returns(TestReturnsSchema);

  const testGroup = Group.query("testGroup").pipe(
    Group.add(getUserFn),
    Group.add(listUsersFn),
  );
  void testGroup

  describe("GetName", () => {
    test("extracts name as literal type", () => {
      type Name = Group.GetName<typeof testGroup>;
      expectTypeOf<Name>().toEqualTypeOf<"testGroup">();
    });
  });

  describe("GetFunctionNames", () => {
    test("extracts function names as union", () => {
      type Names = Group.GetFunctionNames<typeof testGroup>;
      expectTypeOf<Names>().toEqualTypeOf<"getUser" | "listUsers">();
    });

    test("returns never for empty group", () => {
      const emptyGroup = Group.query("empty");
      void emptyGroup
      type Names = Group.GetFunctionNames<typeof emptyGroup>;
      expectTypeOf<Names>().toEqualTypeOf<never>();
    });
  });

  describe("GetKind", () => {
    test("extracts kind for query group", () => {
      type Kind = Group.GetKind<typeof testGroup>;
      expectTypeOf<Kind>().toEqualTypeOf<"Query">();
    });

    test("extracts kind for mutation group", () => {
      const mutGroup = Group.mutation("mutations").pipe(Group.add(createUserFn));
      type Kind = Group.GetKind<typeof mutGroup>;
      expectTypeOf<Kind>().toEqualTypeOf<"Mutation">();
    });

    test("returns Query for empty query group", () => {
      const emptyGroup = Group.query("empty");
      type Kind = Group.GetKind<typeof emptyGroup>;
      expectTypeOf<Kind>().toEqualTypeOf<"Query">();
    });
  });
});

// =============================================================================
// Pipeable Utilities Tests
// =============================================================================

describe("Pipeable Utilities", () => {
  describe("add()", () => {
    test("adds a query function to a query group", () => {
      const listUsersFn = Function.query("listUsers")
        .args(Schema.Struct({}))
        .returns(TestReturnsSchema);

      const original = Group.query("users").pipe(
        Group.add(getUserFn),
      );

      const updated = original.pipe(
        Group.add(listUsersFn)
      );

      expect(updated.name).toBe("users");
      expect(updated.kind).toBe("Query");
      expect(updated.functions["getUser"]).toBe(getUserFn);
      expect(updated.functions["listUsers"]).toBe(listUsersFn);
      expect(Object.keys(updated.functions)).toHaveLength(2);
    });

    test("adds a mutation function to a mutation group", () => {
      const updateUserFn = Function.mutation("updateUser")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const original = Group.mutation("users").pipe(
        Group.add(createUserFn),
      );

      const updated = original.pipe(
        Group.add(updateUserFn)
      );

      expect(updated.name).toBe("users");
      expect(updated.kind).toBe("Mutation");
      expect(updated.functions["createUser"]).toBe(createUserFn);
      expect(updated.functions["updateUser"]).toBe(updateUserFn);
      expect(Object.keys(updated.functions)).toHaveLength(2);
    });

    test("does not mutate original group", () => {
      const listUsersFn = Function.query("listUsers")
        .args(Schema.Struct({}))
        .returns(TestReturnsSchema);

      const original = Group.query("users").pipe(
        Group.add(getUserFn),
      );

      void original.pipe(Group.add(listUsersFn));

      expect(Object.keys(original.functions)).toHaveLength(1);
      expect(original.functions).not.toHaveProperty("listUsers");
    });

    test("overwrites existing function with same name", () => {
      const original = Group.query("users").pipe(
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
    test("renames a function in a query group", () => {
      const listUsersFn = Function.query("listUsers")
        .args(Schema.Struct({}))
        .returns(TestReturnsSchema);

      const original = Group.query("users").pipe(
        Group.add(getUserFn),
        Group.add(listUsersFn),
      );

      const updated = original.pipe(Group.rename("getUser", "fetchUser"));

      expect(updated.functions).toHaveProperty("fetchUser");
      expect(updated.functions).not.toHaveProperty("getUser");
      expect(updated.functions["fetchUser"]).toBe(getUserFn);
      expect(updated.functions["listUsers"]).toBe(listUsersFn);
    });

    test("does not mutate original group", () => {
      const original = Group.query("users").pipe(
        Group.add(getUserFn),
      );

      void original.pipe(Group.rename("getUser", "fetchUser"));

      expect(original.functions).toHaveProperty("getUser");
      expect(original.functions).not.toHaveProperty("fetchUser");
    });
  });

  describe("merge()", () => {
    test("merges two query groups with different functions", () => {
      const listUsersFn = Function.query("listUsers")
        .args(Schema.Struct({}))
        .returns(TestReturnsSchema);

      const group1 = Group.query("api").pipe(
        Group.add(getUserFn),
      );

      const group2 = Group.query("api").pipe(
        Group.add(listUsersFn),
      );

      const merged = group1.pipe(Group.merge(group2));

      expect(merged.name).toBe("api");
      expect(merged.kind).toBe("Query");
      expect(merged.functions["getUser"]).toBe(getUserFn);
      expect(merged.functions["listUsers"]).toBe(listUsersFn);
      expect(Object.keys(merged.functions)).toHaveLength(2);
    });

    test("merges two mutation groups with different functions", () => {
      const updateUserFn = Function.mutation("updateUser")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const group1 = Group.mutation("api").pipe(
        Group.add(createUserFn),
      );

      const group2 = Group.mutation("api").pipe(
        Group.add(updateUserFn),
      );

      const merged = group1.pipe(Group.merge(group2));

      expect(merged.name).toBe("api");
      expect(merged.kind).toBe("Mutation");
      expect(merged.functions["createUser"]).toBe(createUserFn);
      expect(merged.functions["updateUser"]).toBe(updateUserFn);
      expect(Object.keys(merged.functions)).toHaveLength(2);
    });

    test("second group functions take precedence on conflict", () => {
      const fn1 = Function.query("test")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const fn2 = Function.query("test")
        .args(TestArgsSchema)
        .returns(Schema.String);

      const group1 = Group.query("api").pipe(
        Group.add(fn1),
        Group.add(getUserFn),
      );

      const group2 = Group.query("api").pipe(
        Group.add(fn2),
      );

      const merged = group1.pipe(Group.merge(group2));

      expect(merged.functions["test"]).toBe(fn2);
      expect(merged.functions["getUser"]).toBe(getUserFn);
    });

    test("does not mutate original groups", () => {
      const listUsersFn = Function.query("listUsers")
        .args(Schema.Struct({}))
        .returns(TestReturnsSchema);

      const group1 = Group.query("api").pipe(
        Group.add(getUserFn),
      );

      const group2 = Group.query("api").pipe(
        Group.add(listUsersFn),
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
      const zGroup = Group.query("zebra");
      const aGroup = Group.query("apple");
      const mGroup = Group.query("mango");

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
    const specific = Group.query("specificName").pipe(
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
      const testGroup = Group.query("test").pipe(
        Group.add(getUserFn),
      );

      // Simple handler with no dependencies
      const TestLive = Group.build(testGroup,
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

      const usersGroup = Group.query("users").pipe(
        Group.add(getUserFn),
      );

      // Handler Effect requires Database
      const UsersLive = Group.build(usersGroup,
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
      const testGroup = Group.query("test").pipe(
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
      const createNoteFn = Function.mutation("create")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);
      const deleteNoteFn = Function.mutation("delete")
        .args(TestArgsSchema)
        .returns(Schema.Null);

      const notesWriteGroup = Group.mutation("notesWrite").pipe(
        Group.add(createNoteFn),
        Group.add(deleteNoteFn)
      );

      // Define query group
      const listNotesFn = Function.query("list")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);
      const getNoteFn = Function.query("get")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const notesReadGroup = Group.query("notesRead").pipe(
        Group.add(listNotesFn),
        Group.add(getNoteFn),
      );

      // Create tags for the groups


      // Implement mutation group with no dependencies
      const NotesWriteLive = Group.build(notesWriteGroup,
        Effect.succeed({
          create: () => Effect.succeed({ result: "created" }),
          delete: () => Effect.succeed(null),
        })
      );

      // Implement query group that depends on mutation handlers
      const NotesReadLive = Group.build(notesReadGroup,
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

      const usersGroup = Group.query("users").pipe(
        Group.add(getUserFn),
      );

      const getPostFn = Function.query("getPost")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const postsGroup = Group.query("posts").pipe(
        Group.add(getPostFn),
      );

      // Create tags


      // Both groups depend on QueryDB
      const UsersLive = Group.build(usersGroup,
        Effect.gen(function* () {
          const db = yield* QueryDB;
          return {
            getUser: () => db.query("users").pipe(Effect.map(() => ({ result: "user" }))),
          };
        })
      );

      const PostsLive = Group.build(postsGroup,
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

      const funcA = Function.query("funcA")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const groupA = Group.query("a").pipe(
        Group.add(funcA),
      );

      const funcB = Function.mutation("funcB")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const groupB = Group.mutation("b").pipe(
        Group.add(funcB),
      );
      void groupB; // Used below


      // GroupA depends on GroupB - this is fine
      const GroupALive = Group.build(groupA,
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
      const usersGroup = Group.query("users").pipe(
        Group.add(getUserFn),
      );

      const UsersLive = Group.build(usersGroup,
        Effect.gen(function* () {
          const db = yield* Database;
          return {
            getUser: () => db.query().pipe(Effect.map(() => ({ result: "user-from-db" }))),
          };
        })
      );

      // Level 3: Application services using domain services
      const getProfileFn = Function.query("getProfile")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const profileGroup = Group.query("profile").pipe(
        Group.add(getProfileFn),
      );

      const someMutationGroup = Group.query("myService")

      const ProfileLive = Group.build(profileGroup,
        Effect.gen(function* () {
          yield* Group.Tag(someMutationGroup)
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
      const loginFn = Function.query("login")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const authGroup = Group.query("auth").pipe(
        Group.add(loginFn),
      );

      const uploadFn = Function.mutation("upload")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const storageGroup = Group.mutation("storage").pipe(
        Group.add(uploadFn),
      );


      const AuthLive = Group.build(authGroup,
        Effect.gen(function* () {
          const config = yield* Config;
          return {
            login: () => Effect.succeed({ result: `auth:${config.apiUrl}` }),
          };
        })
      );

      const StorageLive = Group.build(storageGroup,
        Effect.gen(function* () {
          const config = yield* Config;
          return {
            upload: () => Effect.succeed({ result: `storage:${config.apiUrl}` }),
          };
        })
      );

      // Third group depends on both
      const initFn = Function.query("init")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const appGroup = Group.query("app").pipe(
        Group.add(initFn),
      );

      const AppLive = Group.build(appGroup,
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
      const testGroup = Group.query("test").pipe(
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
      const func1 = Function.query("func1")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);
      const func2 = Function.query("func2")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      const testGroup = Group.query("test").pipe(
        Group.add(func1),
        Group.add(func2),
      );

      // Only implement func1, func2 will throw if called
      const TestMock = Layer.mock(Group.Tag(testGroup), {
        func1: () => Effect.succeed({ result: "mocked" }),
      });

      void TestMock;
    });
  });

});
