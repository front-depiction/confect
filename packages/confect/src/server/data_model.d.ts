import type {
  GenericDocument,
  GenericFieldPaths,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
} from "convex/server";
import type { Schema } from "effect";
import type { ReadonlyRecord } from "effect/Record";
import type { ReadonlyValue } from "./schema_to_validator";
import type { WithSystemFields } from "./schemas/SystemFields";



export type GenericConfectDocumentWithSystemFields = WithSystemFields<
  string,
  GenericConfectDoc<any, any>
>;

export type GenericEncodedConfectDocument = ReadonlyRecord<
  string,
  ReadonlyValue
>;

export type ConfectDocumentByName<
  ConfectDataModel extends GenericConfectDataModel,
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = ConfectDataModel[TableName]["confectDocument"];

export type GenericConfectDataModel = Record<string, GenericConfectTableInfo>;

export type DataModelFromConfectDataModel<
  ConfectDataModel extends GenericConfectDataModel,
> = {
  [TableName in keyof ConfectDataModel & string]: TableInfoFromConfectTableInfo<
    ConfectDataModel[TableName]
  >;
};

export type TableNamesInConfectDataModel<
  ConfectDataModel extends GenericConfectDataModel,
> = keyof ConfectDataModel & string;

export type TableInfoFromConfectTableInfo<
  ConfectTableInfo extends GenericConfectTableInfo,
> = {
  document: ConfectTableInfo["convexDocument"];
  fieldPaths: ConfectTableInfo["fieldPaths"];
  indexes: ConfectTableInfo["indexes"];
  searchIndexes: ConfectTableInfo["searchIndexes"];
  vectorIndexes: ConfectTableInfo["vectorIndexes"];
};

export type GenericConfectTableInfo = {
  confectDocument: GenericConfectDoc<any, any>;
  encodedConfectDocument: GenericEncodedConfectDocument;
  convexDocument: GenericDocument;
  fieldPaths: GenericFieldPaths;
  indexes: GenericTableIndexes;
  searchIndexes: GenericTableSearchIndexes;
  vectorIndexes: GenericTableVectorIndexes;
};

export type TableSchemaFromConfectTableInfo<
  ConfectTableInfo extends GenericConfectTableInfo,
> = Schema.Schema<
  ConfectTableInfo["confectDocument"],
  ConfectTableInfo["encodedConfectDocument"]
>;

/**
 * The Confect document encoded for storage in Convex. This is the data as it is stored in the database.
 */
export type GenericConfectDoc<
  ConfectDataModel extends GenericConfectDataModel,
  TableName extends TableNamesInConfectDataModel<ConfectDataModel>,
> = ConfectDataModel[TableName]["encodedConfectDocument"];

export type ConvexDataModel<ConfectSchema extends GenericConfectSchemaDefinition> =
  DataModelFromConfectDataModel<
    ConfectDataModelFromConfectSchemaDefinition<ConfectSchema>
  >;

// ===========================
// Type Aliases for Extraction from Schema (S)
// ===========================
// These are the primary aliases - everything derives from GenericConfectSchema

/**
 * Extract ConfectDataModel from Schema.
 * This is the primary type-level transformation of the schema.
 */
export type ConfectDataModelFromSchema<
  S extends GenericConfectSchema
> = ConfectDataModelFromConfectSchemaDefinition<ConfectSchemaDefinition<S>>;

/**
 * Extract table names from Schema.
 */
export type TableNamesFromSchema<
  S extends GenericConfectSchema
> = TableNamesInConfectDataModel<ConfectDataModelFromSchema<S>>;

/**
 * Extract table schema for a specific table from Schema.
 */
export type TableSchemaFromSchema<
  S extends GenericConfectSchema,
  TableName extends TableNamesFromSchema<S>
> = ConfectSchemaDefinition<S>["tableSchemas"][TableName]["withoutSystemFields"];

/**
 * Extract document type for a specific table from Schema.
 */
export type ConfectDocumentFromSchema<
  S extends GenericConfectSchema,
  TableName extends TableNamesFromSchema<S>
> = ConfectDocumentByName<
  ConfectDataModelFromSchema<S>,
  TableName
>;

/**
 * Extract TableInfo (Convex-compatible) for a specific table from Schema.
 * This converts ConfectTableInfo to Convex's GenericTableInfo format.
 */
export type TableInfoFromSchema<
  S extends GenericConfectSchema,
  TableName extends TableNamesFromSchema<S>
> = TableInfoFromConfectTableInfo<
  ConfectDataModelFromSchema<S>[TableName]
>;

/**
 * Type alias for a table schema derived from a ConfectSchema and table name.
 * This represents an Effect Schema with no context requirements (R = never).
 */
export type DerivedTableSchema<
  S extends GenericConfectSchema,
  TN extends TableNamesFromSchema<S>,
  I = never
> = Schema.Schema<ConfectDocumentFromSchema<S, TN>, I, never>;

// ===========================
// Legacy Aliases (for backwards compatibility)
// ===========================
// These wrap the SchemaDefinition but internally use the Schema-based aliases

/**
 * @deprecated Use ConfectDataModelFromSchema instead
 */
export type ConfectDataModelFromSchemaDefinition<
  SD extends GenericConfectSchemaDefinition
> = ConfectDataModelFromConfectSchemaDefinition<SD>;

/**
 * @deprecated Use TableNamesFromSchema instead
 */
export type TableNamesFromSchemaDefinition<
  SD extends GenericConfectSchemaDefinition
> = TableNamesInConfectDataModel<ConfectDataModelFromSchemaDefinition<SD>>;

/**
 * @deprecated Use TableSchemaFromSchema instead
 */
export type TableSchemaFromSchemaDefinition<
  SD extends GenericConfectSchemaDefinition,
  TableName extends TableNamesFromSchemaDefinition<SD>
> = SD["tableSchemas"][TableName]["withoutSystemFields"];

/**
 * @deprecated Use ConfectDocumentFromSchema instead
 */
export type ConfectDocumentFromSchemaDefinition<
  SD extends GenericConfectSchemaDefinition,
  TableName extends TableNamesFromSchemaDefinition<SD>
> = ConfectDocumentByName<
  ConfectDataModelFromSchemaDefinition<SD>,
  TableName
>;

/**
 * @deprecated Use TableInfoFromSchema instead
 */
export type TableInfoFromSchemaDefinition<
  SD extends GenericConfectSchemaDefinition,
  TableName extends TableNamesFromSchemaDefinition<SD>
> = TableInfoFromConfectTableInfo<
  ConfectDataModelFromSchemaDefinition<SD>[TableName]
>;
