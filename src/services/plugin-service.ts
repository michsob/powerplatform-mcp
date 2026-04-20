/**
 * PluginService
 *
 * Service for plugin assemblies, types, steps, images, trace logs, and step registration.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';

export interface PluginStepInventoryEntry {
  stepId: string;
  name: string;
  messageName: string;
  stage: number;
  stageName: string;
  mode: number;
  modeName: string;
  statuscode: number;
  enabled: boolean;
  rank: number;
  filteringAttributes: string | null;
  pluginTypeName: string | null;
  assemblyName: string | null;
  isManaged: boolean;
  modifiedOn: string;
}

export interface PluginStepInventoryResult {
  [key: string]: unknown;
  totalCount: number;
  steps: PluginStepInventoryEntry[];
}

export class PluginService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get all plugin assemblies in the environment
   */
  async getPluginAssemblies(
    includeManaged: boolean = false,
    maxRecords: number = 100
  ): Promise<{ totalCount: number; assemblies: unknown[] }> {
    const managedFilter = includeManaged ? '' : '$filter=ismanaged eq false&';

    const assemblies = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/pluginassemblies?${managedFilter}$select=pluginassemblyid,name,version,culture,publickeytoken,isolationmode,sourcetype,major,minor,createdon,modifiedon,ismanaged,ishidden&$expand=modifiedby($select=fullname)&$orderby=name&$top=${maxRecords}`
    );

    // Filter out hidden assemblies and format results
    const formattedAssemblies = assemblies.value
      .filter((assembly) => {
        const isHidden =
          (assembly.ishidden as { Value?: boolean })?.Value !== undefined
            ? (assembly.ishidden as { Value: boolean }).Value
            : assembly.ishidden;
        return !isHidden;
      })
      .map((assembly) => ({
        pluginassemblyid: assembly.pluginassemblyid,
        name: assembly.name,
        version: assembly.version,
        isolationMode:
          assembly.isolationmode === 1
            ? 'None'
            : assembly.isolationmode === 2
              ? 'Sandbox'
              : 'External',
        isManaged: assembly.ismanaged,
        modifiedOn: assembly.modifiedon,
        modifiedBy: (assembly.modifiedby as { fullname?: string })?.fullname,
        major: assembly.major,
        minor: assembly.minor,
      }));

    return {
      totalCount: formattedAssemblies.length,
      assemblies: formattedAssemblies,
    };
  }

  /**
   * Get a plugin assembly by name with all related plugin types, steps, and images
   */
  async getPluginAssemblyComplete(
    assemblyName: string,
    includeDisabled: boolean = false
  ): Promise<{
    assembly: unknown;
    pluginTypes: unknown[];
    steps: unknown[];
    validation: {
      hasDisabledSteps: boolean;
      hasAsyncSteps: boolean;
      hasSyncSteps: boolean;
      stepsWithoutFilteringAttributes: string[];
      stepsWithoutImages: string[];
      potentialIssues: string[];
    };
  }> {
    // Get the plugin assembly
    const assemblies = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/pluginassemblies?$filter=name eq '${assemblyName}'&$select=pluginassemblyid,name,version,culture,publickeytoken,isolationmode,sourcetype,major,minor,createdon,modifiedon,ismanaged,ishidden,description&$expand=modifiedby($select=fullname)`
    );

    if (!assemblies.value || assemblies.value.length === 0) {
      throw new Error(`Plugin assembly '${assemblyName}' not found`);
    }

    const assembly = assemblies.value[0];
    const assemblyId = assembly.pluginassemblyid as string;

    // Get plugin types
    const pluginTypes = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/plugintypes?$filter=_pluginassemblyid_value eq ${assemblyId}&$select=plugintypeid,typename,friendlyname,name,assemblyname,description,workflowactivitygroupname`
    );

    // Get all steps for each plugin type
    const pluginTypeIds = pluginTypes.value.map((pt) => pt.plugintypeid as string);
    let allSteps: Record<string, unknown>[] = [];

    if (pluginTypeIds.length > 0) {
      const statusFilter = includeDisabled ? '' : ' and statuscode eq 1';
      const typeFilter = pluginTypeIds
        .map((id) => `_plugintypeid_value eq ${id}`)
        .join(' or ');
      const steps = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
        `api/data/v9.2/sdkmessageprocessingsteps?$filter=(${typeFilter})${statusFilter}&$select=sdkmessageprocessingstepid,name,stage,mode,rank,statuscode,asyncautodelete,filteringattributes,supporteddeployment,configuration,description,invocationsource,_plugintypeid_value,_sdkmessagefilterid_value,_impersonatinguserid_value,_eventhandler_value&$expand=sdkmessageid($select=name),plugintypeid($select=typename),impersonatinguserid($select=fullname),modifiedby($select=fullname),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=stage,rank`
      );
      allSteps = steps.value;
    }

    // Get all images for these steps
    const stepIds = allSteps.map((s) => s.sdkmessageprocessingstepid as string);
    let allImages: Record<string, unknown>[] = [];

    if (stepIds.length > 0) {
      const imageFilter = stepIds
        .map((id) => `_sdkmessageprocessingstepid_value eq ${id}`)
        .join(' or ');
      const images = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
        `api/data/v9.2/sdkmessageprocessingstepimages?$filter=${imageFilter}&$select=sdkmessageprocessingstepimageid,name,imagetype,messagepropertyname,entityalias,attributes,_sdkmessageprocessingstepid_value`
      );
      allImages = images.value;
    }

    // Attach images to their respective steps
    const stepsWithImages: Array<
      Record<string, unknown> & { images: Record<string, unknown>[] }
    > = allSteps.map((step) => ({
      ...step,
      images: allImages.filter(
        (img) =>
          img._sdkmessageprocessingstepid_value ===
          step.sdkmessageprocessingstepid
      ),
    }));

    // Validation checks
    const validation = {
      hasDisabledSteps: allSteps.some((s) => s.statuscode !== 1),
      hasAsyncSteps: allSteps.some((s) => s.mode === 1),
      hasSyncSteps: allSteps.some((s) => s.mode === 0),
      stepsWithoutFilteringAttributes: stepsWithImages
        .filter((s) => {
          const sdkmsg = s.sdkmessageid as { name?: string } | undefined;
          const msgName = sdkmsg?.name;
          return (
            (msgName === 'Update' || msgName === 'Delete') &&
            !s.filteringattributes
          );
        })
        .map((s) => s.name as string),
      stepsWithoutImages: stepsWithImages
        .filter((s) => {
          const sdkmsg = s.sdkmessageid as { name?: string } | undefined;
          const msgName = sdkmsg?.name;
          return (
            s.images.length === 0 &&
            (msgName === 'Update' || msgName === 'Delete')
          );
        })
        .map((s) => s.name as string),
      potentialIssues: [] as string[],
    };

    if (validation.stepsWithoutFilteringAttributes.length > 0) {
      validation.potentialIssues.push(
        `${validation.stepsWithoutFilteringAttributes.length} Update/Delete steps without filtering attributes (performance concern)`
      );
    }
    if (validation.stepsWithoutImages.length > 0) {
      validation.potentialIssues.push(
        `${validation.stepsWithoutImages.length} Update/Delete steps without images (may need entity data)`
      );
    }

    return {
      assembly,
      pluginTypes: pluginTypes.value,
      steps: stepsWithImages,
      validation,
    };
  }

  /**
   * Get all plugins that execute on a specific entity
   */
  async getEntityPluginPipeline(
    entityName: string,
    messageFilter?: string,
    includeDisabled: boolean = false
  ): Promise<{
    entity: string;
    messages: unknown[];
    steps: unknown[];
    executionOrder: string[];
  }> {
    const statusFilter = includeDisabled ? '' : ' and statuscode eq 1';
    const msgFilter = messageFilter
      ? ` and sdkmessageid/name eq '${messageFilter}'`
      : '';

    const steps = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/sdkmessageprocessingsteps?$filter=sdkmessagefilterid/primaryobjecttypecode eq '${entityName}'${statusFilter}${msgFilter}&$select=sdkmessageprocessingstepid,name,stage,mode,rank,statuscode,asyncautodelete,filteringattributes,supporteddeployment,configuration,description,_plugintypeid_value,_sdkmessagefilterid_value,_impersonatinguserid_value&$expand=sdkmessageid($select=name),plugintypeid($select=typename),impersonatinguserid($select=fullname),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=stage,rank`
    );

    // Get assembly information for each plugin type
    const pluginTypeIds = [
      ...new Set(
        steps.value
          .map((s) => s._plugintypeid_value as string)
          .filter((id) => id != null)
      ),
    ];
    const assemblyMap = new Map<string, unknown>();

    for (const typeId of pluginTypeIds) {
      const pluginType = await this.client.get<Record<string, unknown>>(
        `api/data/v9.2/plugintypes(${typeId})?$expand=pluginassemblyid($select=name,version)`
      );
      assemblyMap.set(typeId, pluginType.pluginassemblyid);
    }

    // Get images for all steps
    const stepIds = steps.value.map(
      (s) => s.sdkmessageprocessingstepid as string
    );
    let allImages: Record<string, unknown>[] = [];

    if (stepIds.length > 0) {
      const imageFilter = stepIds
        .map((id) => `_sdkmessageprocessingstepid_value eq ${id}`)
        .join(' or ');
      const images = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
        `api/data/v9.2/sdkmessageprocessingstepimages?$filter=${imageFilter}&$select=sdkmessageprocessingstepimageid,name,imagetype,messagepropertyname,entityalias,attributes,_sdkmessageprocessingstepid_value`
      );
      allImages = images.value;
    }

    // Format steps
    const formattedSteps = steps.value.map((step) => {
      const assembly = assemblyMap.get(step._plugintypeid_value as string) as {
        name?: string;
        version?: string;
      };
      const images = allImages.filter(
        (img) =>
          img._sdkmessageprocessingstepid_value ===
          step.sdkmessageprocessingstepid
      );

      return {
        sdkmessageprocessingstepid: step.sdkmessageprocessingstepid,
        name: step.name,
        stage: step.stage,
        stageName:
          step.stage === 10
            ? 'PreValidation'
            : step.stage === 20
              ? 'PreOperation'
              : 'PostOperation',
        mode: step.mode,
        modeName: step.mode === 0 ? 'Synchronous' : 'Asynchronous',
        rank: step.rank,
        message: (step.sdkmessageid as { name?: string })?.name,
        pluginType: (step.plugintypeid as { typename?: string })?.typename,
        assemblyName: assembly?.name,
        assemblyVersion: assembly?.version,
        filteringAttributes: step.filteringattributes
          ? (step.filteringattributes as string).split(',')
          : [],
        statuscode: step.statuscode,
        enabled: step.statuscode === 1,
        deployment:
          step.supporteddeployment === 0
            ? 'Server'
            : step.supporteddeployment === 1
              ? 'Offline'
              : 'Both',
        impersonatingUser: (step.impersonatinguserid as { fullname?: string })
          ?.fullname,
        hasPreImage: images.some(
          (img) => img.imagetype === 0 || img.imagetype === 2
        ),
        hasPostImage: images.some(
          (img) => img.imagetype === 1 || img.imagetype === 2
        ),
        images,
      };
    });

    // Organize by message
    const messageGroups = new Map<
      string,
      {
        messageName: string;
        stages: {
          preValidation: unknown[];
          preOperation: unknown[];
          postOperation: unknown[];
        };
      }
    >();

    formattedSteps.forEach((step) => {
      if (!messageGroups.has(step.message as string)) {
        messageGroups.set(step.message as string, {
          messageName: step.message as string,
          stages: {
            preValidation: [],
            preOperation: [],
            postOperation: [],
          },
        });
      }
      const msg = messageGroups.get(step.message as string)!;
      if (step.stage === 10) msg.stages.preValidation.push(step);
      else if (step.stage === 20) msg.stages.preOperation.push(step);
      else if (step.stage === 40) msg.stages.postOperation.push(step);
    });

    return {
      entity: entityName,
      messages: Array.from(messageGroups.values()),
      steps: formattedSteps,
      executionOrder: formattedSteps.map((s) => s.name as string),
    };
  }

  /**
   * Get plugin trace logs with filtering
   */
  async getPluginTraceLogs(options: {
    entityName?: string;
    messageName?: string;
    correlationId?: string;
    pluginStepId?: string;
    exceptionOnly?: boolean;
    hoursBack?: number;
    maxRecords?: number;
  }): Promise<{ totalCount: number; logs: unknown[] }> {
    const {
      entityName,
      messageName,
      correlationId,
      pluginStepId,
      exceptionOnly = false,
      hoursBack = 24,
      maxRecords = 50,
    } = options;

    // Build filter
    const filters: string[] = [];

    const dateThreshold = new Date();
    dateThreshold.setHours(dateThreshold.getHours() - hoursBack);
    filters.push(`createdon gt ${dateThreshold.toISOString()}`);

    if (entityName) filters.push(`primaryentity eq '${entityName}'`);
    if (messageName) filters.push(`messagename eq '${messageName}'`);
    if (correlationId) filters.push(`correlationid eq '${correlationId}'`);
    if (pluginStepId)
      filters.push(`_sdkmessageprocessingstepid_value eq ${pluginStepId}`);
    if (exceptionOnly) filters.push(`exceptiondetails ne null`);

    const filterString = filters.join(' and ');

    const logs = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/plugintracelogs?$filter=${filterString}&$orderby=createdon desc&$top=${maxRecords}`
    );

    // Parse logs for better readability
    const parsedLogs = logs.value.map((log) => ({
      ...log,
      modeName: log.mode === 0 ? 'Synchronous' : 'Asynchronous',
      operationTypeName: this.getOperationTypeName(log.operationtype as number),
      parsed: {
        hasException: !!log.exceptiondetails,
        exceptionType: log.exceptiondetails
          ? this.extractExceptionType(log.exceptiondetails as string)
          : null,
        exceptionMessage: log.exceptiondetails
          ? this.extractExceptionMessage(log.exceptiondetails as string)
          : null,
        stackTrace: log.exceptiondetails,
      },
    }));

    return {
      totalCount: parsedLogs.length,
      logs: parsedLogs,
    };
  }

  /**
   * Get all plugin SDK message processing steps across all assemblies.
   * Useful for cross-environment comparison of plugin registrations.
   */
  async getAllPluginSteps(options?: {
    includeDisabled?: boolean;
    maxRecords?: number;
  }): Promise<PluginStepInventoryResult> {
    // Dataverse OData's $top is a hard cap that does NOT emit @odata.nextLink; proper
    // pagination uses the `Prefer: odata.maxpagesize=N` header. Default raised well above
    // the old 500 cap — orgs routinely have 3000-5000+ steps (most of them OOTB).
    const { includeDisabled = true, maxRecords = 10000 } = options ?? {};
    const statusFilter = includeDisabled ? '' : 'statuscode eq 1 and ';
    const pageSize = Math.min(maxRecords, 500);

    const allRecords: Record<string, unknown>[] = [];
    let nextUrl: string | null =
      `api/data/v9.2/sdkmessageprocessingsteps?$filter=${statusFilter}ishidden/Value eq false&$select=sdkmessageprocessingstepid,name,stage,mode,rank,statuscode,filteringattributes,ismanaged,modifiedon&$expand=sdkmessageid($select=name),plugintypeid($select=typename,assemblyname)&$orderby=name`;
    const preferHeader = { Prefer: `odata.maxpagesize=${pageSize}` };

    while (nextUrl && allRecords.length < maxRecords) {
      const page: ApiCollectionResponse<Record<string, unknown>> = await this.client.get(nextUrl, preferHeader);
      allRecords.push(...page.value);

      const odataNext = (page as unknown as Record<string, unknown>)['@odata.nextLink'] as string | undefined;
      if (odataNext && allRecords.length < maxRecords) {
        const baseUrl = this.client.organizationUrl;
        nextUrl = odataNext.startsWith(baseUrl)
          ? odataNext.substring(baseUrl.length + 1)
          : odataNext;
      } else {
        nextUrl = null;
      }
    }

    const trimmed = allRecords.slice(0, maxRecords);

    const steps: PluginStepInventoryEntry[] = trimmed.map((step) => {
      const sdkmsg = step.sdkmessageid as { name?: string } | null;
      const pluginType = step.plugintypeid as { typename?: string; assemblyname?: string } | null;

      return {
        stepId: step.sdkmessageprocessingstepid as string,
        name: step.name as string,
        messageName: sdkmsg?.name ?? 'Unknown',
        stage: step.stage as number,
        stageName:
          step.stage === 10 ? 'PreValidation'
            : step.stage === 20 ? 'PreOperation'
              : 'PostOperation',
        mode: step.mode as number,
        modeName: step.mode === 0 ? 'Synchronous' : 'Asynchronous',
        statuscode: step.statuscode as number,
        enabled: step.statuscode === 1,
        rank: step.rank as number,
        filteringAttributes: (step.filteringattributes as string) ?? null,
        pluginTypeName: pluginType?.typename ?? null,
        assemblyName: pluginType?.assemblyname ?? null,
        isManaged: step.ismanaged as boolean,
        modifiedOn: step.modifiedon as string,
      };
    });

    return {
      totalCount: steps.length,
      steps,
    };
  }

  /**
   * Look up a plugin type by its fully qualified class name (e.g. 'miejskinajem.Plugins.Hospitable.SyncProperties').
   * Returns the plugin type record or null if not found.
   */
  async getPluginType(typeName: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/plugintypes?$filter=typename eq '${typeName}'&$select=plugintypeid,typename,friendlyname,name,assemblyname&$top=1`,
    );
    return result.value && result.value.length > 0 ? result.value[0] : null;
  }

  /**
   * Get plugin packages in the environment.
   */
  async getPluginPackages(
    includeManaged: boolean = false,
    maxRecords: number = 100,
  ): Promise<{ totalCount: number; packages: unknown[] }> {
    const managedFilter = includeManaged ? '' : 'ismanaged eq false and ';
    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/pluginpackages?$filter=${managedFilter}statecode eq 0&$select=pluginpackageid,name,uniquename,version,ismanaged,modifiedon&$orderby=name&$top=${maxRecords}`,
    );

    return {
      totalCount: result.value.length,
      packages: result.value,
    };
  }

  /**
   * Register a new plugin package by uploading a .nupkg file.
   * @param name Display name for the package
   * @param uniqueName Unique name for the package
   * @param version Package version (e.g. "1.0.0")
   * @param content Base64-encoded .nupkg file content
   * @param solutionName Optional solution to add the package to
   */
  async registerPluginPackage(options: {
    name: string;
    uniqueName: string;
    version: string;
    content: string;
    solutionName?: string;
  }): Promise<{ pluginPackageId: string }> {
    const body: Record<string, unknown> = {
      name: options.name,
      uniquename: options.uniqueName,
      version: options.version,
      content: options.content,
    };

    const headers = options.solutionName ? { 'MSCRM.SolutionUniqueName': options.solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/pluginpackages',
      body,
      headers,
    );

    return { pluginPackageId: result?.entityId ?? 'created' };
  }

  /**
   * Update an existing plugin package with new content.
   * @param pluginPackageId The ID of the existing plugin package
   * @param content Base64-encoded .nupkg file content
   * @param version Optional new version string
   */
  async updatePluginPackage(options: {
    pluginPackageId: string;
    content: string;
    version?: string;
  }): Promise<void> {
    const body: Record<string, unknown> = {
      content: options.content,
    };
    if (options.version) {
      body.version = options.version;
    }

    await this.client.patch(
      `api/data/v9.2/pluginpackages(${options.pluginPackageId})`,
      body,
    );
  }

  /**
   * Look up an SDK message by name (e.g. 'Create', 'Update', 'br_SyncProperties').
   * Returns the message record or null if not found.
   */
  async getSdkMessage(messageName: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/sdkmessages?$filter=name eq '${messageName}'&$select=sdkmessageid,name,categoryname,isactive,isprivate&$top=1`,
    );
    return result.value && result.value.length > 0 ? result.value[0] : null;
  }

  /**
   * Register a plugin step (SDK message processing step).
   * @param options Step configuration
   */
  async createPluginStep(options: {
    name: string;
    pluginTypeId: string;
    sdkMessageId: string;
    stage: number;
    mode: number;
    rank?: number;
    supportedDeployment?: number;
    description?: string;
    configuration?: string;
    sdkMessageFilterId?: string;
    solutionName?: string;
  }): Promise<{ stepId: string }> {
    const body: Record<string, unknown> = {
      name: options.name,
      'plugintypeid@odata.bind': `/plugintypes(${options.pluginTypeId})`,
      'sdkmessageid@odata.bind': `/sdkmessages(${options.sdkMessageId})`,
      stage: options.stage,
      mode: options.mode,
      rank: options.rank ?? 1,
      supporteddeployment: options.supportedDeployment ?? 0,
    };

    if (options.description) body.description = options.description;
    if (options.configuration) body.configuration = options.configuration;
    if (options.sdkMessageFilterId) {
      body['sdkmessagefilterid@odata.bind'] = `/sdkmessagefilters(${options.sdkMessageFilterId})`;
    }

    const headers = options.solutionName ? { 'MSCRM.SolutionUniqueName': options.solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/sdkmessageprocessingsteps',
      body,
      headers,
    );

    return { stepId: result?.entityId ?? 'created' };
  }

  /**
   * Register a PreImage or PostImage on an existing SDK message processing step.
   * Images let a plugin read the row state before/after the operation.
   * @param options Image configuration
   */
  async createPluginStepImage(options: {
    stepId: string;
    name?: string;
    entityAlias?: string;
    imageType?: number;
    messagePropertyName?: string;
    attributes?: string;
  }): Promise<{ imageId: string }> {
    const name = options.name ?? 'PreImage';
    const body: Record<string, unknown> = {
      name,
      entityalias: options.entityAlias ?? name,
      imagetype: options.imageType ?? 0,
      messagepropertyname: options.messagePropertyName ?? 'Target',
      'sdkmessageprocessingstepid@odata.bind': `/sdkmessageprocessingsteps(${options.stepId})`,
    };

    if (options.attributes) {
      body.attributes = options.attributes;
    }

    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/sdkmessageprocessingstepimages',
      body,
    );

    return { imageId: result?.entityId ?? 'created' };
  }

  private getOperationTypeName(operationType: number): string {
    const types: { [key: number]: string } = {
      0: 'None',
      1: 'Create',
      2: 'Update',
      3: 'Delete',
      4: 'Retrieve',
      5: 'RetrieveMultiple',
      6: 'Associate',
      7: 'Disassociate',
    };
    return types[operationType] || 'Unknown';
  }

  private extractExceptionType(exceptionDetails: string): string | null {
    const match = exceptionDetails.match(/^([^:]+):/);
    return match ? match[1].trim() : null;
  }

  private extractExceptionMessage(exceptionDetails: string): string | null {
    const lines = exceptionDetails.split('\n');
    if (lines.length > 0) {
      const firstLine = lines[0];
      const colonIndex = firstLine.indexOf(':');
      if (colonIndex > 0) {
        return firstLine.substring(colonIndex + 1).trim();
      }
    }
    return null;
  }
}
