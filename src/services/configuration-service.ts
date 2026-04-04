/**
 * ConfigurationService
 *
 * Read-only service for querying connection references, environment variables,
 * and other environment configuration metadata from Dataverse.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';

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
   * Fetches definitions and values separately, then joins them,
   * because $expand on environmentvariablevalues returns 400 on some Dataverse versions.
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
    ].join(',');

    let defsEndpoint =
      `api/data/v9.2/environmentvariabledefinitions` +
      `?$select=${select}` +
      `&$orderby=schemaname` +
      `&$top=${maxRecords}`;

    if (filterConditions.length > 0) {
      defsEndpoint += `&$filter=${filterConditions.join(' and ')}`;
    }

    const [defs, vals] = await Promise.all([
      this.client.get<ApiCollectionResponse<Record<string, unknown>>>(defsEndpoint),
      this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
        `api/data/v9.2/environmentvariablevalues` +
        `?$select=environmentvariablevalueid,schemaname,value,_environmentvariabledefinitionid_value` +
        `&$top=${maxRecords}`
      ),
    ]);

    // Join current values onto their definitions
    const valsByDef: Record<string, Record<string, unknown>[]> = {};
    for (const v of vals.value) {
      const defId = String(v._environmentvariabledefinitionid_value);
      if (!valsByDef[defId]) valsByDef[defId] = [];
      valsByDef[defId].push(v);
    }

    for (const def of defs.value) {
      (def as Record<string, unknown>).currentValues =
        valsByDef[String(def.environmentvariabledefinitionid)] || [];
    }

    return defs;
  }
}
