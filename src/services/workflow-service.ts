/**
 * WorkflowService
 *
 * Read-only service for classic Dynamics workflows.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';

export interface OotbWorkflowEntry {
  workflowid: string;
  name: string;
  category: number;
  categoryName: string;
  state: string;
  statecode: number;
  mode: string;
  primaryEntity: string | null;
  isManaged: boolean;
  modifiedOn: string;
}

export interface OotbWorkflowResult {
  [key: string]: unknown;
  totalCount: number;
  byCategoryCount: Record<string, number>;
  workflows: OotbWorkflowEntry[];
}

const WORKFLOW_CATEGORIES: Record<number, string> = {
  0: 'Background',
  1: 'On-Demand',
  2: 'Business Rule',
  3: 'Action',
  4: 'Business Process Flow',
};

export class WorkflowService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get all classic Dynamics workflows in the environment
   */
  async getWorkflows(
    activeOnly: boolean = false,
    maxRecords: number = 25
  ): Promise<{
    totalCount: number;
    hasMore: boolean;
    requestedMax: number;
    workflows: unknown[];
  }> {
    const stateFilter = activeOnly ? ' and statecode eq 1' : '';
    const requestLimit = maxRecords + 1;

    const workflows = await this.client.get<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/workflows?$filter=category eq 0${stateFilter}&$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,ismanaged,iscrmuiworkflow,primaryentity,mode,subprocess,ondemand,triggeroncreate,triggerondelete,syncworkflowlogonfailure,_ownerid_value&$expand=modifiedby($select=fullname)&$orderby=modifiedon desc&$top=${requestLimit}`
    );

    const hasMore = workflows.value.length > maxRecords;
    const trimmedWorkflows = hasMore
      ? workflows.value.slice(0, maxRecords)
      : workflows.value;

    const formattedWorkflows = trimmedWorkflows.map((workflow) => ({
      workflowid: workflow.workflowid,
      name: workflow.name,
      description: workflow.description,
      state:
        workflow.statecode === 0
          ? 'Draft'
          : workflow.statecode === 1
            ? 'Activated'
            : 'Suspended',
      statecode: workflow.statecode,
      statuscode: workflow.statuscode,
      type:
        workflow.type === 1
          ? 'Definition'
          : workflow.type === 2
            ? 'Activation'
            : 'Template',
      mode: workflow.mode === 0 ? 'Background' : 'Real-time',
      primaryEntity: workflow.primaryentity,
      isManaged: workflow.ismanaged,
      isOnDemand: workflow.ondemand,
      triggerOnCreate: workflow.triggeroncreate,
      triggerOnDelete: workflow.triggerondelete,
      isSubprocess: workflow.subprocess,
      ownerId: workflow._ownerid_value,
      modifiedOn: workflow.modifiedon,
      modifiedBy: (workflow.modifiedby as { fullname?: string })?.fullname,
      createdOn: workflow.createdon,
    }));

    return {
      totalCount: formattedWorkflows.length,
      hasMore,
      requestedMax: maxRecords,
      workflows: formattedWorkflows,
    };
  }

  /**
   * Get all non-cloud-flow workflows (background, on-demand, business rules, actions, BPFs).
   * Useful for cross-environment comparison.
   */
  async getOotbWorkflows(options?: {
    maxRecords?: number;
    categories?: number[];
  }): Promise<OotbWorkflowResult> {
    const { maxRecords = 500, categories } = options ?? {};

    let categoryFilter: string;
    if (categories?.length) {
      categoryFilter = categories.map((c) => `category eq ${c}`).join(' or ');
      categoryFilter = `(${categoryFilter})`;
    } else {
      categoryFilter = 'category ne 5';
    }

    const response = await this.client.get<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/workflows?$filter=${categoryFilter}&$select=workflowid,name,category,statecode,statuscode,ismanaged,mode,primaryentity,modifiedon&$orderby=name&$top=${maxRecords}`,
    );

    const workflows: OotbWorkflowEntry[] = response.value.map((wf) => ({
      workflowid: wf.workflowid as string,
      name: wf.name as string,
      category: wf.category as number,
      categoryName: WORKFLOW_CATEGORIES[wf.category as number] ?? `Other (${wf.category})`,
      state:
        wf.statecode === 0 ? 'Draft'
          : wf.statecode === 1 ? 'Activated'
            : 'Suspended',
      statecode: wf.statecode as number,
      mode: wf.mode === 0 ? 'Background' : 'Real-time',
      primaryEntity: (wf.primaryentity as string) ?? null,
      isManaged: wf.ismanaged as boolean,
      modifiedOn: wf.modifiedon as string,
    }));

    const byCategoryCount: Record<string, number> = {};
    for (const wf of workflows) {
      byCategoryCount[wf.categoryName] = (byCategoryCount[wf.categoryName] ?? 0) + 1;
    }

    return {
      totalCount: workflows.length,
      byCategoryCount,
      workflows,
    };
  }

  /**
   * Get a specific classic workflow with its complete XAML definition
   */
  async getWorkflowDefinition(
    workflowId: string,
    summary: boolean = false
  ): Promise<unknown> {
    const workflow = await this.client.get<Record<string, unknown>>(
      `api/data/v9.2/workflows(${workflowId})?$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,category,ismanaged,iscrmuiworkflow,primaryentity,mode,subprocess,ondemand,triggeroncreate,triggerondelete,triggeronupdateattributelist,syncworkflowlogonfailure,xaml,_ownerid_value&$expand=modifiedby($select=fullname),createdby($select=fullname)`
    );

    const baseResult = {
      workflowid: workflow.workflowid,
      name: workflow.name,
      description: workflow.description,
      state:
        workflow.statecode === 0
          ? 'Draft'
          : workflow.statecode === 1
            ? 'Activated'
            : 'Suspended',
      statecode: workflow.statecode,
      statuscode: workflow.statuscode,
      type:
        workflow.type === 1
          ? 'Definition'
          : workflow.type === 2
            ? 'Activation'
            : 'Template',
      category: workflow.category,
      mode: workflow.mode === 0 ? 'Background' : 'Real-time',
      primaryEntity: workflow.primaryentity,
      isManaged: workflow.ismanaged,
      isOnDemand: workflow.ondemand,
      triggerOnCreate: workflow.triggeroncreate,
      triggerOnDelete: workflow.triggerondelete,
      triggerOnUpdateAttributes: workflow.triggeronupdateattributelist
        ? (workflow.triggeronupdateattributelist as string).split(',')
        : [],
      isSubprocess: workflow.subprocess,
      syncWorkflowLogOnFailure: workflow.syncworkflowlogonfailure,
      ownerId: workflow._ownerid_value,
      createdOn: workflow.createdon,
      createdBy: (workflow.createdby as { fullname?: string })?.fullname,
      modifiedOn: workflow.modifiedon,
      modifiedBy: (workflow.modifiedby as { fullname?: string })?.fullname,
    };

    if (summary) {
      const workflowSummary = this.parseWorkflowXamlSummary(
        workflow.xaml as string | null
      );
      return {
        ...baseResult,
        summary: workflowSummary,
        note: 'Use summary=false to get the full XAML definition',
      };
    }

    return {
      ...baseResult,
      xaml: workflow.xaml,
    };
  }

  /**
   * Parse workflow XAML to extract a structured summary
   */
  parseWorkflowXamlSummary(xaml: string | null): Record<string, unknown> {
    if (!xaml) {
      return { error: 'No XAML definition available' };
    }

    const summary: Record<string, unknown> = {
      activities: [],
      activityCount: 0,
      hasConditions: false,
      hasWaitConditions: false,
      sendsEmail: false,
      createsRecords: false,
      updatesRecords: false,
      assignsRecords: false,
      callsChildWorkflows: false,
      variables: [],
      xamlSize: xaml.length,
      tablesModified: new Set<string>(),
      triggerInfo: 'manual',
      triggerFields: [] as string[],
    };

    try {
      // SendEmail activities
      const emailPattern = /<(SendEmail|mxswa:SendEmail)[^>]*>/gi;
      const emailCount = (xaml.match(emailPattern) || []).length;
      if (emailCount > 0) {
        summary.sendsEmail = true;
        (summary.activities as unknown[]).push({
          type: 'SendEmail',
          count: emailCount,
        });
      }

      // CreateEntity activities
      const createPattern = /<(CreateEntity|mxswa:CreateEntity)[^>]*>/gi;
      const createCount = (xaml.match(createPattern) || []).length;
      if (createCount > 0) {
        summary.createsRecords = true;
        (summary.activities as unknown[]).push({
          type: 'CreateEntity',
          count: createCount,
        });
      }

      // UpdateEntity activities
      const updatePattern = /<(UpdateEntity|mxswa:UpdateEntity)[^>]*>/gi;
      const updateCount = (xaml.match(updatePattern) || []).length;
      if (updateCount > 0) {
        summary.updatesRecords = true;
        (summary.activities as unknown[]).push({
          type: 'UpdateEntity',
          count: updateCount,
        });
      }

      // AssignEntity activities
      const assignPattern = /<(AssignEntity|mxswa:AssignEntity)[^>]*>/gi;
      const assignCount = (xaml.match(assignPattern) || []).length;
      if (assignCount > 0) {
        summary.assignsRecords = true;
        (summary.activities as unknown[]).push({
          type: 'AssignEntity',
          count: assignCount,
        });
      }

      // SetState activities
      const setStatePattern = /<(SetState|mxswa:SetState)[^>]*>/gi;
      const setStateCount = (xaml.match(setStatePattern) || []).length;
      if (setStateCount > 0) {
        (summary.activities as unknown[]).push({
          type: 'SetState',
          count: setStateCount,
        });
      }

      // Extract tables modified
      const createEntityMatches = xaml.matchAll(
        /<CreateEntity[^>]+EntitySchemaName="([^"]+)"/g
      );
      for (const match of createEntityMatches) {
        (summary.tablesModified as Set<string>).add(match[1].toLowerCase());
      }

      const updateEntityMatches = xaml.matchAll(
        /<UpdateEntity[^>]+EntitySchemaName="([^"]+)"/g
      );
      for (const match of updateEntityMatches) {
        (summary.tablesModified as Set<string>).add(match[1].toLowerCase());
      }

      const assignEntityMatches = xaml.matchAll(
        /<AssignEntity[^>]+EntitySchemaName="([^"]+)"/g
      );
      for (const match of assignEntityMatches) {
        (summary.tablesModified as Set<string>).add(match[1].toLowerCase());
      }

      const setStateEntityMatches = xaml.matchAll(
        /<SetState[^>]+EntitySchemaName="([^"]+)"/g
      );
      for (const match of setStateEntityMatches) {
        (summary.tablesModified as Set<string>).add(match[1].toLowerCase());
      }

      // Conditions
      const conditionPattern =
        /<(Condition|mxswa:ConditionBranch|If|Switch)[^>]*>/gi;
      const conditionCount = (xaml.match(conditionPattern) || []).length;
      if (conditionCount > 0) {
        summary.hasConditions = true;
        (summary.activities as unknown[]).push({
          type: 'Condition',
          count: conditionCount,
        });
      }

      // Wait conditions
      const waitPattern = /<(Wait|mxswa:Wait|WaitConditionBranch)[^>]*>/gi;
      const waitCount = (xaml.match(waitPattern) || []).length;
      if (waitCount > 0) {
        summary.hasWaitConditions = true;
        (summary.activities as unknown[]).push({
          type: 'Wait',
          count: waitCount,
        });
      }

      // Child workflow calls
      const childWorkflowPattern =
        /<(ExecuteWorkflow|mxswa:ExecuteWorkflow)[^>]*>/gi;
      const childWorkflowCount = (xaml.match(childWorkflowPattern) || [])
        .length;
      if (childWorkflowCount > 0) {
        summary.callsChildWorkflows = true;
        (summary.activities as unknown[]).push({
          type: 'ExecuteWorkflow',
          count: childWorkflowCount,
        });
      }

      // Custom workflow activities
      const customActivityPattern =
        /<(mxswa:ActivityReference|WorkflowActivity)[^>]*TypeName="([^"]*)"[^>]*>/gi;
      const customMatches = xaml.matchAll(customActivityPattern);
      for (const match of customMatches) {
        (summary.activities as unknown[]).push({
          type: 'CustomActivity',
          typeName: match[2],
        });
      }

      // Extract variables
      const variablePattern =
        /<Variable[^>]*x:Name="([^"]*)"[^>]*x:TypeArguments="([^"]*)"[^>]*>/gi;
      const varMatches = xaml.matchAll(variablePattern);
      for (const match of varMatches) {
        (summary.variables as unknown[]).push({ name: match[1], type: match[2] });
      }

      // Extract trigger information
      const triggerOnCreateMatch = xaml.match(
        /<TriggerOnCreate>([^<]+)<\/TriggerOnCreate>/
      );
      const triggerOnDeleteMatch = xaml.match(
        /<TriggerOnDelete>([^<]+)<\/TriggerOnDelete>/
      );
      const primaryEntityMatch = xaml.match(
        /<PrimaryEntity>([^<]+)<\/PrimaryEntity>/
      );

      if (primaryEntityMatch) {
        const primaryEntity = primaryEntityMatch[1];

        if (triggerOnCreateMatch && triggerOnCreateMatch[1] === 'true') {
          summary.triggerInfo = `${primaryEntity}.create`;
        } else if (triggerOnDeleteMatch && triggerOnDeleteMatch[1] === 'true') {
          summary.triggerInfo = `${primaryEntity}.delete`;
        } else {
          const triggerOnUpdateMatch = xaml.match(
            /<TriggerOnUpdate>([^<]+)<\/TriggerOnUpdate>/
          );
          if (triggerOnUpdateMatch && triggerOnUpdateMatch[1] === 'true') {
            summary.triggerInfo = `${primaryEntity}.update`;

            const filteringAttributesMatch = xaml.match(
              /<FilteringAttributes>([^<]+)<\/FilteringAttributes>/
            );
            if (filteringAttributesMatch) {
              const attrs = filteringAttributesMatch[1]
                .split(',')
                .map((a) => a.trim())
                .filter((a) => a);
              summary.triggerFields = attrs;
            }
          } else {
            summary.triggerInfo = 'manual';
          }
        }
      }

      summary.activityCount = (summary.activities as unknown[]).length;

      // Convert Set to array
      summary.tablesModified = Array.from(
        summary.tablesModified as Set<string>
      );
    } catch {
      summary.parseError = 'Partial parse - some information may be missing';
    }

    return summary;
  }
}
