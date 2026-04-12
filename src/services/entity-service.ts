import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';

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
    const response = await this.client.get(`api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')`);

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
    ].join(',');

    // Make the request to get attributes
    const response = await this.client.get<ApiCollectionResponse<any>>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes?$select=${selectProperties}&$filter=AttributeType ne 'Virtual'`
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
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${attributeName}')`
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
      'ReferencingEntityNavigationPropertyName'
    ].join(',');

    // Only filter by ReferencingAttribute in the OData query since startswith isn't supported
    const response = await this.client.get<ApiCollectionResponse<any>>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/OneToManyRelationships?$select=${selectProperties}&$filter=ReferencingAttribute ne 'regardingobjectid'`
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
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/ManyToManyRelationships?$select=${selectProperties}`
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
   * Create a string (Single Line of Text) attribute on an entity.
   * @param entityName The logical name of the entity
   * @param schemaName The schema name for the new attribute (e.g. br_hospitableid)
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
    languageCode: number = 1045,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const body: Record<string, unknown> = {
      '@odata.type': '#Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: languageCode }],
      },
      RequiredLevel: { Value: requiredLevel },
      MaxLength: maxLength,
      FormatName: { Value: 'Text' },
    };

    if (description) {
      body.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: languageCode }],
      };
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes`,
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
   * @param schemaName Schema name for the new entity (e.g. 'br_FinancialLine' — must start with the publisher prefix)
   * @param displayName Singular display name (e.g. 'Financial Line')
   * @param displayCollectionName Plural display name (e.g. 'Financial Lines')
   * @param primaryNameSchemaName Schema name for the primary name attribute (e.g. 'br_Name')
   * @param primaryNameDisplayName Display name for the primary name attribute (e.g. 'Name')
   * @param description Optional description for the entity
   * @param ownershipType 'UserOwned' or 'OrganizationOwned' (default UserOwned)
   * @param hasActivities Whether the entity tracks activities (default false)
   * @param hasNotes Whether the entity supports notes (default false)
   * @param languageCode Language code for labels (default 1045 — Polish)
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
    languageCode: number = 1045,
    solutionName?: string,
  ): Promise<{ entityId: string }> {
    const label = (text: string) => ({
      '@odata.type': 'Microsoft.Dynamics.CRM.Label',
      LocalizedLabels: [
        {
          '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel',
          Label: text,
          LanguageCode: languageCode,
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
   * Delete an attribute from an entity. Irreversible — the column and all data in it are dropped.
   * Fails if any component (form, view, workflow, etc.) still depends on the attribute; use
   * `checkDependencies` first if you need to investigate.
   *
   * @param entityName The logical name of the entity
   * @param attributeName The logical name of the attribute to delete
   */
  async deleteEntityAttribute(entityName: string, attributeName: string): Promise<void> {
    await this.client.delete(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${attributeName}')`,
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
   * @param languageCode Language code for labels
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
    languageCode: number = 1045,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const body: Record<string, unknown> = {
      '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: languageCode }],
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
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: languageCode }],
      };
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes`,
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
   * @param languageCode Language code for labels
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
    languageCode: number = 1045,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
    const body: Record<string, unknown> = {
      '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: languageCode }],
      },
      RequiredLevel: { Value: requiredLevel },
      Precision: precision,
      MinValue: minValue,
      MaxValue: maxValue,
    };

    if (description) {
      body.Description = {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: description, LanguageCode: languageCode }],
      };
    }

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes`,
      body,
      headers,
    );

    return { attributeId: result?.entityId ?? 'created' };
  }

  /**
   * Create a lookup (N:1 relationship) attribute on an entity.
   * Wraps the Dataverse `CreateOneToManyRelationship` action.
   *
   * @param referencingEntity The child entity that will hold the new lookup column (e.g. 'br_reservation')
   * @param referencedEntity The parent entity the lookup points to (e.g. 'contact')
   * @param relationshipSchemaName Schema name for the 1:N relationship (e.g. 'br_reservation_contact')
   * @param lookupSchemaName Schema name for the lookup column itself (e.g. 'br_ContactId')
   * @param displayName Display name shown on the lookup column
   * @param requiredLevel Required level: 'None', 'ApplicationRequired', or 'SystemRequired'
   * @param description Optional description for the lookup column
   * @param cascadeDelete Cascade delete behavior (default 'RemoveLink' — deleting parent just nulls the lookup)
   * @param languageCode Language code for labels (default 1045 — Polish)
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
    languageCode: number = 1045,
    solutionName?: string,
  ): Promise<{ attributeId: string }> {
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
          LanguageCode: languageCode,
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
            LanguageCode: languageCode,
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
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Keys`,
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
    languageCode: number = 1045,
    solutionName?: string,
  ): Promise<{ keyId: string }> {
    const body = {
      SchemaName: schemaName,
      DisplayName: {
        '@odata.type': 'Microsoft.Dynamics.CRM.Label',
        LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: displayName, LanguageCode: languageCode }],
      },
      KeyAttributes: keyAttributes,
    };

    const headers = solutionName ? { 'MSCRM.SolutionUniqueName': solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      `api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Keys`,
      body,
      headers,
    );

    return { keyId: result?.entityId ?? 'created' };
  }
}
