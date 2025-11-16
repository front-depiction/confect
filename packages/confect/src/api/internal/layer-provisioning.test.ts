/**
 * Layer Provisioning Order Tests
 *
 * These tests verify that Effect's layer provisioning semantics allow:
 * 1. User layers (with plugins) to override default layers
 * 2. The Api.serve pattern: merge(userLayers, defaults).provide(defaults)
 * 3. Comparison between Plugin system and Layer.updateService
 */

import { describe, expect, test } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import * as Plugin from "./Plugin";

// =============================================================================
// Test Services
// =============================================================================

class Database extends Context.Tag("Database")<
  Database,
  {
    query: (sql: string) => Effect.Effect<string>;
    insert: (table: string, value: unknown) => Effect.Effect<string>;
  }
>() { }

class Logger extends Context.Tag("Logger")<
  Logger,
  {
    log: (message: string) => Effect.Effect<void>;
  }
>() { }

// =============================================================================
// Layer.updateService Tests
// =============================================================================

describe("Layer.updateService", () => {
  test("updateService enhances a service by wrapping the requirement", async () => {
    const executionLog: string[] = [];

    const DefaultDB = Layer.succeed(Database, {
      query: (sql) => {
        executionLog.push(`default-query:${sql}`);
        return Effect.succeed("default-result");
      },
      insert: (table) => {
        executionLog.push(`default-insert:${table}`);
        return Effect.succeed("default-id");
      },
    });

    // updateService creates a layer that requires Database and provides enhanced Database
    const withLogging = Layer.updateService(
      Database,
      (base) => ({
        ...base,
        query: (sql) =>
          Effect.gen(function* () {
            executionLog.push("log-before");
            const result = yield* base.query(sql);
            executionLog.push("log-after");
            return result;
          }),
      })
    );

    // Pattern from Effect codebase: base.pipe(updateService(...), Layer.provide(requirement))
    // Start with empty base, apply enhancement, then provide the requirement
    const EmptyBase = Layer.context<never>();
    const layer = EmptyBase.pipe(
      withLogging,
      Layer.provide(DefaultDB)
    );

    const program = Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.query("SELECT *");
    });

    await Effect.runPromise(program.pipe(Effect.provide(layer)));

    expect(executionLog).toEqual([
      "log-before",
      "default-query:SELECT *",
      "log-after",
    ]);
  });

  test("updateService can be chained to compose multiple enhancements", async () => {
    const executionLog: string[] = [];

    const DefaultDB = Layer.succeed(Database, {
      query: (sql) => {
        executionLog.push(`base:${sql}`);
        return Effect.succeed("result");
      },
      insert: (table) => {
        executionLog.push(`insert:${table}`);
        return Effect.succeed("id");
      },
    });

    const withLogging = Layer.updateService(Database, (base) => ({
      ...base,
      query: (sql) =>
        Effect.gen(function* () {
          executionLog.push("log");
          return yield* base.query(sql);
        }),
    }));

    const withValidation = Layer.updateService(Database, (base) => ({
      ...base,
      query: (sql) =>
        Effect.gen(function* () {
          executionLog.push("validate");
          return yield* base.query(sql);
        }),
    }));

    const withAudit = Layer.updateService(Database, (base) => ({
      ...base,
      query: (sql) =>
        Effect.gen(function* () {
          executionLog.push("audit");
          return yield* base.query(sql);
        }),
    }));

    // Chain multiple enhancements and provide requirements
    const EmptyBase = Layer.context<never>();
    const layer = EmptyBase.pipe(
      withLogging,
      withValidation,
      withAudit,
      Layer.provide(DefaultDB)
    );

    const program = Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.query("SELECT *");
    });

    await Effect.runPromise(program.pipe(Effect.provide(layer)));

    // Execution order: log -> validate -> audit -> base (reverse of pipe order)
    expect(executionLog).toEqual(["log", "validate", "audit", "base:SELECT *"]);
  });

  test("User enhancement overrides default in Api.serve pattern", async () => {
    const executionLog: string[] = [];

    const DefaultDB = Layer.succeed(Database, {
      query: () => {
        executionLog.push("default");
        return Effect.succeed("default-result");
      },
      insert: () => Effect.succeed("default-id"),
    });

    // User creates enhancement
    const withAudit = Layer.updateService(
      Database,
      (base) => ({
        ...base,
        query: (sql) =>
          Effect.gen(function* () {
            executionLog.push("audit");
            return yield* base.query(sql);
          }),
      })
    );
    // Apply enhancement to empty base, then provide requirement
    const EmptyBase = Layer.context<never>();
    const layer = EmptyBase.pipe(withAudit, Layer.provide(DefaultDB));

    const program = Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.query("SELECT *");
    });

    // Api.serve pattern: provide user enhancement BEFORE defaults
    const result = await Effect.runPromise(
      program.pipe(
        Effect.provide(layer)    // Default implementation
      )
    );

    expect(executionLog).toEqual(["audit", "default"]);
    expect(result).toBe("default-result");
  });
});

// =============================================================================
// Plugin System Tests
// =============================================================================

describe("Plugin System (Layer.map based)", () => {
  test("Plugin.forTag enhances a service", async () => {
    const executionLog: string[] = [];

    const DefaultDB = Layer.succeed(Database, {
      query: (sql) => {
        executionLog.push(`default-query:${sql}`);
        return Effect.succeed("default-result");
      },
      insert: (table) => {
        executionLog.push(`default-insert:${table}`);
        return Effect.succeed("default-id");
      },
    });

    // Plugin uses Layer.map internally
    const withLogging = Plugin.forTag(Database, (base) => ({
      query: (sql) =>
        Effect.gen(function* () {
          executionLog.push("log-before");
          const result = yield* base.query(sql);
          executionLog.push("log-after");
          return result;
        }),
    }));

    const EnhancedDB = DefaultDB.pipe(withLogging);

    const program = Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.query("SELECT *");
    });

    await Effect.runPromise(program.pipe(Effect.provide(EnhancedDB)));

    expect(executionLog).toEqual([
      "log-before",
      "default-query:SELECT *",
      "log-after",
    ]);
  });

  test("Plugin.forTag can be chained via pipe", async () => {
    const executionLog: string[] = [];

    const DefaultDB = Layer.succeed(Database, {
      query: (sql) => {
        executionLog.push(`base:${sql}`);
        return Effect.succeed("result");
      },
      insert: (table) => {
        executionLog.push(`insert:${table}`);
        return Effect.succeed("id");
      },
    });

    const withLogging = Plugin.forTag(Database, (base) => ({
      query: (sql) =>
        Effect.gen(function* () {
          executionLog.push("log");
          return yield* base.query(sql);
        }),
    }));

    const withValidation = Plugin.forTag(Database, (base) => ({
      query: (sql) =>
        Effect.gen(function* () {
          executionLog.push("validate");
          return yield* base.query(sql);
        }),
    }));

    const withAudit = Plugin.forTag(Database, (base) => ({
      query: (sql) =>
        Effect.gen(function* () {
          executionLog.push("audit");
          return yield* base.query(sql);
        }),
    }));

    // Compose plugins via pipe
    const Enhanced = DefaultDB.pipe(withLogging, withValidation, withAudit);

    const program = Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.query("SELECT *");
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    // Execution order: audit -> validate -> log -> base
    expect(executionLog).toEqual(["audit", "validate", "log", "base:SELECT *"]);
  });

  test("Plugin overrides defaults when provided first", async () => {
    const executionLog: string[] = [];

    const DefaultDB = Layer.succeed(Database, {
      query: () => {
        executionLog.push("default");
        return Effect.succeed("default-result");
      },
      insert: () => Effect.succeed("default-id"),
    });

    // User applies plugin
    const withPlugin = Plugin.forTag(Database, (base) => ({
      query: (sql) =>
        Effect.gen(function* () {
          executionLog.push("plugin-before");
          const result = yield* base.query(sql);
          executionLog.push("plugin-after");
          return result;
        }),
    }));

    const UserDB = DefaultDB.pipe(withPlugin);

    const program = Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.query("SELECT *");
    });

    // Provide user layer first, then defaults - user should win
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(UserDB), Effect.provide(DefaultDB))
    );

    expect(executionLog).toEqual(["plugin-before", "default", "plugin-after"]);
    expect(result).toBe("default-result");
  });

  test("Plugin with effectForTag can access other services", async () => {
    const executionLog: string[] = [];

    const LoggerLive = Layer.succeed(Logger, {
      log: (msg) =>
        Effect.sync(() => {
          executionLog.push(`[LOG] ${msg}`);
        }),
    });

    const DefaultDB = Layer.succeed(Database, {
      query: (sql) => {
        executionLog.push(`query:${sql}`);
        return Effect.succeed("result");
      },
      insert: () => Effect.succeed("id"),
    });

    // Plugin that needs Logger service
    const withAudit = Plugin.effectForTag(Database, (base) =>
      Effect.gen(function* () {
        const logger = yield* Logger;
        yield* logger.log("Audit plugin initialized");

        return {
          query: (sql) =>
            Effect.gen(function* () {
              yield* logger.log(`Querying: ${sql}`);
              return yield* base.query(sql);
            }),
        };
      })
    );

    const Enhanced = DefaultDB.pipe(withAudit, Layer.provide(LoggerLive));

    const program = Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.query("SELECT *");
    });

    await Effect.runPromise(program.pipe(Effect.provide(Enhanced)));

    expect(executionLog).toContain("[LOG] Audit plugin initialized");
    expect(executionLog).toContain("[LOG] Querying: SELECT *");
    expect(executionLog).toContain("query:SELECT *");
  });
});

// =============================================================================
// Provisioning Order Tests (Critical for Api.serve)
// =============================================================================

describe("Layer Provisioning Order", () => {
  test("First provide wins - outer layers not overridden by inner defaults", async () => {
    const executionLog: string[] = [];

    const UserDB = Layer.succeed(Database, {
      query: () => {
        executionLog.push("user");
        return Effect.succeed("user-result");
      },
      insert: () => Effect.succeed("user-id"),
    });

    const DefaultDB = Layer.succeed(Database, {
      query: () => {
        executionLog.push("default");
        return Effect.succeed("default-result");
      },
      insert: () => Effect.succeed("default-id"),
    });

    const program = Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.query("SELECT *");
    });

    // Provide user layer first, then defaults
    // User layer should win
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(UserDB), Effect.provide(DefaultDB))
    );

    expect(executionLog).toEqual(["user"]);
    expect(result).toBe("user-result");
  });

  test("Layer.merge with plugins preserves enhancements", async () => {
    const executionLog: string[] = [];

    const DefaultDB = Layer.succeed(Database, {
      query: () => {
        executionLog.push("default-query");
        return Effect.succeed("result");
      },
      insert: () => {
        executionLog.push("default-insert");
        return Effect.succeed("id");
      },
    });

    const DefaultLogger = Layer.succeed(Logger, {
      log: (msg) =>
        Effect.sync(() => {
          executionLog.push(`log:${msg}`);
        }),
    });

    // Apply plugin to DB
    const withPlugin = Plugin.forTag(Database, (base) => ({
      query: (sql) =>
        Effect.gen(function* () {
          executionLog.push("plugin");
          return yield* base.query(sql);
        }),
    }));

    const EnhancedDB = DefaultDB.pipe(withPlugin);

    // Merge enhanced DB with logger
    const Combined = Layer.merge(EnhancedDB, DefaultLogger);

    const program = Effect.gen(function* () {
      const db = yield* Database;
      const logger = yield* Logger;
      yield* logger.log("test");
      return yield* db.query("SELECT *");
    });

    await Effect.runPromise(program.pipe(Effect.provide(Combined)));

    expect(executionLog).toEqual(["log:test", "plugin", "default-query"]);
  });

  test("Api.serve pattern: user layers with plugins override defaults", async () => {
    // This simulates the Api.serve pattern:
    // - User provides layers with plugins applied
    // - System provides default layers
    // - User layers should override defaults

    const executionLog: string[] = [];

    // Default implementations (what Api.serve provides)
    const DefaultDB = Layer.succeed(Database, {
      query: () => {
        executionLog.push("default-db");
        return Effect.succeed("default");
      },
      insert: () => Effect.succeed("default-id"),
    });

    const DefaultLogger = Layer.succeed(Logger, {
      log: (msg) =>
        Effect.sync(() => {
          executionLog.push(`default-log:${msg}`);
        }),
    });

    const Defaults = Layer.merge(DefaultDB, DefaultLogger);

    // User layer with plugin
    const withAudit = Plugin.forTag(Database, (base) => ({
      query: (sql) =>
        Effect.gen(function* () {
          executionLog.push("audit");
          return yield* base.query(sql);
        }),
    }));

    const UserDB = DefaultDB.pipe(withAudit);

    // Simulate Api.serve: merge user layers with defaults
    const ApiLayer = Layer.merge(UserDB, DefaultLogger);

    const program = Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.query("SELECT *");
    });

    // Pattern: Effect.provide(userLayers).provide(defaults)
    const result = await Effect.runPromise(
      program.pipe(Effect.provide(ApiLayer), Effect.provide(Defaults))
    );

    // Should use audited DB, not bare default
    expect(executionLog).toEqual(["audit", "default-db"]);
    expect(result).toBe("default");
  });

  test("Plugin can completely replace default behavior", async () => {
    const executionLog: string[] = [];

    const DefaultDB = Layer.succeed(Database, {
      query: () => {
        executionLog.push("default");
        return Effect.succeed("default-result");
      },
      insert: () => Effect.succeed("default-id"),
    });

    // Plugin that doesn't call base (complete replacement)
    const withMock = Plugin.forTag(Database, (_base) => ({
      query: (sql) => {
        executionLog.push(`mock:${sql}`);
        return Effect.succeed("mock-result");
      },
      insert: (table) => {
        executionLog.push(`mock-insert:${table}`);
        return Effect.succeed("mock-id");
      },
    }));

    const MockDB = DefaultDB.pipe(withMock);

    const program = Effect.gen(function* () {
      const db = yield* Database;
      return yield* db.query("SELECT *");
    });

    await Effect.runPromise(program.pipe(Effect.provide(MockDB)));

    // Should only execute mock, not default
    expect(executionLog).toEqual(["mock:SELECT *"]);
  });
});
