/**
 * FlowService
 *
 * Read-only service for Power Automate cloud flows.
 */

import axios from 'axios';
import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';
import { applyFlowFilters, type FlowFilterConfig } from './flow-filter.js';

export interface FlowFilterOptions {
  activeOnly?: boolean;
  maxRecords?: number;
  excludeCustomerInsights?: boolean;
  excludeSystem?: boolean;
  excludeCopilotSales?: boolean;
  nameContains?: string;
}

export interface FlowSummary {
  workflowid: string;
  name: string;
  description: string | null;
  state: string;
  statecode: number;
  statuscode: number;
  type: string;
  primaryEntity: string | null;
  isManaged: boolean;
  ownerId: string;
  modifiedOn: string;
  modifiedBy: string | null;
  createdOn: string;
}

export interface FlowListResult {
  [key: string]: unknown;
  totalCount: number;
  hasMore: boolean;
  requestedMax: number;
  excluded: {
    customerInsights: number;
    system: number;
    copilotSales: number;
    total: number;
  };
  filterApplied: {
    excludeCustomerInsights: boolean;
    excludeSystem: boolean;
    excludeCopilotSales: boolean;
    nameContains?: string;
  };
  flows: FlowSummary[];
}

export interface CancelFlowRunResult {
  [key: string]: unknown;
  success: boolean;
  flowId: string;
  runId: string;
  previousStatus: string;
}

export interface ResubmitFlowRunResult {
  [key: string]: unknown;
  success: boolean;
  flowId: string;
  originalRunId: string;
  newRunId: string;
  triggerName: string;
}

export interface FlowRunFilterOptions {
  /** Filter by status: Succeeded, Failed, Running, Waiting, Cancelled */
  status?: string;
  /** Only return runs started after this date (ISO 8601) */
  startedAfter?: string;
  /** Only return runs started before this date (ISO 8601) */
  startedBefore?: string;
  /** Maximum number of runs to return (default: 50, max: 250) */
  maxRecords?: number;
}

export interface FlowRunSummary {
  runId: string;
  flowId: string;
  status: string;
  startTime: string;
  endTime: string | null;
  trigger: {
    name: string;
    status: string;
    startTime: string;
    endTime: string | null;
  } | null;
  error: {
    code: string;
    message: string;
  } | null;
}

export interface FlowRunsResult {
  [key: string]: unknown;
  flowId: string;
  environmentId: string;
  totalCount: number;
  hasMore: boolean;
  filterApplied: {
    status?: string;
    startedAfter?: string;
    startedBefore?: string;
    maxRecords: number;
  };
  runs: FlowRunSummary[];
}

// ─── Flow Health Types ────────────────────────────────────────────

export interface FlowHealthEntry {
  flowId: string;
  flowName: string;
  state: string;
  statecode: number;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  runningRuns: number;
  successRate: number;
  lastRunTime: string | null;
  lastFailureTime: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface FlowHealthScanResult {
  [key: string]: unknown;
  scanTime: string;
  daysAnalyzed: number;
  summary: {
    totalFlowsScanned: number;
    flowsExcluded: number;
    flowsWithFailures: number;
    flowsHealthy: number;
    flowsNoRuns: number;
    totalRunsAnalyzed: number;
    totalFailures: number;
    overallSuccessRate: number;
  };
  topFailingFlows: FlowHealthEntry[];
  allFlows: FlowHealthEntry[];
}

// ─── Flow Inventory Types ─────────────────────────────────────────

export interface FlowInventoryEntry {
  flowId: string;
  flowName: string;
  /** Alias of flowName, required for flow filter compatibility */
  name: string;
  state: string;
  statecode: number;
  isManaged: boolean;
  modifiedOn: string;
  modifiedBy: string | null;
}

export interface FlowInventoryResult {
  [key: string]: unknown;
  totalCount: number;
  excluded: number;
  flows: FlowInventoryEntry[];
}

// ─── Concurrency Helper ──────────────────────────────────────────

async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let index = 0;

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      while (index < tasks.length) {
        const i = index++;
        try {
          const value = await tasks[i]();
          results[i] = { status: 'fulfilled', value };
        } catch (reason) {
          results[i] = { status: 'rejected', reason };
        }
      }
    },
  );

  await Promise.all(workers);
  return results;
}

/**
 * Copilot for Sales flow names - hardcoded list versioned with releases.
 */
const COPILOT_SALES_FLOW_NAMES = new Set([
  'Account Research Summary Flow',
  'AccountResearchTriggerFlow',
  'Chain Of Thoughts Flow',
  'Competitor Research Flow',
  'Competitor Web Research Flow',
  'CustomizationAgentTriggerFlow',
  'Deal Health Flow',
  'Deal Importance Flow',
  'Deal Insights Flow',
  'Deal Needs And Pain Points Flow',
  'Deal Overview Flow',
  'Deal Risk Flow',
  'Email Classification - Leads',
  'Email Insights cleanup Job',
  'Email Validation Flow - Leads',
  'Execute Engage And Readiness Agent',
  'Execute Handover Microagent',
  'Execute Outreach Agent',
  'Lead Qualifcation Agent',
  'Opportunity Competitor Research Flow',
  'Opportunity Stakeholder Research flow',
  'OpportunityAccountResearchTriggerFlow',
  'RCS Insights flow v2',
  'RCS flow',
  'Sales Agents Initiate Opportunity Research Orchestration flow',
  'Sales Agents Refresh Opportunity Research Orchestration flow',
  'Sales Close Agent - Engage - Execute Engage Agent',
  'Sales Close Agent - Engage - Execute Orchestrator',
  'Sales Close Agent - Engage - Execute Outreach Agent',
  'Sales Close Agent - Engage - Orchestrate Engage Activities',
  'Sales Close Agent - Engage - Test Agent',
  'Sales Company Resolver Flow',
  'Sales Micro Agent Orchestration Flow',
  'Sales Outreach Flow',
  'Summary Synthesizer Flow',
  'Tcp and Bant prefill Flow',
]);

export class FlowService {
  private environmentId: string | null = null;

  constructor(private client: PowerPlatformClient) {}

  /**
   * Get Power Automate cloud flows with smart filtering
   */
  async getFlows(options: FlowFilterOptions = {}): Promise<FlowListResult> {
    const {
      activeOnly = false,
      maxRecords = 25,
      excludeCustomerInsights = true,
      excludeSystem = true,
      excludeCopilotSales = true,
      nameContains,
    } = options;

    const filterConditions: string[] = ['category eq 5'];

    if (activeOnly) {
      filterConditions.push('statecode eq 1');
    }

    if (excludeCustomerInsights) {
      filterConditions.push("not startswith(name,'CXP_')");
    }

    if (nameContains) {
      const escapedName = nameContains.replace(/'/g, "''");
      filterConditions.push(`contains(name,'${escapedName}')`);
    }

    const filterString = filterConditions.join(' and ');

    const clientFilterFactor = excludeSystem || excludeCopilotSales ? 1.5 : 1;
    const requestLimit = Math.ceil(maxRecords * clientFilterFactor) + 1;

    const flows = await this.client.get<
      ApiCollectionResponse<Record<string, unknown>>
    >(
      `api/data/v9.2/workflows?$filter=${filterString}&$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,ismanaged,iscrmuiworkflow,primaryentity,_ownerid_value&$expand=modifiedby($select=fullname)&$orderby=modifiedon desc&$top=${requestLimit}`
    );

    const excludedCounts = {
      customerInsights: 0,
      system: 0,
      copilotSales: 0,
    };

    let filteredFlows = flows.value;

    if (excludeSystem) {
      const beforeCount = filteredFlows.length;
      filteredFlows = filteredFlows.filter((flow) => {
        const modifiedBy = (flow.modifiedby as { fullname?: string })?.fullname;
        return modifiedBy !== 'SYSTEM';
      });
      excludedCounts.system = beforeCount - filteredFlows.length;
    }

    if (excludeCopilotSales) {
      const beforeCount = filteredFlows.length;
      filteredFlows = filteredFlows.filter(
        (flow) => !COPILOT_SALES_FLOW_NAMES.has(flow.name as string)
      );
      excludedCounts.copilotSales = beforeCount - filteredFlows.length;
    }

    const hasMore = filteredFlows.length > maxRecords;
    const trimmedFlows = hasMore
      ? filteredFlows.slice(0, maxRecords)
      : filteredFlows;

    const formattedFlows: FlowSummary[] = trimmedFlows.map((flow) => ({
      workflowid: flow.workflowid as string,
      name: flow.name as string,
      description: flow.description as string | null,
      state:
        flow.statecode === 0
          ? 'Draft'
          : flow.statecode === 1
            ? 'Activated'
            : 'Suspended',
      statecode: flow.statecode as number,
      statuscode: flow.statuscode as number,
      type:
        flow.type === 1
          ? 'Definition'
          : flow.type === 2
            ? 'Activation'
            : 'Template',
      primaryEntity: flow.primaryentity as string | null,
      isManaged: flow.ismanaged as boolean,
      ownerId: flow._ownerid_value as string,
      modifiedOn: flow.modifiedon as string,
      modifiedBy: (flow.modifiedby as { fullname?: string })?.fullname || null,
      createdOn: flow.createdon as string,
    }));

    return {
      totalCount: formattedFlows.length,
      hasMore,
      requestedMax: maxRecords,
      excluded: {
        customerInsights: excludedCounts.customerInsights,
        system: excludedCounts.system,
        copilotSales: excludedCounts.copilotSales,
        total: excludedCounts.system + excludedCounts.copilotSales,
      },
      filterApplied: {
        excludeCustomerInsights,
        excludeSystem,
        excludeCopilotSales,
        nameContains,
      },
      flows: formattedFlows,
    };
  }

  /**
   * Search workflows (both classic workflows and Power Automate flows)
   */
  async searchWorkflows(
    options: {
      name?: string;
      primaryEntity?: string;
      description?: string;
      category?: number;
      statecode?: number;
      includeDescription?: boolean;
      maxResults?: number;
    } = {}
  ): Promise<{
    totalCount: number;
    hasMore: boolean;
    requestedMax: number;
    workflows: unknown[];
  }> {
    const {
      name,
      primaryEntity,
      description,
      category,
      statecode,
      includeDescription = true,
      maxResults = 50,
    } = options;

    const filterConditions: string[] = [];

    if (name) {
      const escapedName = name.replace(/'/g, "''");
      filterConditions.push(`contains(name,'${escapedName}')`);
    }

    if (primaryEntity) {
      filterConditions.push(`primaryentity eq '${primaryEntity}'`);
    }

    if (description) {
      const escapedDescription = description.replace(/'/g, "''");
      filterConditions.push(`contains(description,'${escapedDescription}')`);
    }

    if (category !== undefined) {
      filterConditions.push(`category eq ${category}`);
    }

    if (statecode !== undefined) {
      filterConditions.push(`statecode eq ${statecode}`);
    }

    const filterString =
      filterConditions.length > 0 ? filterConditions.join(' and ') : '';
    const requestLimit = maxResults + 1;

    const selectFields = includeDescription
      ? 'workflowid,name,description,statecode,statuscode,category,type,primaryentity,ismanaged,createdon,modifiedon,_ownerid_value'
      : 'workflowid,name,statecode,statuscode,category,type,primaryentity,ismanaged,createdon,modifiedon,_ownerid_value';

    const endpoint = filterString
      ? `api/data/v9.2/workflows?$filter=${filterString}&$select=${selectFields}&$expand=modifiedby($select=fullname),createdby($select=fullname)&$orderby=modifiedon desc&$top=${requestLimit}`
      : `api/data/v9.2/workflows?$select=${selectFields}&$expand=modifiedby($select=fullname),createdby($select=fullname)&$orderby=modifiedon desc&$top=${requestLimit}`;

    const response = await this.client.get<
      ApiCollectionResponse<Record<string, unknown>>
    >(endpoint);

    const hasMore = response.value.length > maxResults;
    const workflows = hasMore
      ? response.value.slice(0, maxResults)
      : response.value;

    const formattedWorkflows = workflows.map((workflow) => ({
      workflowid: workflow.workflowid,
      name: workflow.name,
      description: includeDescription ? workflow.description : undefined,
      state:
        workflow.statecode === 0
          ? 'Draft'
          : workflow.statecode === 1
            ? 'Activated'
            : 'Suspended',
      statecode: workflow.statecode,
      statuscode: workflow.statuscode,
      category:
        workflow.category === 0
          ? 'Classic Workflow'
          : workflow.category === 5
            ? 'Power Automate Flow'
            : `Other (${workflow.category})`,
      categoryCode: workflow.category,
      type:
        workflow.type === 1
          ? 'Definition'
          : workflow.type === 2
            ? 'Activation'
            : 'Template',
      typeCode: workflow.type,
      primaryEntity: workflow.primaryentity,
      isManaged: workflow.ismanaged,
      ownerId: workflow._ownerid_value,
      createdOn: workflow.createdon,
      createdBy: (workflow.createdby as { fullname?: string })?.fullname,
      modifiedOn: workflow.modifiedon,
      modifiedBy: (workflow.modifiedby as { fullname?: string })?.fullname,
    }));

    return {
      totalCount: formattedWorkflows.length,
      hasMore,
      requestedMax: maxResults,
      workflows: formattedWorkflows,
    };
  }

  /**
   * Get a specific Power Automate flow with its complete definition
   */
  async getFlowDefinition(
    flowId: string,
    summary: boolean = false
  ): Promise<unknown> {
    const flow = await this.client.get<Record<string, unknown>>(
      `api/data/v9.2/workflows(${flowId})?$select=workflowid,name,statecode,statuscode,description,createdon,modifiedon,type,category,ismanaged,iscrmuiworkflow,primaryentity,clientdata&$expand=modifiedby($select=fullname),createdby($select=fullname)`
    );

    let flowDefinition = null;
    let flowSummary = null;

    if (flow.clientdata) {
      try {
        flowDefinition = JSON.parse(flow.clientdata as string);

        if (summary && flowDefinition) {
          flowSummary = this.parseFlowSummary(flowDefinition);
        }
      } catch {
        flowDefinition = {
          parseError: 'Failed to parse flow definition',
          raw: (flow.clientdata as string)?.substring(0, 500) + '...',
        };
      }
    }

    const baseResult = {
      workflowid: flow.workflowid,
      name: flow.name,
      description: flow.description,
      state:
        flow.statecode === 0
          ? 'Draft'
          : flow.statecode === 1
            ? 'Activated'
            : 'Suspended',
      statecode: flow.statecode,
      statuscode: flow.statuscode,
      type:
        flow.type === 1
          ? 'Definition'
          : flow.type === 2
            ? 'Activation'
            : 'Template',
      category: flow.category,
      primaryEntity: flow.primaryentity,
      isManaged: flow.ismanaged,
      createdOn: flow.createdon,
      createdBy: (flow.createdby as { fullname?: string })?.fullname,
      modifiedOn: flow.modifiedon,
      modifiedBy: (flow.modifiedby as { fullname?: string })?.fullname,
    };

    if (summary) {
      return {
        ...baseResult,
        summary: flowSummary,
        note: 'Use summary=false to get the full flow definition',
      };
    }

    return {
      ...baseResult,
      flowDefinition,
    };
  }

  /**
   * Parse a flow definition to extract a summary
   */
  parseFlowSummary(flowDef: Record<string, unknown>): Record<string, unknown> {
    const summary: Record<string, unknown> = {
      trigger: null,
      actions: [],
      connectors: new Set<string>(),
      actionCount: 0,
      hasConditions: false,
      hasLoops: false,
      hasErrorHandling: false,
      tablesModified: new Set<string>(),
      triggerInfo: 'manual',
      triggerFields: [] as string[],
      customApisCalled: new Set<string>(),
    };

    try {
      const properties = flowDef.properties as Record<string, unknown>;
      const definition = properties?.definition as Record<string, unknown>;

      // Extract trigger information
      if (definition?.triggers) {
        const triggers = definition.triggers as Record<string, unknown>;
        const triggerNames = Object.keys(triggers);
        if (triggerNames.length > 0) {
          const triggerName = triggerNames[0];
          const trigger = triggers[triggerName] as Record<string, unknown>;
          summary.trigger = {
            name: triggerName,
            type: trigger.type,
            kind: trigger.kind,
            recurrence: trigger.recurrence,
          };

          // Extract trigger type and fields
          if (
            trigger.type === 'OpenApiConnectionWebhook' ||
            trigger.type === 'OpenApiConnection'
          ) {
            const inputs = trigger.inputs as Record<string, unknown>;
            const parameters = inputs?.parameters as Record<string, unknown>;
            const entityName = parameters?.entityName as string;
            const host = inputs?.host as Record<string, unknown>;
            const operationId = (host?.operationId as string) || '';

            if (entityName) {
              if (
                operationId.includes('Create') ||
                operationId.includes('OnNew')
              ) {
                summary.triggerInfo = `${entityName} create`;
              } else if (
                operationId.includes('Update') ||
                operationId.includes('OnModified') ||
                operationId.includes('OnUpdated')
              ) {
                const filterExpression = parameters?.filterExpression as string;
                if (filterExpression && typeof filterExpression === 'string') {
                  const fieldMatches = filterExpression.matchAll(
                    /([a-z_]+)\s*(?:eq|ne|gt|lt|ge|le)/gi
                  );
                  for (const match of fieldMatches) {
                    (summary.triggerFields as string[]).push(match[1]);
                  }
                  summary.triggerInfo = `${entityName} update (${filterExpression})`;
                } else {
                  summary.triggerInfo = `${entityName} update`;
                }
              } else if (
                operationId.includes('Delete') ||
                operationId.includes('OnDeleted')
              ) {
                summary.triggerInfo = `${entityName} delete`;
              } else {
                summary.triggerInfo = `${entityName} ${operationId}`;
              }
            } else {
              const apiId = host?.apiId as string;
              if (apiId && apiId.includes('/')) {
                const apiName = apiId.split('/').pop();
                summary.triggerInfo = `${apiName} trigger`;
              } else {
                summary.triggerInfo = `${trigger.type} trigger`;
              }
            }
          } else if (trigger.type === 'Recurrence') {
            summary.triggerInfo = 'scheduled';
          } else if (trigger.type === 'Request' || trigger.type === 'manual') {
            summary.triggerInfo = 'manual';
          } else {
            summary.triggerInfo = (trigger.type as string) || 'unknown';
          }
        }
      }

      // Process actions recursively
      const processActions = (
        actions: Record<string, unknown>,
        path: string = ''
      ) => {
        for (const [actionName, actionData] of Object.entries(actions)) {
          const action = actionData as Record<string, unknown>;
          const actionType = ((action.type as string) || '').toLowerCase();
          const fullPath = path ? `${path}/${actionName}` : actionName;

          if (actionType === 'if' || actionType === 'switch') {
            summary.hasConditions = true;
          }
          if (actionType === 'foreach' || actionType === 'until') {
            summary.hasLoops = true;
          }

          const runAfter = action.runAfter as Record<string, unknown[]>;
          if (
            actionType === 'scope' &&
            runAfter &&
            Object.values(runAfter).some((r) => r.includes('Failed'))
          ) {
            summary.hasErrorHandling = true;
          }

          // Extract connector and table info
          if (
            action.type === 'OpenApiConnection' ||
            action.type === 'ApiConnection'
          ) {
            const inputs = action.inputs as Record<string, unknown>;
            const host = inputs?.host as Record<string, unknown>;
            const connectorId =
              (host?.connectionName as string) ||
              (host?.apiId as string) ||
              ((action.metadata as Record<string, unknown>)
                ?.operationMetadataId as string);
            if (connectorId) {
              (summary.connectors as Set<string>).add(
                connectorId.split('/').pop() || connectorId
              );
            }

            const operationId = host?.operationId as string;
            if (
              operationId &&
              [
                'CreateRecord',
                'UpdateRecord',
                'DeleteRecord',
                'UpsertRecord',
                'AssociateRecords',
              ].includes(operationId)
            ) {
              const parameters = inputs?.parameters as Record<string, unknown>;
              const entityName = parameters?.entityName as string;
              if (entityName && typeof entityName === 'string') {
                (summary.tablesModified as Set<string>).add(
                  entityName.toLowerCase()
                );
              }
            }

            // Detect Custom API calls
            if (
              operationId &&
              ![
                'CreateRecord',
                'UpdateRecord',
                'DeleteRecord',
                'UpsertRecord',
                'AssociateRecords',
                'GetRecord',
                'ListRecords',
                'GetItem',
                'ListItems',
              ].includes(operationId)
            ) {
              const apiId = (host?.apiId as string) || '';
              const connectionName = (host?.connectionName as string) || '';
              const isDataverseConnector =
                apiId.includes('commondataservice') ||
                connectionName.includes('commondataservice') ||
                connectorId?.toLowerCase().includes('commondataservice');

              if (isDataverseConnector) {
                (summary.customApisCalled as Set<string>).add(operationId);
              }
            }
          }

          // Add action summary
          (summary.actions as unknown[]).push({
            name: fullPath,
            type: action.type,
            runAfter: runAfter ? Object.keys(runAfter) : [],
          });

          // Recurse into nested actions
          if (action.actions) {
            processActions(action.actions as Record<string, unknown>, fullPath);
          }
          if (action.then) {
            processActions(
              action.then as Record<string, unknown>,
              `${fullPath}/then`
            );
          }
          if (action.else) {
            processActions(
              action.else as Record<string, unknown>,
              `${fullPath}/else`
            );
          }
          if (action.cases) {
            for (const [caseName, caseActions] of Object.entries(
              action.cases as Record<string, unknown>
            )) {
              const caseData = caseActions as Record<string, unknown>;
              if (caseData.actions) {
                processActions(
                  caseData.actions as Record<string, unknown>,
                  `${fullPath}/case:${caseName}`
                );
              }
            }
          }
          if (action.default) {
            processActions(
              action.default as Record<string, unknown>,
              `${fullPath}/default`
            );
          }
        }
      };

      if (definition?.actions) {
        const actions = definition.actions as Record<string, unknown>;
        summary.actionCount = Object.keys(actions).length;
        processActions(actions);
      }

      // Convert Sets to arrays
      summary.connectors = Array.from(summary.connectors as Set<string>);
      summary.tablesModified = Array.from(
        summary.tablesModified as Set<string>
      );
      summary.customApisCalled = Array.from(
        summary.customApisCalled as Set<string>
      );

      // Add connection references
      if (properties?.connectionReferences) {
        const refs = properties.connectionReferences as Record<string, unknown>;
        summary.connectionReferences = Object.keys(refs).map((key) => ({
          name: key,
          type:
            ((refs[key] as Record<string, unknown>)?.api as { name?: string })
              ?.name || 'unknown',
        }));
      }
    } catch {
      summary.parseError = 'Partial parse - some information may be missing';
    }

    return summary;
  }

  /**
   * Get flow run history for a specific Power Automate flow using the Dataverse flowruns table.
   */
  async getFlowRuns(
    flowId: string,
    options: FlowRunFilterOptions = {}
  ): Promise<FlowRunsResult> {
    const {
      status,
      startedAfter,
      startedBefore,
      maxRecords = 50,
    } = options;

    const limit = Math.min(maxRecords, 250);

    try {
      const filterConditions: string[] = [`_workflow_value eq '${flowId}'`];

      if (status) {
        filterConditions.push(`status eq '${status}'`);
      }

      if (startedAfter) {
        filterConditions.push(`starttime ge ${startedAfter}`);
      }

      if (startedBefore) {
        filterConditions.push(`starttime le ${startedBefore}`);
      }

      const filterString = filterConditions.join(' and ');

      const response = await this.client.get<
        ApiCollectionResponse<Record<string, unknown>>
      >(
        `api/data/v9.2/flowruns?$filter=${filterString}&$select=flowrunid,status,starttime,endtime,errorcode,errormessage,duration,triggertype&$orderby=starttime desc&$top=${limit + 1}`
      );

      const runsData = response.value || [];
      const hasMore = runsData.length > limit;
      const trimmedRuns = hasMore ? runsData.slice(0, limit) : runsData;

      const formattedRuns: FlowRunSummary[] = trimmedRuns.map((run: Record<string, unknown>) => {
        const errorCode = run.errorcode as string | null;
        const errorMessage = run.errormessage as string | null;
        const triggerType = run.triggertype as string | null;

        return {
          runId: run.flowrunid as string,
          flowId,
          status: run.status as string,
          startTime: run.starttime as string,
          endTime: (run.endtime as string) || null,
          trigger: triggerType ? {
            name: triggerType,
            status: run.status as string,
            startTime: run.starttime as string,
            endTime: (run.endtime as string) || null,
          } : null,
          error: (errorCode || errorMessage) ? {
            code: errorCode || 'Unknown',
            message: errorMessage || 'Unknown error',
          } : null,
        };
      });

      const environmentId = await this.getEnvironmentId();

      return {
        flowId,
        environmentId,
        totalCount: formattedRuns.length,
        hasMore,
        filterApplied: {
          status,
          startedAfter,
          startedBefore,
          maxRecords: limit,
        },
        runs: formattedRuns,
      };
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { error?: { code?: string; message?: string } };
        };
        message?: string;
      };

      const apiError = err.response?.data?.error;
      if (err.response?.status === 404) {
        throw new Error(`Flow runs not found for flow: ${flowId}. Verify the flow ID is correct.`);
      }
      if (err.response?.status === 403) {
        throw new Error(`Access denied to flowruns table. Ensure the service principal has read access to the flowruns Elastic table.`);
      }

      const errorDetails = apiError || err.response?.data || err.message;
      throw new Error(
        `Failed to get flow runs: ${err.message} - ${JSON.stringify(errorDetails)}`
      );
    }
  }

  /**
   * Get detailed flow run information including action-level outputs and errors.
   * Uses the Flow API (api.flow.microsoft.com) with $expand to get action details.
   */
  async getFlowRunDetails(flowId: string, runId: string): Promise<unknown> {
    try {
      const environmentId = await this.getEnvironmentId();
      const token = await this.client.getManagementToken();

      // If runId looks like a GUID, try to get the name from Dataverse flowruns table
      let flowApiRunId = runId;
      if (runId.includes('-') && runId.length === 36) {
        try {
          const response = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
            `api/data/v9.2/flowruns?$filter=flowrunid eq ${runId}&$select=name`
          );
          if (response.value && response.value.length > 0) {
            flowApiRunId = (response.value[0].name as string) || runId;
          }
        } catch {
          flowApiRunId = runId;
        }
      }

      const url = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${environmentId}/flows/${flowId}/runs/${flowApiRunId}?$expand=properties/actions&api-version=2016-11-01`;

      const response = await axios({
        method: 'GET',
        url,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      const runData = response.data;
      const properties = runData.properties || {};

      const result: Record<string, unknown> = {
        flowId,
        runId: flowApiRunId,
        originalRunId: runId,
        name: runData.name,
        status: properties.status,
        code: properties.code,
        error: properties.error,
        startTime: properties.startTime,
        endTime: properties.endTime,
        trigger: {
          name: properties.trigger?.name,
          status: properties.trigger?.status,
          startTime: properties.trigger?.startTime,
          endTime: properties.trigger?.endTime,
        },
        actions: {},
        actionsSummary: {
          total: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          other: 0,
        },
        failedActionErrors: [] as { action: string; code: string; message: string }[],
      };

      const actions = result.actions as Record<string, unknown>;
      const actionsSummary = result.actionsSummary as {
        total: number;
        succeeded: number;
        failed: number;
        skipped: number;
        other: number;
      };
      const failedErrors = result.failedActionErrors as { action: string; code: string; message: string }[];

      if (properties.actions) {
        for (const [actionName, actionData] of Object.entries(properties.actions)) {
          const action = actionData as Record<string, unknown>;
          const actionStatus = ((action.status as string) || '').toLowerCase();
          const outputsLink = (action.outputsLink as { uri?: string })?.uri;

          const actionResult: Record<string, unknown> = {
            status: action.status,
            code: action.code,
            startTime: action.startTime,
            endTime: action.endTime,
            error: null,
          };

          if (actionStatus === 'failed' && outputsLink) {
            try {
              const outputResponse = await axios.get(outputsLink);
              const outputData = outputResponse.data;
              if (outputData?.body?.error) {
                actionResult.error = outputData.body.error;
                failedErrors.push({
                  action: actionName,
                  code: outputData.body.error.code || action.code || 'Unknown',
                  message: outputData.body.error.message || 'Unknown error',
                });
              }
            } catch {
              actionResult.error = { code: action.code, message: 'Could not fetch detailed error' };
            }
          }

          actions[actionName] = actionResult;

          actionsSummary.total++;
          if (actionStatus === 'succeeded') {
            actionsSummary.succeeded++;
          } else if (actionStatus === 'failed') {
            actionsSummary.failed++;
          } else if (actionStatus === 'skipped') {
            actionsSummary.skipped++;
          } else {
            actionsSummary.other++;
          }
        }
      }

      return result;
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { error?: unknown };
        };
        message?: string;
      };
      const errorDetails =
        err.response?.data?.error || err.response?.data || err.message;
      throw new Error(
        `Failed to get flow run details: ${err.message} - ${JSON.stringify(errorDetails)}`
      );
    }
  }

  /**
   * Cancel a running or waiting flow run
   */
  async cancelFlowRun(flowId: string, runId: string): Promise<CancelFlowRunResult> {
    try {
      const environmentId = await this.getEnvironmentId();
      const token = await this.client.getManagementToken();

      const runDetails = await this.getFlowRunDetails(flowId, runId) as Record<string, unknown>;
      const status = (runDetails.status as string) || '';

      const terminalStates = ['Succeeded', 'Failed', 'Cancelled'];
      if (terminalStates.includes(status)) {
        throw new Error(`Cannot cancel flow run - already in terminal state: ${status}`);
      }

      const url = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${environmentId}/flows/${flowId}/runs/${runId}/cancel?api-version=2016-11-01`;

      await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      return {
        success: true,
        flowId,
        runId,
        previousStatus: status,
      };
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { error?: unknown };
        };
        message?: string;
      };
      const errorDetails = err.response?.data?.error || err.response?.data || err.message;
      throw new Error(
        `Failed to cancel flow run: ${err.message} - ${JSON.stringify(errorDetails)}`
      );
    }
  }

  /**
   * Resubmit/retry a failed flow run using the original trigger inputs
   */
  async resubmitFlowRun(flowId: string, runId: string): Promise<ResubmitFlowRunResult> {
    try {
      const environmentId = await this.getEnvironmentId();
      const token = await this.client.getManagementToken();

      const flowDef = await this.getFlowDefinition(flowId, false) as Record<string, unknown>;
      const flowDefinition = flowDef.flowDefinition as Record<string, unknown> | null;
      const properties = flowDefinition?.properties as Record<string, unknown> | undefined;
      const definition = properties?.definition as Record<string, unknown> | undefined;
      const triggers = definition?.triggers as Record<string, unknown> | undefined;
      const triggerName = triggers ? Object.keys(triggers)[0] : 'manual';

      const url = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${environmentId}/flows/${flowId}/triggers/${triggerName}/histories/${runId}/resubmit?api-version=2016-11-01`;

      const response = await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      return {
        success: true,
        flowId,
        originalRunId: runId,
        newRunId: (response.data as Record<string, unknown>)?.name as string || 'pending',
        triggerName,
      };
    } catch (error: unknown) {
      const err = error as {
        response?: {
          status?: number;
          statusText?: string;
          data?: { error?: unknown };
        };
        message?: string;
      };
      const errorDetails = err.response?.data?.error || err.response?.data || err.message;
      throw new Error(
        `Failed to resubmit flow run: ${err.message} - ${JSON.stringify(errorDetails)}`
      );
    }
  }

  /**
   * Batch-scan all cloud flows for health metrics.
   * Iterates all flows, fetches run history for each, and computes per-flow
   * success rates, failure counts, and identifies top failing flows.
   */
  async scanFlowHealth(options?: {
    daysBack?: number;
    maxRunsPerFlow?: number;
    maxFlows?: number;
    activeOnly?: boolean;
    filterConfig?: FlowFilterConfig;
  }): Promise<FlowHealthScanResult> {
    const {
      daysBack = 7,
      maxRunsPerFlow = 100,
      maxFlows = 500,
      activeOnly = true,
      filterConfig,
    } = options ?? {};

    const startedAfter = new Date(
      Date.now() - daysBack * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Fetch all flows
    const flowList = await this.getFlows({
      activeOnly,
      maxRecords: maxFlows,
      excludeSystem: true,
      excludeCopilotSales: true,
      excludeCustomerInsights: true,
    });

    // Apply additional filter config
    const { included: filteredFlows, excluded } = applyFlowFilters(
      flowList.flows,
      filterConfig,
    );

    console.error(`Scanning ${filteredFlows.length} flows (${excluded + flowList.excluded.total} excluded)...`);

    // Build tasks for concurrent execution
    const tasks = filteredFlows.map(
      (flow) => async (): Promise<FlowHealthEntry> => {
        try {
          const runsResult = await this.getFlowRuns(flow.workflowid, {
            startedAfter,
            maxRecords: maxRunsPerFlow,
          });

          const runs = runsResult.runs;
          const succeeded = runs.filter((r) => r.status === 'Succeeded').length;
          const failed = runs.filter((r) => r.status === 'Failed').length;
          const cancelled = runs.filter((r) => r.status === 'Cancelled').length;
          const running = runs.filter((r) => r.status === 'Running' || r.status === 'Waiting').length;
          const total = runs.length;
          const successRate = total > 0 ? Math.round((succeeded / total) * 10000) / 100 : 0;

          const failedRuns = runs.filter((r) => r.status === 'Failed');
          const lastFailure = failedRuns.length > 0 ? failedRuns[0] : null;

          return {
            flowId: flow.workflowid,
            flowName: flow.name,
            state: flow.state,
            statecode: flow.statecode,
            totalRuns: total,
            succeededRuns: succeeded,
            failedRuns: failed,
            cancelledRuns: cancelled,
            runningRuns: running,
            successRate,
            lastRunTime: runs.length > 0 ? runs[0].startTime : null,
            lastFailureTime: lastFailure?.startTime ?? null,
            lastErrorCode: lastFailure?.error?.code ?? null,
            lastErrorMessage: lastFailure?.error?.message ?? null,
          };
        } catch (error) {
          // Return entry with zero runs on error (e.g. access denied to flowruns)
          return {
            flowId: flow.workflowid,
            flowName: flow.name,
            state: flow.state,
            statecode: flow.statecode,
            totalRuns: 0,
            succeededRuns: 0,
            failedRuns: 0,
            cancelledRuns: 0,
            runningRuns: 0,
            successRate: 0,
            lastRunTime: null,
            lastFailureTime: null,
            lastErrorCode: null,
            lastErrorMessage: error instanceof Error ? `Scan error: ${error.message}` : null,
          };
        }
      },
    );

    // Execute with concurrency limit of 5
    const results = await withConcurrencyLimit(tasks, 5);
    const allFlows: FlowHealthEntry[] = results
      .filter((r): r is PromiseFulfilledResult<FlowHealthEntry> => r.status === 'fulfilled')
      .map((r) => r.value);

    // Aggregate metrics
    const flowsWithFailures = allFlows.filter((f) => f.failedRuns > 0);
    const flowsHealthy = allFlows.filter((f) => f.failedRuns === 0 && f.totalRuns > 0);
    const flowsNoRuns = allFlows.filter((f) => f.totalRuns === 0);
    const totalRuns = allFlows.reduce((sum, f) => sum + f.totalRuns, 0);
    const totalFailures = allFlows.reduce((sum, f) => sum + f.failedRuns, 0);
    const totalSucceeded = allFlows.reduce((sum, f) => sum + f.succeededRuns, 0);
    const overallSuccessRate = totalRuns > 0
      ? Math.round((totalSucceeded / totalRuns) * 10000) / 100
      : 0;

    // Top failing flows sorted by failure count
    const topFailingFlows = [...flowsWithFailures]
      .sort((a, b) => b.failedRuns - a.failedRuns)
      .slice(0, 20);

    console.error(`Scan complete: ${allFlows.length} flows, ${totalRuns} runs, ${totalFailures} failures`);

    return {
      scanTime: new Date().toISOString(),
      daysAnalyzed: daysBack,
      summary: {
        totalFlowsScanned: allFlows.length,
        flowsExcluded: excluded + flowList.excluded.total,
        flowsWithFailures: flowsWithFailures.length,
        flowsHealthy: flowsHealthy.length,
        flowsNoRuns: flowsNoRuns.length,
        totalRunsAnalyzed: totalRuns,
        totalFailures,
        overallSuccessRate,
      },
      topFailingFlows,
      allFlows,
    };
  }

  /**
   * Get a complete inventory of all cloud flows.
   * Lighter than scanFlowHealth — returns deployment metadata without run history.
   * Follows @odata.nextLink for pagination to capture all flows.
   */
  async getFlowInventory(options?: {
    maxRecords?: number;
    filterConfig?: FlowFilterConfig;
  }): Promise<FlowInventoryResult> {
    const { maxRecords = 500, filterConfig } = options ?? {};

    const allRecords: Record<string, unknown>[] = [];
    let nextUrl: string | null =
      `api/data/v9.2/workflows?$filter=category eq 5&$select=workflowid,name,statecode,statuscode,ismanaged,modifiedon&$expand=modifiedby($select=fullname)&$orderby=name&$top=${Math.min(maxRecords, 500)}`;

    while (nextUrl && allRecords.length < maxRecords) {
      const page: ApiCollectionResponse<Record<string, unknown>> = await this.client.get(nextUrl);
      allRecords.push(...page.value);

      const pageAny = page as unknown as Record<string, unknown>;
      const odataNext: string | undefined = pageAny['@odata.nextLink'] as string | undefined;
      if (odataNext && allRecords.length < maxRecords) {
        // Use relative URL from the nextLink
        const baseUrl = this.client.organizationUrl;
        nextUrl = odataNext.startsWith(baseUrl)
          ? odataNext.substring(baseUrl.length + 1)
          : odataNext;
      } else {
        nextUrl = null;
      }
    }

    const trimmed = allRecords.slice(0, maxRecords);

    const flows: FlowInventoryEntry[] = trimmed.map((flow) => ({
      flowId: flow.workflowid as string,
      flowName: flow.name as string,
      name: flow.name as string,
      state:
        flow.statecode === 0 ? 'Draft'
          : flow.statecode === 1 ? 'Activated'
            : 'Suspended',
      statecode: flow.statecode as number,
      isManaged: flow.ismanaged as boolean,
      modifiedOn: flow.modifiedon as string,
      modifiedBy: (flow.modifiedby as { fullname?: string })?.fullname ?? null,
    }));

    const { included, excluded } = applyFlowFilters(flows, filterConfig);

    return {
      totalCount: included.length,
      excluded,
      flows: included,
    };
  }

  private async getEnvironmentId(): Promise<string> {
    const envId = process.env.POWERPLATFORM_ENVIRONMENT_ID;
    if (envId) {
      this.environmentId = envId;
      return this.environmentId;
    }

    if (this.environmentId) {
      return this.environmentId;
    }

    const orgResponse = await this.client.get<
      ApiCollectionResponse<{ organizationid: string }>
    >('api/data/v9.2/organizations?$select=organizationid');

    if (!orgResponse.value || orgResponse.value.length === 0) {
      throw new Error('Could not retrieve organization ID');
    }

    this.environmentId = orgResponse.value[0].organizationid;
    return this.environmentId;
  }
}
