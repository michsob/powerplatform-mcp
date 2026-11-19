/**
 * PluginService
 *
 * Service for plugin assemblies, types, steps, images, trace logs, and step registration.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import { fetchCapped, odataGuid, odataString, positiveCap, type Truncation } from '../odata.js';
import type { ApiCollectionResponse } from '../models/index.js';

/** A step's execution stage by name. Stage 30 is the main operation a Custom API's plug-in runs in. */
export function stageName(stage: unknown): string {
  switch (stage) {
    case 10: return 'PreValidation';
    case 20: return 'PreOperation';
    case 30: return 'MainOperation';
    case 40: return 'PostOperation';
    default: return `Unknown(${String(stage)})`;
  }
}

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

export interface PluginStepInventoryResult extends Truncation {
  [key: string]: unknown;
  totalCount: number;
  steps: PluginStepInventoryEntry[];
}

/** A step's settings that `updatePluginStep` can change, as Dataverse stores them. */
export interface PluginStepSettings {
  name: string;
  description: string | null;
  stage: number;
  mode: number;
  rank: number;
  configuration: string | null;
  /** Lower case and comma-separated; null runs an Update step on a change of any column. */
  filteringAttributes: string | null;
}

/** What `updatePluginStep` changes; a value left out stays as it is. */
export interface PluginStepChanges {
  name?: string;
  description?: string;
  stage?: number;
  mode?: number;
  rank?: number;
  configuration?: string;
  /** Columns whose change runs an Update step; null clears them, so a change of any column runs it. */
  filteringAttributes?: string[] | null;
}

/** A step before and after `updatePluginStep`. */
export interface PluginStepUpdateResult {
  stepId: string;
  messageName: string | null;
  entityName: string | null;
  before: PluginStepSettings;
  after: PluginStepSettings;
  /** The settings whose value changed; empty when the step was already as asked, and then nothing was written. */
  changes: (keyof PluginStepSettings)[];
}

/** A step `deletePluginStep` deleted, with the images that went with it. */
export interface PluginStepDeleteResult {
  stepId: string;
  name: string;
  messageName: string | null;
  entityName: string | null;
  stage: number;
  images: string[];
}

/** A step as `updatePluginStep` and `deletePluginStep` read it. */
interface StepRow {
  name: string;
  description?: string | null;
  stage: number;
  mode: number;
  rank: number;
  configuration?: string | null;
  filteringattributes?: string | null;
  ismanaged?: boolean;
  iscustomizable?: { Value?: boolean };
  sdkmessageid?: { name?: string } | null;
  sdkmessagefilterid?: { primaryobjecttypecode?: string } | null;
}

/** The stages a registered step can run in. 30 is a Custom API's main operation, which is not a step's to choose. */
const STEP_STAGES: readonly number[] = [10, 20, 40];

/** Filtering attributes as Dataverse stores them: trimmed, lower case, once each, in the order given. */
function filteringAttributeList(columns: string[]): string {
  const list = [...new Set(columns.map(c => c.trim().toLowerCase()).filter(c => c.length > 0))];
  if (list.length === 0) throw new Error('The filtering attributes are empty.');
  return list.join(',');
}

/** The same columns, whatever their order or case. */
function sameColumns(a: string | null, b: string | null): boolean {
  const set = (value: string | null) => (value ?? '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean).sort().join(',');
  return set(a) === set(b);
}

export class PluginService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get all plugin assemblies in the environment
   */
  async getPluginAssemblies(
    includeManaged: boolean = false,
    maxRecords: number = 100
  ): Promise<{ totalCount: number; assemblies: unknown[] } & Truncation> {
    // Hidden assemblies are excluded in the query itself. Dropping them after `$top` meant
    // the cap counted rows nobody saw, so `--max 200` could return far fewer than 200.
    const filters = ['ishidden/Value eq false'];
    if (!includeManaged) filters.push('ismanaged eq false');

    const { rows: assemblyRows, ...truncation } = await fetchCapped<Record<string, unknown>>(
      this.client,
      `api/data/v9.2/pluginassemblies?$filter=${filters.join(' and ')}&$select=pluginassemblyid,name,version,culture,publickeytoken,isolationmode,sourcetype,major,minor,createdon,modifiedon,ismanaged,ishidden&$expand=modifiedby($select=fullname)&$orderby=name`,
      maxRecords,
    );

    // Filter out hidden assemblies and format results
    const formattedAssemblies = assemblyRows
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
      ...truncation,
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
      `api/data/v9.2/pluginassemblies?$filter=name eq ${odataString(assemblyName)}&$select=pluginassemblyid,name,version,culture,publickeytoken,isolationmode,sourcetype,major,minor,createdon,modifiedon,ismanaged,ishidden,description&$expand=modifiedby($select=fullname)`
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
      // Filtering attributes apply to the Update message only; Dataverse ignores them on
      // every other message, so a Delete step has no columns to filter on.
      stepsWithoutFilteringAttributes: stepsWithImages
        .filter((s) => {
          const sdkmsg = s.sdkmessageid as { name?: string } | undefined;
          return sdkmsg?.name === 'Update' && !s.filteringattributes;
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
        `${validation.stepsWithoutFilteringAttributes.length} Update steps without filtering attributes (performance concern)`
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
      ? ` and sdkmessageid/name eq ${odataString(messageFilter)}`
      : '';

    const steps = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/sdkmessageprocessingsteps?$filter=sdkmessagefilterid/primaryobjecttypecode eq ${odataString(entityName)}${statusFilter}${msgFilter}&$select=sdkmessageprocessingstepid,name,stage,mode,rank,statuscode,asyncautodelete,filteringattributes,supporteddeployment,configuration,description,_plugintypeid_value,_sdkmessagefilterid_value,_impersonatinguserid_value&$expand=sdkmessageid($select=name),plugintypeid($select=typename),impersonatinguserid($select=fullname),sdkmessagefilterid($select=primaryobjecttypecode)&$orderby=stage,rank`
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
        stageName: stageName(step.stage),
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
          mainOperation: unknown[];
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
            mainOperation: [],
            postOperation: [],
          },
        });
      }
      const msg = messageGroups.get(step.message as string)!;
      if (step.stage === 10) msg.stages.preValidation.push(step);
      else if (step.stage === 20) msg.stages.preOperation.push(step);
      else if (step.stage === 30) msg.stages.mainOperation.push(step);
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
  }): Promise<{ totalCount: number; logs: unknown[] } & Truncation> {
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

    if (entityName) filters.push(`primaryentity eq ${odataString(entityName)}`);
    if (messageName) filters.push(`messagename eq ${odataString(messageName)}`);
    if (correlationId) filters.push(`correlationid eq ${odataGuid(correlationId, 'correlationId')}`);
    if (pluginStepId)
      filters.push(`_sdkmessageprocessingstepid_value eq ${odataGuid(pluginStepId, 'pluginStepId')}`);
    // A trace without an exception stores exceptiondetails as '' rather than null, so
    // `ne null` alone matched every row.
    if (exceptionOnly) filters.push(`exceptiondetails ne null and exceptiondetails ne ''`);

    const filterString = filters.join(' and ');

    const { rows: logRows, ...truncation } = await fetchCapped<Record<string, unknown>>(
      this.client,
      `api/data/v9.2/plugintracelogs?$filter=${filterString}&$orderby=createdon desc`,
      maxRecords,
    );

    // Parse logs for better readability
    const parsedLogs = logRows.map((log) => ({
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
      ...truncation,
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
    const cap = positiveCap(maxRecords);

    const { value: records, truncated } = await this.client.getAll<Record<string, unknown>>(
      `api/data/v9.2/sdkmessageprocessingsteps?$filter=${statusFilter}ishidden/Value eq false&$select=sdkmessageprocessingstepid,name,stage,mode,rank,statuscode,filteringattributes,ismanaged,modifiedon&$expand=sdkmessageid($select=name),plugintypeid($select=typename,assemblyname)&$orderby=name`,
      { maxRecords: cap, pageSize: Math.min(cap, 500) },
    );
    const trimmed = records;

    const steps: PluginStepInventoryEntry[] = trimmed.map((step) => {
      const sdkmsg = step.sdkmessageid as { name?: string } | null;
      const pluginType = step.plugintypeid as { typename?: string; assemblyname?: string } | null;

      return {
        stepId: step.sdkmessageprocessingstepid as string,
        name: step.name as string,
        messageName: sdkmsg?.name ?? 'Unknown',
        stage: step.stage as number,
        stageName: stageName(step.stage),
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
      hasMore: truncated,
      requestedMax: cap,
    };
  }

  /**
   * Look up a plugin type by its fully qualified class name (e.g. 'Contoso.Plugins.Accounts.SyncAccounts').
   * Returns the plugin type record or null if not found.
   */
  async getPluginType(typeName: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/plugintypes?$filter=typename eq ${odataString(typeName)}&$select=plugintypeid,typename,friendlyname,name,assemblyname&$top=1`,
    );
    return result.value && result.value.length > 0 ? result.value[0] : null;
  }

  /**
   * Get plugin packages in the environment.
   */
  async getPluginPackages(
    includeManaged: boolean = false,
    maxRecords: number = 100,
  ): Promise<{ totalCount: number; packages: unknown[] } & Truncation> {
    const managedFilter = includeManaged ? '' : 'ismanaged eq false and ';
    const { rows, ...truncation } = await fetchCapped<Record<string, unknown>>(
      this.client,
      `api/data/v9.2/pluginpackages?$filter=${managedFilter}statecode eq 0&$select=pluginpackageid,name,uniquename,version,ismanaged,modifiedon&$orderby=name`,
      maxRecords,
    );

    return {
      totalCount: rows.length,
      packages: rows,
      ...truncation,
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
      `api/data/v9.2/pluginpackages(${odataGuid(options.pluginPackageId, 'pluginPackageId')})`,
      body,
    );
  }

  /**
   * Look up an SDK message by name (e.g. 'Create', 'Update', 'contoso_SyncAccounts').
   * Returns the message record or null if not found.
   */
  async getSdkMessage(messageName: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/sdkmessages?$filter=name eq ${odataString(messageName)}&$select=sdkmessageid,name,categoryname,isactive,isprivate&$top=1`,
    );
    return result.value && result.value.length > 0 ? result.value[0] : null;
  }

  /**
   * Register a plugin step (SDK message processing step).
   *
   * The step's table is either `sdkMessageFilterId` or `entityName`, whose filter for the message is looked up; a step
   * with neither runs for every table. `filteringAttributes` (Update steps only) lists the columns whose change runs the
   * step: an update that sets none of them skips it. They are stored as Dataverse does, lower case and comma-separated.
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
    /** Logical name of the step's table: its message filter is looked up. Leave out with `sdkMessageFilterId`. */
    entityName?: string;
    /** Columns whose change runs an Update step. */
    filteringAttributes?: string[];
    solutionName?: string;
  }): Promise<{ stepId: string; sdkMessageFilterId?: string; filteringAttributes?: string }> {
    const messageId = odataGuid(options.sdkMessageId, 'sdkMessageId');
    if (options.entityName && options.sdkMessageFilterId) {
      throw new Error('Give the step\'s table either as an entity name or as a message filter id, not both.');
    }

    let filteringAttributes: string | undefined;
    if (options.filteringAttributes) {
      filteringAttributes = filteringAttributeList(options.filteringAttributes);
      const message = await this.client.get<{ name?: string }>(`api/data/v9.2/sdkmessages(${messageId})?$select=name`);
      if (message.name !== 'Update') {
        throw new Error(`Filtering attributes apply to Update steps only; this step is on ${message.name ?? 'an unknown message'}.`);
      }
    }

    let sdkMessageFilterId = options.sdkMessageFilterId;
    if (options.entityName) {
      const filters = await this.client.get<ApiCollectionResponse<{ sdkmessagefilterid: string }>>(
        `api/data/v9.2/sdkmessagefilters?$filter=_sdkmessageid_value eq ${messageId} and primaryobjecttypecode eq ${odataString(options.entityName)}&$select=sdkmessagefilterid&$top=1`,
      );
      sdkMessageFilterId = filters.value?.[0]?.sdkmessagefilterid;
      if (!sdkMessageFilterId) {
        throw new Error(`The message ${options.sdkMessageId} has no filter for '${options.entityName}': it cannot run on that table.`);
      }
    }

    const body: Record<string, unknown> = {
      name: options.name,
      'plugintypeid@odata.bind': `/plugintypes(${odataGuid(options.pluginTypeId, 'pluginTypeId')})`,
      'sdkmessageid@odata.bind': `/sdkmessages(${messageId})`,
      stage: options.stage,
      mode: options.mode,
      rank: options.rank ?? 1,
      supporteddeployment: options.supportedDeployment ?? 0,
    };

    if (options.description) body.description = options.description;
    if (options.configuration) body.configuration = options.configuration;
    if (filteringAttributes) body.filteringattributes = filteringAttributes;
    if (sdkMessageFilterId) {
      body['sdkmessagefilterid@odata.bind'] = `/sdkmessagefilters(${odataGuid(sdkMessageFilterId, 'sdkMessageFilterId')})`;
    }

    const headers = options.solutionName ? { 'MSCRM.SolutionUniqueName': options.solutionName } : undefined;
    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/sdkmessageprocessingsteps',
      body,
      headers,
    );

    return { stepId: result?.entityId ?? 'created', sdkMessageFilterId, filteringAttributes };
  }

  /**
   * Change a registered step in place: its name, description, stage, mode, rank, unsecure configuration and filtering
   * attributes. The step is read first; only the settings that differ are sent, in one PATCH, and nothing is written
   * when it is already as asked. Filtering attributes are compared as a set, so a new order or case is no change.
   * It keeps its id, its images and its place in its solutions, so the change is never a moment without the step,
   * as deleting and re-creating it would be.
   *
   * Refused, before anything is written: filtering attributes on a step that is not on Update; a stage other than 10,
   * 20 or 40; a mode other than 0 or 1; an asynchronous step that does not run post-operation (stage 40), counting the
   * settings it keeps; and a step that is not customizable.
   *
   * @param stepId The step's id (sdkmessageprocessingstepid)
   * @param changes The settings to change; leave one out to keep it. `filteringAttributes: null` clears them.
   */
  async updatePluginStep(stepId: string, changes: PluginStepChanges): Promise<PluginStepUpdateResult> {
    const id = odataGuid(stepId, 'stepId');
    if (Object.values(changes).every((value) => value === undefined)) {
      throw new Error('Nothing to change: give a name, description, stage, mode, rank, configuration or filtering attributes.');
    }
    if (changes.name !== undefined && changes.name.trim() === '') throw new Error('The name is empty.');
    if (changes.stage !== undefined && !STEP_STAGES.includes(changes.stage)) {
      throw new Error(`The stage must be 10 (PreValidation), 20 (PreOperation) or 40 (PostOperation), not ${changes.stage}.`);
    }
    if (changes.mode !== undefined && changes.mode !== 0 && changes.mode !== 1) {
      throw new Error(`The mode must be 0 (Synchronous) or 1 (Asynchronous), not ${changes.mode}.`);
    }
    if (changes.rank !== undefined && !Number.isInteger(changes.rank)) throw new Error(`The rank must be a whole number, not ${changes.rank}.`);
    const filteringAttributes = changes.filteringAttributes === undefined
      ? undefined
      : changes.filteringAttributes === null ? null : filteringAttributeList(changes.filteringAttributes);

    const step = await this.readStep(id);
    const messageName = step.sdkmessageid?.name ?? null;
    const entityName = step.sdkmessagefilterid?.primaryobjecttypecode ?? null;
    if (step.iscustomizable?.Value === false) {
      throw new Error(`The step '${step.name}' is ${step.ismanaged ? 'managed and ' : ''}not customizable: it cannot be changed here.`);
    }
    if (filteringAttributes && messageName !== 'Update') {
      throw new Error(`Filtering attributes apply to Update steps only; this step is on ${messageName ?? 'an unknown message'}.`);
    }

    const before: PluginStepSettings = {
      name: step.name,
      description: step.description ?? null,
      stage: step.stage,
      mode: step.mode,
      rank: step.rank,
      configuration: step.configuration ?? null,
      filteringAttributes: step.filteringattributes || null,
    };
    const after: PluginStepSettings = {
      name: changes.name ?? before.name,
      description: changes.description ?? before.description,
      stage: changes.stage ?? before.stage,
      mode: changes.mode ?? before.mode,
      rank: changes.rank ?? before.rank,
      configuration: changes.configuration ?? before.configuration,
      filteringAttributes: filteringAttributes === undefined || sameColumns(filteringAttributes, before.filteringAttributes)
        ? before.filteringAttributes
        : filteringAttributes,
    };
    if (after.mode === 1 && after.stage !== 40) {
      throw new Error(`An asynchronous step must run post-operation (stage 40); this one would run in stage ${after.stage} (${stageName(after.stage)}).`);
    }

    const columns: Record<keyof PluginStepSettings, string> = {
      name: 'name', description: 'description', stage: 'stage', mode: 'mode', rank: 'rank',
      configuration: 'configuration', filteringAttributes: 'filteringattributes',
    };
    const changed = (Object.keys(columns) as (keyof PluginStepSettings)[]).filter((key) => after[key] !== before[key]);
    if (changed.length > 0) {
      const body = Object.fromEntries(changed.map((key) => [columns[key], after[key]]));
      await this.client.patch(`api/data/v9.2/sdkmessageprocessingsteps(${id})`, body);
    }

    return { stepId: id, messageName, entityName, before, after, changes: changed };
  }

  /**
   * Delete (unregister) a step. Dataverse deletes its images with it, in the same request, so the delete is one write.
   * The step and its images are read first, so the result says what was deleted and a wrong id fails before anything
   * is written. A managed step is refused: it goes when its solution is uninstalled.
   *
   * @param stepId The step's id (sdkmessageprocessingstepid)
   */
  async deletePluginStep(stepId: string): Promise<PluginStepDeleteResult> {
    const id = odataGuid(stepId, 'stepId');
    const step = await this.readStep(id);
    if (step.ismanaged) {
      throw new Error(`The step '${step.name}' is managed: it is removed by uninstalling its solution, not deleted here.`);
    }
    const images = await this.client.get<ApiCollectionResponse<{ sdkmessageprocessingstepimageid: string; name?: string }>>(
      `api/data/v9.2/sdkmessageprocessingstepimages?$filter=_sdkmessageprocessingstepid_value eq ${id}&$select=sdkmessageprocessingstepimageid,name`,
    );
    const imageRows = images.value ?? [];
    await this.client.delete(`api/data/v9.2/sdkmessageprocessingsteps(${id})`);

    return {
      stepId: id,
      name: step.name,
      messageName: step.sdkmessageid?.name ?? null,
      entityName: step.sdkmessagefilterid?.primaryobjecttypecode ?? null,
      stage: step.stage,
      images: imageRows.map((image) => image.name ?? image.sdkmessageprocessingstepimageid),
    };
  }

  private async readStep(id: string): Promise<StepRow> {
    return this.client.get<StepRow>(
      `api/data/v9.2/sdkmessageprocessingsteps(${id})?$select=name,description,stage,mode,rank,configuration,filteringattributes,ismanaged,iscustomizable`
        + '&$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)',
    );
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
      'sdkmessageprocessingstepid@odata.bind': `/sdkmessageprocessingsteps(${odataGuid(options.stepId, 'stepId')})`,
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

  /**
   * `plugintracelog.operationtype` says what kind of code wrote the trace — a plug-in or a
   * custom workflow activity — not which SDK message ran; that is `messagename`.
   */
  private getOperationTypeName(operationType: number): string {
    const types: { [key: number]: string } = {
      0: 'Unknown',
      1: 'Plug-in',
      2: 'Workflow Activity',
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
