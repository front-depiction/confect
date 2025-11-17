/**
 * Tests for Plugin system integration with Api.serve layer composition
 *
 * These tests verify the complete layer provisioning system:
 * 1. User provides apiLayer (may include plugins)
 * 2. Api.serve merges with buildtime services (MutationDB.TypedDefault())
 * 3. Inside function handlers, runtime provides ctx-based layers
 *
 * Pattern: User layers -> BuildTime layers -> Runtime layers
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { defineConfectSchema, defineConfectTable } from "../../server";
import { MutationDB } from "../../server/database";
import * as Plugin from "./Plugin";
import * as Api from "./Api";
import * as Group from "./Group";
import * as Function from "./Function";
import { DefaultFunctionArgs, GenericMutationCtx, RegisteredMutation } from "convex/server";
import { DataModelFromConfectSchema } from "../../server/schema";

// =============================================================================
// Test Schema and Setup
// =============================================================================

const schema = defineConfectSchema({
  tasks: defineConfectTable(
    Schema.Struct({
      text: Schema.String,
      completed: Schema.Boolean,
    })
  ),
});
type DataModel = DataModelFromConfectSchema<typeof schema.confectSchema>
const testDB = convexTest(schema.convexSchemaDefinition, import.meta.glob("../../../test/convex/**/*.*s"));
type Mutationhandler<Args, Returns> = (ctx: GenericMutationCtx<DataModel>, args: Args) => Returns;
const getHandler = <Args extends DefaultFunctionArgs, Returns>(rm: RegisteredMutation<"public", Args, Returns>) => (rm as any)._handler as Mutationhandler<Args, Returns>

// =============================================================================
// Test: Api.serve - basic functionality first
// =============================================================================

describe("Api.serve layer provisioning", () => {
  test("basic mutation without plugins", async () => {
    await testDB.run(async (ctx) => {
      // Define API using the proper builder pattern
      const tasksGroup = Group.mutation("tasks").pipe(
        Group.add(
          Function.mutation("createTask")
            .args(Schema.Struct({ text: Schema.String }))
            .returns(Schema.String)
        )
      );

      const api = Api.api("testApi").pipe(Api.add(tasksGroup));

      // Implement handlers
      const TasksLive = Group.build(tasksGroup,
        Effect.gen(function* () {
          const db = yield* MutationDB;

          return {
            createTask: (args) =>
              Effect.gen(function* () {
                const id = yield* db.insert("tasks", {
                  text: args.text,
                  completed: false,
                });
                return id;
              }),
          };
        })
      );

      // No plugins, just the handlers
      const served = Api.serve(schema, api, TasksLive);

      // Extract the handler
      const createTaskHandler = getHandler(served.tasks["createTask"] as never);

      // Call it with the ctx from testDB.run()
      const taskId = await createTaskHandler(ctx, { text: "Test task" });

      // Verify task was actually created
      expect(typeof taskId).toBe("string");
      const tasks = await ctx.db.query("tasks").collect();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.text).toBe("Test task");
    });
  });

  test("mutation with plugin layer gets properly composed", async () => {
    await testDB.run(async (ctx) => {
      let pluginCalled = false;

      // Create a plugin that tracks insertions
      const trackingPlugin = Plugin.forTag(MutationDB, (base) => ({
        insert: (table, value) =>
          Effect.gen(function* () {
            pluginCalled = true;
            return yield* base.insert(table, value);
          }),
      }));

      const tasksGroup = Group.mutation("tasks").pipe(
        Group.add(
          Function.mutation("createTask")
            .args(Schema.Struct({ text: Schema.String }))
            .returns(Schema.String)
        )
      );

      const api = Api.api("testApi").pipe(Api.add(tasksGroup));

      const TasksLive = Group.build(
        tasksGroup,
        Effect.gen(function* () {
          const db = yield* MutationDB;
          return {
            createTask: (args) =>
              db.insert("tasks", {
                text: args.text,
                completed: false,
              }),
          };
        })
      );

      // User layer with plugin
      const apiLayer =
        TasksLive.pipe(
          trackingPlugin
        )

      // Serve the API
      const served = Api.serve(schema, api, apiLayer);

      // Extract the handler and call it
      const createTaskHandler = getHandler(served.tasks["createTask"] as never);
      const taskId = await createTaskHandler(ctx, { text: "Plugin test" });

      // Verify plugin was called
      expect(pluginCalled).toBe(true);

      // Verify task was created
      expect(typeof taskId).toBe("string");
      const tasks = await ctx.db.query("tasks").collect();
      const pluginTask = tasks.find(t => t.text === "Plugin test");
      expect(pluginTask).toBeDefined();
      expect(pluginTask?.text).toBe("Plugin test");
    });
  });

  test("multiple plugins execute in correct order", async () => {
    await testDB.run(async (ctx) => {
      const order: string[] = [];

      const plugin1 = Plugin.forTag(MutationDB, (base) => ({
        insert: (table, value) =>
          Effect.gen(function* () {
            order.push("plugin1");
            return yield* base.insert(table, value);
          }),
      }));

      const plugin2 = Plugin.forTag(MutationDB, (base) => ({
        insert: (table, value) =>
          Effect.gen(function* () {
            order.push("plugin2");
            return yield* base.insert(table, value);
          }),
      }));

      const plugin3 = Plugin.forTag(MutationDB, (base) => ({
        insert: (table, value) =>
          Effect.gen(function* () {
            order.push("plugin3");
            return yield* base.insert(table, value);
          }),
      }));

      const tasksGroup = Group.mutation("tasks").pipe(
        Group.add(
          Function.mutation("createTask")
            .args(Schema.Struct({ text: Schema.String }))
            .returns(Schema.String)
        )
      );

      const api = Api.api("testApi").pipe(Api.add(tasksGroup));

      const TasksLive = Layer.effect(
        Group.Tag(tasksGroup),
        Effect.gen(function* () {
          const db = yield* MutationDB;
          return {
            createTask: (args) =>
              db.insert("tasks", {
                text: args.text,
                completed: false,
              }),
          };
        })
      );

      // Pipe all plugins onto TasksLive
      const apiLayer = TasksLive.pipe(plugin1, plugin2, plugin3);
      const served = Api.serve(schema, api, apiLayer);

      const createTaskHandler = getHandler(served.tasks["createTask"] as never);
      await createTaskHandler(ctx, { text: "Order test" });

      // Verify execution order (left-to-right with Plugin.forTag)
      expect(order).toEqual(["plugin1", "plugin2", "plugin3"]);
    });
  });

  test("effectful plugin with dependencies", async () => {
    await testDB.run(async (ctx) => {
      const auditLog: string[] = [];

      // Create a custom audit service
      class AuditService extends Effect.Service<AuditService>()(
        "AuditService",
        {
          effect: Effect.succeed({
            log: (message: string) =>
              Effect.sync(() => {
                auditLog.push(message);
              }),
          }),
        }
      ) { }

      // Create an effectful plugin that uses AuditService
      const auditPlugin = Plugin.effectForTag(MutationDB, (base) =>
        Effect.gen(function* () {
          const audit = yield* AuditService;

          return {
            insert: (table, value) =>
              Effect.gen(function* () {
                yield* audit.log(`Inserting into ${table}`);
                return yield* base.insert(table, value);
              }),
          };
        })
      );

      const tasksGroup = Group.mutation("tasks").pipe(
        Group.add(
          Function.mutation("createTask")
            .args(Schema.Struct({ text: Schema.String }))
            .returns(Schema.String)
        )
      );

      const api = Api.api("testApi").pipe(Api.add(tasksGroup));

      const TasksLive = Layer.effect(
        Group.Tag(tasksGroup),
        Effect.gen(function* () {
          const db = yield* MutationDB;
          return {
            createTask: (args) =>
              db.insert("tasks", {
                text: args.text,
                completed: false,
              }),
          };
        })
      );

      // Pipe effectful plugin onto TasksLive, provide its dependency
      const apiLayer = TasksLive.pipe(
        auditPlugin,
        Layer.provide(AuditService.Default)
      );

      const served = Api.serve(schema, api, apiLayer);

      const createTaskHandler = getHandler(served.tasks["createTask"] as never);
      await createTaskHandler(ctx, { text: "Audited task" });

      // Verify audit log was called
      expect(auditLog).toEqual(["Inserting into tasks"]);
    });
  });
});
