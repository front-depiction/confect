/**
 * Tests for internal/Function module
 *
 * This test file verifies:
 * - Constructor functions (query, mutation, action)
 * - Literal type preservation
 * - Type IDs and symbols
 * - Predicates and refinements
 * - Type extraction utilities
 * - Convex function conversion
 */

import * as Schema from "effect/Schema";
import { describe, expect, expectTypeOf, test } from "vitest";
import * as Function from "./Function";
import type { TypesAreEquivalent } from "./test-helpers";

// =============================================================================
// Test Schemas
// =============================================================================

const TestArgsSchema = Schema.Struct({
  id: Schema.String,
  count: Schema.Number,
});

const TestReturnsSchema = Schema.Struct({
  result: Schema.String,
  timestamp: Schema.Number,
});

// =============================================================================
// Constructor Tests
// =============================================================================

describe("Function Constructors", () => {
  describe("query()", () => {
    test("creates a valid query function", () => {
      const fn = Function.query("getUser")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      expect(fn.functionType).toBe("Query");
      expect(fn.name).toBe("getUser");
      expect(fn.args).toBe(TestArgsSchema);
      expect(fn.returns).toBe(TestReturnsSchema);
    });

    test("preserves literal name type", () => {
      const fn = Function.query("getUser")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      type Name = typeof fn.name;
      expectTypeOf<Name>().toEqualTypeOf<"getUser">();
      expectTypeOf<TypesAreEquivalent<Name, "getUser">>().toEqualTypeOf<true>();
    });

    test("has correct type structure", () => {
      const fn = Function.query("test")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      type Fn = typeof fn;
      expectTypeOf<Fn>().toMatchTypeOf<
        Function.ConfectApiQueryFunction<
          "test",
          typeof TestArgsSchema,
          typeof TestReturnsSchema
        >
      >();
    });

    test("has QueryFunctionTypeId symbol", () => {
      const fn = Function.query("test")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      expect(fn[Function.QueryFunctionTypeId]).toBeTruthy();
    });
  });

  describe("mutation()", () => {
    test("creates a valid mutation function", () => {
      const fn = Function.mutation("createUser")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      expect(fn.functionType).toBe("Mutation");
      expect(fn.name).toBe("createUser");
      expect(fn.args).toBe(TestArgsSchema);
      expect(fn.returns).toBe(TestReturnsSchema);
    });

    test("preserves literal name type", () => {
      const fn = Function.mutation("createUser")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      type Name = typeof fn.name;
      expectTypeOf<Name>().toEqualTypeOf<"createUser">();
      expectTypeOf<
        TypesAreEquivalent<Name, "createUser">
      >().toEqualTypeOf<true>();
    });

    test("has correct type structure", () => {
      const fn = Function.mutation("test")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      type Fn = typeof fn;
      expectTypeOf<Fn>().toMatchTypeOf<
        Function.ConfectApiMutationFunction<
          "test",
          typeof TestArgsSchema,
          typeof TestReturnsSchema
        >
      >();
    });

    test("has MutationFunctionTypeId symbol", () => {
      const fn = Function.mutation("test")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      expect(fn[Function.MutationFunctionTypeId]).toBeTruthy();
    });
  });

  describe("action()", () => {
    test("creates a valid action function", () => {
      const fn = Function.action("sendEmail")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      expect(fn.functionType).toBe("Action");
      expect(fn.name).toBe("sendEmail");
      expect(fn.args).toBe(TestArgsSchema);
      expect(fn.returns).toBe(TestReturnsSchema);
    });

    test("preserves literal name type", () => {
      const fn = Function.action("sendEmail")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      type Name = typeof fn.name;
      expectTypeOf<Name>().toEqualTypeOf<"sendEmail">();
      expectTypeOf<
        TypesAreEquivalent<Name, "sendEmail">
      >().toEqualTypeOf<true>();
    });

    test("has correct type structure", () => {
      const fn = Function.action("test")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      type Fn = typeof fn;
      expectTypeOf<Fn>().toMatchTypeOf<
        Function.ConfectApiActionFunction<
          "test",
          typeof TestArgsSchema,
          typeof TestReturnsSchema
        >
      >();
    });

    test("has ActionFunctionTypeId symbol", () => {
      const fn = Function.action("test")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);

      expect(fn[Function.ActionFunctionTypeId]).toBeTruthy();
    });
  });
});

// =============================================================================
// Predicate Tests
// =============================================================================

describe("Function Predicates", () => {
  const queryFn = Function.query("test")
    .args(TestArgsSchema)
    .returns(TestReturnsSchema);
  const mutationFn = Function.mutation("test")
    .args(TestArgsSchema)
    .returns(TestReturnsSchema);
  const actionFn = Function.action("test")
    .args(TestArgsSchema)
    .returns(TestReturnsSchema);

  describe("isFunction()", () => {
    test("returns true for query functions", () => {
      expect(Function.isFunction(queryFn)).toBe(true);
    });

    test("returns true for mutation functions", () => {
      expect(Function.isFunction(mutationFn)).toBe(true);
    });

    test("returns true for action functions", () => {
      expect(Function.isFunction(actionFn)).toBe(true);
    });

    test("returns false for plain objects", () => {
      expect(Function.isFunction({})).toBe(false);
      expect(Function.isFunction({ name: "test" })).toBe(false);
    });

    test("returns false for primitives", () => {
      expect(Function.isFunction(null)).toBe(false);
      expect(Function.isFunction(undefined)).toBe(false);
      expect(Function.isFunction(42)).toBe(false);
      expect(Function.isFunction("test")).toBe(false);
    });

    test("narrows type correctly", () => {
      const value: unknown = queryFn;
      if (Function.isFunction(value)) {
        expectTypeOf(value).toMatchTypeOf<Function.ConfectApiFunction>();
      }
    });
  });

  describe("isQuery()", () => {
    test("returns true for query functions", () => {
      expect(Function.isQuery(queryFn)).toBe(true);
    });

    test("returns false for mutation functions", () => {
      expect(Function.isQuery(mutationFn)).toBe(false);
    });

    test("returns false for action functions", () => {
      expect(Function.isQuery(actionFn)).toBe(false);
    });

    test("narrows type correctly", () => {
      const fn: Function.ConfectApiFunction = queryFn;
      if (Function.isQuery(fn)) {
        expectTypeOf(fn).toMatchTypeOf<
          Function.ConfectApiQueryFunction<
            string,
            Schema.Schema.AnyNoContext,
            Schema.Schema.AnyNoContext
          >
        >();
      }
    });
  });

  describe("isMutation()", () => {
    test("returns false for query functions", () => {
      expect(Function.isMutation(queryFn)).toBe(false);
    });

    test("returns true for mutation functions", () => {
      expect(Function.isMutation(mutationFn)).toBe(true);
    });

    test("returns false for action functions", () => {
      expect(Function.isMutation(actionFn)).toBe(false);
    });

    test("narrows type correctly", () => {
      const fn: Function.ConfectApiFunction = mutationFn;
      if (Function.isMutation(fn)) {
        expectTypeOf(fn).toMatchTypeOf<
          Function.ConfectApiMutationFunction<
            string,
            Schema.Schema.AnyNoContext,
            Schema.Schema.AnyNoContext
          >
        >();
      }
    });
  });

  describe("isAction()", () => {
    test("returns false for query functions", () => {
      expect(Function.isAction(queryFn)).toBe(false);
    });

    test("returns false for mutation functions", () => {
      expect(Function.isAction(mutationFn)).toBe(false);
    });

    test("returns true for action functions", () => {
      expect(Function.isAction(actionFn)).toBe(true);
    });

    test("narrows type correctly", () => {
      const fn: Function.ConfectApiFunction = actionFn;
      if (Function.isAction(fn)) {
        expectTypeOf(fn).toMatchTypeOf<
          Function.ConfectApiActionFunction<
            string,
            Schema.Schema.AnyNoContext,
            Schema.Schema.AnyNoContext
          >
        >();
      }
    });
  });
});

// =============================================================================
// Refinement Tests
// =============================================================================

describe("Function Refinements", () => {
  const queryFn = Function.query("q")
    .args(TestArgsSchema)
    .returns(TestReturnsSchema);
  const mutationFn = Function.mutation("m")
    .args(TestArgsSchema)
    .returns(TestReturnsSchema);
  const actionFn = Function.action("a")
    .args(TestArgsSchema)
    .returns(TestReturnsSchema);

  const functions: Function.ConfectApiFunction[] = [queryFn, mutationFn, actionFn];

  test("QueryRefinement filters to queries", () => {
    const queries = functions.filter(Function.isQuery);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toBe(queryFn);

    expectTypeOf(queries).toMatchTypeOf<
      Function.ConfectApiQueryFunction<
        string,
        Schema.Schema.AnyNoContext,
        Schema.Schema.AnyNoContext
      >[]
    >();
  });

  test("MutationRefinement filters to mutations", () => {
    const mutations = functions.filter(Function.isMutation);
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toBe(mutationFn);

    expectTypeOf(mutations).toMatchTypeOf<
      Function.ConfectApiMutationFunction<
        string,
        Schema.Schema.AnyNoContext,
        Schema.Schema.AnyNoContext
      >[]
    >();
  });

  test("ActionRefinement filters to actions", () => {
    const actions = functions.filter(Function.isAction);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toBe(actionFn);

    expectTypeOf(actions).toMatchTypeOf<
      Function.ConfectApiActionFunction<
        string,
        Schema.Schema.AnyNoContext,
        Schema.Schema.AnyNoContext
      >[]
    >();
  });
});

// =============================================================================
// Type Extraction Tests
// =============================================================================

describe("Type Extraction Utilities", () => {
  const testFn = Function.query("testFunction")
    .args(TestArgsSchema)
    .returns(TestReturnsSchema);

  describe("GetName", () => {
    test("extracts name as literal type", () => {
      type Name = Function.GetName<typeof testFn>;
      expectTypeOf<Name>().toEqualTypeOf<"testFunction">();
      expectTypeOf<
        TypesAreEquivalent<Name, "testFunction">
      >().toEqualTypeOf<true>();
    });
  });

  describe("GetArgs", () => {
    test("extracts args schema", () => {
      type Args = Function.GetArgs<typeof testFn>;
      expectTypeOf<Args>().toEqualTypeOf<typeof TestArgsSchema>();
      expectTypeOf<
        TypesAreEquivalent<Args, typeof TestArgsSchema>
      >().toEqualTypeOf<true>();
    });
  });

  describe("GetReturns", () => {
    test("extracts returns schema", () => {
      type Returns = Function.GetReturns<typeof testFn>;
      expectTypeOf<Returns>().toEqualTypeOf<typeof TestReturnsSchema>();
      expectTypeOf<
        TypesAreEquivalent<Returns, typeof TestReturnsSchema>
      >().toEqualTypeOf<true>();
    });
  });

  describe("GetArgsType", () => {
    test("extracts decoded args type", () => {
      type ArgsType = Function.GetArgsType<typeof testFn>;
      expectTypeOf<ArgsType["id"]>().toEqualTypeOf<string>()
      expectTypeOf<ArgsType["count"]>().toEqualTypeOf<number>()
      expectTypeOf<
        TypesAreEquivalent<ArgsType, { id: string; count: number }>
      >().toEqualTypeOf<true>();
    });
  });

  describe("", () => {
    test("extracts encoded args type", () => {
      type ArgsEncoded = Function.GetArgsEncoded<typeof testFn>;
      expectTypeOf<ArgsEncoded>().toEqualTypeOf<{
        readonly id: string;
        readonly count: number;
      }>();
    });
  });

  describe("GetReturnsType", () => {
    test("extracts decoded returns type", () => {
      type ReturnsType = Function.GetReturnsType<typeof testFn>;
      expectTypeOf<ReturnsType["result"]>().toEqualTypeOf<string>()
      expectTypeOf<ReturnsType["timestamp"]>().toEqualTypeOf<number>()
      expectTypeOf<
        TypesAreEquivalent<
          ReturnsType,
          { result: string; timestamp: number }
        >
      >().toEqualTypeOf<true>();
    });
  });

  describe("GetReturnsEncoded", () => {
    test("extracts encoded returns type", () => {
      type ReturnsEncoded = Function.GetReturnsEncoded<typeof testFn>;
      expectTypeOf<ReturnsEncoded>().toEqualTypeOf<{
        readonly result: string;
        readonly timestamp: number;
      }>();
    });
  });

  describe("GetFunctionType", () => {
    test("extracts Query literal type", () => {
      const queryFn = Function.query("q")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);
      type FT = Function.GetFunctionType<typeof queryFn>;
      expectTypeOf<FT>().toEqualTypeOf<"Query">();
      expectTypeOf<TypesAreEquivalent<FT, "Query">>().toEqualTypeOf<true>();
    });

    test("extracts Mutation literal type", () => {
      const mutationFn = Function.mutation("m")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);
      type FT = Function.GetFunctionType<typeof mutationFn>;
      expectTypeOf<FT>().toEqualTypeOf<"Mutation">();
      expectTypeOf<TypesAreEquivalent<FT, "Mutation">>().toEqualTypeOf<true>();
    });

    test("extracts Action literal type", () => {
      const actionFn = Function.action("a")
        .args(TestArgsSchema)
        .returns(TestReturnsSchema);
      type FT = Function.GetFunctionType<typeof actionFn>;
      expectTypeOf<FT>().toEqualTypeOf<"Action">();
      expectTypeOf<TypesAreEquivalent<FT, "Action">>().toEqualTypeOf<true>();
    });
  });
});

// =============================================================================
// Convex Conversion Tests
// =============================================================================

describe("toConvexFunction", () => {
  test("converts query function to Convex format", () => {
    const fn = Function.query("test")
      .args(TestArgsSchema)
      .returns(TestReturnsSchema);

    const mockCompiler = (schema: Schema.Schema.AnyNoContext) => schema as any;
    const convexFn = Function.toConvexFunction(fn, mockCompiler);

    // Convex types are opaque - verify structure via runtime checks
    // Using any here is acceptable as this is testing the Convex API boundary
    const fnObj = convexFn as any;
    expect(fnObj.exportName).toBe("test");
    expect(fnObj.visibility).toBe("public");
    expect(fnObj.argsValidator).toBe(TestArgsSchema);
    expect(fnObj.returnsValidator).toBe(TestReturnsSchema);
  });

  test("converts mutation function to Convex format", () => {
    const fn = Function.mutation("test")
      .args(TestArgsSchema)
      .returns(TestReturnsSchema);

    const mockCompiler = (schema: Schema.Schema.AnyNoContext) => schema as any;
    const convexFn = Function.toConvexFunction(fn, mockCompiler);

    // Convex types are opaque - verify structure via runtime checks
    const fnObj = convexFn as any;
    expect(fnObj.exportName).toBe("test");
    expect(fnObj.visibility).toBe("public");
  });

  test("converts action function to Convex format", () => {
    const fn = Function.action("test")
      .args(TestArgsSchema)
      .returns(TestReturnsSchema);

    const mockCompiler = (schema: Schema.Schema.AnyNoContext) => schema as any;
    const convexFn = Function.toConvexFunction(fn, mockCompiler);

    // Convex types are opaque - verify structure via runtime checks
    const fnObj = convexFn as any;
    expect(fnObj.exportName).toBe("test");
    expect(fnObj.visibility).toBe("public");
  });

  test("uses provided schema compiler", () => {
    const fn = Function.query("test")
      .args(TestArgsSchema)
      .returns(TestReturnsSchema);

    const mockValidator = { type: "mock" };
    const mockCompiler = () => mockValidator;
    const convexFn = Function.toConvexFunction(fn, mockCompiler);

    // Convex types are opaque - verify structure via runtime checks
    const fnObj = convexFn as any;
    expect(fnObj.argsValidator).toBe(mockValidator);
    expect(fnObj.returnsValidator).toBe(mockValidator);
  });
});

// =============================================================================
// Variance Tests
// =============================================================================

describe("Variance Behavior", () => {
  test("Name is covariant", () => {
    const specific = Function.query("specificName")
      .args(TestArgsSchema)
      .returns(TestReturnsSchema);

    // Covariance: specific literal can be assigned to wider string type
    const general: Function.ConfectApiQueryFunction<
      string,
      typeof TestArgsSchema,
      typeof TestReturnsSchema
    > = specific;

    expect(general.name).toBe("specificName");
  });

  test("Args is invariant (schema reference equality)", () => {
    const fn = Function.query("test")
      .args(TestArgsSchema)
      .returns(TestReturnsSchema);
    void fn
    // Args should be the exact schema, not just structurally similar
    expectTypeOf<typeof fn.args>().toEqualTypeOf<typeof TestArgsSchema>();
  });

  test("Returns is covariant", () => {
    const specific = Function.query("test")
      .args(TestArgsSchema)
      .returns(TestReturnsSchema);

    // Covariance: specific schema can be assigned to wider schema type
    const general: Function.ConfectApiQueryFunction<
      "test",
      typeof TestArgsSchema,
      Schema.Schema.AnyNoContext
    > = specific;

    expect(general.returns).toBe(TestReturnsSchema);
  });
});
