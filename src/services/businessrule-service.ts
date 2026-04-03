/**
 * BusinessRuleService
 *
 * Read-only service for business rules in Dynamics 365.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';

export class BusinessRuleService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get all business rules in the environment
   */
  async getBusinessRules(
    activeOnly: boolean = false,
    maxRecords: number = 100
  ): Promise<{
    totalCount: number;
    businessRules: unknown[];
  }> {
    // Category 2 = Business Rule
    // StateCode: 0=Draft, 1=Activated, 2=Suspended
    // Type: 1=Definition
    const stateFilter = activeOnly ? ' and statecode eq 1' : '';

    const businessRules = await this.client.get<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/workflows?$filter=category eq 2${stateFilter}&$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,ismanaged,primaryentity&$expand=ownerid($select=fullname),modifiedby($select=fullname)&$orderby=modifiedon desc&$top=${maxRecords}`
    );

    const formattedBusinessRules = businessRules.value.map((rule) => ({
      workflowid: rule.workflowid,
      name: rule.name,
      description: rule.description,
      state:
        rule.statecode === 0
          ? 'Draft'
          : rule.statecode === 1
            ? 'Activated'
            : 'Suspended',
      statecode: rule.statecode,
      statuscode: rule.statuscode,
      type:
        rule.type === 1
          ? 'Definition'
          : rule.type === 2
            ? 'Activation'
            : 'Template',
      primaryEntity: rule.primaryentity,
      isManaged: rule.ismanaged,
      owner: (rule.ownerid as { fullname?: string })?.fullname,
      modifiedOn: rule.modifiedon,
      modifiedBy: (rule.modifiedby as { fullname?: string })?.fullname,
      createdOn: rule.createdon,
    }));

    return {
      totalCount: formattedBusinessRules.length,
      businessRules: formattedBusinessRules,
    };
  }

  /**
   * Get a specific business rule with its complete XAML definition
   */
  async getBusinessRule(workflowId: string): Promise<unknown> {
    const businessRule = await this.client.get<Record<string, unknown>>(
      `api/data/v9.2/workflows(${workflowId})?$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,category,ismanaged,primaryentity,xaml&$expand=ownerid($select=fullname),modifiedby($select=fullname),createdby($select=fullname)`
    );

    // Verify it's actually a business rule
    if (businessRule.category !== 2) {
      throw new Error(
        `Workflow ${workflowId} is not a business rule (category: ${businessRule.category})`
      );
    }

    return {
      workflowid: businessRule.workflowid,
      name: businessRule.name,
      description: businessRule.description,
      state:
        businessRule.statecode === 0
          ? 'Draft'
          : businessRule.statecode === 1
            ? 'Activated'
            : 'Suspended',
      statecode: businessRule.statecode,
      statuscode: businessRule.statuscode,
      type:
        businessRule.type === 1
          ? 'Definition'
          : businessRule.type === 2
            ? 'Activation'
            : 'Template',
      category: businessRule.category,
      primaryEntity: businessRule.primaryentity,
      isManaged: businessRule.ismanaged,
      owner: (businessRule.ownerid as { fullname?: string })?.fullname,
      createdOn: businessRule.createdon,
      createdBy: (businessRule.createdby as { fullname?: string })?.fullname,
      modifiedOn: businessRule.modifiedon,
      modifiedBy: (businessRule.modifiedby as { fullname?: string })?.fullname,
      xaml: businessRule.xaml,
    };
  }
}
