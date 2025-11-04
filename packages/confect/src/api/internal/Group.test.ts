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
import * as Schema from "effect/Schema";
import { describe, expect, expectTypeOf, test } from "vitest";
import * as Function from "./Function";
import * as Group from "./Group";

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

const testGroup = Group.group("users").pipe(
  Group.add("getUser", getUserFn),
  Group.add("createUser", createUserFn),
)
void testGroup.functions
// =============================================================================
// Type Testing Utility
// =============================================================================

type TypesAreEquivalent<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

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

      const updated = original.pipe(v => Group.rename("getUsers", "fetchUser")(v));

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
