/**
 * Type tests for api/data_model.d.ts
 *
 * These tests validate that the type extraction and transformation utilities
 * work correctly. They use vitest's expectTypeOf for compile-time type checking.
 */

import * as Schema from "effect/Schema";
import { describe, expectTypeOf, test } from "vitest";

import type {
  ApiClient,
  ApiGroupAtPath,
  ApiGroupByName,
  ApiGroupNames,
  ApiGroupPaths,
  ApiGroups,
  ApiName,
  ApiSchema,
  ApiServer,
  FunctionArgs,
  FunctionArgsEncoded,
  FunctionArgsType,
  FunctionClientMethod,
  FunctionHandler,
  FunctionName,
  FunctionReturns,
  FunctionReturnsEncoded,
  FunctionReturnsType,
  FunctionType,
  GenericConfectApi,
  GenericConfectApiFunction,
  GenericConfectApiGroup,
  GroupClient,
  GroupFunctionByName,
  GroupFunctionNames,
  GroupFunctions,
  GroupHandlers,
  GroupNestedGroupNames,
  GroupNestedGroups,
  GroupServer,
  ValidateApiSchemas,
} from "../src/api/data_model";
import type { GenericConfectSchema } from "../src/server/schema";

// ===========================
// Test Fixtures
// ===========================

// Simple test schema
type TestSchema = GenericConfectSchema & {
  users: { name: "users" };
  posts: { name: "posts" };
};

// Test function schemas
const UserArgsSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
});

const UserReturnsSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
});

const PostArgsSchema = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
});

const PostReturnsSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
});

// Test function types
type CreateUserFunction = GenericConfectApiFunction & {
  functionType: "Mutation";
  name: "createUser";
  args: typeof UserArgsSchema;
  returns: typeof UserReturnsSchema;
};

type ListUsersFunction = GenericConfectApiFunction & {
  functionType: "Query";
  name: "listUsers";
  args: Schema.Struct<{}>;
  returns: Schema.Array$<typeof UserReturnsSchema>;
};

type CreatePostFunction = GenericConfectApiFunction & {
  functionType: "Mutation";
  name: "createPost";
  args: typeof PostArgsSchema;
  returns: typeof PostReturnsSchema;
};

// Test group types
type UsersGroup = GenericConfectApiGroup & {
  name: "users";
  functions: {
    createUser: CreateUserFunction;
    listUsers: ListUsersFunction;
  };
  groups: {
    admin: UsersAdminGroup;
  };
};

type UsersAdminGroup = GenericConfectApiGroup & {
  name: "admin";
  functions: {
    deleteUser: {
      functionType: "Mutation";
      name: "deleteUser";
      args: Schema.Struct<{ id: Schema.Schema<string, string, never> }>;
      returns: Schema.Struct<{}>;
    };
  };
  groups: {};
};

type PostsGroup = GenericConfectApiGroup & {
  name: "posts";
  functions: {
    createPost: CreatePostFunction;
  };
  groups: {};
};

// Test API type
type TestApi = GenericConfectApi & {
  name: "testApi";
  schema: TestSchema;
  groups: {
    users: UsersGroup;
    posts: PostsGroup;
  };
};

// ===========================
// Core Generic Types Tests
// ===========================

describe("GenericConfectApi", () => {
  test("has required fields", () => {
    expectTypeOf<GenericConfectApi>().toHaveProperty("name");
    expectTypeOf<GenericConfectApi>().toHaveProperty("schema");
    expectTypeOf<GenericConfectApi>().toHaveProperty("groups");
  });

  test("TestApi extends GenericConfectApi", () => {
    expectTypeOf<TestApi>().toMatchTypeOf<GenericConfectApi>();
  });
});

describe("GenericConfectApiGroup", () => {
  test("has required fields", () => {
    expectTypeOf<GenericConfectApiGroup>().toHaveProperty("name");
    expectTypeOf<GenericConfectApiGroup>().toHaveProperty("functions");
    expectTypeOf<GenericConfectApiGroup>().toHaveProperty("groups");
  });

  test("UsersGroup extends GenericConfectApiGroup", () => {
    expectTypeOf<UsersGroup>().toMatchTypeOf<GenericConfectApiGroup>();
  });
});

describe("GenericConfectApiFunction", () => {
  test("has required fields", () => {
    expectTypeOf<GenericConfectApiFunction>().toHaveProperty("functionType");
    expectTypeOf<GenericConfectApiFunction>().toHaveProperty("name");
    expectTypeOf<GenericConfectApiFunction>().toHaveProperty("args");
    expectTypeOf<GenericConfectApiFunction>().toHaveProperty("returns");
  });

  test("CreateUserFunction extends GenericConfectApiFunction", () => {
    expectTypeOf<CreateUserFunction>().toMatchTypeOf<GenericConfectApiFunction>();
  });

  test("function type is literal union", () => {
    expectTypeOf<GenericConfectApiFunction["functionType"]>().toEqualTypeOf<
      "Query" | "Mutation" | "Action"
    >();
  });
});

// ===========================
// API-Level Extraction Tests
// ===========================

describe("ApiName", () => {
  test("extracts API name as literal string", () => {
    expectTypeOf<ApiName<TestApi>>().toEqualTypeOf<"testApi">();
  });
});

describe("ApiSchema", () => {
  test("extracts database schema", () => {
    expectTypeOf<ApiSchema<TestApi>>().toEqualTypeOf<TestSchema>();
  });
});

describe("ApiGroupNames", () => {
  test("extracts group names as literal union", () => {
    expectTypeOf<ApiGroupNames<TestApi>>().toEqualTypeOf<"users" | "posts">();
  });

  test("is a string subtype", () => {
    expectTypeOf<ApiGroupNames<TestApi>>().toMatchTypeOf<string>();
  });
});

describe("ApiGroupByName", () => {
  test("extracts specific group by name", () => {
    expectTypeOf<ApiGroupByName<TestApi, "users">>().toEqualTypeOf<UsersGroup>();
    expectTypeOf<ApiGroupByName<TestApi, "posts">>().toEqualTypeOf<PostsGroup>();
  });

  test("requires valid group name", () => {
    // @ts-expect-error - "invalid" is not a valid group name
    type Invalid = ApiGroupByName<TestApi, "invalid">;
  });
});

describe("ApiGroups", () => {
  test("extracts all groups as union", () => {
    expectTypeOf<ApiGroups<TestApi>>().toEqualTypeOf<UsersGroup | PostsGroup>();
  });
});

// ===========================
// Group-Level Extraction Tests
// ===========================

describe("GroupFunctionNames", () => {
  test("extracts function names as literal union", () => {
    expectTypeOf<GroupFunctionNames<UsersGroup>>().toEqualTypeOf<
      "createUser" | "listUsers"
    >();
    expectTypeOf<GroupFunctionNames<PostsGroup>>().toEqualTypeOf<"createPost">();
  });
});

describe("GroupFunctionByName", () => {
  test("extracts specific function by name", () => {
    expectTypeOf<
      GroupFunctionByName<UsersGroup, "createUser">
    >().toEqualTypeOf<CreateUserFunction>();
    expectTypeOf<
      GroupFunctionByName<UsersGroup, "listUsers">
    >().toEqualTypeOf<ListUsersFunction>();
  });

  test("requires valid function name", () => {
    // @ts-expect-error - "invalid" is not a valid function name
    type Invalid = GroupFunctionByName<UsersGroup, "invalid">;
  });
});

describe("GroupFunctions", () => {
  test("extracts all functions as union", () => {
    expectTypeOf<GroupFunctions<UsersGroup>>().toEqualTypeOf<
      CreateUserFunction | ListUsersFunction
    >();
  });
});

describe("GroupNestedGroupNames", () => {
  test("extracts nested group names", () => {
    expectTypeOf<GroupNestedGroupNames<UsersGroup>>().toEqualTypeOf<"admin">();
  });

  test("returns never for groups without nested groups", () => {
    expectTypeOf<GroupNestedGroupNames<PostsGroup>>().toEqualTypeOf<never>();
  });
});

describe("GroupNestedGroups", () => {
  test("extracts nested groups as union", () => {
    expectTypeOf<GroupNestedGroups<UsersGroup>>().toEqualTypeOf<UsersAdminGroup>();
  });

  test("returns never for groups without nested groups", () => {
    expectTypeOf<GroupNestedGroups<PostsGroup>>().toEqualTypeOf<never>();
  });
});

// ===========================
// Path-Based Access Tests
// ===========================

describe("ApiGroupPaths", () => {
  test("generates all valid group paths", () => {
    type Paths = ApiGroupPaths<TestApi>;

    // Should include top-level groups
    expectTypeOf<"users">().toMatchTypeOf<Paths>();
    expectTypeOf<"posts">().toMatchTypeOf<Paths>();

    // Should include nested paths
    expectTypeOf<"users.admin">().toMatchTypeOf<Paths>();

    // Exact type check
    expectTypeOf<Paths>().toEqualTypeOf<"users" | "users.admin" | "posts">();
  });
});

describe("ApiGroupAtPath", () => {
  test("extracts group at top-level path", () => {
    expectTypeOf<ApiGroupAtPath<TestApi, "users">>().toEqualTypeOf<UsersGroup>();
    expectTypeOf<ApiGroupAtPath<TestApi, "posts">>().toEqualTypeOf<PostsGroup>();
  });

  test("extracts group at nested path", () => {
    expectTypeOf<
      ApiGroupAtPath<TestApi, "users.admin">
    >().toEqualTypeOf<UsersAdminGroup>();
  });

  test("returns never for invalid path", () => {
    expectTypeOf<ApiGroupAtPath<TestApi, "invalid">>().toEqualTypeOf<never>();
    expectTypeOf<
      ApiGroupAtPath<TestApi, "users.invalid">
    >().toEqualTypeOf<never>();
  });
});

// ===========================
// Function-Level Extraction Tests
// ===========================

describe("FunctionType", () => {
  test("extracts function type", () => {
    expectTypeOf<FunctionType<CreateUserFunction>>().toEqualTypeOf<"Mutation">();
    expectTypeOf<FunctionType<ListUsersFunction>>().toEqualTypeOf<"Query">();
  });
});

describe("FunctionName", () => {
  test("extracts function name", () => {
    expectTypeOf<FunctionName<CreateUserFunction>>().toEqualTypeOf<"createUser">();
    expectTypeOf<FunctionName<ListUsersFunction>>().toEqualTypeOf<"listUsers">();
  });
});

describe("FunctionArgs", () => {
  test("extracts args schema", () => {
    expectTypeOf<FunctionArgs<CreateUserFunction>>().toEqualTypeOf<
      typeof UserArgsSchema
    >();
  });
});

describe("FunctionReturns", () => {
  test("extracts returns schema", () => {
    expectTypeOf<FunctionReturns<CreateUserFunction>>().toEqualTypeOf<
      typeof UserReturnsSchema
    >();
  });
});

describe("FunctionArgsType", () => {
  test("extracts decoded args type", () => {
    expectTypeOf<FunctionArgsType<CreateUserFunction>>().toEqualTypeOf<{
      readonly name: string;
      readonly email: string;
    }>();
  });
});

describe("FunctionReturnsType", () => {
  test("extracts decoded returns type", () => {
    expectTypeOf<FunctionReturnsType<CreateUserFunction>>().toEqualTypeOf<{
      readonly id: string;
      readonly name: string;
      readonly email: string;
    }>();
  });
});

describe("FunctionArgsEncoded", () => {
  test("extracts encoded args type", () => {
    type EncodedArgs = FunctionArgsEncoded<CreateUserFunction>;

    // Encoded type should match decoded for simple schemas
    expectTypeOf<EncodedArgs>().toEqualTypeOf<{
      readonly name: string;
      readonly email: string;
    }>();
  });
});

describe("FunctionReturnsEncoded", () => {
  test("extracts encoded returns type", () => {
    type EncodedReturns = FunctionReturnsEncoded<CreateUserFunction>;

    // Encoded type should match decoded for simple schemas
    expectTypeOf<EncodedReturns>().toEqualTypeOf<{
      readonly id: string;
      readonly name: string;
      readonly email: string;
    }>();
  });
});

// ===========================
// Handler Type Tests
// ===========================

describe("FunctionHandler", () => {
  test("creates correct handler signature for mutation", () => {
    type Handler = FunctionHandler<CreateUserFunction>;

    // Handler should be a generic function
    expectTypeOf<Handler>().toBeFunction();

    // Should accept args and return Effect
    type TestHandler = <E>(args: {
      readonly name: string;
      readonly email: string;
    }) => any;

    expectTypeOf<Handler>().toMatchTypeOf<TestHandler>();
  });

  test("creates correct handler signature for query", () => {
    type Handler = FunctionHandler<ListUsersFunction>;

    expectTypeOf<Handler>().toBeFunction();
  });
});

describe("GroupHandlers", () => {
  test("creates handler map for all group functions", () => {
    type Handlers = GroupHandlers<UsersGroup>;

    // Should have all function names as keys
    expectTypeOf<Handlers>().toHaveProperty("createUser");
    expectTypeOf<Handlers>().toHaveProperty("listUsers");

    // Each should be a function handler
    expectTypeOf<Handlers["createUser"]>().toEqualTypeOf<
      FunctionHandler<CreateUserFunction>
    >();
    expectTypeOf<Handlers["listUsers"]>().toEqualTypeOf<
      FunctionHandler<ListUsersFunction>
    >();
  });
});

// ===========================
// Client Type Tests
// ===========================

describe("FunctionClientMethod", () => {
  test("creates correct client method signature", () => {
    type Method = FunctionClientMethod<CreateUserFunction>;

    expectTypeOf<Method>().toBeFunction();

    // Should accept args and return Effect with ParseError
    expectTypeOf<Method>().parameters.toEqualTypeOf<
      [{ readonly name: string; readonly email: string }]
    >();
  });
});

describe("GroupClient", () => {
  test("creates client interface for group", () => {
    type Client = GroupClient<UsersGroup>;

    expectTypeOf<Client>().toHaveProperty("createUser");
    expectTypeOf<Client>().toHaveProperty("listUsers");

    expectTypeOf<Client["createUser"]>().toEqualTypeOf<
      FunctionClientMethod<CreateUserFunction>
    >();
  });
});

describe("ApiClient", () => {
  test("creates full API client type", () => {
    type Client = ApiClient<TestApi>;

    // Should have all groups
    expectTypeOf<Client>().toHaveProperty("users");
    expectTypeOf<Client>().toHaveProperty("posts");

    // Each group should be a GroupClient
    expectTypeOf<Client["users"]>().toEqualTypeOf<GroupClient<UsersGroup>>();
    expectTypeOf<Client["posts"]>().toEqualTypeOf<GroupClient<PostsGroup>>();

    // Should be able to access nested functions
    expectTypeOf<Client["users"]["createUser"]>().toBeFunction();
    expectTypeOf<Client["posts"]["createPost"]>().toBeFunction();
  });
});

// ===========================
// Server Type Tests
// ===========================

describe("GroupServer", () => {
  test("creates server type for group", () => {
    type Server = GroupServer<UsersGroup>;

    expectTypeOf<Server>().toHaveProperty("createUser");
    expectTypeOf<Server>().toHaveProperty("listUsers");
  });
});

describe("ApiServer", () => {
  test("creates full API server type", () => {
    type Server = ApiServer<TestApi>;

    expectTypeOf<Server>().toHaveProperty("users");
    expectTypeOf<Server>().toHaveProperty("posts");

    expectTypeOf<Server["users"]>().toEqualTypeOf<GroupServer<UsersGroup>>();
    expectTypeOf<Server["posts"]>().toEqualTypeOf<GroupServer<PostsGroup>>();
  });
});

// ===========================
// Validation Tests
// ===========================

describe("ValidateApiSchemas", () => {
  test("validates schemas have R = never", () => {
    type Valid = ValidateApiSchemas<TestApi>;

    // Should be true for valid API
    expectTypeOf<Valid>().toEqualTypeOf<true>();
  });

  test("detects schemas with context requirements", () => {
    // Create an invalid function with context requirement
    type InvalidFunction = GenericConfectApiFunction & {
      functionType: "Query";
      name: "invalid";
      args: Schema.Schema<any, any, "SomeContext">; // Has context requirement
      returns: Schema.Schema.AnyNoContext;
    };

    type InvalidGroup = GenericConfectApiGroup & {
      name: "invalid";
      functions: {
        invalid: InvalidFunction;
      };
      groups: {};
    };

    type InvalidApi = GenericConfectApi & {
      name: "invalid";
      schema: TestSchema;
      groups: {
        invalid: InvalidGroup;
      };
    };

    type Invalid = ValidateApiSchemas<InvalidApi>;

    // Should return error object for invalid API
    expectTypeOf<Invalid>().not.toEqualTypeOf<true>();
  });
});

// ===========================
// Integration Tests
// ===========================

describe("Type Flow Integration", () => {
  test("full type extraction chain works", () => {
    // Extract API name
    type Name = ApiName<TestApi>;
    expectTypeOf<Name>().toEqualTypeOf<"testApi">();

    // Extract group names
    type GroupNames = ApiGroupNames<TestApi>;
    expectTypeOf<GroupNames>().toEqualTypeOf<"users" | "posts">();

    // Extract specific group
    type Group = ApiGroupByName<TestApi, "users">;
    expectTypeOf<Group>().toEqualTypeOf<UsersGroup>();

    // Extract function names from group
    type FunctionNames = GroupFunctionNames<Group>;
    expectTypeOf<FunctionNames>().toEqualTypeOf<"createUser" | "listUsers">();

    // Extract specific function
    type Function = GroupFunctionByName<Group, "createUser">;
    expectTypeOf<Function>().toEqualTypeOf<CreateUserFunction>();

    // Extract handler type
    type Handler = FunctionHandler<Function>;
    expectTypeOf<Handler>().toBeFunction();

    // Extract client method
    type ClientMethod = FunctionClientMethod<Function>;
    expectTypeOf<ClientMethod>().toBeFunction();
  });

  test("no type casts needed in extraction chain", () => {
    // This test verifies that types align naturally without casts
    // If this compiles, it proves the type system is working correctly

    type API = TestApi;
    type Groups = ApiGroups<API>;
    type Functions = Groups extends GenericConfectApiGroup
      ? GroupFunctions<Groups>
      : never;
    type Names = Functions extends GenericConfectApiFunction
      ? FunctionName<Functions>
      : never;

    expectTypeOf<Names>().toMatchTypeOf<string>();
  });
});
