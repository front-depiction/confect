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
import * as Schema from "effect/Schema";
import { describe, expect, expectTypeOf, test } from "vitest";
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

const usersGroup = Group.group("users").pipe(
  Group.add("getUser", getUserFn),
  Group.add("createUser", createUserFn),
);

const postsGroup = Group.group("posts").pipe(
  Group.add("getPost", getPostFn),
  Group.add("createPost", createPostFn),
);

const emptyGroup = Group.group("empty");

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
      expect(myApi.groups.users).toBe(usersGroup);
      expect(myApi.groups.posts).toBe(postsGroup);
      expect(Object.keys(myApi.groups)).toHaveLength(2);
    });

    test("preserves group names as literal types with pipe", () => {
      const myApi = Api.api("myApp").pipe(
        Api.add(usersGroup),
        Api.add(postsGroup),
      );

      type GroupNames = keyof typeof myApi.groups;
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
            Record<
              string,
              Group.ConfectApiGroup<
                string,
                Record<string, Function.ConfectApiFunction>
              >
            >
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
      expectTypeOf<Groups>().toMatchTypeOf<{
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
      expect(updated.groups.users).toBe(usersGroup);
      expect(updated.groups.posts).toBe(postsGroup);
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

      const newUsersGroup = Group.group("users").pipe(
        Group.add("getUser", getUserFn),
      );

      const updated = original.pipe(Api.add(newUsersGroup));

      expect(updated.groups.users).toBe(newUsersGroup);
      expect(updated.groups.users).not.toBe(usersGroup);
    });

    test("works with multiple adds in single pipe", () => {
      const api = Api.api("myApp").pipe(
        Api.add(usersGroup),
        Api.add(postsGroup),
        Api.add(emptyGroup),
      );

      expect(Object.keys(api.groups)).toHaveLength(3);
      expect(api.groups.users).toBe(usersGroup);
      expect(api.groups.posts).toBe(postsGroup);
      expect(api.groups.empty).toBe(emptyGroup);
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
      expect(merged.groups.users).toBe(usersGroup);
      expect(merged.groups.posts).toBe(postsGroup);
      expect(Object.keys(merged.groups)).toHaveLength(2);
    });

    test("second API groups take precedence on conflict", () => {
      const group1 = Group.group("shared").pipe(
        Group.add("fn1", getUserFn),
      );

      const group2 = Group.group("shared").pipe(
        Group.add("fn2", createUserFn),
      );

      const api1 = Api.api("myApp").pipe(
        Api.add(group1),
        Api.add(usersGroup),
      );

      const api2 = Api.api("myApp").pipe(
        Api.add(group2),
      );

      const merged = api1.pipe(Api.merge(api2));

      expect(merged.groups.shared).toBe(group2);
      expect(merged.groups.users).toBe(usersGroup);
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

    expect(specific.groups.users).toBe(usersGroup);

    type GroupNames = keyof typeof specific.groups;
    expectTypeOf<GroupNames>().toEqualTypeOf<"users">();
  });
});
