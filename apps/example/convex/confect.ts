import {
  QueryDB as $QueryDB,
  type ConfectDataModelFromConfectSchemaDefinition,
  type DataModelFromConfectDataModel,
  type GenericConfectDoc,
  GenericId,
  makeConfectFunctions,
  type TableNamesInConfectDataModel
} from "@rjdellecese/confect/server";

import { confectSchema } from "./schema";

export const {
  confectQuery,
  confectInternalQuery,
  confectMutation,
  confectInternalMutation,
  confectAction,
  confectInternalAction,
} = makeConfectFunctions(confectSchema);
type ConfectSchema = typeof confectSchema.confectSchema
type ConfectSchemaDefinition = typeof confectSchema;
type ConfectDataModel =
  ConfectDataModelFromConfectSchemaDefinition<ConfectSchemaDefinition>;

type TableNames = TableNamesInConfectDataModel<ConfectDataModel>;

export type ConfectDoc<TableName extends TableNames> = GenericConfectDoc<
  ConfectDataModel,
  TableName
>;

export const Id = <TableName extends TableNames>(tableName: TableName) =>
  GenericId<TableName>(tableName);
export type Id<TableName extends TableNames> = GenericId<TableName>;



export {
  ConfectActionRunner,
  ConfectAuth,
  ConfectMutationRunner,
  ConfectQueryRunner,
  ConfectScheduler,
  ConfectStorageActionWriter,
  ConfectStorageReader,
  ConfectStorageWriter,
  ConfectVectorSearch
} from "@rjdellecese/confect/server";

type DataModel = DataModelFromConfectDataModel<ConfectDataModel>;

export const QueryDB = $QueryDB.Typed<ConfectSchema>()