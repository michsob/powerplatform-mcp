import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

export interface PowerPlatformConfig {
  organizationUrl: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

// Interface for API responses with value collections
export interface ApiCollectionResponse<T> {
  value: T[];
  [key: string]: any; // For any additional properties
}

export class PowerPlatformService {
  private config: PowerPlatformConfig;
  private msalClient: ConfidentialClientApplication;
  private accessToken: string | null = null;
  private tokenExpirationTime: number = 0;

  constructor(config: PowerPlatformConfig) {
    this.config = config;
    
    // Initialize MSAL client
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
      }
    });
  }

  /**
   * Get an access token for the PowerPlatform API
   */
  private async getAccessToken(): Promise<string> {
    const currentTime = Date.now();
    
    // If we have a token that isn't expired, return it
    if (this.accessToken && this.tokenExpirationTime > currentTime) {
      return this.accessToken;
    }

    try {
      // Get a new token
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: [`${this.config.organizationUrl}/.default`],
      });

      if (!result || !result.accessToken) {
        throw new Error('Failed to acquire access token');
      }

      this.accessToken = result.accessToken;
      
      // Set expiration time (subtract 5 minutes to refresh early)
      if (result.expiresOn) {
        this.tokenExpirationTime = result.expiresOn.getTime() - (5 * 60 * 1000);
      }

      return this.accessToken;
    } catch (error) {
      console.error('Error acquiring access token:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Make an authenticated request to the PowerPlatform API
   */
  private async makeRequest<T>(endpoint: string): Promise<T> {
    try {
      const token = await this.getAccessToken();

      const response = await axios({
        method: 'GET',
        url: `${this.config.organizationUrl}/${endpoint}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0'
        }
      });

      return response.data as T;
    } catch (error) {
      console.error('PowerPlatform API request failed:', error);
      throw new Error(`PowerPlatform API request failed: ${error}`);
    }
  }

  /**
   * Get metadata about an entity
   * @param entityName The logical name of the entity
   */
  async getEntityMetadata(entityName: string): Promise<any> {
    const response = await this.makeRequest(`api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')`);
    
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
    const response = await this.makeRequest<ApiCollectionResponse<any>>(`api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes?$select=${selectProperties}&$filter=AttributeType ne 'Virtual'`);
    
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
    return this.makeRequest(`api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${attributeName}')`);
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
    const response = await this.makeRequest<ApiCollectionResponse<any>>(`api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/OneToManyRelationships?$select=${selectProperties}&$filter=ReferencingAttribute ne 'regardingobjectid'`);
    
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
    
    return this.makeRequest<ApiCollectionResponse<any>>(`api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/ManyToManyRelationships?$select=${selectProperties}`);
  }

  /**
   * Get all relationships (one-to-many and many-to-many) for an entity
   * @param entityName The logical name of the entity
   */
  async getEntityRelationships(entityName: string): Promise<{oneToMany: ApiCollectionResponse<any>, manyToMany: ApiCollectionResponse<any>}> {
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
   * Get a global option set definition by name
   * @param optionSetName The name of the global option set
   * @returns The global option set definition
   */
  async getGlobalOptionSet(optionSetName: string): Promise<any> {
    return this.makeRequest(`api/data/v9.2/GlobalOptionSetDefinitions(Name='${optionSetName}')`);
  }

  /**
   * Get a specific record by entity name (plural) and ID
   * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
   * @param recordId The GUID of the record
   * @returns The record data
   */
  async getRecord(entityNamePlural: string, recordId: string): Promise<any> {
    return this.makeRequest(`api/data/v9.2/${entityNamePlural}(${recordId})`);
  }

  /**
   * Query records using entity name (plural) and a filter expression
   * @param entityNamePlural The plural name of the entity (e.g., 'accounts', 'contacts')
   * @param filter OData filter expression (e.g., "name eq 'test'")
   * @param maxRecords Maximum number of records to retrieve (default: 50)
   * @returns Filtered list of records
   */
  async queryRecords(entityNamePlural: string, filter: string, maxRecords: number = 50): Promise<ApiCollectionResponse<any>> {
    return this.makeRequest<ApiCollectionResponse<any>>(`api/data/v9.2/${entityNamePlural}?$filter=${encodeURIComponent(filter)}&$top=${maxRecords}`);
  }
}