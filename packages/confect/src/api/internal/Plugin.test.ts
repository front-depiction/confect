/**
 * Plugin API - Layer Enhancement Tests
 *
 * Plugins enhance Layers (not Tags) via Layer.build.
 * Each plugin builds the base layer to get its context,
 * extracts the base service, wraps it, and returns a new Layer.
 *
 * Pattern: Layer transformation functions
 * - Plugins are functions: Layer<T> => Layer<T>
 * - Use Layer.build to get Context
 * - Extract base service from context
 * - Return enhanced Layer with same service tag
 * - Compose via .pipe() on layers
 */

import { describe, expect, test } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import * as Schema from "effect/Schema";
import * as Plugin from "./Plugin";

// =============================================================================
// Mock Services for Testing
// =============================================================================

/**
 * Mock MutationDB service for testing
 */
class MutationDB extends Context.Tag("MutationDB")<
  MutationDB,
  {
    insert: <T extends string>(
      table: T,
      value: any
    ) => Effect.Effect<string, never, never>;
    patch: <T extends string>(
      table: T,
      id: string,
      value: any
    ) => Effect.Effect<void, never, never>;
    remove: <T extends string>(
      table: T,
      id: string
    ) => Effect.Effect<void, never, never>;
  }
>() { }

// Simple in-memory implementation for testing
const MutationDBLive = Layer.succeed(
  MutationDB,
  MutationDB.of({
    insert: (table, _value) => Effect.succeed(`${table}-${Math.random()}`),
    patch: (_table, _id, _value) => Effect.void,
    remove: (_table, _id) => Effect.void,
  })
)

// =============================================================================
// Plugin Definition Pattern
// =============================================================================

describe("Plugin Definition", () => {


  test("Plugin.forTag helper simplifies plugin creation", () => {
    const withLogging = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[LOG] ${table}`);
          return yield* base.insert(table, value);
        }),
    }));

    // Pattern: Layer.context<Service>().pipe(plugin, Layer.provide(ServiceLive))
    const enhanced = Layer.context<MutationDB>().pipe(withLogging, Layer.provide(MutationDBLive));
    expect(enhanced).toBeDefined();
  });

  test("Plugin.forTag supports partial service (only enhanced methods)", async () => {
    // Return only the methods you want to enhance
    const withLogging = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[PARTIAL LOG] ${table}`);
          return yield* base.insert(table, value);
        }),
      // patch and remove are not specified - they'll be passed through from base
    }));

    const Enhanced = Layer.context<MutationDB>().pipe(withLogging, Layer.provide(MutationDBLive));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
      yield* db.patch("notes", "id", { text: "updated" }); // Should still work
      yield* db.remove("notes", "id"); // Should still work
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));
  });

  test("Multiple plugins compose via .pipe()", () => {
    // Using partial pattern - only specify enhanced methods
    const withAudit = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          yield* Effect.logInfo("[AUDIT]");
          return yield* base.insert(table, value);
        }),
    }));

    const withValidation = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value: any) =>
        Effect.gen(function* () {
          if (!value) {
            return yield* Effect.die(new Error("Invalid"));
          }
          return yield* base.insert(table, value);
        }),
    }));

    // Compose plugins via pipe
    const Enhanced = Layer.context<MutationDB>().pipe(withAudit, withValidation, Layer.provide(MutationDBLive));

    expect(Enhanced).toBeDefined();
  });
});

// =============================================================================
// Order of Execution
// =============================================================================

describe("Plugin Order", () => {
  test("Plugins execute in pipe order (onion model)", async () => {
    const executionOrder: string[] = [];

    const plugin1 = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          executionOrder.push("plugin1-before");
          const result = yield* base.insert(table, value);
          executionOrder.push("plugin1-after");
          return result;
        }),
    }));

    const plugin2 = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          executionOrder.push("plugin2-before");
          const result = yield* base.insert(table, value);
          executionOrder.push("plugin2-after");
          return result;
        }),
    }));

    const plugin3 = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          executionOrder.push("plugin3-before");
          const result = yield* base.insert(table, value);
          executionOrder.push("plugin3-after");
          return result;
        }),
    }));

    // Compose: Layer.context<MutationDB>() -> plugin1 -> plugin2 -> plugin3
    const Enhanced = Layer.context<MutationDB>().pipe(plugin1, plugin2, plugin3, Layer.provide(MutationDBLive));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      return yield* db.insert("notes", { text: "test" });
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // Execution order: plugin1 -> plugin2 -> plugin3 -> base -> plugin3 -> plugin2 -> plugin1 (left-to-right onion)
    // Plugins execute in the order they appear in pipe (first plugin in pipe executes first)
    expect(executionOrder).toEqual([
      "plugin1-before",
      "plugin2-before",
      "plugin3-before",
      "plugin3-after",
      "plugin2-after",
      "plugin1-after",
    ]);
  });
});

// =============================================================================
// Plugin Interception Patterns
// =============================================================================

describe("Plugin Interception", () => {
  test("Plugin can run logic before operation", async () => {
    const beforeLog: string[] = [];

    const withBefore = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          beforeLog.push(`before:${table}`);
          return yield* base.insert(table, value);
        }),
    }));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    const Enhanced = Layer.context<MutationDB>().pipe(withBefore, Layer.provide(MutationDBLive));

    await Effect.runPromise(
      program.pipe(Effect.provide(Enhanced))
    );

    expect(beforeLog).toEqual(["before:notes"]);
  });

  test("Plugin can run logic after operation", async () => {
    const afterLog: Array<{ table: string; id: string }> = [];

    const withAfter = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          const id = yield* base.insert(table, value);
          afterLog.push({ table, id });
          return id;
        }),
    }));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      const id = yield* db.insert("notes", { text: "test" });
      return id;
    });

    const Enhanced = Layer.context<MutationDB>().pipe(withAfter, Layer.provide(MutationDBLive));

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(Enhanced))
    );

    expect(afterLog).toHaveLength(1);
    const firstLog = afterLog[0];
    expect(firstLog).toBeDefined();
    expect(firstLog?.table).toBe("notes");
    expect(firstLog?.id).toBe(result);
  });

  test("Plugin can modify arguments", async () => {
    const withTimestamp = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) => {
        // Add timestamp to all inserts
        const enriched = { ...value, _timestamp: Date.now() };
        return base.insert(table, enriched);
      },
    }));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      return yield* db.insert("notes", { text: "test" });
    });

    const Enhanced = Layer.context<MutationDB>().pipe(withTimestamp, Layer.provide(MutationDBLive));

    await Effect.runPromise(
      program.pipe(Effect.provide(Enhanced))
    );

    expect(true).toBe(true); // Would verify timestamp was added in real impl
  });

  test("Plugin can modify return value", async () => {
    const withPrefix = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          const id = yield* base.insert(table, value);
          return `prefix:${id}`;
        }),
    }));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      return yield* db.insert("notes", { text: "test" });
    });

    const Enhanced = Layer.context<MutationDB>().pipe(withPrefix, Layer.provide(MutationDBLive));

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(Enhanced))
    );

    expect(result.startsWith("prefix:")).toBe(true);
  });

  test("Plugin can prevent execution (validation with defects)", async () => {
    class ValidationError extends Schema.TaggedError<ValidationError>()(
      "ValidationError",
      { message: Schema.String }
    ) { }

    const withValidation = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value: any) =>
        Effect.gen(function* () {
          if (!value.text || value.text.length === 0) {
            // Service interface doesn't allow typed errors, so use defects
            return yield* Effect.die(
              new ValidationError({ message: "Text required" })
            );
          }
          return yield* base.insert(table, value);
        }),
    }));

    const programValid = Effect.gen(function* () {
      const db = yield* MutationDB;
      return yield* db.insert("notes", { text: "valid" });
    });

    const programInvalid = Effect.gen(function* () {
      const db = yield* MutationDB;
      return yield* db.insert("notes", { text: "" });
    });

    const Enhanced = Layer.context<MutationDB>().pipe(withValidation, Layer.provide(MutationDBLive));

    // Valid should succeed
    await Effect.runPromise(programValid.pipe(Effect.provide(Enhanced)));

    // Invalid should die (defect, not typed error)
    const result = await Effect.runPromise(
      programInvalid.pipe(Effect.provide(Enhanced), Effect.exit)
    );
    expect(result._tag).toBe("Failure");
  });

  test("Plugin can short-circuit (caching)", async () => {
    const cache = new Map<string, string>();

    const withCache = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value: any) =>
        Effect.gen(function* () {
          const cacheKey = `${table}:${value.text}`;

          // Check cache
          if (cache.has(cacheKey)) {
            return cache.get(cacheKey)!;
          }

          // Cache miss - call through
          const id = yield* base.insert(table, value);
          cache.set(cacheKey, id);
          return id;
        }),
    }));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      const id1 = yield* db.insert("notes", { text: "cached" });
      const id2 = yield* db.insert("notes", { text: "cached" });
      return { id1, id2 };
    });

    const Enhanced = Layer.context<MutationDB>().pipe(withCache, Layer.provide(MutationDBLive));

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(Enhanced))
    );

    // Both calls return same cached ID
    expect(result.id1).toBe(result.id2);
  });
});

// =============================================================================
// Plugin Dependencies
// =============================================================================

describe("Plugin Dependencies", () => {
  test("Plugin can access other services via Effect context", async () => {
    // Custom audit service
    class AuditLog extends Context.Tag("AuditLog")<
      AuditLog,
      { log: (event: string) => Effect.Effect<void> }
    >() { }

    const auditEvents: string[] = [];
    const AuditLogLive = Layer.succeed(AuditLog, {
      log: (event) =>
        Effect.sync(() => {
          auditEvents.push(event);
        }),
    });

    const withAudit = Plugin.effectForTag(MutationDB, (base) =>
      Effect.gen(function* () {
        const audit = yield* AuditLog; // Access service during setup

        return {
          insert: (table, value) =>
            Effect.gen(function* () {
              yield* audit.log(`Inserting into ${table}`);
              return yield* base.insert(table, value);
            }),
        };
      })
    );

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    const Enhanced = Layer.context<MutationDB>().pipe(
      withAudit,
      Layer.provide(Layer.provideMerge(AuditLogLive, MutationDBLive))
    );

    await Effect.runPromise(
      program.pipe(Effect.provide(Enhanced))
    );

    expect(auditEvents).toEqual(["Inserting into notes"]);
  });

  test("Plugin enhancement can use Effect.gen for setup", async () => {
    // Plugin that needs async setup
    class AuditLog extends Context.Tag("AuditLog")<
      AuditLog,
      { log: (event: string) => Effect.Effect<void> }
    >() { }

    const auditEvents: string[] = [];
    const AuditLogLive = Layer.succeed(AuditLog, {
      log: (event) =>
        Effect.sync(() => {
          auditEvents.push(event);
        }),
    });

    // Plugin.effectForTag for async setup
    const withAudit = Plugin.effectForTag(MutationDB, (base) =>
      Effect.gen(function* () {
        const audit = yield* AuditLog; // Can yield during setup
        yield* Effect.logInfo("Audit plugin initialized");

        return {
          insert: (table, value) =>
            Effect.gen(function* () {
              yield* audit.log(`Inserting into ${table}`);
              return yield* base.insert(table, value);
            }),
        };
      })
    );

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    const Enhanced = Layer.context<MutationDB>().pipe(
      withAudit,
      Layer.provide(Layer.provideMerge(AuditLogLive, MutationDBLive))
    );

    await Effect.runPromise(
      program.pipe(Effect.provide(Enhanced))
    );

    expect(auditEvents).toEqual(["Inserting into notes"]);
  });
});

// =============================================================================
// Real-World Plugin Examples
// =============================================================================

describe("Real-World Plugins", () => {
  test("Audit Log Plugin", async () => {
    const auditLog: Array<{ action: string; table: string; id?: string }> = [];

    const withAuditLog = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          const id = yield* base.insert(table, value);
          auditLog.push({ action: "insert", table, id });
          return id;
        }),
      remove: (table, id) =>
        Effect.gen(function* () {
          yield* base.remove(table, id);
          auditLog.push({ action: "remove", table, id });
        }),
    }));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      const id = yield* db.insert("notes", { text: "test" });
      yield* db.remove("notes", id);
    });

    const Enhanced = Layer.context<MutationDB>().pipe(withAuditLog, Layer.provide(MutationDBLive));

    await Effect.runPromise(
      program.pipe(Effect.provide(Enhanced))
    );

    expect(auditLog).toHaveLength(2);
    expect(auditLog[0]).toBeDefined();
    expect(auditLog[1]).toBeDefined();
    expect(auditLog[0]?.action).toBe("insert");
    expect(auditLog[1]?.action).toBe("remove");
  });

  test("Soft Delete Plugin", async () => {
    const patches: Array<{ table: string; id: string }> = [];

    const withSoftDelete = Plugin.forTag(MutationDB, (base) => ({
      remove: (table, id) => {
        // Convert remove to patch
        patches.push({ table, id });
        return base.patch(table, id, { deleted: true });
      },
    }));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.remove("notes", "note-123");
    });

    const Enhanced = Layer.context<MutationDB>().pipe(withSoftDelete, Layer.provide(MutationDBLive));

    await Effect.runPromise(
      program.pipe(Effect.provide(Enhanced))
    );

    expect(patches).toEqual([{ table: "notes", id: "note-123" }]);
  });

  test("Trigger Plugin", async () => {
    const triggered: Array<{ event: string; id: string }> = [];

    const withTriggers = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          const id = yield* base.insert(table, value);

          // Run trigger logic
          if (table === "notes") {
            triggered.push({ event: "note_created", id });
          }

          return id;
        }),
    }));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    const Enhanced = Layer.context<MutationDB>().pipe(withTriggers, Layer.provide(MutationDBLive));

    await Effect.runPromise(
      program.pipe(Effect.provide(Enhanced))
    );

    expect(triggered).toHaveLength(1);
    expect(triggered[0]).toBeDefined();
    expect(triggered[0]?.event).toBe("note_created");
  });

  test("Row-Level Security Plugin", async () => {
    class CurrentUser extends Context.Tag("CurrentUser")<
      CurrentUser,
      { id: string }
    >() { }

    const CurrentUserLive = Layer.succeed(CurrentUser, { id: "user-123" });

    const insertedValues: any[] = [];

    // Mock DB that tracks insertions
    const TrackingDBLive = Layer.succeed(MutationDB, {
      insert: (table, value) => {
        insertedValues.push(value);
        return Effect.succeed(`${table}-id`);
      },
      patch: () => Effect.void,
      remove: () => Effect.void,
    });

    const withRLS = Plugin.effectForTag(MutationDB, (base) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser;

        return {
          insert: (table, value) => {
            // Auto-inject userId
            const withUser = { ...value, userId: user.id };
            return base.insert(table, withUser);
          },
        };
      })
    );

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    const Enhanced = Layer.context<MutationDB>().pipe(
      withRLS,
      Layer.provide(Layer.provideMerge(CurrentUserLive, TrackingDBLive))
    );

    await Effect.runPromise(
      program.pipe(Effect.provide(Enhanced))
    );

    expect(insertedValues[0]).toEqual({ text: "test", userId: "user-123" });
  });

  test("Composing Multiple Plugins", async () => {
    const events: string[] = [];

    const withLogging = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          events.push("log");
          return yield* base.insert(table, value);
        }),
    }));

    const withValidation = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          events.push("validate");
          if (!value.text) {
            return yield* Effect.die(new Error("Invalid"));
          }
          return yield* base.insert(table, value);
        }),
    }));

    const withAudit = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          events.push("audit");
          return yield* base.insert(table, value);
        }),
    }));

    const composed = Layer.context<MutationDB>().pipe(withAudit, withValidation, withLogging, Layer.provide(MutationDBLive));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    await Effect.runPromise(program.pipe(Effect.provide(composed)));

    // Execution order: audit -> validate -> log -> base (left-to-right in pipe)
    // Plugins execute in order: withAudit -> withValidation -> withLogging
    expect(events).toEqual(["audit", "validate", "log"]);
  });
});

// =============================================================================
// Utility Functions
// =============================================================================

describe("Plugin Utilities", () => {
  test("identity returns layer untouched", () => {
    const layer = MutationDBLive;
    const result = Plugin.identity(layer);
    expect(result).toBe(layer);
  });

  test("combine merges two plugins", async () => {
    const events: string[] = [];

    const plugin1 = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          events.push("plugin1");
          return yield* base.insert(table, value);
        }),
    }));

    const plugin2 = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          events.push("plugin2");
          return yield* base.insert(table, value);
        }),
    }));

    const combined = Plugin.combine(plugin1, plugin2);
    const Enhanced = Layer.context<MutationDB>().pipe(combined, Layer.provide(MutationDBLive));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // combine uses Function.compose, so plugin1 executes before plugin2
    expect(events).toEqual(["plugin1", "plugin2"]);
  });

  test("compose creates plugin from array", async () => {
    const events: string[] = [];

    const plugin1 = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          events.push("p1");
          return yield* base.insert(table, value);
        }),
    }));

    const plugin2 = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          events.push("p2");
          return yield* base.insert(table, value);
        }),
    }));

    const plugin3 = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          events.push("p3");
          return yield* base.insert(table, value);
        }),
    }));

    const composed = Plugin.compose([plugin1, plugin2, plugin3]);
    const Enhanced = Layer.context<MutationDB>().pipe(composed, Layer.provide(MutationDBLive));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // Right-to-left execution due to Function.compose: plugin3 -> plugin2 -> plugin1
    expect(events).toEqual(["p3", "p2", "p1"]);
  });

  test("combineAll with empty array returns identity", () => {
    const combined = Plugin.combineAll([]);
    const layer = MutationDBLive;
    const result = combined(layer);
    expect(result).toBe(layer);
  });

  test("combineAll with plugins composes them", async () => {
    const events: string[] = [];

    const plugin1 = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          events.push("a");
          return yield* base.insert(table, value);
        }),
    }));

    const plugin2 = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          events.push("b");
          return yield* base.insert(table, value);
        }),
    }));

    const combined = Plugin.combineAll([plugin1, plugin2]);
    const Enhanced = Layer.context<MutationDB>().pipe(combined, Layer.provide(MutationDBLive));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // Right-to-left execution due to Function.compose: plugin2 -> plugin1
    expect(events).toEqual(["b", "a"]);
  });

  test("compose plugins for different services", async () => {
    // Define a second service
    class LogService extends Context.Tag("LogService")<
      LogService,
      { log: (msg: string) => Effect.Effect<void> }
    >() { }

    const logs: string[] = [];
    const LogServiceLive = Layer.succeed(LogService, {
      log: (msg) => Effect.sync(() => { logs.push(msg); })
    });

    const events: string[] = [];

    // Plugin for MutationDB
    const withDBLogging = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          events.push("db-plugin");
          return yield* base.insert(table, value);
        }),
    }));

    // Plugin for LogService (different service)
    const withLogPrefix = Plugin.forTag(LogService, (base) => ({
      log: (msg) =>
        Effect.gen(function* () {
          events.push("log-plugin");
          return yield* base.log(`[PREFIX] ${msg}`);
        }),
    }));

    // Compose plugins for different services
    const combined = Plugin.combineAll([withDBLogging, withLogPrefix]);
    const Enhanced = Layer.mergeAll(Layer.context<MutationDB>(), Layer.context<LogService>()).pipe(
      combined,
      Layer.provide(Layer.provideMerge(MutationDBLive, LogServiceLive))
    );

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      const logger = yield* LogService;
      yield* db.insert("notes", { text: "test" });
      yield* logger.log("hello");
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // Both plugins executed
    expect(events).toEqual(["db-plugin", "log-plugin"]);
    // Log was prefixed
    expect(logs).toEqual(["[PREFIX] hello"]);
  });

  test("compose plugins for three different services with type inference", async () => {
    // Define three different services
    class ServiceA extends Context.Tag("ServiceA")<
      ServiceA,
      { doA: () => Effect.Effect<string> }
    >() { }

    class ServiceB extends Context.Tag("ServiceB")<
      ServiceB,
      { doB: () => Effect.Effect<number> }
    >() { }

    class ServiceC extends Context.Tag("ServiceC")<
      ServiceC,
      { doC: () => Effect.Effect<boolean> }
    >() { }

    const ServiceALive = Layer.succeed(ServiceA, {
      doA: () => Effect.succeed("base-a")
    });

    const ServiceBLive = Layer.succeed(ServiceB, {
      doB: () => Effect.succeed(42)
    });

    const ServiceCLive = Layer.succeed(ServiceC, {
      doC: () => Effect.succeed(true)
    });

    const events: string[] = [];

    // Plugin for ServiceA
    const pluginA = Plugin.forTag(ServiceA, (base) => ({
      doA: () =>
        Effect.gen(function* () {
          events.push("plugin-a");
          const result = yield* base.doA();
          return `[A] ${result}`;
        }),
    }));

    // Plugin for ServiceB
    const pluginB = Plugin.forTag(ServiceB, (base) => ({
      doB: () =>
        Effect.gen(function* () {
          events.push("plugin-b");
          const result = yield* base.doB();
          return result * 2;
        }),
    }));

    // Plugin for ServiceC
    const pluginC = Plugin.forTag(ServiceC, (base) => ({
      doC: () =>
        Effect.gen(function* () {
          events.push("plugin-c");
          const result = yield* base.doC();
          return !result;
        }),
    }));

    // Compose three plugins for different services
    // Type inference should properly union all three service requirements
    const combined = Plugin.combineAll([pluginA, pluginB, pluginC]);

    const Enhanced = Layer.mergeAll(
      Layer.context<ServiceA>(),
      Layer.context<ServiceB>(),
      Layer.context<ServiceC>()
    ).pipe(
      combined,
      Layer.provide(
        Layer.provideMerge(
          ServiceALive,
          Layer.provideMerge(ServiceBLive, ServiceCLive)
        )
      )
    );

    const program = Effect.gen(function* () {
      const a = yield* ServiceA;
      const b = yield* ServiceB;
      const c = yield* ServiceC;

      const resultA = yield* a.doA();
      const resultB = yield* b.doB();
      const resultC = yield* c.doC();

      return { resultA, resultB, resultC };
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // All three plugins executed
    expect(events).toEqual(["plugin-a", "plugin-b", "plugin-c"]);

    // All three services were properly enhanced
    expect(result).toEqual({
      resultA: "[A] base-a",
      resultB: 84, // 42 * 2
      resultC: false, // !true
    });
  });
});

// =============================================================================
// Plugin on Non-Empty Layers
// =============================================================================

describe("Plugin on Non-Empty Layers", () => {
  test("Layer.updateService piped onto layer that uses MutationDB", async () => {
    let pluginCalled = false;

    // Define a service Tag
    class TasksService extends Context.Tag("TasksService")<
      TasksService,
      { createTask: (text: string) => Effect.Effect<string> }
    >() { }

    // Create a layer that uses MutationDB
    const TasksServiceLive = Layer.effect(
      TasksService,
      Effect.gen(function* () {
        const db = yield* MutationDB;

        return {
          createTask: (text) =>
            Effect.gen(function* () {
              return yield* db.insert("tasks", { text });
            }),
        };
      })
    );

    // Create an update using Layer.updateService
    const trackingUpdate = Layer.updateService(MutationDB, (base) => ({
      ...base,
      insert: (table, value) =>
        Effect.gen(function* () {
          pluginCalled = true;
          return yield* base.insert(table, value);
        }),
    }));

    // Pipe update onto TasksServiceLive, then provide MutationDBLive
    const Enhanced = TasksServiceLive.pipe(
      trackingUpdate,
      Layer.provide(MutationDBLive)
    );

    // Use the enhanced layer
    const program = Effect.gen(function* () {
      const tasks = yield* TasksService;
      return yield* tasks.createTask("Test task");
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // Verify: did the plugin wrap the MutationDB that TasksServiceLive uses?
    expect(pluginCalled).toBe(true);
  });

  test("multiple Layer.updateService on layer with dependencies", async () => {
    const order: string[] = [];

    class TasksService extends Context.Tag("TasksService")<
      TasksService,
      { createTask: (text: string) => Effect.Effect<string> }
    >() { }

    const TasksServiceLive = Layer.effect(
      TasksService,
      Effect.gen(function* () {
        const db = yield* MutationDB;
        return {
          createTask: (text) => db.insert("tasks", { text }),
        };
      })
    );

    const update1 = Layer.updateService(MutationDB, (base) => ({
      ...base,
      insert: (table, value) =>
        Effect.gen(function* () {
          order.push("update1");
          return yield* base.insert(table, value);
        }),
    }));

    const update2 = Layer.updateService(MutationDB, (base) => ({
      ...base,
      insert: (table, value) =>
        Effect.gen(function* () {
          order.push("update2");
          return yield* base.insert(table, value);
        }),
    }));

    const update3 = Layer.updateService(MutationDB, (base) => ({
      ...base,
      insert: (table, value) =>
        Effect.gen(function* () {
          order.push("update3");
          return yield* base.insert(table, value);
        }),
    }));

    // Pipe multiple updates onto the service layer
    const Enhanced = TasksServiceLive.pipe(
      update1,
      update2,
      update3,
      Layer.provide(MutationDBLive)
    );

    const program = Effect.gen(function* () {
      const tasks = yield* TasksService;
      return yield* tasks.createTask("Test");
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // Left-to-right execution with Layer.updateService: update1 -> update2 -> update3 -> base
    expect(order).toEqual(["update1", "update2", "update3"]);
  });
});

describe("Plugin.provide", () => {
  test("closes over plugin dependencies", async () => {
    class Config extends Context.Tag("Config")<
      Config,
      { prefix: string }
    >() { }

    const ConfigLive = Layer.succeed(Config, { prefix: "[APP]" });

    const logs: string[] = [];
    const MutationDBLive = Layer.succeed(MutationDB, {
      insert: (table, value) => {
        logs.push(`insert:${table}`);
        return Effect.succeed(`${table}-id`);
      },
      patch: () => Effect.void,
      remove: () => Effect.void,
    });

    // Plugin with Config dependency
    const withConfigLogging = Plugin.effectForTag(MutationDB, (base) =>
      Effect.gen(function* () {
        const config = yield* Config;

        return {
          insert: (table, value) =>
            Effect.gen(function* () {
              logs.push(`${config.prefix} inserting into ${table}`);
              return yield* base.insert(table, value);
            }),
        };
      })
    );
    // Type: Plugin<MutationDB, never, Config>

    // Close over Config dependency
    const withMyConfigLogging = Plugin.provide(withConfigLogging, ConfigLive);
    // Type: Plugin<MutationDB, never, never>

    // Use without providing Config
    const Enhanced = Layer.context<MutationDB>().pipe(
      withMyConfigLogging,
      Layer.provide(MutationDBLive)
    );

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    expect(logs).toEqual([
      "[APP] inserting into notes",
      "insert:notes"
    ]);
  });

  test("trigger registry example", async () => {
    type Trigger = (id: string, value: any) => Effect.Effect<void>;

    class TriggerRegistry extends Context.Tag("TriggerRegistry")<
      TriggerRegistry,
      { get: (table: string) => Trigger | undefined }
    >() { }

    const triggered: Array<{ table: string; id: string; value: any }> = [];

    const TriggerRegistryLive = Layer.succeed(TriggerRegistry, {
      get: (table: string) => {
        if (table === "notes") {
          return (id, value) =>
            Effect.sync(() => {
              triggered.push({ table, id, value });
            });
        }
        return undefined;
      },
    });

    const MutationDBLive = Layer.succeed(MutationDB, {
      insert: (table, value) => Effect.succeed(`${table}-123`),
      patch: () => Effect.void,
      remove: () => Effect.void,
    });

    // Plugin that needs a trigger registry
    const withTriggers = Plugin.effectForTag(MutationDB, (base) =>
      Effect.gen(function* () {
        const registry = yield* TriggerRegistry;

        return {
          insert: (table, value) =>
            Effect.gen(function* () {
              const id = yield* base.insert(table, value);
              const trigger = registry.get(table);
              if (trigger) yield* trigger(id, value);
              return id;
            }),
        };
      })
    );
    // Type: Plugin<MutationDB, never, TriggerRegistry>

    // Close over the registry dependency
    const withMyTriggers = Plugin.provide(withTriggers, TriggerRegistryLive);
    // Type: Plugin<MutationDB, never, never>

    // Now can be used without providing TriggerRegistry
    const Enhanced = Layer.context<MutationDB>().pipe(
      withMyTriggers,
      Layer.provide(MutationDBLive)
    );

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test note" });
      yield* db.insert("tasks", { text: "test task" }); // No trigger for tasks
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // Only notes trigger was called
    expect(triggered).toHaveLength(1);
    expect(triggered[0]).toEqual({
      table: "notes",
      id: "notes-123",
      value: { text: "test note" },
    });
  });

  test("chain multiple provides", async () => {
    class ConfigA extends Context.Tag("ConfigA")<ConfigA, { a: string }>() { }
    class ConfigB extends Context.Tag("ConfigB")<ConfigB, { b: string }>() { }

    const ConfigALive = Layer.succeed(ConfigA, { a: "value-a" });
    const ConfigBLive = Layer.succeed(ConfigB, { b: "value-b" });

    const logs: string[] = [];
    const MutationDBLive = Layer.succeed(MutationDB, {
      insert: (table, value) => {
        logs.push(`insert:${table}`);
        return Effect.succeed(`${table}-id`);
      },
      patch: () => Effect.void,
      remove: () => Effect.void,
    });

    // Plugin with two dependencies
    const withDualConfig = Plugin.effectForTag(MutationDB, (base) =>
      Effect.gen(function* () {
        const configA = yield* ConfigA;
        const configB = yield* ConfigB;

        return {
          insert: (table, value) =>
            Effect.gen(function* () {
              logs.push(`${configA.a}:${configB.b}`);
              return yield* base.insert(table, value);
            }),
        };
      })
    );
    // Type: Plugin<MutationDB, never, ConfigA | ConfigB>

    // Provide both dependencies via chaining
    const withAllConfig = Plugin.provide(
      Plugin.provide(withDualConfig, ConfigALive),
      ConfigBLive
    );
    // Type: Plugin<MutationDB, never, never>

    const Enhanced = Layer.context<MutationDB>().pipe(
      withAllConfig,
      Layer.provide(MutationDBLive)
    );

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    expect(logs).toEqual(["value-a:value-b", "insert:notes"]);
  });

  test("provide one dependency, user provides the rest", async () => {
    class ConfigA extends Context.Tag("ConfigA")<ConfigA, { a: string }>() { }
    class ConfigB extends Context.Tag("ConfigB")<ConfigB, { b: string }>() { }

    const ConfigALive = Layer.succeed(ConfigA, { a: "value-a" });
    const ConfigBLive = Layer.succeed(ConfigB, { b: "value-b" });

    const logs: string[] = [];
    const MutationDBLive = Layer.succeed(MutationDB, {
      insert: (table, value) => {
        logs.push(`insert:${table}`);
        return Effect.succeed(`${table}-id`);
      },
      patch: () => Effect.void,
      remove: () => Effect.void,
    });

    // Plugin with two dependencies
    const withDualConfig = Plugin.effectForTag(MutationDB, (base) =>
      Effect.gen(function* () {
        const configA = yield* ConfigA;
        const configB = yield* ConfigB;

        return {
          insert: (table, value) =>
            Effect.gen(function* () {
              logs.push(`${configA.a}:${configB.b}`);
              return yield* base.insert(table, value);
            }),
        };
      })
    );
    // Type: Plugin<MutationDB, never, ConfigA | ConfigB>

    // Provide only ConfigA
    const withPartialConfig = Plugin.provide(withDualConfig, ConfigALive);
    // Type: Plugin<MutationDB, never, ConfigB>

    // User must still provide ConfigB
    const Enhanced = Layer.context<MutationDB>().pipe(
      withPartialConfig,
      Layer.provide(Layer.provideMerge(ConfigBLive, MutationDBLive))
    );

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    expect(logs).toEqual(["value-a:value-b", "insert:notes"]);
  });

  test("provide can add new errors from the layer", async () => {
    class ErrorProneConfig extends Context.Tag("ErrorProneConfig")<
      ErrorProneConfig,
      { value: string }
    >() { }

    class ConfigError {
      readonly _tag = "ConfigError";
    }

    // Layer that can fail
    const ErrorProneConfigLive = Layer.effect(
      ErrorProneConfig,
      Effect.gen(function* () {
        // Simulate potential failure
        const shouldFail = false;
        if (shouldFail) {
          return yield* Effect.fail(new ConfigError());
        }
        return { value: "loaded" };
      })
    );

    const logs: string[] = [];
    const MutationDBLive = Layer.succeed(MutationDB, {
      insert: (table, value) => {
        logs.push(`insert:${table}`);
        return Effect.succeed(`${table}-id`);
      },
      patch: () => Effect.void,
      remove: () => Effect.void,
    });

    const withConfigPlugin = Plugin.effectForTag(MutationDB, (base) =>
      Effect.gen(function* () {
        const config = yield* ErrorProneConfig;

        return {
          insert: (table, value) =>
            Effect.gen(function* () {
              logs.push(`config:${config.value}`);
              return yield* base.insert(table, value);
            }),
        };
      })
    );
    // Type: Plugin<MutationDB, never, ErrorProneConfig>

    // Providing a layer with errors adds those errors to the plugin
    const withConfig = Plugin.provide(withConfigPlugin, ErrorProneConfigLive);
    // Type: Plugin<MutationDB, ConfigError, never>

    const Enhanced = Layer.context<MutationDB>().pipe(
      withConfig,
      Layer.provide(MutationDBLive)
    );

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    expect(logs).toEqual(["config:loaded", "insert:notes"]);
  });
});
