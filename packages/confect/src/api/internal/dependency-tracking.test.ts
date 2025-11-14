/**
 * Tests for dependency management via Layer builders
 *
 * This test file demonstrates the FINAL API design for dependency management:
 *
 * **Key Principles:**
 * 1. Function/Group/Api definitions are PURE (R = never always)
 * 2. Handlers are provided separately via Layer builders
 * 3. R requirements flow from handler implementations, not definitions
 * 4. Handlers close over dependencies (dependencies captured at Layer construction)
 * 5. Builders are thin wrappers around Layer.effect/scoped/mock
 *
 * **Pattern:**
 * - Define API (pure data, no handlers)
 * - Implement handlers with Group.build() / buildScoped() / buildMock()
 * - Compose layers with Api.build()
 * - Provide dependencies with Layer.provide()
 *
 * **References:**
 * - Implementation plan: /tmp/confect-dependency-management-plan.md
 * - Effect HTTP: https://github.com/Effect-TS/effect/blob/main/packages/platform/src/HttpApi.ts
 * - Effect Layer: https://effect.website/docs/layers
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { describe, expect, expectTypeOf, test } from "vitest";
import * as Api from "./Api";
import * as Function from "./Function";
import * as Group from "./Group";

// =============================================================================
// Mock Services (representing Confect runtime services)
// =============================================================================

/**
 * Mock database service for queries
 */
class Database extends Context.Tag("Database")<
  Database,
  {
    readonly get: (table: string, id: string) => Effect.Effect<unknown, Error>
    readonly query: (sql: string) => Effect.Effect<unknown[], Error>
    readonly insert: (table: string, doc: unknown) => Effect.Effect<string, Error>
    readonly update: (table: string, id: string, doc: unknown) => Effect.Effect<void, Error>
  }
>() { }

/**
 * Mock auth service
 */
class Auth extends Context.Tag("Auth")<
  Auth,
  {
    readonly getUserId: () => Effect.Effect<string, Error>
    readonly hasPermission: (perm: string) => Effect.Effect<boolean, Error>
  }
>() { }

/**
 * Mock storage service
 */
class Storage extends Context.Tag("Storage")<
  Storage,
  {
    readonly getUrl: (storageId: string) => Effect.Effect<string, Error>
    readonly store: (file: string) => Effect.Effect<string, Error>
  }
>() { }

// Mock implementations for testing
const DatabaseLive = Layer.succeed(Database, {
  get: (table, id) => Effect.succeed({ id, table, data: "mock" }),
  query: (sql) => Effect.succeed([{ result: "mock" }]),
  insert: (table, doc) => Effect.succeed("mock-id-123"),
  update: (table, id, doc) => Effect.succeed(void 0),
});

const AuthLive = Layer.succeed(Auth, {
  getUserId: () => Effect.succeed("user-123"),
  hasPermission: (perm) => Effect.succeed(true),
});

const StorageLive = Layer.succeed(Storage, {
  getUrl: (id) => Effect.succeed(`https://storage.example.com/${id}`),
  store: (file) => Effect.succeed("storage-id-456"),
});

// =============================================================================
// Test Schemas
// =============================================================================

const UserArgsSchema = Schema.Struct({
  id: Schema.String,
});

const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
});

const CreateUserArgsSchema = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
});

const PostSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  authorId: Schema.String,
});

const FileArgsSchema = Schema.Struct({
  file: Schema.String,
});

const FileResultSchema = Schema.Struct({
  url: Schema.String,
});

// =============================================================================
// CORE PRINCIPLE: Definitions are Pure (R = never)
// =============================================================================

describe("Pure Definitions", () => {
  test("Function definitions have no handlers (pure data)", () => {
    const getUser = Function.query("getUser")
      .args(UserArgsSchema)
      .returns(UserSchema);

    // Runtime checks: No handler property
    expect(getUser.name).toBe("getUser");
    expect(getUser.functionType).toBe("Query");
    expect((getUser as any).handler).toBeUndefined();
  });

  test("Group definitions compose functions (pure data)", () => {
    const getUser = Function.query("getUser")
      .args(UserArgsSchema)
      .returns(UserSchema);

    const createUser = Function.mutation("createUser")
      .args(CreateUserArgsSchema)
      .returns(UserSchema);

    const usersGroup = Group.group("users").pipe(
      Group.add("getUser", getUser),
      Group.add("createUser", createUser),
    );

    // Runtime checks: Pure composition
    expect(usersGroup.name).toBe("users");
    expect(Object.keys(usersGroup.functions)).toEqual(["getUser", "createUser"]);
  });

  test("Api definitions compose groups (pure data)", () => {
    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
    );

    const myApi = Api.api("myApp").pipe(Api.add(usersGroup));

    // Runtime checks: Pure composition
    expect(myApi.name).toBe("myApp");
    expect(myApi.groups.users).toBe(usersGroup);
  });
});

// =============================================================================
// Group.build(): Handlers with Dependencies
// =============================================================================

describe("Group.build() - Layer Creation with Dependencies", () => {
  test("build creates Layer with single dependency", () => {
    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
    );

    // Handler Effect can have requirements (R)
    const UsersLive = Group.build(
      usersGroup,
      Effect.gen(function* () {
        const db = yield* Database; // ← R includes Database

        return {
          getUser: (args) => db.get("users", args.id) as any,
        };
      }),
    );

    // Type check: Layer requires Database
    expectTypeOf(UsersLive).toMatchTypeOf<
      Layer.Layer<Group.Tag<typeof usersGroup>, any, Database>
    >();
  });

  test("build creates Layer with multiple dependencies", () => {
    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
      Group.add(
        "createUser",
        Function.mutation("createUser")
          .args(CreateUserArgsSchema)
          .returns(UserSchema),
      ),
    );

    const UsersLive = Group.build(
      usersGroup,
      Effect.gen(function* () {
        const db = yield* Database; // ← R includes Database
        const auth = yield* Auth; // ← R includes Auth

        return {
          getUser: (args) => db.get("users", args.id) as any,
          createUser: (args) =>
            Effect.gen(function* () {
              const userId = yield* auth.getUserId();
              const id = yield* db.insert("users", {
                ...args,
                createdBy: userId,
              });
              return { id, ...args };
            }),
        };
      }),
    );

    // Type check: Layer requires Database | Auth
    expectTypeOf(UsersLive).toMatchTypeOf<
      Layer.Layer<Group.Tag<typeof usersGroup>, any, Database | Auth>
    >();
  });

  test("handlers close over dependencies (R = never for handler functions)", () => {
    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
    );

    Group.build(
      usersGroup,
      Effect.gen(function* () {
        const db = yield* Database;

        return {
          // This handler function has R = never
          // It closes over 'db' from the outer scope
          getUser: (args) => db.get("users", args.id) as any,
          //        ^
          //        Type: (args: { id: string }) => Effect<unknown, Error, never>
          //                                                               ^^^^^
        };
      }),
    );
  });

  test("handlers can reuse other handlers", () => {
    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
      Group.add(
        "getUserWithPrefix",
        Function.query("getUserWithPrefix")
          .args(UserArgsSchema)
          .returns(UserSchema),
      ),
    );

    Group.build(
      usersGroup,
      Effect.gen(function* () {
        const db = yield* Database;

        // Define handlers, reusing logic
        const getUser = (args: { id: string }) => db.get("users", args.id);

        const getUserWithPrefix = (args: { id: string }) =>
          getUser(args).pipe(
            Effect.map((user: any) => ({
              ...user,
              name: `Mr. ${user.name}`,
            })),
          );

        return {
          getUser: getUser as any,
          getUserWithPrefix: getUserWithPrefix as any,
        };
      }),
    );
  });

  test("curried syntax works", () => {
    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
    );

    // Curried: Group.build(group)(effect)
    const buildUsers = Group.build(usersGroup);

    const UsersLive = buildUsers(
      Effect.gen(function* () {
        const db = yield* Database;
        return {
          getUser: (args) => db.get("users", args.id) as any,
        };
      }),
    );

    expectTypeOf(UsersLive).toMatchTypeOf<
      Layer.Layer<Group.Tag<typeof usersGroup>, any, Database>
    >();
  });
});

// =============================================================================
// Group.buildScoped(): Scoped Resources
// =============================================================================

describe("Group.buildScoped() - Scoped Resource Management", () => {
  test("buildScoped creates Layer that excludes Scope from requirements", () => {
    // Mock connection pool that requires Scope
    class DbPool extends Context.Tag("DbPool")<
      DbPool,
      {
        readonly query: (sql: string) => Effect.Effect<unknown[], Error>
      }
    >() { }

    const DbPoolLive = Layer.scoped(
      DbPool,
      Effect.gen(function* () {
        // Acquire resource
        const connection = yield* Effect.acquireRelease(
          Effect.succeed({ conn: "mock" }),
          () => Effect.sync(() => console.log("Closing connection")),
        );

        return {
          query: (sql) => Effect.succeed([{ result: sql }]),
        };
      }),
    );

    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
    );

    const UsersLive = Group.buildScoped(
      usersGroup,
      Effect.gen(function* () {
        const pool = yield* DbPool; // Requires DbPool (which is scoped)

        return {
          getUser: (args) => pool.query("SELECT *") as any,
        };
      }),
    );

    // Type check: Layer requires DbPool, but NOT Scope
    expectTypeOf(UsersLive).toMatchTypeOf<
      Layer.Layer<Group.GroupService<"users">, any, DbPool>
    >();
  });
});

// =============================================================================
// Group.buildMock(): Partial Implementation for Testing
// =============================================================================

describe("Group.buildMock() - Mocking and Testing", () => {
  test("buildMock creates Layer with partial implementation", () => {
    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
      Group.add(
        "createUser",
        Function.mutation("createUser")
          .args(CreateUserArgsSchema)
          .returns(UserSchema),
      ),
    );

    // Only implement getUser, createUser will throw UnimplementedError
    const UsersMock = Group.buildMock(usersGroup, {
      getUser: (args) =>
        Effect.succeed({
          id: args.id,
          name: "Mock User",
          email: "mock@test.com",
        }),
      // createUser missing - will throw if called
    });

    // Type check: No requirements (it's a mock)
    expectTypeOf(UsersMock).toMatchTypeOf<
      Layer.Layer<Group.GroupService<"users">>
    >();
  });

  test("buildMock allows fully mocked implementations", () => {
    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
      Group.add(
        "createUser",
        Function.mutation("createUser")
          .args(CreateUserArgsSchema)
          .returns(UserSchema),
      ),
    );

    const UsersMock = Group.buildMock(usersGroup, {
      getUser: (args) =>
        Effect.succeed({ id: args.id, name: "Mock", email: "mock@test.com" }),
      createUser: (args) =>
        Effect.succeed({ id: "mock-id", ...args }),
    });

    expectTypeOf(UsersMock).toMatchTypeOf<
      Layer.Layer<Group.GroupService<"users">>
    >();
  });
});

// =============================================================================
// Api.build(): Composing Group Layers
// =============================================================================

describe("Api.build() - API Layer Composition", () => {
  test("build creates Layer requiring all GroupServices", () => {
    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
    );

    const filesGroup = Group.group("files").pipe(
      Group.add(
        "upload",
        Function.action("upload").args(FileArgsSchema).returns(FileResultSchema),
      ),
    );

    const myApi = Api.api("myApp").pipe(
      Api.add(usersGroup),
      Api.add(filesGroup),
    );

    const MyApiLive = Api.toLayer(myApi);

    // Type check: Requires both GroupServices
    expectTypeOf(MyApiLive).toMatchTypeOf<
      Layer.Layer<
        Api.ApiService,
        never,
        Group.GroupService<"users"> | Group.GroupService<"files">
      >
    >();
  });

  test("Api Layer composition with dependencies flows correctly", () => {
    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
    );

    const filesGroup = Group.group("files").pipe(
      Group.add(
        "upload",
        Function.action("upload").args(FileArgsSchema).returns(FileResultSchema),
      ),
    );

    const myApi = Api.api("myApp").pipe(
      Api.add(usersGroup),
      Api.add(filesGroup),
    );

    // Implement groups with dependencies
    const UsersLive = Group.build(
      usersGroup,
      Effect.gen(function* () {
        const db = yield* Database;
        const auth = yield* Auth;
        return {
          getUser: (args) => db.get("users", args.id) as any,
        };
      }),
    );

    const FilesLive = Group.build(
      filesGroup,
      Effect.gen(function* () {
        const storage = yield* Storage;
        return {
          upload: (args) => storage.store(args.file).pipe(Effect.map((id) => ({ url: `https://example.com/${id}` }))),
        };
      }),
    );

    // Compose: Api requires GroupServices, provide them
    const MyApiLive = Api.toLayer(myApi).pipe(
      Layer.provide(UsersLive),
      Layer.provide(FilesLive),
    );

    // Type check: Now requires Database | Auth | Storage
    expectTypeOf(MyApiLive).toMatchTypeOf<
      Layer.Layer<Api.ApiService, any, Database | Auth | Storage>
    >();
  });
});

// =============================================================================
// End-to-End Integration
// =============================================================================

describe("End-to-End Integration", () => {
  test("Full API definition, implementation, and composition", () => {
    // Step 1: Define API (pure)
    const getUserQuery = Function.query("getUser")
      .args(UserArgsSchema)
      .returns(UserSchema);

    const createUserMutation = Function.mutation("createUser")
      .args(CreateUserArgsSchema)
      .returns(UserSchema);

    const uploadAction = Function.action("upload")
      .args(FileArgsSchema)
      .returns(FileResultSchema);

    const usersGroup = Group.group("users").pipe(
      Group.add("getUser", getUserQuery),
      Group.add("createUser", createUserMutation),
    );

    const filesGroup = Group.group("files").pipe(
      Group.add("upload", uploadAction),
    );

    const myApi = Api.api("myApp").pipe(
      Api.add(usersGroup),
      Api.add(filesGroup),
    );

    // Step 2: Implement handlers
    const UsersLive = Group.build(
      usersGroup,
      Effect.gen(function* () {
        const db = yield* Database;
        const auth = yield* Auth;

        return {
          getUser: (args) => db.get("users", args.id) as any,
          createUser: (args) =>
            Effect.gen(function* () {
              const userId = yield* auth.getUserId();
              const id = yield* db.insert("users", {
                ...args,
                createdBy: userId,
              });
              return { id, ...args };
            }),
        };
      }),
    );

    const FilesLive = Group.build(
      filesGroup,
      Effect.gen(function* () {
        const storage = yield* Storage;
        return {
          upload: (args) =>
            storage.store(args.file).pipe(
              Effect.map((id) => ({ url: `https://example.com/${id}` })),
            ),
        };
      }),
    );

    // Step 3: Compose API Layer
    const MyApiLive = Api.toLayer(myApi).pipe(
      Layer.provide(UsersLive),
      Layer.provide(FilesLive),
    );

    // Step 4: Provide all dependencies
    const AppLive = MyApiLive.pipe(
      Layer.provide(DatabaseLive),
      Layer.provide(AuthLive),
      Layer.provide(StorageLive),
    );

    // Type check: No more requirements (all provided)
    expectTypeOf(AppLive).toMatchTypeOf<Layer.Layer<Api.ApiService, any, never>>();

    // Step 5: Use the API
    const program = Effect.gen(function* () {
      const apiService = yield* Api.ApiService;
      expect(apiService.api.name).toBe("myApp");
      expect(apiService.api.groups.users.name).toBe("users");
      expect(apiService.api.groups.files.name).toBe("files");
    });

    // Run the program
    const runnable = program.pipe(Effect.provide(AppLive));

    expect(Effect.runSync(runnable)).toBeUndefined();
  });

  test("Mixing real and mock implementations", () => {
    const usersGroup = Group.group("users").pipe(
      Group.add(
        "getUser",
        Function.query("getUser").args(UserArgsSchema).returns(UserSchema),
      ),
    );

    const filesGroup = Group.group("files").pipe(
      Group.add(
        "upload",
        Function.action("upload").args(FileArgsSchema).returns(FileResultSchema),
      ),
    );

    const myApi = Api.api("myApp").pipe(
      Api.add(usersGroup),
      Api.add(filesGroup),
    );

    // Real implementation for users
    const UsersLive = Group.build(
      usersGroup,
      Effect.gen(function* () {
        const db = yield* Database;
        return {
          getUser: (args) => db.get("users", args.id) as any,
        };
      }),
    );

    // Mock implementation for files
    const FilesMock = Group.buildMock(filesGroup, {
      upload: (args) => Effect.succeed({ url: "https://mock.example.com/file" }),
    });

    // Compose with mix of real and mock
    const MyApiTest = Api.toLayer(myApi).pipe(
      Layer.provide(UsersLive),
      Layer.provide(FilesMock),
      Layer.provide(DatabaseLive),
    );

    expectTypeOf(MyApiTest).toMatchTypeOf<
      Layer.Layer<Api.ApiService, any, never>
    >();
  });
});

// =============================================================================
// Documentation Examples
// =============================================================================

describe("Documentation Examples", () => {
  test("Simple example matching Effect HTTP README", () => {
    // This mirrors the Effect HTTP example structure

    // Define API
    const MyApi = Api.api("MyApi").pipe(
      Api.add(
        Group.group("Greetings").pipe(
          Group.add(
            "hello-world",
            Function.query("hello-world")
              .args(Schema.Struct({}))
              .returns(Schema.String),
          ),
        ),
      ),
    );

    // Implement handlers
    const GreetingsLive = Group.build(
      MyApi.groups.Greetings,
      Effect.succeed({
        "hello-world": () => Effect.succeed("Hello, World!"),
      }),
    );

    // Provide implementation
    const MyApiLive = Api.toLayer(MyApi).pipe(Layer.provide(GreetingsLive));

    // Type check: No requirements
    expectTypeOf(MyApiLive).toMatchTypeOf<
      Layer.Layer<Api.ApiService, never, never>
    >();
  });
});

// =============================================================================
// Api.serve() - Convex Integration
// =============================================================================

describe("Api.serve() - Convert Layer-based API to Convex", () => {
  test("serve converts API to Convex registered functions", () => {
    // Define API
    const MyApi = Api.api("TestApi").pipe(
      Api.add(
        Group.group("greetings").pipe(
          Group.add(
            "hello",
            Function.query("hello")
              .args(Schema.Struct({ name: Schema.String }))
              .returns(Schema.String),
          ),
        ),
      ),
    );

    // Implement handlers
    const GreetingsLive = Group.build(
      MyApi.groups.greetings,
      Effect.succeed({
        hello: (args) => Effect.succeed(`Hello, ${args.name}!`),
      }),
    );

    // Build API Layer
    const MyApiLive = Api.toLayer(MyApi).pipe(Layer.provide(GreetingsLive));

    // Mock schema definition for testing
    const mockSchemaDefinition = {} as any;

    // Convert to Convex functions
    const convexApi = Api.serve(mockSchemaDefinition, MyApi, MyApiLive);

    // Verify structure
    expect(convexApi).toHaveProperty("greetings");
    expect(convexApi.greetings).toHaveProperty("hello");

    // The returned object should have the RegisteredQuery structure
    // (we can't easily test the actual function without a Convex runtime)
    expectTypeOf(convexApi).toMatchTypeOf<{
      greetings: Record<string, any>;
    }>();
  });

  test("serve handles multiple groups", () => {
    // Define API with multiple groups
    const MyApi = Api.api("MultiGroupApi").pipe(
      Api.add(
        Group.group("users").pipe(
          Group.add(
            "getUser",
            Function.query("getUser")
              .args(Schema.Struct({ id: Schema.String }))
              .returns(Schema.Struct({ id: Schema.String, name: Schema.String })),
          ),
        ),
      ),
      Api.add(
        Group.group("posts").pipe(
          Group.add(
            "getPost",
            Function.query("getPost")
              .args(Schema.Struct({ id: Schema.String }))
              .returns(Schema.Struct({ id: Schema.String, title: Schema.String })),
          ),
        ),
      ),
    );

    // Implement handlers
    const UsersLive = Group.build(
      MyApi.groups.users,
      Effect.succeed({
        getUser: (args) => Effect.succeed({ id: args.id, name: "Test User" }),
      }),
    );

    const PostsLive = Group.build(
      MyApi.groups.posts,
      Effect.succeed({
        getPost: (args) => Effect.succeed({ id: args.id, title: "Test Post" }),
      }),
    );

    // Build API Layer
    const MyApiLive = Api.toLayer(MyApi).pipe(
      Layer.provide(UsersLive),
      Layer.provide(PostsLive),
    );

    // Mock schema definition
    const mockSchemaDefinition = {} as any;

    // Convert to Convex functions
    const convexApi = Api.serve(mockSchemaDefinition, MyApi, MyApiLive);

    // Verify both groups are present
    expect(convexApi).toHaveProperty("users");
    expect(convexApi).toHaveProperty("posts");
    expect(convexApi.users).toHaveProperty("getUser");
    expect(convexApi.posts).toHaveProperty("getPost");
  });

  test("serve handles different function types", () => {
    // Define API with query, mutation, and action
    const MyApi = Api.api("MixedApi").pipe(
      Api.add(
        Group.group("mixed").pipe(
          Group.add(
            "getItem",
            Function.query("getItem")
              .args(Schema.Struct({ id: Schema.String }))
              .returns(Schema.String),
          ),
          Group.add(
            "createItem",
            Function.mutation("createItem")
              .args(Schema.Struct({ name: Schema.String }))
              .returns(Schema.String),
          ),
          Group.add(
            "sendEmail",
            Function.action("sendEmail")
              .args(Schema.Struct({ to: Schema.String }))
              .returns(Schema.Struct({})),
          ),
        ),
      ),
    );

    // Implement handlers
    const MixedLive = Group.build(
      MyApi.groups.mixed,
      Effect.succeed({
        getItem: (args) => Effect.succeed(args.id),
        createItem: (args) => Effect.succeed(args.name),
        sendEmail: () => Effect.succeed({}),
      }),
    );

    // Build API Layer
    const MyApiLive = Api.toLayer(MyApi).pipe(Layer.provide(MixedLive));

    // Mock schema definition
    const mockSchemaDefinition = {} as any;

    // Convert to Convex functions
    const convexApi = Api.serve(mockSchemaDefinition, MyApi, MyApiLive);

    // Verify all function types are present
    expect(convexApi.mixed).toHaveProperty("getItem");
    expect(convexApi.mixed).toHaveProperty("createItem");
    expect(convexApi.mixed).toHaveProperty("sendEmail");
  });
});
