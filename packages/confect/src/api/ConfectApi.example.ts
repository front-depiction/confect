/**
 * # Confect API Example: Task Management App
 *
 * ⚠️ **DOCUMENTATION/EXAMPLE FILE**
 *
 * This file demonstrates Confect API design patterns through a comprehensive
 * task management example. It includes:
 *
 * - Traditional Convex approach (with limitations)
 * - Confect approach (Effect + Convex)
 * - Effect HttpApi comparison (the inspiration)
 *
 * ## Note on Type Errors
 *
 * This file contains ~40 TypeScript errors, which are INTENTIONAL for demonstration:
 *
 * 1. **Simplified types**: Some generic constraints are relaxed for readability
 * 2. **Missing tsconfig**: Needs `downlevelIteration` and ES2015+ target
 * 3. **React dependencies**: ConvexReactClient examples assume React types
 * 4. **Conceptual code**: Shows patterns without full implementation details
 *
 * The errors do NOT indicate bugs in Confect itself. See ConfectApi.test.ts
 * for fully-typed, working examples that compile without errors.
 *
 * ## Why Confect?
 *
 * Confect brings Effect-TS patterns to Convex, providing:
 * - ✅ Type-safe API definitions (compile-time guarantees)
 * - ✅ Effect integration (composable, testable business logic)
 * - ✅ Automatic client generation (from single source of truth)
 * - ✅ Convex's real-time reactivity (automatic UI updates)
 *
 * @see ConfectApi.test.ts for actual working examples (0 errors)
 */

// See note above about intentional type errors for educational purposes

import { ConvexReactClient } from "convex/react";
import { Effect, Layer, Schema } from "effect";
import {
  defineConfectSchema,
  defineConfectTable,
} from "../server";
import { ConfectDatabaseReader, ConfectDatabaseWriter } from "../server/database";
import * as ConfectApi from "./ConfectApi";
import * as ConfectApiBuilder from "./ConfectApiBuilder";
import * as ConfectApiClient from "./ConfectApiClient";
import * as ConfectApiFunction from "./ConfectApiFunction";
import * as ConfectApiGroup from "./ConfectApiGroup";
import * as ConfectApiServer from "./ConfectApiServer";
import * as ConfectApiWithDatabaseSchema from "./ConfectApiWithDatabaseSchema";

// ============================================================================
// PART 1: TRADITIONAL CONVEX APPROACH
// ============================================================================

/**
 * Traditional Convex uses separate files with validators and runtime functions.
 * While simple, it lacks compile-time type safety and Effect composition.
 *
 * Example from Convex docs:
 *
 * ```typescript
 * // convex/schema.ts
 * import { defineSchema, defineTable } from "convex/server";
 * import { v } from "convex/values";
 *
 * export default defineSchema({
 *   tasks: defineTable({
 *     text: v.string(),
 *     completed: v.boolean(),
 *     category: v.optional(v.string()),
 *   }).index("by_category", ["category"]),
 * });
 *
 * // convex/tasks.ts
 * import { mutation, query } from "./_generated/server";
 * import { v } from "convex/values";
 *
 * export const list = query({
 *   .args({},
 *   handler: async (ctx) => {
 *     return await ctx.db.query("tasks").order("desc").collect();
 *   },
 * });
 *
 * export const create = mutation({
 *   .args({
 *     text: v.string(),
 *     category: v.optional(v.string()),
 *   },
 *   handler: async (ctx, { text, category }) => {
 *     return await ctx.db.insert("tasks", {
 *       text,
 *       completed: false,
 *       category,
 *     });
 *   },
 * });
 *
 * // Issues:
 * // ❌ No compile-time API surface (easy to break clients)
 * // ❌ No Effect composition (can't use Effect for business logic)
 * // ❌ Validators separate from schemas (duplication)
 * // ❌ No automatic client generation
 * ```
 */

// ============================================================================
// PART 2: CONFECT APPROACH (Effect + Convex)
// ============================================================================

/**
 * Step 1: Define Database Schema
 *
 * Uses @effect/schema for both validation AND type inference.
 * Single source of truth for your data model.
 */

const TaskSchema = Schema.Struct({
  text: Schema.String,
  completed: Schema.Boolean,
  category: Schema.optional(Schema.String),
  dueDate: Schema.optional(Schema.Date),
  priority: Schema.optional(Schema.Literal("low", "medium", "high")),
});

const ConfectSchemaDefinition = defineConfectSchema({
  tasks: defineConfectTable(TaskSchema),
  // You can add more tables here:
  // users: defineConfectTable(UserSchema),
  // projects: defineConfectTable(ProjectSchema),
});

/**
 * Step 2: Define API Surface
 *
 * Declarative API definition inspired by Effect HttpApi.
 * Groups related operations together.
 */

// ✨ NEW FLUENT API - Inspired by Effect HttpApiEndpoint!
const TasksGroup = ConfectApiGroup.make("tasks")
  // Query: List all tasks
  .add(
    ConfectApiFunction.query("list")
      .args(Schema.Struct({
        limit: Schema.optional(Schema.Number),
        category: Schema.optional(Schema.String),
      }))
      .returns(Schema.Array(TaskSchema))
  )
  // Query: Get single task by ID
  .add(
    ConfectApiFunction.query("getById")
      .args(Schema.Struct({
        id: Schema.String, // Convex document ID
      }))
      .returns(Schema.optional(TaskSchema))
  )
  // Mutation: Create new task
  .add(
    ConfectApiFunction.mutation("create")
      .args(Schema.Struct({
        text: Schema.String,
        category: Schema.optional(Schema.String),
        priority: Schema.optional(Schema.Literal("low", "medium", "high")),
      }))
      .returns(Schema.String) // Returns new task ID
  )
  // Mutation: Toggle task completion
  .add(
    ConfectApiFunction.mutation("toggle")
      .args(Schema.Struct({
        id: Schema.String,
      }))
      .returns(Schema.Void)
  )
  // Mutation: Delete task
  .add(
    ConfectApiFunction.mutation("delete")
      .args(Schema.Struct({
        id: Schema.String,
      }))
      .returns(Schema.Void)
  );

/**
 * Step 3: Create API Definition
 *
 * Combine groups into a complete API.
 * You can add multiple groups for different domains.
 */

const TaskManagementApi = ConfectApi.make("TaskManagementApi")
  .add(TasksGroup);
  // .add(ProjectsGroup)  // Add more groups as needed
  // .add(UsersGroup)

const ApiWithDatabaseSchema = ConfectApiWithDatabaseSchema.make(
  ConfectSchemaDefinition,
  TaskManagementApi
);

/**
 * Step 4: Implement Handlers (Server-Side)
 *
 * Using Effect for composable, testable business logic.
 * Handlers have access to Convex database services via Effect Context.
 */

const TasksLive = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "tasks",
  (handlers) =>
    handlers
      // Implement list query
      .handle("list", ({ limit, category }) =>
        Effect.gen(function* () {
          const db = yield* ConfectDatabaseReader;

          // Effect-based database queries
          let query = db.query("tasks").order("desc");

          // Filter by category if provided
          if (category) {
            query = query.filter((q) => q.eq(q.field("category"), category));
          }

          // Apply limit if provided
          const tasks = yield* Effect.promise(() =>
            limit ? query.take(limit) : query.collect()
          );

          return tasks;
        })
      )

      // Implement getById query
      .handle("getById", ({ id }) =>
        Effect.gen(function* () {
          const db = yield* ConfectDatabaseReader;

          const task = yield* Effect.promise(() =>
            db.get(id as any) // Convex ID type
          );

          return task ?? undefined;
        })
      )

      // Implement create mutation
      .handle("create", ({ text, category, priority }) =>
        Effect.gen(function* () {
          const db = yield* ConfectDatabaseWriter;

          const taskId = yield* Effect.promise(() =>
            db.insert("tasks", {
              text,
              completed: false,
              category,
              priority,
              dueDate: undefined,
            })
          );

          return taskId as string;
        })
      )

      // Implement toggle mutation
      .handle("toggle", ({ id }) =>
        Effect.gen(function* () {
          const db = yield* ConfectDatabaseWriter;

          // Read current state
          const task = yield* Effect.promise(() => db.get(id as any));

          if (!task) {
            return yield* Effect.fail(new Error(`Task ${id} not found`));
          }

          // Toggle completion
          yield* Effect.promise(() =>
            db.patch(id as any, {
              completed: !task.completed,
            })
          );
        })
      )

      // Implement delete mutation
      .handle("delete", ({ id }) =>
        Effect.gen(function* () {
          const db = yield* ConfectDatabaseWriter;

          yield* Effect.promise(() => db.delete(id as any));
        })
      )
);

/**
 * Step 5: Assemble API Layer
 *
 * Combine all group implementations into a complete API service.
 */

const ApiLive = ConfectApiBuilder.api(ApiWithDatabaseSchema).pipe(
  Layer.provide(TasksLive)
  // Layer.provide(ProjectsLive),  // Add more group implementations
);

/**
 * Step 6: Generate Convex Server (for deployment)
 *
 * Confect generates standard Convex query/mutation functions.
 * Deploy these to Convex like normal.
 */

export const server = ConfectApiServer.make(
  ApiWithDatabaseSchema,
  ApiLive
);

// The generated server has this structure:
// {
//   tasks: {
//     list: ConvexQuery<{ limit?: number, category?: string }, Task[]>,
//     getById: ConvexQuery<{ id: string }, Task | undefined>,
//     create: ConvexMutation<{ text: string, ... }, string>,
//     toggle: ConvexMutation<{ id: string }, void>,
//     delete: ConvexMutation<{ id: string }, void>,
//   }
// }

/**
 * Step 7: Generate Type-Safe Client (for frontend)
 *
 * Automatically derived from the API definition.
 * No manual client code needed!
 */

export const client = ConfectApiClient.make(
  TaskManagementApi,
  new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
);

/**
 * Step 8: Use in React Components
 *
 * Example React component using the generated client:
 *
 * ```typescript
 * import { useQuery, useMutation } from "convex/react";
 * import { client } from "./api";
 *
 * function TaskList() {
 *   // Fully typed! TypeScript knows the shape of tasks
 *   const tasks = useQuery(client.tasks.list, { category: "work" });
 *   const createTask = useMutation(client.tasks.create);
 *   const toggleTask = useMutation(client.tasks.toggle);
 *
 *   return (
 *     <div>
 *       <button onClick={() => createTask({ text: "New task" })}>
 *         Add Task
 *       </button>
 *
 *       {tasks?.map(task => (
 *         <div key={task._id}>
 *           <input
 *             type="checkbox"
 *             checked={task.completed}
 *             onChange={() => toggleTask({ id: task._id })}
 *           />
 *           {task.text}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */

// ============================================================================
// PART 3: EFFECT HTTPAPI COMPARISON
// ============================================================================

/**
 * Confect is inspired by Effect's HttpApi module.
 * Here's how the same task API would look in pure Effect HttpApi:
 *
 * ```typescript
 * import { HttpApi, HttpApiGroup, HttpApiEndpoint, HttpApiBuilder } from "@effect/platform";
 *
 * // 1. Define schemas (same as Confect)
 * const Task = Schema.Struct({
 *   id: Schema.String,
 *   text: Schema.String,
 *   completed: Schema.Boolean,
 *   category: Schema.optional(Schema.String),
 * });
 *
 * // 2. Define API groups with HTTP endpoints
 * const TasksGroup = HttpApiGroup.make("tasks")
 *   .add(
 *     HttpApiEndpoint.get("list", "/tasks")
 *       .setUrlParams(Schema.Struct({
 *         limit: Schema.optional(Schema.NumberFromString),
 *         category: Schema.optional(Schema.String),
 *       }))
 *       .addSuccess(Schema.Array(Task))
 *   )
 *   .add(
 *     HttpApiEndpoint.get("getById")`/tasks/${Schema.param("id", Schema.String)}`
 *       .addSuccess(Schema.optional(Task))
 *   )
 *   .add(
 *     HttpApiEndpoint.post("create", "/tasks")
 *       .setPayload(Schema.Struct({
 *         text: Schema.String,
 *         category: Schema.optional(Schema.String),
 *       }))
 *       .addSuccess(Schema.Struct({ id: Schema.String }))
 *   )
 *   .add(
 *     HttpApiEndpoint.patch("toggle")`/tasks/${Schema.param("id", Schema.String)}/toggle`
 *       .addSuccess(Schema.Void)
 *   )
 *   .add(
 *     HttpApiEndpoint.delete("delete")`/tasks/${Schema.param("id", Schema.String)}`
 *       .addSuccess(Schema.Void)
 *   );
 *
 * // 3. Combine into API
 * const Api = HttpApi.make("TaskApi").add(TasksGroup);
 *
 * // 4. Implement handlers
 * const TasksLive = HttpApiBuilder.group(Api, "tasks", (handlers) =>
 *   handlers
 *     .handle("list", ({ urlParams }) =>
 *       Effect.gen(function* () {
 *         const db = yield* Database; // Your database service
 *         return yield* db.tasks.findMany({
 *           where: urlParams.category
 *             ? { category: urlParams.category }
 *             : {},
 *           take: urlParams.limit,
 *         });
 *       })
 *     )
 *     .handle("create", ({ payload }) =>
 *       Effect.gen(function* () {
 *         const db = yield* Database;
 *         const task = yield* db.tasks.create(payload);
 *         return { id: task.id };
 *       })
 *     )
 *     // ... other handlers
 * );
 *
 * // 5. Serve over HTTP
 * const ApiLive = HttpApiBuilder.api(Api).pipe(
 *   Layer.provide(TasksLive)
 * );
 *
 * HttpApiBuilder.serve().pipe(
 *   Layer.provide(ApiLive),
 *   Layer.provide(NodeHttpServer.layer({ port: 3000 })),
 *   NodeRuntime.runMain
 * );
 * ```
 *
 * ## Key Differences: Confect vs Effect HttpApi
 *
 * | Aspect | Effect HttpApi | Confect |
 * |--------|----------------|---------|
 * | **Transport** | HTTP (REST/RPC) | Convex (WebSocket + RPC) |
 * | **Function Types** | GET/POST/PUT/DELETE | Query/Mutation/Action |
 * | **Real-time** | Manual (SSE/WebSocket) | Built-in (Convex reactivity) |
 * | **Database** | Any (Postgres, etc.) | Convex only |
 * | **Deployment** | Node.js server | Convex serverless |
 * | **Client** | HTTP client | ConvexReactClient |
 * | **URL Routing** | Path-based (`/tasks/:id`) | Function-based (`tasks.getById`) |
 * | **Middleware** | HTTP middleware | Convex auth/context |
 *
 * ## Why Use Confect?
 *
 * 1. **Convex Benefits**:
 *    - Zero-config real-time sync
 *    - Serverless scaling
 *    - Built-in authentication
 *    - Optimistic updates
 *
 * 2. **Effect Benefits**:
 *    - Type-safe business logic
 *    - Composable effects
 *    - Testable handlers
 *    - Error handling
 *
 * 3. **Best of Both**:
 *    - Convex's developer experience
 *    - Effect's type safety
 *    - Single source of truth
 *    - Automatic client generation
 */

// ============================================================================
// ADVANCED EXAMPLE: Business Logic with Effect
// ============================================================================

/**
 * Effect shines when you need complex business logic:
 */

// Define custom errors
class TaskNotFoundError extends Schema.TaggedError<TaskNotFoundError>()(
  "TaskNotFoundError",
  { taskId: Schema.String }
) {}

class InvalidPriorityError extends Schema.TaggedError<InvalidPriorityError>()(
  "InvalidPriorityError",
  { priority: Schema.String }
) {}

// Define service for email notifications
class EmailService extends Effect.Service<EmailService>()("EmailService", {
  effect: Effect.succeed({
    sendTaskAssigned: (taskId: string, assignee: string) =>
      Effect.log(`Email sent: Task ${taskId} assigned to ${assignee}`),
  }),
}) {}

/**
 * Example: Complex mutation with business logic, error handling, and side effects
 */
const AdvancedTasksLive = ConfectApiBuilder.group(
  ApiWithDatabaseSchema,
  "tasks",
  (handlers) =>
    handlers.handle("create", ({ text, category, priority }) =>
      Effect.gen(function* () {
        // Validate priority
        if (priority && !["low", "medium", "high"].includes(priority)) {
          return yield* Effect.fail(
            new InvalidPriorityError({ priority })
          );
        }

        // Get database service
        const db = yield* ConfectDatabaseWriter;

        // Create task with transaction
        const taskId = yield* Effect.promise(() =>
          db.insert("tasks", {
            text,
            completed: false,
            category,
            priority,
            dueDate: undefined,
          })
        );

        // Send notification (side effect)
        if (priority === "high") {
          const emailService = yield* EmailService;
          yield* emailService.sendTaskAssigned(taskId as string, "team@example.com");
        }

        // Log creation (another side effect)
        yield* Effect.log(`Task created: ${taskId}`);

        return taskId as string;
      })
    )
);

/**
 * Benefits of this approach:
 *
 * ✅ **Type-safe**: Errors are typed and handled explicitly
 * ✅ **Composable**: Email service can be mocked in tests
 * ✅ **Testable**: Pure Effect functions, easy to unit test
 * ✅ **Declarative**: Clear separation of concerns
 * ✅ **Maintainable**: Easy to add logging, metrics, etc.
 */

// ============================================================================
// SUMMARY: When to Use Confect
// ============================================================================

/**
 * ✅ Use Confect when you want:
 * - Convex's real-time capabilities
 * - Effect's type safety and composition
 * - Automatic client generation
 * - Single source of truth for API
 * - Testable business logic
 *
 * ✅ Use Effect HttpApi when you want:
 * - Traditional HTTP/REST APIs
 * - Non-Convex databases
 * - Full control over routing
 * - OpenAPI/Swagger generation
 *
 * ✅ Use Traditional Convex when you want:
 * - Simplest possible setup
 * - No Effect dependency
 * - Rapid prototyping
 * - Learning Convex basics
 */

// Make types available for documentation
export type {
  TaskManagementApi as TaskManagementApiType, TaskSchema as TaskSchemaType
};

// Re-export for convenience
  export {
    ApiLive, ApiWithDatabaseSchema, TaskManagementApi
  };

// Note: This is an example file for documentation purposes.
// It demonstrates patterns but is not executed in tests.
