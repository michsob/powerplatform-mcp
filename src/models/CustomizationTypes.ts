/**
 * Types for Dataverse customization operations.
 * Based on Microsoft Dataverse Web API metadata definitions.
 */

// ============================================================================
// Table (Entity) Types
// ============================================================================

/**
 * Label with language code for display names and descriptions
 */
export interface LocalizedLabel {
  Label: string;
  LanguageCode: number;
}

/**
 * Collection of localized labels
 */
export interface Label {
  LocalizedLabels: LocalizedLabel[];
}

/**
 * Ownership type for tables
 */
export type OwnershipType = 'None' | 'UserOwned' | 'OrganizationOwned';

/**
 * Definition for creating a new table (entity)
 */
export interface CreateTableDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata';
  SchemaName: string;
  DisplayName: Label;
  DisplayCollectionName: Label;
  Description?: Label;
  OwnershipType: OwnershipType;
  IsActivity?: boolean;
  HasActivities?: boolean;
  HasNotes?: boolean;
  PrimaryNameAttribute: string;
  Attributes: CreateColumnDefinition[];
}

/**
 * Definition for updating a table
 */
export interface UpdateTableDefinition {
  DisplayName?: Label;
  DisplayCollectionName?: Label;
  Description?: Label;
  HasActivities?: boolean;
  HasNotes?: boolean;
}

// ============================================================================
// Column (Attribute) Types
// ============================================================================

/**
 * Base attribute types
 */
export type AttributeType =
  | 'String'
  | 'Memo'
  | 'Integer'
  | 'BigInt'
  | 'Decimal'
  | 'Double'
  | 'Money'
  | 'Boolean'
  | 'DateTime'
  | 'Picklist'
  | 'State'
  | 'Status'
  | 'Lookup'
  | 'Customer'
  | 'Owner'
  | 'Uniqueidentifier';

/**
 * String format types
 */
export type StringFormat = 'Text' | 'Email' | 'Phone' | 'Url' | 'TextArea' | 'TickerSymbol';

/**
 * DateTime format types
 */
export type DateTimeFormat = 'DateOnly' | 'DateAndTime';

/**
 * Integer format types
 */
export type IntegerFormat = 'None' | 'Duration' | 'TimeZone' | 'Language' | 'Locale';

/**
 * Required level for columns
 */
export type RequiredLevel = 'None' | 'Recommended' | 'ApplicationRequired' | 'SystemRequired';

/**
 * Base column definition (shared properties)
 */
interface BaseColumnDefinition {
  SchemaName: string;
  DisplayName: Label;
  Description?: Label;
  RequiredLevel?: {
    Value: RequiredLevel;
  };
  IsAuditEnabled?: {
    Value: boolean;
  };
}

/**
 * String column definition
 */
export interface StringColumnDefinition extends BaseColumnDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata';
  MaxLength?: number;
  FormatName?: {
    Value: StringFormat;
  };
  IsPrimaryName?: boolean;
}

/**
 * Memo (multi-line text) column definition
 */
export interface MemoColumnDefinition extends BaseColumnDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata';
  MaxLength?: number;
}

/**
 * Integer column definition
 */
export interface IntegerColumnDefinition extends BaseColumnDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata';
  MinValue?: number;
  MaxValue?: number;
  Format?: IntegerFormat;
}

/**
 * Decimal column definition
 */
export interface DecimalColumnDefinition extends BaseColumnDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata';
  MinValue?: number;
  MaxValue?: number;
  Precision?: number;
}

/**
 * Money column definition
 */
export interface MoneyColumnDefinition extends BaseColumnDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata';
  MinValue?: number;
  MaxValue?: number;
  Precision?: number;
  PrecisionSource?: number;
}

/**
 * Boolean column definition
 */
export interface BooleanColumnDefinition extends BaseColumnDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata';
  DefaultValue?: boolean;
  OptionSet?: {
    TrueOption: {
      Value: number;
      Label: Label;
    };
    FalseOption: {
      Value: number;
      Label: Label;
    };
  };
}

/**
 * DateTime column definition
 */
export interface DateTimeColumnDefinition extends BaseColumnDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata';
  Format?: DateTimeFormat;
  DateTimeBehavior?: {
    Value: 'UserLocal' | 'DateOnly' | 'TimeZoneIndependent';
  };
}

/**
 * Option for picklist/choice columns
 */
export interface OptionMetadata {
  Value: number;
  Label: Label;
  Description?: Label;
}

/**
 * Picklist (choice) column definition
 */
export interface PicklistColumnDefinition extends BaseColumnDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata';
  OptionSet?: {
    '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata';
    IsGlobal: boolean;
    Name?: string;
    OptionSetType: 'Picklist';
    Options: OptionMetadata[];
  };
  GlobalOptionSet?: {
    '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata';
    Name: string;
  };
}

/**
 * Lookup column definition
 */
export interface LookupColumnDefinition extends BaseColumnDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata';
  Targets?: string[];
}

/**
 * Union type for all column definitions
 */
export type CreateColumnDefinition =
  | StringColumnDefinition
  | MemoColumnDefinition
  | IntegerColumnDefinition
  | DecimalColumnDefinition
  | MoneyColumnDefinition
  | BooleanColumnDefinition
  | DateTimeColumnDefinition
  | PicklistColumnDefinition
  | LookupColumnDefinition;

// ============================================================================
// Relationship Types
// ============================================================================

/**
 * Cascade behavior for relationships
 */
export type CascadeType = 'NoCascade' | 'Cascade' | 'Active' | 'UserOwned' | 'RemoveLink' | 'Restrict';

/**
 * Cascade configuration for relationships
 */
export interface CascadeConfiguration {
  Assign?: CascadeType;
  Delete?: CascadeType;
  Merge?: CascadeType;
  Reparent?: CascadeType;
  Share?: CascadeType;
  Unshare?: CascadeType;
  RollupView?: CascadeType;
}

/**
 * Associated menu configuration
 */
export interface AssociatedMenuConfiguration {
  Behavior?: 'UseCollectionName' | 'UseLabel' | 'DoNotDisplay';
  Group?: 'Details' | 'Sales' | 'Service' | 'Marketing';
  Label?: Label;
  Order?: number;
}

/**
 * One-to-Many relationship definition
 */
export interface OneToManyRelationshipDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata';
  SchemaName: string;
  ReferencedEntity: string;
  ReferencedAttribute: string;
  ReferencingEntity: string;
  CascadeConfiguration?: CascadeConfiguration;
  AssociatedMenuConfiguration?: AssociatedMenuConfiguration;
  Lookup?: LookupColumnDefinition;
}

/**
 * Many-to-Many relationship definition
 */
export interface ManyToManyRelationshipDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.ManyToManyRelationshipMetadata';
  SchemaName: string;
  Entity1LogicalName: string;
  Entity2LogicalName: string;
  IntersectEntityName?: string;
  Entity1AssociatedMenuConfiguration?: AssociatedMenuConfiguration;
  Entity2AssociatedMenuConfiguration?: AssociatedMenuConfiguration;
}

// ============================================================================
// Global Option Set Types
// ============================================================================

/**
 * Global option set definition
 */
export interface GlobalOptionSetDefinition {
  '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata';
  Name: string;
  DisplayName: Label;
  Description?: Label;
  IsGlobal: true;
  OptionSetType: 'Picklist' | 'Boolean' | 'State' | 'Status';
  Options: OptionMetadata[];
}

/**
 * Request to insert a new option value
 */
export interface InsertOptionValueRequest {
  OptionSetName: string;
  Label: Label;
  Value?: number;
  Description?: Label;
}

/**
 * Request to update an option value label
 */
export interface UpdateOptionValueRequest {
  OptionSetName: string;
  Value: number;
  Label: Label;
  Description?: Label;
  MergeLabels?: boolean;
}

/**
 * Request to delete an option value
 */
export interface DeleteOptionValueRequest {
  OptionSetName: string;
  Value: number;
}

/**
 * Request to reorder option values
 */
export interface OrderOptionRequest {
  OptionSetName: string;
  Values: number[];
}

// ============================================================================
// Publishing Types
// ============================================================================

/**
 * Publish XML request body
 */
export interface PublishXmlRequest {
  ParameterXml: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response from creating an entity/attribute
 */
export interface CreateMetadataResponse {
  MetadataId: string;
}

/**
 * Helper function to create a simple label
 */
export function createLabel(text: string, languageCode: number = 1033): Label {
  return {
    LocalizedLabels: [
      {
        Label: text,
        LanguageCode: languageCode
      }
    ]
  };
}
