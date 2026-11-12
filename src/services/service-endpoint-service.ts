/**
 * ServiceEndpointService
 *
 * Read-only service for Dataverse service endpoints
 * (Service Bus, webhooks, Event Hub, Event Grid).
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import { fetchCapped, type Truncation } from '../odata.js';
import type { ApiCollectionResponse } from '../models/index.js';

export interface ServiceEndpointSummary {
  serviceendpointid: string;
  name: string;
  contract: number;
  contractName: string;
  connectionMode: number;
  connectionModeName: string;
  messageFormat: number;
  messageFormatName: string;
  authType: number;
  authTypeName: string;
  isManaged: boolean;
  modifiedOn: string;
}

export interface ServiceEndpointListResult extends Truncation {
  [key: string]: unknown;
  totalCount: number;
  endpoints: ServiceEndpointSummary[];
}

const CONTRACT_NAMES: Record<number, string> = {
  1: 'One-Way',
  2: 'Queue',
  3: 'REST',
  4: 'Two-Way',
  5: 'Topic',
  6: 'Persistent Queue',
  7: 'EventHub',
  8: 'Webhook',
  9: 'EventGrid',
  10: 'Managed Data Lake',
  11: 'Container Storage',
};

const CONNECTION_MODE_NAMES: Record<number, string> = {
  1: 'Normal',
  2: 'Federated',
};

const MESSAGE_FORMAT_NAMES: Record<number, string> = {
  1: 'BinaryXML',
  2: 'Json',
  3: 'TextXML',
};

const AUTH_TYPE_NAMES: Record<number, string> = {
  1: 'ACS',
  2: 'SASKey',
  3: 'SASToken',
  4: 'WebhookKey',
  5: 'HttpHeader',
  6: 'HttpQueryString',
  7: 'ConnectionString',
  8: 'AccessKeyAuth',
  9: 'ManagedIdentity',
};

export class ServiceEndpointService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get all service endpoints in the environment
   */
  async getServiceEndpoints(
    maxRecords: number = 100,
  ): Promise<ServiceEndpointListResult> {
    const { rows, ...truncation } = await fetchCapped<Record<string, unknown>>(
      this.client,
      `api/data/v9.2/serviceendpoints?$select=serviceendpointid,name,connectionmode,contract,messageformat,authtype,ismanaged,modifiedon&$orderby=name`,
      maxRecords,
    );

    const endpoints: ServiceEndpointSummary[] = rows.map((ep) => ({
      serviceendpointid: ep.serviceendpointid as string,
      name: ep.name as string,
      contract: ep.contract as number,
      contractName: CONTRACT_NAMES[ep.contract as number] ?? `Unknown (${ep.contract})`,
      connectionMode: ep.connectionmode as number,
      connectionModeName: CONNECTION_MODE_NAMES[ep.connectionmode as number] ?? `Unknown (${ep.connectionmode})`,
      messageFormat: ep.messageformat as number,
      messageFormatName: MESSAGE_FORMAT_NAMES[ep.messageformat as number] ?? `Unknown (${ep.messageformat})`,
      authType: ep.authtype as number,
      authTypeName: AUTH_TYPE_NAMES[ep.authtype as number] ?? `Unknown (${ep.authtype})`,
      isManaged: ep.ismanaged as boolean,
      modifiedOn: ep.modifiedon as string,
    }));

    return {
      totalCount: endpoints.length,
      endpoints,
      ...truncation,
    };
  }
}
