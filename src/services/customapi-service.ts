/**
 * CustomApiService
 *
 * Service for querying and managing Custom API definitions,
 * request parameters, and response properties in Dataverse.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';

export class CustomApiService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get Custom API definitions in the environment.
   * @param options.maxRecords Maximum records to return (default: 100)
   * @param options.includeManaged Include managed Custom APIs (default: false)
   */
  async getCustomApis(options?: {
    maxRecords?: number;
    includeManaged?: boolean;
  }): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const { maxRecords = 100, includeManaged = false } = options ?? {};

    const select = [
      'customapiid',
      'uniquename',
      'name',
      'displayname',
      'description',
      'bindingtype',
      'isfunction',
      'isprivate',
      'allowedcustomprocessingsteptype',
      'ismanaged',
    ].join(',');

    const filterConditions: string[] = [];
    if (!includeManaged) {
      filterConditions.push('ismanaged eq false');
    }

    let endpoint =
      `api/data/v9.2/customapis` +
      `?$select=${select}` +
      `&$orderby=uniquename` +
      `&$top=${maxRecords}`;

    if (filterConditions.length > 0) {
      endpoint += `&$filter=${filterConditions.join(' and ')}`;
    }

    return this.client.get<ApiCollectionResponse<Record<string, unknown>>>(endpoint);
  }

  /**
   * Get a single Custom API by unique name.
   * @param uniqueName The unique name of the Custom API
   */
  async getCustomApi(uniqueName: string): Promise<Record<string, unknown> | null> {
    const select = [
      'customapiid',
      'uniquename',
      'name',
      'displayname',
      'description',
      'bindingtype',
      'isfunction',
      'isprivate',
      'allowedcustomprocessingsteptype',
      'ismanaged',
    ].join(',');

    const response = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/customapis?$filter=uniquename eq '${uniqueName}'&$select=${select}&$top=1`
    );

    return response.value.length > 0 ? response.value[0] : null;
  }

  /**
   * Create a Custom API definition.
   * @param options.uniqueName Unique name for the Custom API
   * @param options.name Logical name
   * @param options.displayName Display name
   * @param options.description Optional description
   * @param options.bindingType Binding type (0=Global, 1=Entity, 2=EntityCollection)
   * @param options.boundEntityLogicalName Bound entity logical name (required when bindingType is 1 or 2)
   * @param options.isFunction Whether this is a function (true) or action (false)
   * @param options.isPrivate Whether this Custom API is private
   * @param options.allowedCustomProcessingStepType Processing step type (0=None, 1=AsyncOnly, 2=SyncAndAsync)
   * @param options.pluginTypeId Optional plugin type ID to bind
   */
  async createCustomApi(options: {
    uniqueName: string;
    name: string;
    displayName: string;
    description?: string;
    bindingType: number;
    boundEntityLogicalName?: string;
    isFunction: boolean;
    isPrivate: boolean;
    allowedCustomProcessingStepType: number;
    pluginTypeId?: string;
    solutionName?: string;
  }): Promise<{ customApiId: string }> {
    const body: Record<string, unknown> = {
      uniquename: options.uniqueName,
      name: options.name,
      displayname: options.displayName,
      bindingtype: options.bindingType,
      isfunction: options.isFunction,
      isprivate: options.isPrivate,
      allowedcustomprocessingsteptype: options.allowedCustomProcessingStepType,
    };

    if (options.description !== undefined) {
      body.description = options.description;
    }

    if (options.boundEntityLogicalName !== undefined) {
      body.boundentitylogicalname = options.boundEntityLogicalName;
    }

    if (options.pluginTypeId !== undefined) {
      body['PluginTypeId@odata.bind'] = `/plugintypes(${options.pluginTypeId})`;
    }

    const headers = options.solutionName ? { 'MSCRM.SolutionUniqueName': options.solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/customapis',
      body,
      headers,
    );

    return { customApiId: result?.entityId ?? 'created' };
  }

  /**
   * Get response properties for a Custom API.
   * @param customApiId The Custom API ID
   */
  async getCustomApiResponseProperties(
    customApiId: string
  ): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const select = [
      'customapiresponsepropertyid',
      'uniquename',
      'name',
      'displayname',
      'description',
      'type',
      'isoptional',
    ].join(',');

    return this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/customapiresponseproperties?$filter=_customapiid_value eq ${customApiId}&$select=${select}`
    );
  }

  /**
   * Create a response property for a Custom API.
   * @param options.customApiId The Custom API ID to link to
   * @param options.uniqueName Unique name
   * @param options.name Logical name
   * @param options.displayName Display name
   * @param options.description Optional description
   * @param options.type Type code (0=Boolean, 1=DateTime, 2=Decimal, 3=Entity, 4=EntityCollection, 5=EntityReference, 6=Float, 7=Integer, 8=Money, 9=Picklist, 10=String, 11=StringArray, 12=Guid)
   * @param options.logicalEntityName Logical entity name (required for Entity, EntityCollection, EntityReference types)
   * @param options.isOptional Whether this property is optional (default: false)
   */
  async createCustomApiResponseProperty(options: {
    customApiId: string;
    uniqueName: string;
    name: string;
    displayName: string;
    description?: string;
    type: number;
    logicalEntityName?: string;
    isOptional?: boolean;
    solutionName?: string;
  }): Promise<{ responsePropertyId: string }> {
    const body: Record<string, unknown> = {
      uniquename: options.uniqueName,
      name: options.name,
      displayname: options.displayName,
      type: options.type,
      'CustomAPIId@odata.bind': `/customapis(${options.customApiId})`,
    };

    if (options.description !== undefined) {
      body.description = options.description;
    }

    if (options.logicalEntityName !== undefined) {
      body.logicalentityname = options.logicalEntityName;
    }

    const headers = options.solutionName ? { 'MSCRM.SolutionUniqueName': options.solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/customapiresponseproperties',
      body,
      headers,
    );

    return { responsePropertyId: result?.entityId ?? 'created' };
  }

  /**
   * Get request parameters for a Custom API.
   * @param customApiId The Custom API ID
   */
  async getCustomApiRequestParameters(
    customApiId: string
  ): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const select = [
      'customapirequestparameterid',
      'uniquename',
      'name',
      'displayname',
      'description',
      'type',
      'isoptional',
    ].join(',');

    return this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/customapirequestparameters?$filter=_customapiid_value eq ${customApiId}&$select=${select}`
    );
  }

  /**
   * Create a request parameter for a Custom API.
   * @param options.customApiId The Custom API ID to link to
   * @param options.uniqueName Unique name
   * @param options.name Logical name
   * @param options.displayName Display name
   * @param options.description Optional description
   * @param options.type Type code (0=Boolean, 1=DateTime, 2=Decimal, 3=Entity, 4=EntityCollection, 5=EntityReference, 6=Float, 7=Integer, 8=Money, 9=Picklist, 10=String, 11=StringArray, 12=Guid)
   * @param options.logicalEntityName Logical entity name (required for Entity, EntityCollection, EntityReference types)
   * @param options.isOptional Whether this parameter is optional (default: false)
   */
  async createCustomApiRequestParameter(options: {
    customApiId: string;
    uniqueName: string;
    name: string;
    displayName: string;
    description?: string;
    type: number;
    logicalEntityName?: string;
    isOptional?: boolean;
    solutionName?: string;
  }): Promise<{ requestParameterId: string }> {
    const body: Record<string, unknown> = {
      uniquename: options.uniqueName,
      name: options.name,
      displayname: options.displayName,
      type: options.type,
      isoptional: options.isOptional ?? false,
      'CustomAPIId@odata.bind': `/customapis(${options.customApiId})`,
    };

    if (options.description !== undefined) {
      body.description = options.description;
    }

    if (options.logicalEntityName !== undefined) {
      body.logicalentityname = options.logicalEntityName;
    }

    const headers = options.solutionName ? { 'MSCRM.SolutionUniqueName': options.solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/customapirequestparameters',
      body,
      headers,
    );

    return { requestParameterId: result?.entityId ?? 'created' };
  }
}
