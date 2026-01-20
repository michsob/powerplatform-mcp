import { PowerPlatformClient } from '../PowerPlatformClient.js';
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
}
