/**
 * @module api/data_model
 *
 * Type-level data model for the Confect API layer.
 *
 * This module defines the core type hierarchy for the API layer, following the
 * same pattern as `server/data_model.d.ts`: a single source of truth
 * (GenericConfectApi) with all other types derived from it.
 *
 * ## Design Principles
 *
 * 1. **Single Source of Truth**: All API types derive from `GenericConfectApi`
 * 2. **Branded Type Extraction**: Names are extracted from definitions, not parameterized
 * 3. **Schema-First**: All args/returns use `Schema.Schema.AnyNoContext`
 * 4. **Clear Separation**: Definition types vs. derived types vs. runtime types
 *
 * ## Type Categories
 *
 * - **Generic Types**: Core structural types (GenericConfectApi, etc.)
 * - **Extraction Aliases**: Extract parts of API (ApiGroupNames, FunctionName, etc.)
 * - **Handler Types**: Server-side handler signatures
 * - **Client Types**: Client-side method signatures
 * - **Server Types**: Registered Convex function types
 *
 * @see ../server/data_model.d.ts for the server-side equivalent pattern
 */

import type { RegisteredQuery } from "convex/server";
import type * as Effect from "effect/Effect";
import type * as ParseResult from "effect/ParseResult";
import type { ReadonlyRecord } from "effect/Record";
import type * as Schema from "effect/Schema";
import type { GenericConfectSchema } from "../server/schema";
import type { ConfectAuth } from "../server/auth";
import type {
  ConfectQueryCtx,
  ConfectMutationCtx,
  ConfectActionCtx,
} from "../server/ctx";
import type { QueryDB, MutationDB } from "../server/database";
import type {
  ConfectQueryRunner,
  ConfectMutationRunner,
  ConfectActionRunner,
} from "../server/runners";
import type { ConfectScheduler } from "../server/scheduler";
import type {
  ConfectStorageReader,
  ConfectStorageWriter,
  ConfectStorageActionWriter,
} from "../server/storage";
import type { ConfectVectorSearch } from "../server/vector_search";

// ===========================
// Core Generic Types (Single Source of Truth)
// ===========================

/**
 * Generic API type - the single source of truth for the API layer.
 *
 * All other API types derive from this structure. An API consists of:
 * - A name (identifier for the API)
 * - A database schema (links to server-side types)
 * - Groups (collections of functions, can be nested)
 *
 * @example
 * type MyApi = GenericConfectApi & {
 *   name: "myApi"
 *   schema: MyDatabaseSchema
 *   groups: {
 *     users: { name: "users"; functions: {...}; groups: {} }
 *     posts: { name: "posts"; functions: {...}; groups: {} }
 *   }
 * }
 */
export type GenericConfectApi = {
  readonly name: string;
  readonly schema: GenericConfectSchema;
  readonly groups: ReadonlyRecord<string, GenericConfectApiGroup>;
};

/**
 * Generic API Group type.
 *
 * A group is a collection of functions and can contain nested subgroups.
 * Groups provide namespacing for API functions.
 *
 * @example
 * type UsersGroup = GenericConfectApiGroup & {
 *   name: "users"
 *   functions: {
 *     list: { name: "list"; functionType: "Query"; ... }
 *     create: { name: "create"; functionType: "Mutation"; ... }
 *   }
 *   groups: {
 *     admin: { name: "admin"; functions: {...}; groups: {} }
 *   }
 * }
 */
export type GenericConfectApiGroup = {
  readonly name: string;
  readonly functions: ReadonlyRecord<string, GenericConfectApiFunction>;
  readonly groups: ReadonlyRecord<string, GenericConfectApiGroup>;
};

/**
 * Generic API Function type.
 *
 * Represents a single callable function in the API. Functions are typed by:
 * - Function type (Query/Mutation/Action - maps to Convex function types)
 * - Name (unique within the group)
 * - Args schema (request payload)
 * - Returns schema (response payload)
 *
 * All schemas must have R = never (no context requirements).
 *
 * @example
 * type CreateUserFunction = GenericConfectApiFunction & {
 *   functionType: "Mutation"
 *   name: "createUser"
 *   args: Schema.Struct<{ name: Schema.String }>
 *   returns: Schema.Struct<{ id: Schema.String }>
 * }
 */
export type GenericConfectApiFunction = {
  readonly functionType: "Query" | "Mutation" | "Action";
  readonly name: string;
  readonly args: Schema.Schema.AnyNoContext;
  readonly returns: Schema.Schema.AnyNoContext;
};

// ===========================
// API-Level Type Extraction
// ===========================

/**
 * Extract the API name from an API definition.
 *
 * This is a branded extraction - the name comes FROM the API, not as a parameter.
 * This prevents type drift where a name parameter doesn't match the actual API.
 *
 * @example
 * type MyApi = { name: "myApi"; schema: ...; groups: ... }
 * type Name = ApiName<MyApi>  // "myApi"
 */
export type ApiName<Api extends GenericConfectApi> = Api["name"];

/**
 * Extract the database schema from an API definition.
 *
 * This links the API layer to the server layer, enabling type-safe
 * database operations within API handlers.
 *
 * @example
 * type Schema = ApiSchema<MyApi>  // The GenericConfectSchema
 */
export type ApiSchema<Api extends GenericConfectApi> = Api["schema"];

/**
 * Extract all group names from an API as a union of literal strings.
 *
 * Returns the top-level group names only (not nested groups).
 *
 * @example
 * type MyApi = { groups: { users: ...; posts: ... } }
 * type Names = ApiGroupNames<MyApi>  // "users" | "posts"
 */
export type ApiGroupNames<Api extends GenericConfectApi> =
  keyof Api["groups"] & string;

/**
 * Extract a specific group by name from an API.
 *
 * The name must be a valid group name in the API (type-checked).
 *
 * @example
 * type UsersGroup = ApiGroupByName<MyApi, "users">
 */
export type ApiGroupByName<
  Api extends GenericConfectApi,
  GroupName extends ApiGroupNames<Api>,
> = Api["groups"][GroupName];

/**
 * Extract all groups from an API as a union type.
 *
 * Useful for generic operations over all groups.
 *
 * @example
 * type AllGroups = ApiGroups<MyApi>  // UsersGroup | PostsGroup | ...
 */
export type ApiGroups<Api extends GenericConfectApi> =
  Api["groups"][keyof Api["groups"]];

// ===========================
// Group-Level Type Extraction
// ===========================

/**
 * Extract function names from a group as a union of literal strings.
 *
 * @example
 * type Names = GroupFunctionNames<UsersGroup>  // "list" | "create" | "delete"
 */
export type GroupFunctionNames<Group extends GenericConfectApiGroup> =
  keyof Group["functions"] & string;

/**
 * Extract a specific function by name from a group.
 *
 * The name must be a valid function name in the group (type-checked).
 *
 * @example
 * type CreateFn = GroupFunctionByName<UsersGroup, "create">
 */
export type GroupFunctionByName<
  Group extends GenericConfectApiGroup,
  FunctionName extends GroupFunctionNames<Group>,
> = Group["functions"][FunctionName];

/**
 * Extract all functions from a group as a union type.
 *
 * @example
 * type AllFunctions = GroupFunctions<UsersGroup>  // ListFn | CreateFn | DeleteFn
 */
export type GroupFunctions<Group extends GenericConfectApiGroup> =
  Group["functions"][keyof Group["functions"]];

/**
 * Extract nested group names from a group.
 *
 * @example
 * type NestedNames = GroupNestedGroupNames<UsersGroup>  // "admin" | "settings"
 */
export type GroupNestedGroupNames<Group extends GenericConfectApiGroup> =
  keyof Group["groups"] & string;

/**
 * Extract nested groups from a group as a union type.
 *
 * @example
 * type Nested = GroupNestedGroups<UsersGroup>  // AdminGroup | SettingsGroup
 */
export type GroupNestedGroups<Group extends GenericConfectApiGroup> =
  Group["groups"][keyof Group["groups"]];

// ===========================
// Path-Based Group Access
// ===========================

/**
 * Recursively generate all valid group paths in an API.
 *
 * Paths are dot-separated strings representing the nesting structure.
 * Returns a union of all possible paths.
 *
 * @example
 * type Paths = ApiGroupPaths<MyApi>
 * // "users" | "users.admin" | "users.settings" | "posts" | "posts.moderation"
 */
export type ApiGroupPaths<Api extends GenericConfectApi> =
  ApiGroupPathsFromGroup<ApiGroups<Api>>;

/**
 * Internal helper: Generate paths from a group and its subgroups.
 *
 * @internal
 */
type ApiGroupPathsFromGroup<Group extends GenericConfectApiGroup> =
  | Group["name"]
  | (GroupNestedGroups<Group> extends never
      ? never
      : `${Group["name"]}.${ApiGroupPathsFromGroup<
          GroupNestedGroups<Group>
        >}`);

/**
 * Extract a group at a specific dot-separated path.
 *
 * Navigates through nested groups following the path segments.
 *
 * @example
 * type AdminGroup = ApiGroupAtPath<MyApi, "users.admin">
 */
export type ApiGroupAtPath<
  Api extends GenericConfectApi,
  Path extends string,
> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends ApiGroupNames<Api>
    ? GroupAtPath<ApiGroupByName<Api, Head>, Tail>
    : never
  : Path extends ApiGroupNames<Api>
    ? ApiGroupByName<Api, Path>
    : never;

/**
 * Internal helper: Extract a group from nested groups by path.
 *
 * @internal
 */
type GroupAtPath<
  Group extends GenericConfectApiGroup,
  Path extends string,
> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends GroupNestedGroupNames<Group>
    ? GroupAtPath<Group["groups"][Head], Tail>
    : never
  : Path extends GroupNestedGroupNames<Group>
    ? Group["groups"][Path]
    : never;

// ===========================
// Function-Level Type Extraction
// ===========================

/**
 * Extract the function type (Query/Mutation/Action) from a function.
 *
 * @example
 * type Type = FunctionType<CreateUserFn>  // "Mutation"
 */
export type FunctionType<Fn extends GenericConfectApiFunction> =
  Fn["functionType"];

/**
 * Extract the function name from a function.
 *
 * @example
 * type Name = FunctionName<CreateUserFn>  // "createUser"
 */
export type FunctionName<Fn extends GenericConfectApiFunction> = Fn["name"];

/**
 * Extract the args schema from a function.
 *
 * Returns the Schema.Schema object, not the decoded type.
 *
 * @example
 * type ArgsSchema = FunctionArgs<CreateUserFn>
 * // Schema.Struct<{ name: Schema.String }>
 */
export type FunctionArgs<Fn extends GenericConfectApiFunction> = Fn["args"];

/**
 * Extract the returns schema from a function.
 *
 * Returns the Schema.Schema object, not the decoded type.
 *
 * @example
 * type ReturnsSchema = FunctionReturns<CreateUserFn>
 * // Schema.Struct<{ id: Schema.String }>
 */
export type FunctionReturns<Fn extends GenericConfectApiFunction> =
  Fn["returns"];

/**
 * Extract the TypeScript type for function arguments (decoded/runtime type).
 *
 * This is the type handlers receive and clients pass.
 *
 * @example
 * type Args = FunctionArgsType<CreateUserFn>  // { name: string }
 */
export type FunctionArgsType<Fn extends GenericConfectApiFunction> =
  Schema.Schema.Type<FunctionArgs<Fn>>;

/**
 * Extract the TypeScript type for function return value (decoded/runtime type).
 *
 * This is the type handlers return and clients receive.
 *
 * @example
 * type Returns = FunctionReturnsType<CreateUserFn>  // { id: string }
 */
export type FunctionReturnsType<Fn extends GenericConfectApiFunction> =
  Schema.Schema.Type<FunctionReturns<Fn>>;

/**
 * Extract the encoded type for function arguments (wire/storage format).
 *
 * This is what gets serialized for network transport or Convex storage.
 *
 * @example
 * type ArgsEncoded = FunctionArgsEncoded<CreateUserFn>
 * // { name: string } (may differ if schema has transformations)
 */
export type FunctionArgsEncoded<Fn extends GenericConfectApiFunction> =
  Schema.Schema.Encoded<FunctionArgs<Fn>>;

/**
 * Extract the encoded type for function return value (wire/storage format).
 *
 * @example
 * type ReturnsEncoded = FunctionReturnsEncoded<CreateUserFn>
 */
export type FunctionReturnsEncoded<Fn extends GenericConfectApiFunction> =
  Schema.Schema.Encoded<FunctionReturns<Fn>>;

// ===========================
// Handler Type Construction (Server-Side)
// ===========================

/**
 * Effect requirements for Query function handlers.
 *
 * Query handlers have read-only access to the database and related services.
 *
 * @see src/server/functions.ts (QueryR type) for the implementation
 */
export type QueryRequirements =
  | ConfectQueryCtx
  | QueryDB
  | ConfectAuth
  | ConfectStorageReader
  | ConfectQueryRunner;

/**
 * Effect requirements for Mutation function handlers.
 *
 * Mutation handlers have read-write access to the database plus scheduling
 * and storage mutation capabilities. Includes all QueryRequirements.
 *
 * @see src/server/functions.ts (MutationR type) for the implementation
 */
export type MutationRequirements =
  | QueryRequirements
  | ConfectMutationCtx
  | MutationDB
  | ConfectScheduler
  | ConfectStorageWriter
  | ConfectMutationRunner;

/**
 * Effect requirements for Action function handlers.
 *
 * Action handlers can run arbitrary code including external API calls,
 * with access to scheduling and all runner types.
 *
 * @see src/server/functions.ts (ActionR type) for the implementation
 */
export type ActionRequirements =
  | ConfectActionCtx
  | ConfectScheduler
  | ConfectAuth
  | ConfectStorageReader
  | ConfectStorageWriter
  | ConfectStorageActionWriter
  | ConfectQueryRunner
  | ConfectMutationRunner
  | ConfectActionRunner
  | ConfectVectorSearch;

/**
 * Extract the Effect requirements for a function handler based on its type.
 *
 * Maps function types to their requirement unions:
 * - Query -> QueryRequirements
 * - Mutation -> MutationRequirements
 * - Action -> ActionRequirements
 *
 * @example
 * type Reqs = FunctionHandlerRequirements<CreateUserFn>
 * // MutationRequirements (if CreateUserFn is a Mutation)
 */
export type FunctionHandlerRequirements<Fn extends GenericConfectApiFunction> =
  Fn["functionType"] extends "Query"
    ? QueryRequirements
    : Fn["functionType"] extends "Mutation"
      ? MutationRequirements
      : Fn["functionType"] extends "Action"
        ? ActionRequirements
        : never;

/**
 * Handler type for a specific function.
 *
 * A handler is a function that:
 * - Takes decoded arguments (TypeScript types)
 * - Returns an Effect with decoded result, user error, and service requirements
 * - Generic over error type E (user-defined errors)
 *
 * @example
 * type CreateUserHandler = FunctionHandler<CreateUserFn>
 * // <E>(args: { name: string }) => Effect.Effect<
 * //   { id: string },
 * //   E,
 * //   MutationRequirements
 * // >
 */
export type FunctionHandler<Fn extends GenericConfectApiFunction> = <E>(
  args: FunctionArgsType<Fn>,
) => Effect.Effect<
  FunctionReturnsType<Fn>,
  E,
  FunctionHandlerRequirements<Fn>
>;

/**
 * Handler map for all functions in a group.
 *
 * Used by `HttpApiBuilder.group()` to collect handler implementations.
 *
 * @example
 * type Handlers = GroupHandlers<UsersGroup>
 * // {
 * //   list: <E>(args: ...) => Effect.Effect<...>,
 * //   create: <E>(args: ...) => Effect.Effect<...>,
 * //   ...
 * // }
 */
export type GroupHandlers<Group extends GenericConfectApiGroup> = {
  readonly [FnName in GroupFunctionNames<Group>]: FunctionHandler<
    GroupFunctionByName<Group, FnName>
  >;
};

// ===========================
// Client Type Construction (Client-Side)
// ===========================

/**
 * Client method for calling a single function.
 *
 * A client method:
 * - Takes decoded arguments (TypeScript types)
 * - Returns an Effect with decoded result or ParseError
 * - ParseError occurs if response doesn't match schema
 *
 * @example
 * type CreateMethod = FunctionClientMethod<CreateUserFn>
 * // (args: { name: string }) => Effect.Effect<
 * //   { id: string },
 * //   ParseResult.ParseError
 * // >
 */
export type FunctionClientMethod<Fn extends GenericConfectApiFunction> = (
  args: FunctionArgsType<Fn>,
) => Effect.Effect<FunctionReturnsType<Fn>, ParseResult.ParseError>;

/**
 * Client interface for a group (all its functions as callable methods).
 *
 * @example
 * type UsersClient = GroupClient<UsersGroup>
 * // {
 * //   list: (args: ...) => Effect.Effect<...>,
 * //   create: (args: ...) => Effect.Effect<...>,
 * //   ...
 * // }
 */
export type GroupClient<Group extends GenericConfectApiGroup> = {
  readonly [FnName in GroupFunctionNames<Group>]: FunctionClientMethod<
    GroupFunctionByName<Group, FnName>
  >;
};

/**
 * Full API client (all groups as properties with their callable functions).
 *
 * This is the type returned by `ConfectApiClient.make()`.
 *
 * @example
 * type Client = ApiClient<MyApi>
 * // {
 * //   users: {
 * //     list: (args: ...) => Effect.Effect<...>,
 * //     create: (args: ...) => Effect.Effect<...>,
 * //   },
 * //   posts: { ... }
 * // }
 *
 * // Usage:
 * const client = ConfectApiClient.make(api, convexClient)
 * const result = await client.users.create({ name: "Alice" }).pipe(Effect.runPromise)
 */
export type ApiClient<Api extends GenericConfectApi> = {
  readonly [GroupName in ApiGroupNames<Api>]: GroupClient<
    ApiGroupByName<Api, GroupName>
  >;
};

// ===========================
// Server Type Construction (Convex Functions)
// ===========================

/**
 * Registered Convex function type for a Confect API function.
 *
 * This is what Convex expects for exported query/mutation/action functions.
 * Uses encoded types for wire format.
 *
 * @example
 * type Registered = RegisteredFunction<CreateUserFn>
 * // RegisteredQuery<"public", { name: string }, { id: string }>
 */
export type RegisteredFunction<Fn extends GenericConfectApiFunction> =
  RegisteredQuery<
    "public",
    FunctionArgsEncoded<Fn>,
    FunctionReturnsEncoded<Fn>
  >;

/**
 * Server implementation for a group (all functions as registered Convex functions).
 *
 * @example
 * type Server = GroupServer<UsersGroup>
 * // {
 * //   list: RegisteredQuery<...>,
 * //   create: RegisteredQuery<...>,
 * //   ...
 * // }
 */
export type GroupServer<Group extends GenericConfectApiGroup> = {
  readonly [FnName in GroupFunctionNames<Group>]: RegisteredFunction<
    GroupFunctionByName<Group, FnName>
  >;
};

/**
 * Full API server (all groups with their registered functions).
 *
 * This is the type returned by `ConfectApiServer.make()`.
 * Export this object in your `convex/` directory to register functions.
 *
 * @example
 * type Server = ApiServer<MyApi>
 * // {
 * //   users: {
 * //     list: RegisteredQuery<...>,
 * //     create: RegisteredQuery<...>,
 * //   },
 * //   posts: { ... }
 * // }
 *
 * // Usage in convex/index.ts:
 * export const api = ConfectApiServer.make(apiWithSchema, handlers)
 * // Convex sees: { users: { list: ..., create: ... }, posts: { ... } }
 */
export type ApiServer<Api extends GenericConfectApi> = {
  readonly [GroupName in ApiGroupNames<Api>]: GroupServer<
    ApiGroupByName<Api, GroupName>
  >;
};

// ===========================
// Validation & Constraints
// ===========================

/**
 * Validate that all function schemas in an API have R = never (no context).
 *
 * This is a compile-time check. Use it to ensure schema correctness.
 *
 * @example
 * type Valid = ValidateApiSchemas<MyApi>
 * // If all schemas are valid: true
 * // If invalid: { error: "...", function: Fn }
 */
export type ValidateApiSchemas<Api extends GenericConfectApi> =
  ApiGroups<Api> extends infer Group
    ? Group extends GenericConfectApiGroup
      ? GroupFunctions<Group> extends infer Fn
        ? Fn extends GenericConfectApiFunction
          ? [Schema.Schema.Context<Fn["args"]>] extends [never]
            ? [Schema.Schema.Context<Fn["returns"]>] extends [never]
              ? true
              : { error: "Returns schema must have R = never"; function: Fn }
            : { error: "Args schema must have R = never"; function: Fn }
          : never
        : never
      : never
    : never;

// ===========================
// Legacy Compatibility (Deprecated)
// ===========================

/**
 * @deprecated Use `ApiGroupNames<Api>` instead.
 *
 * This type alias is provided for backward compatibility but will be removed
 * in a future version. Migrate to the new extraction pattern.
 */
export type ConfectApiGroupName<Group> = GroupFunctionNames<
  Group extends GenericConfectApiGroup ? Group : never
>;

/**
 * @deprecated Use `FunctionHandler<Fn>` instead.
 *
 * The new pattern no longer requires passing the schema separately since
 * it's now part of the API definition.
 *
 * Migration:
 * ```typescript
 * // Before:
 * type Handler = Handler<MySchema, MyFunction>
 *
 * // After:
 * type Handler = FunctionHandler<MyFunction>
 * ```
 */
export type Handler<
  _Schema extends GenericConfectSchema,
  Function extends GenericConfectApiFunction,
> = FunctionHandler<Function>;
