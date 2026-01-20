/**
 * PluginService
 *
 * Read-only service for plugin assemblies, types, steps, images, and trace logs.
 */

import { PowerPlatformClient } from '../PowerPlatformClient.js';
import type { ApiCollectionResponse } from '../models/index.js';

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
