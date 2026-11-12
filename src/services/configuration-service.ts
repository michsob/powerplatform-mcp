/**
 * ConfigurationService
 *
 * Service for querying and managing connection references, environment variables,
 * and other environment configuration metadata in Dataverse.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import { odataGuid } from '../odata.js';
import type { ApiCollectionResponse } from '../models/index.js';
import { ENVIRONMENT_VARIABLE_TYPES } from './environment-variable-masking.js';

/** Definition ids per value query: keeps the `or` filter well inside the URL length limit. */
const VALUE_QUERY_CHUNK = 20;

export interface ConnectionReferenceOptions {
  /** Maximum records to return (default: 100) */
  maxRecords?: number;
  /** Only return managed connection references (default: false) */
  managedOnly?: boolean;
  /** Filter to references that have (true) or lack (false) a connection set */
  hasConnection?: boolean;
  /** Filter to inactive connection references (statecode ne 0) */
  inactive?: boolean;
}

export interface EnvironmentVariableOptions {
  /** Maximum records to return (default: 100) */
  maxRecords?: number;
  /** Only return managed environment variables (default: false) */
  managedOnly?: boolean;
}

export class ConfigurationService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get connection references in the environment with optional filtering.
   */
  async getConnectionReferences(
    options: ConnectionReferenceOptions = {}
  ): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const { maxRecords = 100, managedOnly = false, hasConnection, inactive } = options;

    const filterConditions: string[] = [];
    if (managedOnly) {
      filterConditions.push('ismanaged eq true');
    }
    if (hasConnection === true) {
      filterConditions.push('connectionid ne null');
    } else if (hasConnection === false) {
      filterConditions.push('connectionid eq null');
    }
    if (inactive) {
      filterConditions.push('statecode ne 0');
    }

    const select = [
      'connectionreferenceid',
      'connectionreferencelogicalname',
      'connectionreferencedisplayname',
      'connectorid',
      'statecode',
      'statuscode',
      'ismanaged',
      'connectionid',
      '_ownerid_value',
      '_createdby_value',
    ].join(',');

    let endpoint =
      `api/data/v9.2/connectionreferences` +
      `?$select=${select}` +
      `&$orderby=connectionreferencelogicalname` +
      `&$top=${maxRecords}`;

    if (filterConditions.length > 0) {
      endpoint += `&$filter=${filterConditions.join(' and ')}`;
    }

    return this.client.get<ApiCollectionResponse<Record<string, unknown>>>(endpoint);
  }

  /**
   * Get environment variable definitions with their current values.
   *
   * Definitions and values are fetched separately and joined, because $expand on
   * environmentvariablevalues returns 400 on some Dataverse versions. Values are fetched for
   * the returned definitions only: an unfiltered, capped value query could drop an override
   * and make a definition look like it uses its default.
   *
   * Each definition carries `currentValues` (the value records), `effectiveValue` (the
   * override, else the default — what a plug-in or flow reading the variable gets),
   * `valueSource`, `valueModifiedOn` and `typeName`.
   *
   * Values come back in clear. Anything printed, cached or handed to an agent goes through
   * `maskEnvironmentVariables` first.
   */
  async getEnvironmentVariables(
    options: EnvironmentVariableOptions = {}
  ): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const { maxRecords = 100, managedOnly = false } = options;

    const filterConditions: string[] = [];
    if (managedOnly) {
      filterConditions.push('ismanaged eq true');
    }

    const select = [
      'environmentvariabledefinitionid',
      'schemaname',
      'displayname',
      'type',
      'defaultvalue',
      'ismanaged',
      'statecode',
      'modifiedon',
    ].join(',');

    let defsEndpoint =
      `api/data/v9.2/environmentvariabledefinitions` +
      `?$select=${select}` +
      `&$orderby=schemaname` +
      `&$top=${maxRecords}`;

    if (filterConditions.length > 0) {
      defsEndpoint += `&$filter=${filterConditions.join(' and ')}`;
    }

    const defs = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(defsEndpoint);

    // A definition has at most one value record, so each chunk's answer fits in one page.
    const defIds = defs.value.map((d) => String(d.environmentvariabledefinitionid));
    const valueChunks = await Promise.all(
      Array.from({ length: Math.ceil(defIds.length / VALUE_QUERY_CHUNK) }, (_, i) => {
        const ids = defIds.slice(i * VALUE_QUERY_CHUNK, (i + 1) * VALUE_QUERY_CHUNK);
        const filter = ids.map((id) => `_environmentvariabledefinitionid_value eq ${id}`).join(' or ');
        return this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
          `api/data/v9.2/environmentvariablevalues` +
          `?$select=environmentvariablevalueid,schemaname,value,modifiedon,_environmentvariabledefinitionid_value` +
          `&$filter=${filter}`
        );
      }),
    );

    // Join current values onto their definitions
    const valsByDef: Record<string, Record<string, unknown>[]> = {};
    for (const v of valueChunks.flatMap((c) => c.value)) {
      const defId = String(v._environmentvariabledefinitionid_value);
      if (!valsByDef[defId]) valsByDef[defId] = [];
      valsByDef[defId].push(v);
    }

    for (const def of defs.value) {
      const current = valsByDef[String(def.environmentvariabledefinitionid)] || [];
      const override = current.find((v) => v.value !== null && v.value !== undefined);
      def.currentValues = current;
      def.effectiveValue = (override?.value as string | undefined) ?? (def.defaultvalue as string | null) ?? null;
      def.valueSource = override ? 'value'
        : def.defaultvalue !== null && def.defaultvalue !== undefined ? 'default'
          : 'none';
      def.valueModifiedOn = (override?.modifiedon as string | undefined) ?? null;
      def.typeName = ENVIRONMENT_VARIABLE_TYPES[def.type as number] ?? `Unknown(${def.type})`;
    }

    return defs;
  }

  /**
   * Create an environment variable definition.
   * @param schemaName The schema name (e.g. contoso_ApiBaseUrl)
   * @param displayName The display name
   * @param type Dataverse type code: 100000000=String, 100000001=Number, 100000002=Boolean, 100000003=JSON, 100000004=DataSource
   * @param defaultValue Optional default value
   * @param description Optional description
   */
  async createEnvironmentVariableDefinition(options: {
    schemaName: string;
    displayName: string;
    type: number;
    defaultValue?: string;
    description?: string;
    solutionName?: string;
  }): Promise<{ definitionId: string }> {
    const body: Record<string, unknown> = {
      schemaname: options.schemaName,
      displayname: options.displayName,
      type: options.type,
    };

    if (options.defaultValue !== undefined) {
      body.defaultvalue = options.defaultValue;
    }
    if (options.description !== undefined) {
      body.description = options.description;
    }

    const headers = options.solutionName ? { 'MSCRM.SolutionUniqueName': options.solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/environmentvariabledefinitions',
      body,
      headers,
    );

    return { definitionId: result?.entityId ?? 'created' };
  }

  /**
   * Create a connection reference. When solutionName is provided, the
   * MSCRM.SolutionUniqueName header places it directly in that solution
   * so a separate AddSolutionComponent call isn't needed.
   */
  async createConnectionReference(options: {
    logicalName: string;
    displayName: string;
    connectorId: string;
    description?: string;
    solutionName?: string;
  }): Promise<{ connectionReferenceId: string }> {
    const body: Record<string, unknown> = {
      connectionreferencelogicalname: options.logicalName,
      connectionreferencedisplayname: options.displayName,
      connectorid: options.connectorId,
    };

    if (options.description !== undefined) {
      body.description = options.description;
    }

    const headers = options.solutionName ? { 'MSCRM.SolutionUniqueName': options.solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/connectionreferences',
      body,
      headers,
    );

    return { connectionReferenceId: result?.entityId ?? 'created' };
  }

  /**
   * Set or update an environment variable value.
   * If existingValueId is provided, updates the existing value via PATCH.
   * Otherwise, creates a new value record linked to the definition.
   * @param definitionId The environment variable definition ID
   * @param value The value to set
   * @param existingValueId Optional existing value record ID to update
   */
  async setEnvironmentVariableValue(options: {
    definitionId: string;
    value: string;
    existingValueId?: string;
  }): Promise<{ valueId: string }> {
    if (options.existingValueId) {
      await this.client.patch(
        `api/data/v9.2/environmentvariablevalues(${odataGuid(options.existingValueId, 'existingValueId')})`,
        { value: options.value },
      );
      return { valueId: options.existingValueId };
    }

    const body = {
      value: options.value,
      'EnvironmentVariableDefinitionId@odata.bind': `/environmentvariabledefinitions(${odataGuid(options.definitionId, 'definitionId')})`,
    };

    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/environmentvariablevalues',
      body,
    );

    return { valueId: result?.entityId ?? 'created' };
  }
}
