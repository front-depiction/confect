/**
 * Tests for internal/Api module
 *
 * This test file showcases the desired pipeable API pattern:
 * - Api.api("name") creates empty API
 * - Api.add(group) adds group (pipeable)
 * - Api.remove(name) removes group (pipeable)
 * - Api.merge(other) merges APIs (pipeable)
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  defineConfectSchema,
  defineConfectTable,
} from "../../server";
import * as Api from "./Api";
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

const getPostFn = Function.query("getPost")
  .args(TestArgsSchema)
  .returns(TestReturnsSchema);

const createPostFn = Function.mutation("createPost")
  .args(TestArgsSchema)
  .returns(TestReturnsSchema);

const usersGroup = Group.query("users").pipe(
  Group.add(getUserFn),
);

const postsGroup = Group.query("posts").pipe(
  Group.add(getPostFn),
);

const emptyGroup = Group.query("empty");





// =============================================================================
// Constructor Tests
// =============================================================================

describe("Api Constructor", () => {
  describe("api()", () => {
    test("creates an empty API", () => {
      const myApi = Api.api("myApp");

      expect(myApi.name).toBe("myApp");
      expect(myApi.groups).toEqual({});
      expect(Object.keys(myApi.groups)).toHaveLength(0);
    });

    test("preserves literal name type", () => {
      const myApi = Api.api("myApp");

      type Name = typeof myApi.name;
      expectTypeOf<Name>().toEqualTypeOf<"myApp">();
      expectTypeOf<TypesAreEquivalent<Name, "myApp">>().toEqualTypeOf<true>();
    });

    test("has ApiTypeId symbol", () => {
      const myApi = Api.api("test");
      expect(myApi[Api.ApiTypeId]).toBeTruthy();
    });

    test("works with pipe to add groups", () => {
      const myApi = Api.api("myApp").pipe(
        Api.add(usersGroup),
        Api.add(postsGroup),
      );

      expect(myApi.name).toBe("myApp");
      expect(myApi.groups["users"]).toBe(usersGroup);
      expect(myApi.groups["posts"]).toBe(postsGroup);
      expect(Object.keys(myApi.groups)).toHaveLength(2);
    });

    test("preserves group names as literal types with pipe", () => {
      const myApi = Api.api("myApp").pipe(
        Api.add(usersGroup),
        Api.add(postsGroup),
      );
      void myApi

      type GroupNames = Api.GetGroupNames<typeof myApi>;
      expectTypeOf<GroupNames>().toEqualTypeOf<"users" | "posts">();
      expectTypeOf<
        TypesAreEquivalent<GroupNames, "users" | "posts">
      >().toEqualTypeOf<true>();
    });
  });
});

// =============================================================================
// Predicate Tests
// =============================================================================

describe("Api Predicates", () => {
  const validApi = Api.api("myApp").pipe(
    Api.add(usersGroup),
  );



  describe("isApi()", () => {
    test("returns true for valid APIs", () => {
      expect(Api.isApi(validApi)).toBe(true);
    });

    test("returns false for plain objects", () => {
      expect(Api.isApi({})).toBe(false);
      expect(Api.isApi({ name: "test", groups: {} })).toBe(false);
    });

    test("returns false for primitives", () => {
      expect(Api.isApi(null)).toBe(false);
      expect(Api.isApi(undefined)).toBe(false);
      expect(Api.isApi(42)).toBe(false);
      expect(Api.isApi("test")).toBe(false);
    });

    test("returns false for groups and functions", () => {
      expect(Api.isApi(usersGroup)).toBe(false);
      expect(Api.isApi(getUserFn)).toBe(false);
    });

    test("narrows type correctly", () => {
      const value: unknown = validApi;
      if (Api.isApi(value)) {
        expectTypeOf(value).toMatchTypeOf<
          Api.ConfectApi<
            string,
            Group.ConfectApiGroup.AnyGroup
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
  const testApi = Api.api("testApp").pipe(
    Api.add(usersGroup),
    Api.add(postsGroup),
  );

  describe("GetName", () => {
    test("extracts name as literal type", () => {
      type Name = Api.GetName<typeof testApi>;
      expectTypeOf<Name>().toEqualTypeOf<"testApp">();
      expectTypeOf<
        TypesAreEquivalent<Name, "testApp">
      >().toEqualTypeOf<true>();
    });
  });

  describe("GetGroups", () => {
    test("extracts groups record", () => {
      type Groups = Api.GetGroups<typeof testApi>;
      // Use toMatchTypeOf for structural compatibility instead of exact equality
      expectTypeOf<Groups>().toEqualTypeOf<{
        users: typeof usersGroup;
        posts: typeof postsGroup;
      }>();

      // Verify it's a record with the right keys
      expectTypeOf<keyof Groups>().toEqualTypeOf<"users" | "posts">();
    });
  });

  describe("GetGroupNames", () => {
    test("extracts group names as union", () => {
      type Names = Api.GetGroupNames<typeof testApi>;
      expectTypeOf<Names>().toEqualTypeOf<"users" | "posts">();
      expectTypeOf<
        TypesAreEquivalent<Names, "users" | "posts">
      >().toEqualTypeOf<true>();
    });

    test("returns never for empty API", () => {
      const emptyApi = Api.api("empty");
      type Names = Api.GetGroupNames<typeof emptyApi>;
      expectTypeOf<Names>().toEqualTypeOf<never>();
    });
  });
});

// =============================================================================
// Pipeable Utilities Tests
// =============================================================================

describe("Pipeable Utilities", () => {
  describe("add()", () => {
    test("adds a group to an API", () => {
      const original = Api.api("myApp").pipe(
        Api.add(usersGroup),
      );

      const updated = original.pipe(
        Api.add(postsGroup)
      );

      expect(updated.name).toBe("myApp");
      expect(updated.groups["users"]).toBe(usersGroup);
      expect(updated.groups["posts"]).toBe(postsGroup);
      expect(Object.keys(updated.groups)).toHaveLength(2);
    });

    test("does not mutate original API", () => {
      const original = Api.api("myApp").pipe(
        Api.add(usersGroup),
      );

      original.pipe(Api.add(postsGroup));

      expect(Object.keys(original.groups)).toHaveLength(1);
      expect(original.groups).not.toHaveProperty("posts");
    });

    test("overwrites existing group with same name", () => {
      const original = Api.api("myApp").pipe(
        Api.add(usersGroup),
      );

      const newUsersGroup = Group.query("users").pipe(
        Group.add(getUserFn),
      );

      const updated = original.pipe(Api.add(newUsersGroup));

      expect(updated.groups["users"]).toBe(newUsersGroup);
      expect(updated.groups["users"]).not.toBe(usersGroup);
    });

    test("works with multiple adds in single pipe", () => {
      const api = Api.api("myApp").pipe(
        Api.add(usersGroup),
        Api.add(postsGroup),
        Api.add(emptyGroup),
      );

      expect(Object.keys(api.groups)).toHaveLength(3);
      expect(api.groups["users"]).toBe(usersGroup);
      expect(api.groups["posts"]).toBe(postsGroup);
      expect(api.groups["empty"]).toBe(emptyGroup);
    });
  });

  describe("merge()", () => {
    test("merges two APIs with different groups", () => {
      const api1 = Api.api("myApp").pipe(
        Api.add(usersGroup),
      );

      const api2 = Api.api("myApp").pipe(
        Api.add(postsGroup),
      );

      const merged = api1.pipe(Api.merge(api2));

      expect(merged.name).toBe("myApp");
      expect(merged.groups["users"]).toBe(usersGroup);
      expect(merged.groups["posts"]).toBe(postsGroup);
      expect(Object.keys(merged.groups)).toHaveLength(2);
    });

    test("second API groups take precedence on conflict", () => {
      const group1 = Group.query("shared").pipe(
        Group.add(getUserFn),
      );

      const group2 = Group.mutation("shared").pipe(
        Group.add(createUserFn),
      );

      const api1 = Api.api("myApp").pipe(
        Api.add(group1),
        Api.add(usersGroup),
      );

      const api2 = Api.api("myApp").pipe(
        Api.add(group2),
      );

      const merged = api1.pipe(Api.merge(api2));

      expect(merged.groups["shared"]).toBe(group2);
      expect(merged.groups["users"]).toBe(usersGroup);
    });

    test("does not mutate original APIs", () => {
      const api1 = Api.api("myApp").pipe(
        Api.add(usersGroup),
      );

      const api2 = Api.api("myApp").pipe(
        Api.add(postsGroup),
      );

      api1.pipe(Api.merge(api2));

      expect(Object.keys(api1.groups)).toHaveLength(1);
      expect(Object.keys(api2.groups)).toHaveLength(1);
    });

    test("merges empty APIs", () => {
      const api1 = Api.api("myApp");
      const api2 = Api.api("myApp");

      const merged = api1.pipe(Api.merge(api2));

      expect(Object.keys(merged.groups)).toHaveLength(0);
    });
  });
});

// =============================================================================
// Order Utilities Tests
// =============================================================================

describe("Order Utilities", () => {
  describe("byName", () => {
    test("orders APIs alphabetically by name", () => {
      const zApi = Api.api("zebra");
      const aApi = Api.api("apple");
      const mApi = Api.api("mango");

      const apis = [zApi, aApi, mApi];
      const sorted = Array.sort(apis, Api.byName);

      expect(sorted[0]!.name).toBe("apple");
      expect(sorted[1]!.name).toBe("mango");
      expect(sorted[2]!.name).toBe("zebra");
    });
  });

  describe("byGroupCount", () => {
    test("orders APIs by number of groups (ascending)", () => {
      const api1 = Api.api("one").pipe(Api.add(usersGroup));
      const api3 = Api.api("three").pipe(
        Api.add(usersGroup),
        Api.add(postsGroup),
        Api.add(emptyGroup),
      );
      const api2 = Api.api("two").pipe(
        Api.add(usersGroup),
        Api.add(postsGroup),
      );

      const apis = [api3, api1, api2];
      const sorted = Array.sort(apis, Api.byGroupCount);

      expect(sorted[0]).toBe(api1);
      expect(sorted[1]).toBe(api2);
      expect(sorted[2]).toBe(api3);
    });
  });

  describe("byFunctionCount", () => {
    test("orders APIs by total number of functions (ascending)", () => {
      const api1 = Api.api("one").pipe(Api.add(emptyGroup)); // 0 functions
      const api2 = Api.api("two").pipe(Api.add(usersGroup)); // 2 functions
      const api3 = Api.api("three").pipe(
        Api.add(usersGroup),
        Api.add(postsGroup),
      ); // 4 functions

      const apis = [api3, api1, api2];
      const sorted = Array.sort(apis, Api.byFunctionCount);

      expect(sorted[0]).toBe(api1); // 0 functions
      expect(sorted[1]).toBe(api2); // 2 functions
      expect(sorted[2]).toBe(api3); // 4 functions
    });
  });
});

// =============================================================================
// Path Navigation Tests
// =============================================================================

describe("Path Navigation", () => {
  const testApi = Api.api("testApp").pipe(
    Api.add(usersGroup),
    Api.add(postsGroup),
  );

  describe("getGroup()", () => {
    test("returns group when it exists", () => {
      const users = Api.getGroup(testApi, "users");
      expect(users).toBe(usersGroup);
    });

    test("returns undefined when group does not exist", () => {
      const missing = Api.getGroup(testApi, "missing" as any);
      expect(missing).toBeUndefined();
    });
  });

  describe("getFunction()", () => {
    test("returns function when it exists", () => {
      const getUser = Api.getFunction(testApi, "users", "getUser");
      expect(getUser).toBe(getUserFn);
    });

    test("returns undefined when group does not exist", () => {
      const fn = Api.getFunction(testApi, "missing" as any, "test");
      expect(fn).toBeUndefined();
    });

    test("returns undefined when function does not exist", () => {
      const fn = Api.getFunction(testApi, "users", "missing");
      expect(fn).toBeUndefined();
    });

    test("navigates nested paths correctly", () => {
      const getPost = Api.getFunction(testApi, "posts", "getPost");
      expect(getPost).toBe(getPostFn);
    });
  });
});

// =============================================================================
// Variance Tests
// =============================================================================

describe("Variance Behavior", () => {
  test("Name is covariant", () => {
    const specific = Api.api("specificName").pipe(
      Api.add(usersGroup),
    );

    expect(specific.name).toBe("specificName");

    type Name = typeof specific.name;
    expectTypeOf<Name>().toEqualTypeOf<"specificName">();

    const name: string = specific.name;
    expect(name).toBe("specificName");
  });

  test("Groups maintains type structure", () => {
    const specific = Api.api("test").pipe(
      Api.add(usersGroup),
    );

    expect(specific.groups["users"]).toBe(usersGroup);

    type GroupNames = Api.GetGroupNames<typeof specific>;
    expectTypeOf<GroupNames>().toEqualTypeOf<"users">();
  });
});

// =============================================================================
// Api.serve Tests
// =============================================================================

describe("Api.serve", () => {
  // Define test schema
  const testConfectSchema = defineConfectSchema({
    users: defineConfectTable(
      Schema.Struct({
        name: Schema.String,
        email: Schema.String,
      })
    ),
    posts: defineConfectTable(
      Schema.Struct({
        title: Schema.String,
        content: Schema.String,
      })
    ),
  });

  describe("Object Structure", () => {
    test("returns nested object structure matching API groups", () => {
      const testApi = Api.api("testApp").pipe(
        Api.add(usersGroup),
        Api.add(postsGroup),
      );

      // Create minimal handler implementations
      const UsersLive = Layer.succeed(
        Group.Tag(usersGroup),
        {
          getUser: () => Effect.succeed({ result: "user" }),
          createUser: () => Effect.succeed({ result: "created" }),
        }
      );

      const PostsLive = Layer.succeed(
        Group.Tag(postsGroup),
        {
          getPost: () => Effect.succeed({ result: "post" }),
          createPost: () => Effect.succeed({ result: "created" }),
        }
      );

      const apiLayer = Layer.mergeAll(UsersLive, PostsLive);

      const convexApi = Api.serve(testConfectSchema, testApi, apiLayer);

      // Check top-level structure has group names as keys
      expect(convexApi).toHaveProperty("users");
      expect(convexApi).toHaveProperty("posts");
      expect(Object.keys(convexApi)).toHaveLength(2);
    });

    test("each group contains function names as keys", () => {
      const testApi = Api.api("testApp").pipe(
        Api.add(usersGroup),
      );

      const UsersLive = Layer.succeed(
        Group.Tag(usersGroup),
        {
          getUser: () => Effect.succeed({ result: "user" }),
          createUser: () => Effect.succeed({ result: "created" }),
        }
      );

      const convexApi = Api.serve(testConfectSchema, testApi, UsersLive);

      // Check that users group has function keys
      expect(convexApi["users"]).toHaveProperty("getUser");
      expect(convexApi["users"]).toHaveProperty("createUser");
      expect(Object.keys(convexApi["users"])).toHaveLength(2);
    });

    test("works with empty groups", () => {
      const testApi = Api.api("testApp").pipe(
        Api.add(emptyGroup),
      );

      const EmptyLive = Layer.succeed(
        Group.Tag(emptyGroup),
        {}
      );

      const convexApi = Api.serve(testConfectSchema, testApi, EmptyLive);

      expect(convexApi).toHaveProperty("empty");
      expect(Object.keys(convexApi["empty"])).toHaveLength(0);
    });

    test("functions are Convex registered handlers", () => {
      const testApi = Api.api("testApp").pipe(
        Api.add(usersGroup),
      );

      const UsersLive = Layer.succeed(
        Group.Tag(usersGroup),
        {
          getUser: () => Effect.succeed({ result: "user" }),
          createUser: () => Effect.succeed({ result: "created" }),
        }
      );

      const convexApi = Api.serve(testConfectSchema, testApi, UsersLive);

      // Registered functions should have specific structure
      expect(convexApi["users"]["getUser"]).toHaveProperty("isQuery");
      expect(convexApi["users"]["createUser"]).toHaveProperty("isMutation");
    });
  });

  describe("Handler Execution", () => {
    test("query handlers can be invoked", async () => {
      const testApi = Api.api("testApp").pipe(
        Api.add(usersGroup),
      );

      const UsersLive = Layer.succeed(
        Group.Tag(usersGroup),
        {
          getUser: (args: { id: string }) =>
            Effect.succeed({ result: `user-${args.id}` }),
          createUser: () => Effect.succeed({ result: "created" }),
        }
      );

      const convexApi = Api.serve(testConfectSchema, testApi, UsersLive);

      // Mock Convex query context
      const mockQueryCtx = {
        db: {},
        auth: {},
        storage: {},
      } as any;

      // Invoke the handler (use _handler for direct invocation)
      const result = await (convexApi["users"]["getUser"] as any)._handler(
        mockQueryCtx,
        { id: "test-123" }
      );

      expect(result).toEqual({ result: "user-test-123" });
    });

    test("mutation handlers can be invoked", async () => {
      const testApi = Api.api("testApp").pipe(
        Api.add(usersGroup),
      );

      const UsersLive = Layer.succeed(
        Group.Tag(usersGroup),
        {
          getUser: () => Effect.succeed({ result: "user" }),
          createUser: (args: { id: string }) =>
            Effect.succeed({ result: `created-${args.id}` }),
        }
      );

      const convexApi = Api.serve(testConfectSchema, testApi, UsersLive);

      // Mock Convex mutation context
      const mockMutationCtx = {
        db: {},
        auth: {},
        storage: {},
        scheduler: {},
      } as any;

      // Invoke the handler (use _handler for direct invocation)
      const result = await (convexApi["users"]["createUser"] as any)._handler(
        mockMutationCtx,
        { id: "new-user" }
      );

      expect(result).toEqual({ result: "created-new-user" });
    });

    test("multiple groups with handlers work correctly", async () => {
      const testApi = Api.api("testApp").pipe(
        Api.add(usersGroup),
        Api.add(postsGroup),
      );

      const UsersLive = Layer.succeed(
        Group.Tag(usersGroup),
        {
          getUser: (args: { id: string }) =>
            Effect.succeed({ result: `user-${args.id}` }),
          createUser: () => Effect.succeed({ result: "created" }),
        }
      );

      const PostsLive = Layer.succeed(
        Group.Tag(postsGroup),
        {
          getPost: (args: { id: string }) =>
            Effect.succeed({ result: `post-${args.id}` }),
          createPost: () => Effect.succeed({ result: "post-created" }),
        }
      );

      const apiLayer = Layer.mergeAll(UsersLive, PostsLive);

      const convexApi = Api.serve(testConfectSchema, testApi, apiLayer);

      const mockQueryCtx = {
        db: {},
        auth: {},
        storage: {},
      } as any;

      // Test both group handlers
      const userResult = await (convexApi["users"]["getUser"] as any)._handler(
        mockQueryCtx,
        { id: "user-1" }
      );
      const postResult = await (convexApi["posts"]["getPost"] as any)._handler(
        mockQueryCtx,
        { id: "post-1" }
      );

      expect(userResult).toEqual({ result: "user-user-1" });
      expect(postResult).toEqual({ result: "post-post-1" });
    });

    test("handlers receive correct argument types", async () => {
      const testApi = Api.api("testApp").pipe(
        Api.add(usersGroup),
      );

      let receivedArgs: any = null;

      const UsersLive = Layer.succeed(
        Group.Tag(usersGroup),
        {
          getUser: (args: { id: string }) => {
            receivedArgs = args;
            return Effect.succeed({ result: "ok" });
          },
          createUser: () => Effect.succeed({ result: "created" }),
        }
      );

      const convexApi = Api.serve(testConfectSchema, testApi, UsersLive);

      const mockQueryCtx = {
        db: {},
        auth: {},
        storage: {},
      } as any;

      await (convexApi["users"]["getUser"] as any)._handler(
        mockQueryCtx,
        { id: "test-id" }
      );

      expect(receivedArgs).toEqual({ id: "test-id" });
    });
  });
});
