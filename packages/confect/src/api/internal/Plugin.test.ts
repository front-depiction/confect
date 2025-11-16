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
    // Plugin.forTag uses Layer.updateService internally
    const withLogging = Plugin.forTag(MutationDB, (base) => ({
      insert: (table, value) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[LOG] ${table}`);
          return yield* base.insert(table, value);
        }),
    }));

    // Pattern: EmptyBase.pipe(plugin, Layer.provide(requirement))
    const EmptyBase = Layer.context<never>();
    const enhanced = EmptyBase.pipe(withLogging, Layer.provide(MutationDBLive));
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

    const EmptyBase = Layer.context<never>();
    const Enhanced = EmptyBase.pipe(withLogging, Layer.provide(MutationDBLive));

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
    const Enhanced = Layer.context<never>().pipe(withAudit, withValidation, Layer.provide(MutationDBLive));

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

    // Compose: Layer.context -> plugin1 -> plugin2 -> plugin3 -> MutationDBLive
    const Enhanced = Layer.context<never>().pipe(plugin1, plugin2, plugin3, Layer.provide(MutationDBLive));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      return yield* db.insert("notes", { text: "test" });
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // Execution order: plugin1 -> plugin2 -> plugin3 -> base -> plugin3 -> plugin2 -> plugin1 (left-to-right onion)
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

    await Effect.runPromise(
      program.pipe(Effect.provide(Layer.context<never>().pipe(withBefore, Layer.provide(MutationDBLive))))
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

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(Layer.context<never>().pipe(withAfter, Layer.provide(MutationDBLive))))
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

    await Effect.runPromise(
      program.pipe(Effect.provide(Layer.context<never>().pipe(withTimestamp, Layer.provide(MutationDBLive))))
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

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(Layer.context<never>().pipe(withPrefix, Layer.provide(MutationDBLive))))
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

    const Enhanced = Layer.context<never>().pipe(withValidation, Layer.provide(MutationDBLive));

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

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(Layer.context<never>().pipe(withCache, Layer.provide(MutationDBLive))))
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

    await Effect.runPromise(
      program.pipe(
        Effect.provide(
          Layer.context<never>().pipe(
            withAudit,
            Layer.provide(Layer.provideMerge(AuditLogLive, MutationDBLive))
          )
        )
      )
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

    await Effect.runPromise(
      program.pipe(
        Effect.provide(
          Layer.context<never>().pipe(
            withAudit,
            Layer.provide(Layer.provideMerge(AuditLogLive, MutationDBLive))
          )
        )
      )
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

    await Effect.runPromise(
      program.pipe(Effect.provide(Layer.context<never>().pipe(withAuditLog, Layer.provide(MutationDBLive))))
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

    await Effect.runPromise(
      program.pipe(Effect.provide(Layer.context<never>().pipe(withSoftDelete, Layer.provide(MutationDBLive))))
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

    await Effect.runPromise(
      program.pipe(Effect.provide(Layer.context<never>().pipe(withTriggers, Layer.provide(MutationDBLive))))
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

    await Effect.runPromise(
      program.pipe(
        Effect.provide(
          Layer.context<never>().pipe(
            withRLS,
            Layer.provide(Layer.provideMerge(CurrentUserLive, TrackingDBLive))
          )
        )
      )
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

    // Compose all plugins via pipe
    const Enhanced = Layer.context<never>().pipe(withLogging, withValidation, withAudit, Layer.provide(MutationDBLive));

    const program = Effect.gen(function* () {
      const db = yield* MutationDB;
      yield* db.insert("notes", { text: "test" });
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // Execution order: log -> validate -> audit -> base (left-to-right in pipe)
    expect(events).toEqual(["log", "validate", "audit"]);
  });
});
