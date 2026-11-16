import type { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';

/** The organization's root business unit: the one with no parent. */
export async function getRootBusinessUnitId(client: PowerPlatformClient): Promise<string> {
  const result = await client.get<ApiCollectionResponse<Record<string, unknown>>>(
    `api/data/v9.2/businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null&$top=1`,
  );
  const bu = result.value[0];
  if (!bu) {
    throw new Error('Unable to locate the root business unit for this organization');
  }
  return String(bu.businessunitid);
}
