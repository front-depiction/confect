import {
  ConvexActionCtx,
  ConvexMutationCtx,
  ConvexQueryCtx,
} from "../../src/server/ctx";
import type {
  GenericConfectDoc as ConfectDocType,
  DataModelFromConfectDataModel,
  TableNamesInConfectDataModel,
} from "../../src/server/data_model";
import { makeConfectFunctions } from "../../src/server/functions";
import type { ConfectDataModelFromConfectSchemaDefinition } from "../../src/server/schema";
import { GenericId } from "../../src/server/schemas/GenericId";
import { confectSchema } from "../convex/schema";

export const {
  confectQuery,
  confectInternalQuery,
  confectMutation,
  confectInternalMutation,
  confectAction,
  confectInternalAction,
  QueryDB,
  MutationDB,
} = makeConfectFunctions(confectSchema);

type ConfectSchema = typeof confectSchema;

type ConfectDataModel =
  ConfectDataModelFromConfectSchemaDefinition<ConfectSchema>;

type TableNames = TableNamesInConfectDataModel<ConfectDataModel>;

export type ConfectDoc<TableName extends TableNames> = ConfectDocType<
  ConfectDataModel,
  TableName
>;

export const Id = <TableName extends TableNames>(tableName: TableName) =>
  GenericId<TableName>(tableName);
export type Id<TableName extends TableNames> = GenericId<TableName>;

export type ConfectDatabaseReader = typeof QueryDB.Type;
export type ConfectDatabaseWriter = typeof MutationDB.Type;

export { ConfectAuth } from "../../src/server/auth";
export {
  ConfectActionRunner,
  ConfectMutationRunner,
  ConfectQueryRunner,
} from "../../src/server/runners";
export { ConfectScheduler } from "../../src/server/scheduler";
export {
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
} from "../../src/server/storage";
export { ConfectVectorSearch } from "../../src/server/vector_search";

type DataModel = DataModelFromConfectDataModel<ConfectDataModel>;

export const QueryCtx = ConvexQueryCtx<DataModel>;
export type QueryCtx = typeof QueryCtx.Type;
export const MutationCtx = ConvexMutationCtx<DataModel>;
export type MutationCtx = typeof MutationCtx.Type;
export const ActionCtx = ConvexActionCtx<DataModel>;
export type ActionCtx = typeof ActionCtx.Type;
