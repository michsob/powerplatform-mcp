import { PowerPlatformClient } from '../powerplatform-client.js';
import { odataString } from '../odata.js';
import type { ApiCollectionResponse } from '../models/index.js';

/** The required levels `updateAttribute` sets. SystemRequired belongs to system attributes: Dataverse refuses it on a custom one. */
export const UPDATABLE_REQUIRED_LEVELS: readonly string[] = ['None', 'Recommended', 'ApplicationRequired'];

/** The attribute types that have a minimum and a maximum. */
const NUMBER_ATTRIBUTE_TYPES: readonly string[] = ['Integer', 'Decimal', 'Double', 'Money'];

/** What `updateAttribute` changes; a value left out stays as it is. */
export interface AttributeChanges {
  /** None, Recommended or ApplicationRequired (Business Required, which binds forms, not the API). */
  requiredLevel?: string;
  minValue?: number;
  maxValue?: number;
  /** The display name in `languageCode`. */
  displayName?: string;
  /** The description (the column's tooltip) in `languageCode`. */
  description?: string;
  /** The language of the display name and description; the organization's base language when left out. */
  languageCode?: number;
}

/** The settings `updateAttribute` reports; a label is reported in its language only when it is being changed. */
export interface AttributeSettings {
  requiredLevel?: string;
  minValue?: number;
  maxValue?: number;
  displayName?: string;
  description?: string;
}

/** An attribute's settings before and after `updateAttribute`. */
export interface AttributeUpdateResult {
  entityName: string;
  attributeName: string;
  attributeType?: string;
  /** The language of the labels reported, when a label is being changed. */
  languageCode?: number;
  before: AttributeSettings;
  after: AttributeSettings;
  changed: boolean;
}

/** A label as metadata returns it: one text per language, and the text in the calling user's language. */
type Label = {
  LocalizedLabels?: Array<Record<string, unknown> & { Label?: string; LanguageCode?: number }>;
  UserLocalizedLabel?: (Record<string, unknown> & { Label?: string; LanguageCode?: number }) | null;
};

/** The label's text in one language, or undefined when it has none. */
function labelText(label: Label | undefined, languageCode: number): string | undefined {
  return label?.LocalizedLabels?.find((l) => l.LanguageCode === languageCode)?.Label;
}

/** The label with its text in one language replaced (or added); the other languages stay. */
function withLabelText(label: Label | undefined, languageCode: number, text: string): Label {
  const existing = label?.LocalizedLabels ?? [];
  const index = existing.findIndex((l) => l.LanguageCode === languageCode);
  const localized = index >= 0
    ? existing.map((l, i) => (i === index ? { ...l, Label: text } : l))
    : [...existing, { '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: languageCode }];
  const user = label?.UserLocalizedLabel;
  return {
    ...label,
    LocalizedLabels: localized,
    UserLocalizedLabel: user && user.LanguageCode === languageCode ? { ...user, Label: text } : user ?? null,
  };
}

/** An attribute's definition as `EntityDefinitions(...)/Attributes(...)` returns it: the derived type, with its own properties. */
type AttributeDefinition = Record<string, unknown> & {
  MetadataId: string;
  '@odata.type'?: string;
  AttributeType?: string;
  RequiredLevel?: { Value?: string; CanBeChanged?: boolean; ManagedPropertyLogicalName?: string };
  MinValue?: number;
  MaxValue?: number;
  DisplayName?: Label;
  Description?: Label;
};

/**
 * Service for entity metadata operations.
 * Handles entity definitions, attributes, and relationships.
 */
export class EntityService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get metadata about an entity
   * @param entityName The logical name of the entity
   */
  async getEntityMetadata(entityName: string): Promise<any> {
    const response = await this.client.get(`api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})`);

    // Remove Privileges property if it exists
    if (response && typeof response === 'object' && 'Privileges' in response) {
      delete response.Privileges;
    }

    return response;
  }

  /**
   * Get metadata about entity attributes/fields
   * @param entityName The logical name of the entity
   */
  async getEntityAttributes(entityName: string): Promise<ApiCollectionResponse<any>> {
    const selectProperties = [
      'LogicalName',
      'RequiredLevel',
      'AttributeType',
    ].join(',');

    // Make the request to get attributes
    const response = await this.client.get<ApiCollectionResponse<any>>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes?$select=${selectProperties}&$filter=AttributeType ne 'Virtual'`
    );

    if (response && response.value) {
      // First pass: Filter out attributes that end with 'yominame'
      response.value = response.value.filter((attribute: any) => {
        const logicalName = attribute.LogicalName || '';
        return !logicalName.endsWith('yominame');
      });

      // Filter out attributes that end with 'name' if there is another attribute with the same name without the 'name' suffix
      const baseNames = new Set<string>();
      const namesAttributes = new Map<string, any>();

      for (const attribute of response.value) {
        const logicalName = attribute.LogicalName || '';

        if (logicalName.endsWith('name') && logicalName.length > 4) {
          const baseName = logicalName.slice(0, -4); // Remove 'name' suffix
          namesAttributes.set(baseName, attribute);
        } else {
          // This is a potential base attribute
          baseNames.add(logicalName);
        }
      }

      // Find attributes to remove that match the pattern
      const attributesToRemove = new Set<any>();
      for (const [baseName, nameAttribute] of namesAttributes.entries()) {
        if (baseNames.has(baseName)) {
          attributesToRemove.add(nameAttribute);
        }
      }

      response.value = response.value.filter(attribute => !attributesToRemove.has(attribute));
    }

    return response;
  }

  /**
   * Get metadata about a specific entity attribute/field
   * @param entityName The logical name of the entity
   * @param attributeName The logical name of the attribute
   */
  async getEntityAttribute(entityName: string, attributeName: string): Promise<any> {
    return this.client.get(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes(LogicalName=${odataString(attributeName)})`
    );
  }

  /**
   * Get one-to-many relationships for an entity
   * @param entityName The logical name of the entity
   */
  async getEntityOneToManyRelationships(entityName: string): Promise<ApiCollectionResponse<any>> {
    const selectProperties = [
      'SchemaName',
      'RelationshipType',
      'ReferencedAttribute',
      'ReferencedEntity',
      'ReferencingAttribute',
      'ReferencingEntity',
      'ReferencedEntityNavigationPropertyName',
      'ReferencingEntityNavigationPropertyName',
      'CascadeConfiguration'
    ].join(',');

    // Only filter by ReferencingAttribute in the OData query since startswith isn't supported
    const response = await this.client.get<ApiCollectionResponse<any>>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/OneToManyRelationships?$select=${selectProperties}&$filter=ReferencingAttribute ne 'regardingobjectid'`
    );

    // Filter the response to exclude relationships with ReferencingEntity starting with 'msdyn_' or 'adx_'
    if (response && response.value) {
      response.value = response.value.filter((relationship: any) => {
        const referencingEntity = relationship.ReferencingEntity || '';
        return !(referencingEntity.startsWith('msdyn_') || referencingEntity.startsWith('adx_'));
      });
    }

    return response;
  }

  /**
   * Get many-to-many relationships for an entity
   * @param entityName The logical name of the entity
   */
  async getEntityManyToManyRelationships(entityName: string): Promise<ApiCollectionResponse<any>> {
    const selectProperties = [
      'SchemaName',
      'RelationshipType',
      'Entity1LogicalName',
      'Entity2LogicalName',
      'Entity1IntersectAttribute',
      'Entity2IntersectAttribute',
      'Entity1NavigationPropertyName',
      'Entity2NavigationPropertyName'
    ].join(',');

    return this.client.get<ApiCollectionResponse<any>>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/ManyToManyRelationships?$select=${selectProperties}`
    );
  }

  /**
   * Get all relationships (one-to-many and many-to-many) for an entity
   * @param entityName The logical name of the entity
   */
  async getEntityRelationships(entityName: string): Promise<{ oneToMany: ApiCollectionResponse<any>, manyToMany: ApiCollectionResponse<any> }> {
    const [oneToMany, manyToMany] = await Promise.all([
      this.getEntityOneToManyRelationships(entityName),
      this.getEntityManyToManyRelationships(entityName)
    ]);

    return {
      oneToMany,
      manyToMany
    };
  }

  /**
   * Set the vector (SVG) icon used for an entity in the unified-interface app nav.
   * The referenced web resource must already exist and be of type 11 (Vector).
   *
   * Dataverse metadata updates can't use PATCH — they require a full-replace PUT
   * (UpdateEntityRequest semantics). So: fetch full entity metadata, modify the
   * one field, PUT it back. MergeLabels=true preserves localized labels.
   *
   * @param entityName Logical name (e.g. 'contoso_project')
   * @param iconVectorName Web-resource name (e.g. 'contoso_project_icon.svg')
   * @param solutionName Optional solution to scope the metadata change to
   */
  async setEntityIconVector(
    entityName: string,
    iconVectorName: string,
    solutionName?: string,
  ): Promise<void> {
    const metadata = await this.client.get<Record<string, unknown> & { MetadataId: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})`,
    );

    const body: Record<string, unknown> = {
      ...metadata,
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      IconVectorName: iconVectorName,
    };

    const headers: Record<string, string> = { 'MSCRM.MergeLabels': 'true' };
    if (solutionName) headers['MSCRM.SolutionUniqueName'] = solutionName;

    await this.client.put(
      `api/data/v9.2/EntityDefinitions(${metadata.MetadataId})`,
      body,
      headers,
    );
  }

  /**
   * Turn change tracking on or off for an entity, so `RetrieveEntityChanges` (and Azure Synapse Link, and offline sync)
   * can read what changed since a version. Like every metadata update this is a full-replace PUT of the entity's
   * metadata with `ChangeTrackingEnabled` changed; `MergeLabels` keeps the localized labels. Publish afterwards.
   *
   * @param entityName Logical name (e.g. 'contoso_project')
   * @param enabled Whether changes are tracked
   * @param solutionName Optional solution to scope the metadata change to
   * @returns Whether the setting changed (false when it was already as asked)
   */
  async setChangeTracking(entityName: string, enabled: boolean, solutionName?: string): Promise<{ changed: boolean }> {
    const metadata = await this.client.get<Record<string, unknown> & { MetadataId: string; ChangeTrackingEnabled?: boolean }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})`,
    );
    if (metadata.ChangeTrackingEnabled === enabled) return { changed: false };

    const body: Record<string, unknown> = {
      ...metadata,
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      ChangeTrackingEnabled: enabled,
    };

    const headers: Record<string, string> = { 'MSCRM.MergeLabels': 'true' };
    if (solutionName) headers['MSCRM.SolutionUniqueName'] = solutionName;

    await this.client.put(`api/data/v9.2/EntityDefinitions(${metadata.MetadataId})`, body, headers);
    return { changed: true };
  }

  /**
   * Change an existing attribute's required level, its display name and description, and, for a number (Integer,
   * Decimal, Double, Money), its minimum and maximum. Like every metadata update this is a full-replace PUT: the
   * attribute's definition is read, the asked values are changed, and it is put back with `MergeLabels`, so every other
   * setting stays. A display name or description is set in one language (the organization's base language unless one is
   * given); its text in the other languages stays. Publish afterwards.
   * Dataverse does not check the rows already stored against a new minimum or maximum.
   *
   * @param entityName Logical name of the entity (e.g. 'contoso_project')
   * @param attributeName Logical name of the attribute (e.g. 'contoso_points')
   * @param changes The values to set; leave one out to keep it
   * @param solutionName Optional solution to scope the metadata change to
   * @returns The attribute's type, its values before and after, and whether anything changed (false when it was already as asked)
   */
  async updateAttribute(
    entityName: string,
    attributeName: string,
    changes: AttributeChanges,
    solutionName?: string,
  ): Promise<AttributeUpdateResult> {
    const changesLabels = changes.displayName !== undefined || changes.description !== undefined;
    if (changes.requiredLevel === undefined && changes.minValue === undefined && changes.maxValue === undefined && !changesLabels) {
      throw new Error('Nothing to change: give a required level, a minimum, a maximum, a display name or a description.');
    }
    for (const [name, value] of [['display name', changes.displayName], ['description', changes.description]] as const) {
      if (value !== undefined && value.trim() === '') throw new Error(`The ${name} is empty.`);
    }
    if (changes.languageCode !== undefined && !(Number.isInteger(changes.languageCode) && changes.languageCode > 0)) {
      throw new Error(`The language code must be a language's LCID (e.g. 1033), not ${changes.languageCode}.`);
    }
    if (changes.requiredLevel !== undefined && !UPDATABLE_REQUIRED_LEVELS.includes(changes.requiredLevel)) {
      throw new Error(`The required level must be one of ${UPDATABLE_REQUIRED_LEVELS.join(', ')}, not '${changes.requiredLevel}'.`);
    }
    for (const [name, value] of [['minimum', changes.minValue], ['maximum', changes.maxValue]] as const) {
      if (value !== undefined && !Number.isFinite(value)) throw new Error(`The ${name} must be a number.`);
    }

    const metadata = await this.client.get<AttributeDefinition>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes(LogicalName=${odataString(attributeName)})`,
    );
    const type = String(metadata['@odata.type'] ?? '').replace(/^#/, '');
    const languageCode = changesLabels ? changes.languageCode ?? await this.baseLanguage() : undefined;
    const before: AttributeSettings = { requiredLevel: metadata.RequiredLevel?.Value, minValue: metadata.MinValue, maxValue: metadata.MaxValue };
    if (languageCode !== undefined && changes.displayName !== undefined) before.displayName = labelText(metadata.DisplayName, languageCode);
    if (languageCode !== undefined && changes.description !== undefined) before.description = labelText(metadata.Description, languageCode);

    const changesRange = changes.minValue !== undefined || changes.maxValue !== undefined;
    if (changesRange && !NUMBER_ATTRIBUTE_TYPES.includes(metadata.AttributeType ?? '')) {
      throw new Error(`'${attributeName}' is ${metadata.AttributeType ?? 'of an unknown type'}: only Integer, Decimal, Double and Money attributes have a minimum and a maximum.`);
    }
    if (changes.requiredLevel !== undefined && metadata.RequiredLevel?.CanBeChanged === false) {
      throw new Error(`The required level of '${attributeName}' cannot be changed (CanBeChanged is false).`);
    }

    const after: AttributeSettings = {
      requiredLevel: changes.requiredLevel ?? before.requiredLevel,
      minValue: changes.minValue ?? before.minValue,
      maxValue: changes.maxValue ?? before.maxValue,
    };
    if (changes.displayName !== undefined) after.displayName = changes.displayName;
    if (changes.description !== undefined) after.description = changes.description;
    if (after.minValue !== undefined && after.maxValue !== undefined && after.minValue > after.maxValue) {
      throw new Error(`The minimum (${after.minValue}) is above the maximum (${after.maxValue}).`);
    }

    const changed = (['requiredLevel', 'minValue', 'maxValue', 'displayName', 'description'] as const)
      .some((key) => after[key] !== before[key]);
    const result: AttributeUpdateResult = { entityName, attributeName, attributeType: metadata.AttributeType, before, after, changed };
    if (languageCode !== undefined) result.languageCode = languageCode;
    if (!changed) return result;

    const body: Record<string, unknown> = { ...metadata, '@odata.type': type };
    delete body['@odata.context'];
    if (changes.requiredLevel !== undefined) body.RequiredLevel = { ...metadata.RequiredLevel, Value: changes.requiredLevel };
    if (changes.minValue !== undefined) body.MinValue = changes.minValue;
    if (changes.maxValue !== undefined) body.MaxValue = changes.maxValue;
    if (languageCode !== undefined && after.displayName !== before.displayName) {
      body.DisplayName = withLabelText(metadata.DisplayName, languageCode, after.displayName as string);
    }
    if (languageCode !== undefined && after.description !== before.description) {
      body.Description = withLabelText(metadata.Description, languageCode, after.description as string);
    }

    const headers: Record<string, string> = { 'MSCRM.MergeLabels': 'true' };
    if (solutionName) headers['MSCRM.SolutionUniqueName'] = solutionName;

    await this.client.put(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes(${metadata.MetadataId})`,
      body,
      headers,
    );
    return result;
  }

  /**
   * Create a string (Single Line of Text) attribute on an entity.
   * @param entityName The logical name of the entity
   * @param schemaName The schema name for the new attribute (e.g. contoso_externalid)
   * @param displayName The display name for the new attribute
   * @param maxLength Maximum length of the text field (default: 100)
   * @param requiredLevel Required level: 'None', 'ApplicationRequired', or 'SystemRequired'
   * @param description Optional description for the attribute
   */
  async createStringAttribute(
    entityName: string,
    schemaName: string,
    displayName: string,
    maxLength: number = 100,
    requiredLevel: 'None' | 'ApplicationRequired' | 'SystemRequired' = 'None',
    description?: string,
    languageCode?: number,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const lcid = languageCode ?? await this.baseLanguage();
    const body: Record<string, unknown> = {
      '@odata.type': '#Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: lcid }],
      },
      RequiredLevel: { Value: requiredLevel },
      MaxLength: maxLength,
      FormatName: { Value: 'Text' },
    };

    if (description) {
      body.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: lcid }],
      };
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes`,
      body,
      headers,
    );

    return { attributeId: result?.entityId ?? 'created' };
  }

  /**
   * Create a new custom entity (table) in Dataverse.
   * Creates the entity shell with a single primary name (Single Line of Text) attribute.
   * Use the existing `createStringAttribute`, `createDecimalAttribute`, `createLookupAttribute`
   * helpers to add additional columns after creation.
   *
   * @param schemaName Schema name for the new entity (e.g. 'contoso_Invoice' — must start with the publisher prefix)
   * @param displayName Singular display name (e.g. 'Financial Line')
   * @param displayCollectionName Plural display name (e.g. 'Financial Lines')
   * @param primaryNameSchemaName Schema name for the primary name attribute (e.g. 'contoso_Name')
   * @param primaryNameDisplayName Display name for the primary name attribute (e.g. 'Name')
   * @param description Optional description for the entity
   * @param ownershipType 'UserOwned' or 'OrganizationOwned' (default UserOwned)
   * @param hasActivities Whether the entity tracks activities (default false)
   * @param hasNotes Whether the entity supports notes (default false)
   * @param languageCode Language code for labels (default: the organization's base language)
   * @param solutionName Optional solution unique name to add the entity to
   */
  async createEntity(
    schemaName: string,
    displayName: string,
    displayCollectionName: string,
    primaryNameSchemaName: string,
    primaryNameDisplayName: string,
    description?: string,
    ownershipType: 'UserOwned' | 'OrganizationOwned' = 'UserOwned',
    hasActivities: boolean = false,
    hasNotes: boolean = false,
    languageCode?: number,
    solutionName?: string,
  ): Promise<{ entityId: string }> {
    const lcid = languageCode ?? await this.baseLanguage();
    const label = (text: string) => ({
      '@odata.type': 'Microsoft.Dynamics.CRM.Label',
      LocalizedLabels: [
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
          Label: text,
          LanguageCode: lcid,
        },
      ],
    });

    const primaryName: Record<string, unknown> = {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: primaryNameSchemaName,
      IsPrimaryName: true,
      RequiredLevel: { Value: 'None' },
      MaxLength: 200,
      FormatName: { Value: 'Text' },
      DisplayName: label(primaryNameDisplayName),
    };

    const body: Record<string, unknown> = {
      '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
      SchemaName: schemaName,
      DisplayName: label(displayName),
      DisplayCollectionName: label(displayCollectionName),
      OwnershipType: ownershipType,
      HasActivities: hasActivities,
      HasNotes: hasNotes,
      IsActivity: false,
      Attributes: [primaryName],
    };

    if (description) {
      body.Description = label(description);
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string; MetadataId?: string }>(
      `api/data/v9.2/EntityDefinitions`,
      body,
      headers,
    );

    return { entityId: result?.entityId ?? result?.MetadataId ?? 'created' };
  }

  /**
   * Create a Picklist (Choice / OptionSet) attribute on an entity: a local choice with its own options, or a column on
   * an existing global choice (`choice.globalOptionSetName`, with no options of its own).
   *
   * @param entityName The logical name of the entity
   * @param schemaName Schema name for the new attribute
   * @param displayName Display name
   * @param options Array of { value: number, label: string } defining a local choice's options; empty for a global choice
   * @param requiredLevel Required level
   * @param description Optional description
   * @param languageCode Language code for labels (default: the organization's base language)
   * @param solutionName Optional solution unique name
   * @param choice.globalOptionSetName The global choice (option set) the column uses, by name
   * @param choice.defaultValue The option a new record gets (DefaultFormValue); unset leaves the platform's default
   */
  async createPicklistAttribute(
    entityName: string,
    schemaName: string,
    displayName: string,
    options: { value: number; label: string }[],
    requiredLevel: 'None' | 'ApplicationRequired' | 'SystemRequired' = 'None',
    description?: string,
    languageCode?: number,
    solutionName?: string,
    choice: { globalOptionSetName?: string; defaultValue?: number } = {},
  ): Promise<{ attributeId: string }> {
    const { globalOptionSetName, defaultValue } = choice;
    if (globalOptionSetName ? options.length > 0 : options.length === 0) {
      throw new Error(globalOptionSetName
        ? 'A column on a global choice takes its options from the choice: pass no options of its own.'
        : 'A local choice needs at least one option.');
    }

    const lcid = languageCode ?? await this.baseLanguage();

    const mkLabel = (text: string) => ({
      '@odata.type': 'Microsoft.Dynamics.CRM.Label',
      LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: lcid }],
    });

    const body: Record<string, unknown> = {
      '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: mkLabel(displayName),
      RequiredLevel: { Value: requiredLevel },
    };

    if (globalOptionSetName) {
      // The bind takes the choice's MetadataId: Dataverse refuses a bind by name.
      const globalChoice = await this.client.get<{ MetadataId?: string }>(
        `api/data/v9.2/GlobalOptionSetDefinitions(Name=${odataString(globalOptionSetName)})?$select=MetadataId`,
      );
      if (!globalChoice?.MetadataId) {
        throw new Error(`Global choice '${globalOptionSetName}' was not found.`);
      }
      body['GlobalOptionSet@odata.bind'] = `/GlobalOptionSetDefinitions(${globalChoice.MetadataId})`;
    } else {
      body.OptionSet = {
        '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
        IsGlobal: false,
        OptionSetType: 'Picklist',
        Options: options.map(o => ({
          Value: o.value,
          Label: mkLabel(o.label),
        })),
      };
    }

    if (defaultValue !== undefined) {
      body.DefaultFormValue = defaultValue;
    }

    if (description) {
      body.Description = mkLabel(description);
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes`,
      body,
      headers,
    );

    return { attributeId: result?.entityId ?? 'created' };
  }

  /**
   * Delete an attribute from an entity. Irreversible — the column and all data in it are dropped.
   * Fails if any component (form, view, workflow, etc.) still depends on the attribute; use
   * `checkDependencies` first if you need to investigate.
   *
   * @param entityName The logical name of the entity
   * @param attributeName The logical name of the attribute to delete
   */
  async deleteEntityAttribute(entityName: string, attributeName: string): Promise<void> {
    await this.client.delete(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes(LogicalName=${odataString(attributeName)})`,
    );
  }

  /**
   * Create a Money (Currency) attribute on an entity.
   * On the first Money column added to an entity, Dataverse automatically adds a
   * `transactioncurrencyid` lookup to the entity if it doesn't already have one.
   *
   * @param entityName The logical name of the entity
   * @param schemaName The schema name for the new attribute
   * @param displayName The display name
   * @param precisionSource 0 = SimpleFixed (use Precision), 1 = Pricing, 2 = Currency (default)
   * @param precision Display precision when precisionSource is 0 (default 2)
   * @param minValue Minimum allowed value
   * @param maxValue Maximum allowed value
   * @param requiredLevel Required level
   * @param description Optional description
   * @param languageCode Language code for labels (default: the organization's base language)
   * @param solutionName Optional solution unique name
   */
  async createMoneyAttribute(
    entityName: string,
    schemaName: string,
    displayName: string,
    precisionSource: 0 | 1 | 2 = 2,
    precision: number = 2,
    minValue: number = -100_000_000_000,
    maxValue: number = 100_000_000_000,
    requiredLevel: 'None' | 'ApplicationRequired' | 'SystemRequired' = 'None',
    description?: string,
    languageCode?: number,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const lcid = languageCode ?? await this.baseLanguage();
    const body: Record<string, unknown> = {
      '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: lcid }],
      },
      RequiredLevel: { Value: requiredLevel },
      PrecisionSource: precisionSource,
      Precision: precision,
      MinValue: minValue,
      MaxValue: maxValue,
    };

    if (description) {
      body.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: lcid }],
      };
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes`,
      body,
      headers,
    );

    return { attributeId: result?.entityId ?? 'created' };
  }

  /**
   * Create a decimal number attribute on an entity.
   * Used for money/quantities when you don't want Dataverse Currency (which requires a TCURRENCY lookup).
   *
   * @param entityName The logical name of the entity
   * @param schemaName The schema name for the new attribute
   * @param displayName The display name
   * @param precision Number of digits after the decimal (default 2, max 10)
   * @param minValue Minimum allowed value (default -100_000_000_000)
   * @param maxValue Maximum allowed value (default 100_000_000_000)
   * @param requiredLevel Required level
   * @param description Optional description
   * @param languageCode Language code for labels (default: the organization's base language)
   * @param solutionName Optional solution unique name
   */
  async createDecimalAttribute(
    entityName: string,
    schemaName: string,
    displayName: string,
    precision: number = 2,
    minValue: number = -100_000_000_000,
    maxValue: number = 100_000_000_000,
    requiredLevel: 'None' | 'ApplicationRequired' | 'SystemRequired' = 'None',
    description?: string,
    languageCode?: number,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const lcid = languageCode ?? await this.baseLanguage();
    const body: Record<string, unknown> = {
      '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: lcid }],
      },
      RequiredLevel: { Value: requiredLevel },
      Precision: precision,
      MinValue: minValue,
      MaxValue: maxValue,
    };

    if (description) {
      body.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: lcid }],
      };
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes`,
      body,
      headers,
    );

    return { attributeId: result?.entityId ?? 'created' };
  }

  /**
   * Create a DateTime attribute on an entity.
   *
   * @param entityName The logical name of the entity
   * @param schemaName The schema name for the new attribute
   * @param displayName The display name
   * @param format 'DateOnly' or 'DateAndTime' (default 'DateOnly')
   * @param behavior 'UserLocal', 'DateOnly', or 'TimeZoneIndependent' (default 'UserLocal')
   * @param requiredLevel Required level
   * @param description Optional description
   * @param languageCode Language code for labels (default: the organization's base language)
   * @param solutionName Optional solution unique name
   */
  async createDateTimeAttribute(
    entityName: string,
    schemaName: string,
    displayName: string,
    format: 'DateOnly' | 'DateAndTime' = 'DateOnly',
    behavior: 'UserLocal' | 'DateOnly' | 'TimeZoneIndependent' = 'UserLocal',
    requiredLevel: 'None' | 'ApplicationRequired' | 'SystemRequired' = 'None',
    description?: string,
    languageCode?: number,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const lcid = languageCode ?? await this.baseLanguage();
    const body: Record<string, unknown> = {
      '@odata.type': '#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: lcid }],
      },
      RequiredLevel: { Value: requiredLevel },
      Format: format,
      DateTimeBehavior: { Value: behavior },
    };

    if (description) {
      body.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: lcid }],
      };
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes`,
      body,
      headers,
    );

    return { attributeId: result?.entityId ?? 'created' };
  }

  /**
   * Create an Integer (Whole Number) attribute on an entity.
   *
   * @param entityName The logical name of the entity
   * @param schemaName The schema name for the new attribute
   * @param displayName The display name
   * @param minValue Minimum allowed value (default -2147483648)
   * @param maxValue Maximum allowed value (default 2147483647)
   * @param requiredLevel Required level
   * @param description Optional description
   * @param languageCode Language code for labels (default: the organization's base language)
   * @param solutionName Optional solution unique name
   */
  async createIntegerAttribute(
    entityName: string,
    schemaName: string,
    displayName: string,
    minValue: number = -2147483648,
    maxValue: number = 2147483647,
    requiredLevel: 'None' | 'ApplicationRequired' | 'SystemRequired' = 'None',
    description?: string,
    languageCode?: number,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const lcid = languageCode ?? await this.baseLanguage();
    const body: Record<string, unknown> = {
      '@odata.type': '#Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: lcid }],
      },
      RequiredLevel: { Value: requiredLevel },
      MinValue: minValue,
      MaxValue: maxValue,
    };

    if (description) {
      body.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: lcid }],
      };
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes`,
      body,
      headers,
    );

    return { attributeId: result?.entityId ?? 'created' };
  }

  /**
   * Create a Boolean (Two Option / Yes/No) attribute on an entity.
   *
   * @param entityName The logical name of the entity
   * @param schemaName The schema name for the new attribute
   * @param displayName The display name
   * @param trueLabel Label for the true/yes option (default 'Yes')
   * @param falseLabel Label for the false/no option (default 'No')
   * @param defaultValue Default value (default false)
   * @param requiredLevel Required level
   * @param description Optional description
   * @param languageCode Language code for labels (default: the organization's base language)
   * @param solutionName Optional solution unique name
   */
  async createBooleanAttribute(
    entityName: string,
    schemaName: string,
    displayName: string,
    trueLabel: string = 'Yes',
    falseLabel: string = 'No',
    defaultValue: boolean = false,
    requiredLevel: 'None' | 'ApplicationRequired' | 'SystemRequired' = 'None',
    description?: string,
    languageCode?: number,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const lcid = languageCode ?? await this.baseLanguage();
    const body: Record<string, unknown> = {
      '@odata.type': '#Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: lcid }],
      },
      RequiredLevel: { Value: requiredLevel },
      DefaultValue: defaultValue,
      OptionSet: {
        TrueOption: {
          Value: 1,
          Label: {
            '@odata.type': 'Microsoft.Dynamics.CRM.Label',
            LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: trueLabel, LanguageCode: lcid }],
          },
        },
        FalseOption: {
          Value: 0,
          Label: {
            '@odata.type': 'Microsoft.Dynamics.CRM.Label',
            LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: falseLabel, LanguageCode: lcid }],
          },
        },
      },
    };

    if (description) {
      body.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: lcid }],
      };
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes`,
      body,
      headers,
    );

    return { attributeId: result?.entityId ?? 'created' };
  }

  /**
   * Create a Memo (Multi-Line Text) attribute on an entity.
   *
   * @param entityName The logical name of the entity
   * @param schemaName The schema name for the new attribute
   * @param displayName The display name
   * @param maxLength Maximum text length (default 2000)
   * @param requiredLevel Required level
   * @param description Optional description
   * @param languageCode Language code for labels (default: the organization's base language)
   * @param solutionName Optional solution unique name
   */
  async createMemoAttribute(
    entityName: string,
    schemaName: string,
    displayName: string,
    maxLength: number = 2000,
    requiredLevel: 'None' | 'ApplicationRequired' | 'SystemRequired' = 'None',
    description?: string,
    languageCode?: number,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const lcid = languageCode ?? await this.baseLanguage();
    const body: Record<string, unknown> = {
      '@odata.type': '#Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: lcid }],
      },
      RequiredLevel: { Value: requiredLevel },
      MaxLength: maxLength,
      FormatName: { Value: 'TextArea' },
    };

    if (description) {
      body.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: lcid }],
      };
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes`,
      body,
      headers,
    );

    return { attributeId: result?.entityId ?? 'created' };
  }

  /**
   * Create a File attribute on an entity. File columns store one file per record
   * (uploaded/downloaded through the file-column endpoints, not as a plain field value).
   *
   * @param entityName The logical name of the entity
   * @param schemaName The schema name for the new attribute
   * @param displayName The display name
   * @param maxSizeInKb Maximum file size in KB (default 32768 = 32 MB; Dataverse allows up to 10 GB)
   * @param requiredLevel Required level
   * @param description Optional description
   * @param languageCode Language code for labels (default: the organization's base language)
   * @param solutionName Optional solution unique name
   */
  async createFileAttribute(
    entityName: string,
    schemaName: string,
    displayName: string,
    maxSizeInKb: number = 32768,
    requiredLevel: 'None' | 'ApplicationRequired' | 'SystemRequired' = 'None',
    description?: string,
    languageCode?: number,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const lcid = languageCode ?? await this.baseLanguage();
    const body: Record<string, unknown> = {
      '@odata.type': '#Microsoft.Dynamics.CRM.FileAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: lcid }],
      },
      RequiredLevel: { Value: requiredLevel },
      MaxSizeInKB: maxSizeInKb,
    };

    if (description) {
      body.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: lcid }],
      };
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Attributes`,
      body,
      headers,
    );

    return { attributeId: result?.entityId ?? 'created' };
  }

  /**
   * Create a lookup (N:1 relationship) attribute on an entity.
   * Wraps the Dataverse `CreateOneToManyRelationship` action.
   *
   * @param referencingEntity The child entity that will hold the new lookup column (e.g. 'contoso_booking')
   * @param referencedEntity The parent entity the lookup points to (e.g. 'contact')
   * @param relationshipSchemaName Schema name for the 1:N relationship (e.g. 'contoso_booking_contact')
   * @param lookupSchemaName Schema name for the lookup column itself (e.g. 'contoso_ContactId')
   * @param displayName Display name shown on the lookup column
   * @param requiredLevel Required level: 'None', 'ApplicationRequired', or 'SystemRequired'
   * @param description Optional description for the lookup column
   * @param cascadeDelete Cascade delete behavior (default 'RemoveLink' — deleting parent just nulls the lookup)
   * @param languageCode Language code for labels (default: the organization's base language)
   * @param solutionName Optional solution unique name to add the component to
   */
  async createLookupAttribute(
    referencingEntity: string,
    referencedEntity: string,
    relationshipSchemaName: string,
    lookupSchemaName: string,
    displayName: string,
    requiredLevel: 'None' | 'ApplicationRequired' | 'SystemRequired' = 'None',
    description?: string,
    cascadeDelete: 'NoCascade' | 'RemoveLink' | 'Restrict' | 'Cascade' = 'RemoveLink',
    languageCode?: number,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const lcid = languageCode ?? await this.baseLanguage();
    const emptyLabel = {
      '@odata.type': 'Microsoft.Dynamics.CRM.Label',
      LocalizedLabels: [] as unknown[],
    };

    const displayLabel = {
      '@odata.type': 'Microsoft.Dynamics.CRM.Label',
      LocalizedLabels: [
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
          Label: displayName,
          LanguageCode: lcid,
        },
      ],
    };

    const lookup: Record<string, unknown> = {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      SchemaName: lookupSchemaName,
      DisplayName: displayLabel,
      RequiredLevel: { Value: requiredLevel },
    };

    if (description) {
      lookup.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [
          {
            '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
            Label: description,
            LanguageCode: lcid,
          },
        ],
      };
    }

    const body = {
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      SchemaName: relationshipSchemaName,
      ReferencedEntity: referencedEntity,
      ReferencingEntity: referencingEntity,
      AssociatedMenuConfiguration: {
        Behavior: 'UseCollectionName',
        Group: 'Details',
        Label: emptyLabel,
        Order: 10000,
      },
      CascadeConfiguration: {
        Assign: 'NoCascade',
        Delete: cascadeDelete,
        Merge: 'NoCascade',
        Reparent: 'NoCascade',
        Share: 'NoCascade',
        Unshare: 'NoCascade',
      },
      Lookup: lookup,
    };

    // POST to RelationshipDefinitions with the OneToMany metadata; Lookup is nested inside.
    // Solution association goes through the standard MSCRM.SolutionUniqueName header.
    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ AttributeId?: string; entityId?: string }>(
      `api/data/v9.2/RelationshipDefinitions`,
      body,
      headers,
    );

    return { attributeId: result?.AttributeId ?? result?.entityId ?? 'created' };
  }

  /**
   * Get alternate keys defined on an entity.
   * @param entityName The logical name of the entity
   */
  async getEntityKeys(entityName: string): Promise<ApiCollectionResponse<any>> {
    return this.client.get<ApiCollectionResponse<any>>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Keys`,
    );
  }

  /**
   * Create an alternate key on an entity.
   * @param entityName The logical name of the entity
   * @param schemaName The schema name for the key
   * @param displayName The display name for the key
   * @param keyAttributes Array of attribute logical names that make up the key
   */
  async createAlternateKey(
    entityName: string,
    schemaName: string,
    displayName: string,
    keyAttributes: string[],
    languageCode?: number,
    solutionName?: string,
  ): Promise<{ keyId: string }> {
    const lcid = languageCode ?? await this.baseLanguage();
    const body = {
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: lcid }],
      },
      KeyAttributes: keyAttributes,
    };

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Keys`,
      body,
      headers,
    );

    return { keyId: result?.entityId ?? 'created' };
  }

  /**
   * Delete an alternate key from an entity. Irreversible: the key's index is dropped.
   * @param entityName The logical name of the entity
   * @param keyName The logical name of the key
   */
  async deleteAlternateKey(entityName: string, keyName: string): Promise<void> {
    await this.client.delete(
      `api/data/v9.2/EntityDefinitions(LogicalName=${odataString(entityName)})/Keys(LogicalName=${odataString(keyName)})`,
    );
  }

  /** The organization's base language (its LCID), in which a label is set when no language is given. */
  /**
   * The organization's base language: every organization has it, so Dataverse accepts a label in it.
   * A fixed default (it was Polish) fails on an organization without that language pack, or leaves
   * labels nobody sees. Asked once per service; a failed lookup is not kept.
   */
  private baseLanguage(): Promise<number> {
    this.baseLanguageCode ??= this.client
      .get<ApiCollectionResponse<{ languagecode: number }>>('api/data/v9.2/organizations?$select=languagecode')
      .then((result) => result.value?.[0]?.languagecode ?? 1033)
      .catch((error) => {
        this.baseLanguageCode = undefined;
        throw error;
      });
    return this.baseLanguageCode;
  }

  private baseLanguageCode?: Promise<number>;
}
