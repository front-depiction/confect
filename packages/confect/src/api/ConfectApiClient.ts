import { ConvexReactClient } from "convex/react";
import { FunctionReference } from "convex/server";
import { Effect, Record, Schema } from "effect";
import type {
  ApiClient,
  GenericConfectApi,
  GenericConfectApiGroup,
} from "./data_model";
import * as ConfectApiFunctionPath from "./ConfectApiFunctionPath";

export type ConfectApiClient<Api extends GenericConfectApi> = ApiClient<Api>;

export const make = <Api extends GenericConfectApi>(
  confectApi: Api & {
    readonly groups: Record.ReadonlyRecord<string, GenericConfectApiGroup>;
  },
  convexReactClient: ConvexReactClient
): ConfectApiClient<Api> =>
  Record.map(confectApi.groups, (group) =>
    Record.map(
      group.functions,
      (function_) => (args: unknown) =>
        Effect.gen(function* () {
          const encodedArgs = yield* Schema.encodeUnknown(function_.args)(args);

          // API boundary cast: Convex expects FunctionReference<"public", any, any> which is a
          // branded string type. ConfectApiFunctionPath.make returns a string with the correct
          // format ("groupName.functionName"), but TypeScript cannot verify the brand matches.
          // This is a legitimate API boundary between Confect's type system and Convex's runtime.
          // Safe because: (1) path format matches Convex's expectations, (2) Convex performs
          // runtime validation, (3) we're calling registered functions from the same schema.
          const path = ConfectApiFunctionPath.make(
            group.name,
            function_.name
          ) as unknown as FunctionReference<any, any>;

          const result = yield* Effect.promise(() =>
            convexReactClient.query(path, encodedArgs)
          );

          const decodedResult = yield* Schema.decodeUnknown(function_.returns)(
            result
          );

          return decodedResult;
        })
    )
  // Record.map preserves the structure of Api["groups"] but returns ReadonlyRecord with
  // generic value types. TypeScript cannot infer the precise nested function signatures
  // through the double Record.map transformation. This cast is safe because:
  // 1. Outer Record.map preserves group structure from Api["groups"]
  // 2. Inner Record.map preserves function structure from each group.functions
  // 3. The lambda correctly types args/returns from function_.args/returns schemas
  // 4. The resulting structure exactly matches ConfectApiClient<Api> by construction
  ) as ConfectApiClient<Api>;
