/**
 * SolutionService
 *
 * Service for querying solutions, publishers, solution components,
 * exporting solutions, adding, removing and moving components, checking a solution
 * for missing dependencies, and publishing customizations.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import { odataGuid, odataInteger, odataString } from '../odata.js';
import type { ApiCollectionResponse } from '../models/index.js';

/** `solutioncomponent.componenttype` labels for the component types met most often. */
export const COMPONENT_TYPE_NAMES: Record<number, string> = {
  1: 'Entity', 2: 'Attribute', 3: 'Relationship', 9: 'OptionSet', 10: 'EntityRelationship',
  14: 'EntityKey', 20: 'SecurityRole', 24: 'Form', 26: 'View', 29: 'Process', 31: 'Report',
  36: 'EmailTemplate', 44: 'DuplicateRule', 59: 'Chart', 60: 'SystemForm', 61: 'WebResource',
  62: 'SiteMap', 63: 'ConnectionRole', 65: 'HierarchyRule', 66: 'CustomControl',
  70: 'FieldSecurityProfile', 80: 'ModelDrivenApp', 90: 'PluginType', 91: 'PluginAssembly',
  92: 'SdkMessageProcessingStep', 93: 'SdkMessageProcessingStepImage', 95: 'ServiceEndpoint',
  150: 'RoutingRule', 152: 'SLA', 161: 'MobileOfflineProfile', 300: 'CanvasApp', 371: 'Connector',
  372: 'Connector', 380: 'EnvironmentVariableDefinition', 381: 'EnvironmentVariableValue',
  400: 'AIProjectType', 401: 'AIProject', 402: 'AIConfiguration',
};

export function componentTypeName(componentType: number): string {
  return COMPONENT_TYPE_NAMES[componentType] ?? `Type ${componentType}`;
}

/** `dependency.dependencytype` labels. */
export const DEPENDENCY_TYPE_NAMES: Record<number, string> = {
  0: 'None', 1: 'SolutionInternal', 2: 'Published', 4: 'Unpublished',
};

/** A row of RetrieveMissingDependencies, with its type codes labelled. */
export type MissingDependency = Record<string, unknown> & {
  requiredComponentTypeName: string;
  dependentComponentTypeName: string;
  dependencyTypeName: string;
};

export interface MissingDependencies {
  solutionUniqueName: string;
  /**
   * The required components the solution does not include, one row per component in the solution
   * that needs one (`requiredcomponent*` is what is missing, `dependentcomponent*` what needs it).
   */
  missingDependencies: MissingDependency[];
}

export interface SolutionComponentRef {
  /** The component's own id (`objectid`), e.g. a table's MetadataId. */
  componentId: string;
  componentType: number;
  componentTypeName: string;
}

export interface RemovedSolutionComponent extends SolutionComponentRef {
  solutionUniqueName: string;
  /** The components the solution held under it (a table's columns, forms, views), removed with it. */
  subcomponents: SolutionComponentRef[];
}

export interface MovedSolutionComponent extends SolutionComponentRef {
  sourceSolutionUniqueName: string;
  targetSolutionUniqueName: string;
  /** The components the source held under it (a table's columns, forms, views), moved with it. */
  subcomponents: SolutionComponentRef[];
  /**
   * `rootcomponentbehavior` in each solution: 0 the table with all its subcomponents, 1 its metadata
   * without them, 2 a shell; null for a component that is not a table. They differ only when the
   * target already held the table another way.
   */
  rootComponentBehavior: { source: number | null; target: number | null };
  /** Both solutions checked after the move, so a component that needs what moved shows up. */
  missingDependencies: { source: MissingDependency[]; target: MissingDependency[] };
}

/**
 * How much of a table a solution holds, as the maker portal offers it: `all` its columns, forms and
 * views ("Include all objects"), its `metadata` without them ("Include table metadata"), or a `shell`
 * that only holds the ones added one by one (neither).
 */
export type TableInclude = 'all' | 'metadata' | 'shell';

/** `solutioncomponent.rootcomponentbehavior` for each {@link TableInclude}. */
export const TABLE_INCLUDE_BEHAVIOR: Record<TableInclude, number> = { all: 0, metadata: 1, shell: 2 };

/** A table's `rootcomponentbehavior` in words. */
export function tableIncludeDescription(behavior: number | null | undefined): string {
  switch (behavior) {
    case 0: return 'with all its columns, forms and views';
    case 1: return 'with its table metadata, without its columns, forms and views';
    case 2: return 'as a shell, holding only the columns, forms and views added one by one';
    default: return behavior === null || behavior === undefined ? 'not at all' : `with rootcomponentbehavior ${behavior}`;
  }
}

interface SolutionComponentRow {
  solutioncomponentid: string;
  objectid: string;
  componenttype: number;
  rootcomponentbehavior?: number | null;
}

const SOLUTION_COMPONENT_SELECT = 'solutioncomponentid,objectid,componenttype,rootcomponentbehavior';

function componentRef(row: SolutionComponentRow): SolutionComponentRef {
  return { componentId: row.objectid, componentType: row.componenttype, componentTypeName: componentTypeName(row.componenttype) };
}

function componentLabel(ref: { componentId: string; componentType: number }): string {
  return `${componentTypeName(ref.componentType)} ${ref.componentId}`;
}

/** Summary lines for a solution's missing dependencies: a heading, then up to `max` of them. */
export function missingDependencySummary(solutionUniqueName: string, missing: MissingDependency[], max = 10): string[] {
  if (missing.length === 0) {
    return [`✓ '${solutionUniqueName}': no missing dependencies`];
  }
  return [
    `✗ '${solutionUniqueName}': ${missing.length} missing ${missing.length === 1 ? 'dependency' : 'dependencies'}:`,
    ...missing.slice(0, max).map((d) => {
      const required = `${d.requiredComponentTypeName} ${d.requiredcomponentobjectid}`;
      // Dataverse reports a table the solution holds without all its subcomponents as needing itself.
      if (d.requiredcomponentobjectid === d.dependentcomponentobjectid && d.requiredcomponenttype === d.dependentcomponenttype) {
        return `    ${required}, required by itself (${d.dependencyTypeName}): the solution holds it without all its subcomponents`;
      }
      return `    ${required}, required by ${d.dependentComponentTypeName} ${d.dependentcomponentobjectid}`;
    }),
    ...(missing.length > max ? [`    ... and ${missing.length - max} more`] : []),
  ];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Run writes that belong together and, when one fails, say which of them were already done: the
 * solutions are left as those steps made them, so the caller needs to know where it stopped.
 */
async function inSteps<T>(what: string, body: (done: (step: string) => void) => Promise<T>): Promise<T> {
  const finished = new Map<string, number>();
  try {
    return await body((step) => finished.set(step, (finished.get(step) ?? 0) + 1));
  } catch (error) {
    const steps = [...finished].map(([step, n]) => (n > 1 ? `${step} (x${n})` : step));
    throw new Error(
      `${what} stopped: ${errorMessage(error)}. ` +
      (steps.length > 0 ? `Done before it: ${steps.join('; ')}.` : 'Nothing was changed before it.'),
    );
  }
}

function labelDependency(row: Record<string, unknown>): MissingDependency {
  const dependencyType = row.dependencytype as number;
  return {
    ...row,
    requiredComponentTypeName: componentTypeName(row.requiredcomponenttype as number),
    dependentComponentTypeName: componentTypeName(row.dependentcomponenttype as number),
    dependencyTypeName: DEPENDENCY_TYPE_NAMES[dependencyType] ?? `Type ${dependencyType}`,
  };
}

export class SolutionService {
  constructor(private client: PowerPlatformClient) {}

  /**
   * Get the publishers in the environment, each with `isreadonly`.
   *
   * All of them by default. A publisher that came with a managed solution built in another
   * organization (an ISV's, a partner's) is read-only here, and those are exactly the ones an
   * `isreadonly eq false` filter hid, along with every table they own. `writableOnly`
   * restores that filter, for picking a publisher to create components under.
   */
  async getPublishers(options: { writableOnly?: boolean } = {}): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const filter = options.writableOnly ? '&$filter=isreadonly eq false' : '';
    const result = await this.client.getAll<Record<string, unknown>>(
      'api/data/v9.2/publishers?$select=publisherid,uniquename,friendlyname,customizationprefix,customizationoptionvalueprefix,isreadonly,description,createdon,modifiedon' +
      `${filter}&$orderby=uniquename`
    );
    return { value: result.value };
  }

  /**
   * Get all visible solutions, ordered by creation date descending.
   */
  async getSolutions(): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const result = await this.client.getAll<Record<string, unknown>>(
      'api/data/v9.2/solutions?$filter=isvisible eq true&$orderby=createdon desc'
    );
    return { value: result.value };
  }

  /**
   * Get a specific solution by its unique name.
   * Returns the first matching solution, or null if not found.
   */
  async getSolution(uniqueName: string): Promise<Record<string, unknown> | null> {
    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/solutions?$filter=uniquename eq ${odataString(uniqueName)}&$top=1`
    );
    return result.value && result.value.length > 0 ? result.value[0] : null;
  }

  /**
   * Get all components in a solution, ordered by component type.
   * First resolves the solution by unique name, then fetches its components.
   */
  async getSolutionComponents(
    solutionUniqueName: string
  ): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const solution = await this.getSolution(solutionUniqueName);
    if (!solution) {
      throw new Error(`Solution '${solutionUniqueName}' not found`);
    }

    // Every page: a large solution holds more components than one page returns.
    const components = await this.client.getAll<Record<string, unknown>>(
      `api/data/v9.2/solutioncomponents?$filter=_solutionid_value eq ${solution.solutionid}&$orderby=componenttype`
    );
    return {
      value: components.value.map((c) => ({
        ...c,
        componentTypeName: componentTypeName(c.componenttype as number),
      })),
    };
  }

  /**
   * Export a solution as a base64-encoded package.
   * This is a read-only operation that serializes the solution for download.
   *
   * @param solutionName - The unique name of the solution to export
   * @param managed - Whether to export as a managed solution (default: false)
   */
  async exportSolution(
    solutionName: string,
    managed: boolean = false
  ): Promise<unknown> {
    return this.client.post(
      'api/data/v9.2/ExportSolution',
      {
        SolutionName: solutionName,
        Managed: managed,
        ExportAutoNumberingSettings: true,
        ExportCalendarSettings: true,
        ExportCustomizationSettings: true,
        ExportEmailTrackingSettings: true,
        ExportGeneralSettings: true,
        ExportMarketingSettings: true,
        ExportOutlookSynchronizationSettings: true,
        ExportRelationshipRoles: true,
        ExportIsvConfig: true,
        ExportSales: true,
        ExportExternalApplications: true,
      }
    );
  }

  /**
   * Add a component to a solution.
   *
   * A table comes with all its columns, forms and views unless `include` says otherwise: `metadata`
   * adds the table's own definition without them, `shell` only a container for them. The columns,
   * forms and views wanted are then added one by one; adding one of a table the solution does not
   * hold brings the table in as a shell. Adding a table the solution holds already only widens how it
   * holds it (shell, metadata, all): Dataverse never narrows it.
   *
   * @param solutionUniqueName The unique name of the target solution
   * @param componentId The GUID of the component
   * @param componentType Dataverse component type code (see COMPONENT_TYPE_NAMES: 1=Entity, 2=Attribute, 61=WebResource, 91=PluginAssembly, 92=SdkMessageProcessingStep, etc.)
   * @param addRequiredComponents Whether to also add required dependencies
   * @param options.include How much of a table to add (tables only); `all` by default
   */
  async addSolutionComponent(
    solutionUniqueName: string,
    componentId: string,
    componentType: number,
    addRequiredComponents: boolean = false,
    options: { include?: TableInclude } = {},
  ): Promise<unknown> {
    const include = options.include ?? 'all';
    if (!(include in TABLE_INCLUDE_BEHAVIOR)) {
      throw new Error(`include must be all, metadata or shell, not '${include}'`);
    }
    if (include !== 'all' && componentType !== 1) {
      throw new Error(`include applies to a table (component type 1), not to ${componentTypeName(componentType)}`);
    }
    return this.client.post(
      'api/data/v9.2/AddSolutionComponent',
      {
        ComponentId: componentId,
        ComponentType: componentType,
        SolutionUniqueName: solutionUniqueName,
        AddRequiredComponents: addRequiredComponents,
        // Sent only when asked for, so every other add is the request it always was. No settings at
        // all leaves the table's definition out too: what is left is the shell.
        ...(include === 'metadata' ? { DoNotIncludeSubcomponents: true } : {}),
        ...(include === 'shell' ? { DoNotIncludeSubcomponents: true, IncludedComponentSettingsValues: [] } : {}),
      },
    );
  }

  /**
   * How a solution holds a table (`rootcomponentbehavior`: 0 all, 1 metadata, 2 shell), or null
   * when it does not hold it.
   */
  async getTableInclude(solutionUniqueName: string, tableId: string): Promise<number | null> {
    const solution = await this.getSolution(solutionUniqueName);
    if (!solution) {
      throw new Error(`Solution '${solutionUniqueName}' not found`);
    }
    const row = await this.findSolutionComponent(solution.solutionid as string, tableId, 1);
    return row ? row.rootcomponentbehavior ?? null : null;
  }

  /**
   * Remove a component from an unmanaged solution. The component stays in the environment, and in any
   * other solution that holds it.
   *
   * The component is named by its own id (`objectid`, the id add-solution-component takes) or by the id of
   * its row in the solution (`solutioncomponentid`); get-solution-components lists both. A table held
   * without all its subcomponents has its columns, forms and views as rows of their own under it: they
   * leave the solution with it. Refuses a managed solution and a component the solution does not hold.
   */
  async removeSolutionComponent(
    solutionUniqueName: string,
    componentId: string,
    componentType: number,
  ): Promise<RemovedSolutionComponent> {
    const solution = await this.getUnmanagedSolution(solutionUniqueName);
    const solutionId = solution.solutionid as string;
    const row = await this.requireSolutionComponent(solutionId, solutionUniqueName, componentId, componentType);
    const subcomponents = await this.getSubcomponents(solutionId, row.solutioncomponentid);

    await inSteps(`Removing ${componentLabel(componentRef(row))} from '${solutionUniqueName}'`, (done) =>
      this.removeWithSubcomponents(solutionId, solutionUniqueName, row, done));

    return { solutionUniqueName, ...componentRef(row), subcomponents: subcomponents.map(componentRef) };
  }

  /**
   * Move a component from one unmanaged solution to another, then check both for missing dependencies.
   *
   * The target gets the component as the source holds it: a table with or without all its subcomponents,
   * and the subcomponents the source holds under it. Only then is it removed from the source, so a step
   * that fails leaves the component in both solutions, never in neither. The component itself is not
   * changed. `addRequiredComponents` also adds to the target what the component requires.
   */
  async moveSolutionComponent(
    sourceSolutionUniqueName: string,
    targetSolutionUniqueName: string,
    componentId: string,
    componentType: number,
    options: { addRequiredComponents?: boolean } = {},
  ): Promise<MovedSolutionComponent> {
    const source = await this.getUnmanagedSolution(sourceSolutionUniqueName);
    const target = await this.getUnmanagedSolution(targetSolutionUniqueName);
    if (source.solutionid === target.solutionid) {
      throw new Error(`The source and target are the same solution ('${sourceSolutionUniqueName}')`);
    }
    const sourceId = source.solutionid as string;
    const targetId = target.solutionid as string;
    const row = await this.requireSolutionComponent(sourceId, sourceSolutionUniqueName, componentId, componentType);
    const subcomponents = await this.getSubcomponents(sourceId, row.solutioncomponentid);
    const behavior = row.rootcomponentbehavior ?? null;
    const label = componentLabel(componentRef(row));

    const inTarget = await inSteps(
      `Moving ${label} from '${sourceSolutionUniqueName}' to '${targetSolutionUniqueName}'`,
      async (done) => {
        await this.addSolutionComponent(
          targetSolutionUniqueName, row.objectid, row.componenttype, options.addRequiredComponents ?? false,
          { include: behavior === 1 ? 'metadata' : behavior === 2 ? 'shell' : 'all' },
        );
        done(`added it to '${targetSolutionUniqueName}'`);
        for (const sub of subcomponents) {
          await this.addSolutionComponent(targetSolutionUniqueName, sub.objectid, sub.componenttype);
          done(`added a subcomponent to '${targetSolutionUniqueName}'`);
        }
        const added = await this.findSolutionComponent(targetId, row.objectid, row.componenttype);
        if (!added) {
          throw new Error(`Dataverse accepted the add, but ${label} is not in solution '${targetSolutionUniqueName}'`);
        }
        await this.removeWithSubcomponents(sourceId, sourceSolutionUniqueName, row, done);
        return added;
      },
    );

    let missing: [MissingDependency[], MissingDependency[]];
    try {
      missing = await Promise.all([
        this.retrieveMissingDependencies(sourceSolutionUniqueName),
        this.retrieveMissingDependencies(targetSolutionUniqueName),
      ]);
    } catch (error) {
      // The move is done; only the check after it is not.
      throw new Error(
        `Moved ${label} from '${sourceSolutionUniqueName}' to '${targetSolutionUniqueName}', but checking the two ` +
        `solutions for missing dependencies failed: ${errorMessage(error)}. Run check-solution-dependencies on each.`,
      );
    }

    return {
      sourceSolutionUniqueName,
      targetSolutionUniqueName,
      ...componentRef(row),
      subcomponents: subcomponents.map(componentRef),
      rootComponentBehavior: { source: behavior, target: inTarget.rootcomponentbehavior ?? null },
      missingDependencies: { source: missing[0], target: missing[1] },
    };
  }

  /**
   * The components that a solution's components require but the solution does not include
   * (RetrieveMissingDependencies): what an import of the solution would need the target environment to
   * have already. None missing means the solution carries everything its components need.
   */
  async getMissingDependencies(solutionUniqueName: string): Promise<MissingDependencies> {
    // A solution that does not exist could come back with nothing missing, which would read as all clear.
    if (!(await this.getSolution(solutionUniqueName))) {
      throw new Error(`Solution '${solutionUniqueName}' not found`);
    }
    return { solutionUniqueName, missingDependencies: await this.retrieveMissingDependencies(solutionUniqueName) };
  }

  /** RetrieveMissingDependencies is an unbound function: a GET, with the name passed as an alias. */
  private async retrieveMissingDependencies(solutionUniqueName: string): Promise<MissingDependency[]> {
    const result = await this.client.get<{ value?: Record<string, unknown>[] }>(
      `api/data/v9.2/RetrieveMissingDependencies(SolutionUniqueName=@p1)?@p1=${odataString(solutionUniqueName)}`
    );
    return (result.value ?? []).map(labelDependency);
  }

  /** A solution components can be added to and removed from: it exists, and it is unmanaged. */
  private async getUnmanagedSolution(uniqueName: string): Promise<Record<string, unknown>> {
    const solution = await this.getSolution(uniqueName);
    if (!solution) {
      throw new Error(`Solution '${uniqueName}' not found`);
    }
    if (solution.ismanaged === true) {
      throw new Error(`Solution '${uniqueName}' is managed; components can be added to and removed from unmanaged solutions only`);
    }
    return solution;
  }

  /**
   * A solution's row for a component, found by the component's own id (`objectid`) or by the row's id
   * (`solutioncomponentid`). Null when the solution does not hold the component.
   */
  private async findSolutionComponent(
    solutionId: string,
    componentId: string,
    componentType: number,
  ): Promise<SolutionComponentRow | null> {
    const id = odataGuid(componentId, 'componentId');
    const result = await this.client.get<ApiCollectionResponse<SolutionComponentRow>>(
      `api/data/v9.2/solutioncomponents?$select=${SOLUTION_COMPONENT_SELECT}` +
      `&$filter=_solutionid_value eq ${odataGuid(solutionId, 'solutionid')}` +
      ` and componenttype eq ${odataInteger(componentType, 'componentType')}` +
      ` and (objectid eq ${id} or solutioncomponentid eq ${id})`
    );
    return result.value?.[0] ?? null;
  }

  private async requireSolutionComponent(
    solutionId: string,
    solutionUniqueName: string,
    componentId: string,
    componentType: number,
  ): Promise<SolutionComponentRow> {
    const row = await this.findSolutionComponent(solutionId, componentId, componentType);
    if (!row) {
      throw new Error(`${componentLabel({ componentId, componentType })} is not in solution '${solutionUniqueName}'`);
    }
    return row;
  }

  /** The rows a solution holds under a component's row: a table's columns, forms and views, added one by one. */
  private async getSubcomponents(solutionId: string, solutionComponentId: string): Promise<SolutionComponentRow[]> {
    const result = await this.client.getAll<SolutionComponentRow>(
      `api/data/v9.2/solutioncomponents?$select=${SOLUTION_COMPONENT_SELECT}` +
      `&$filter=_solutionid_value eq ${odataGuid(solutionId, 'solutionid')}` +
      ` and rootsolutioncomponentid eq ${odataGuid(solutionComponentId, 'solutioncomponentid')}`
    );
    return result.value;
  }

  private async postRemoveSolutionComponent(solutionUniqueName: string, row: SolutionComponentRow): Promise<void> {
    // The Web API takes the component as a solutioncomponent entity, and the id that goes in it is the
    // component's own id (objectid), the id AddSolutionComponent takes: Microsoft's RemoveSolutionComponent
    // sample removes a table by its MetadataId.
    await this.client.post('api/data/v9.2/RemoveSolutionComponent', {
      SolutionComponent: {
        '@odata.type': 'Microsoft.Dynamics.CRM.solutioncomponent',
        solutioncomponentid: row.objectid,
      },
      ComponentType: row.componenttype,
      SolutionUniqueName: solutionUniqueName,
    });
  }

  /**
   * Remove a component from a solution, and with it the subcomponents the solution holds under it.
   * Dataverse takes those along when it removes a table; any it leaves are removed after it, one by one.
   * Each is looked up again first: removing one can take another with it (a lookup column takes its
   * relationship), and removing what is already gone fails.
   */
  private async removeWithSubcomponents(
    solutionId: string,
    solutionUniqueName: string,
    row: SolutionComponentRow,
    done: (step: string) => void,
  ): Promise<void> {
    await this.postRemoveSolutionComponent(solutionUniqueName, row);
    await this.expectRemoved(solutionId, solutionUniqueName, row);
    done(`removed it from '${solutionUniqueName}'`);
    for (const sub of await this.getSubcomponents(solutionId, row.solutioncomponentid)) {
      if (!(await this.findSolutionComponent(solutionId, sub.objectid, sub.componenttype))) continue;
      await this.postRemoveSolutionComponent(solutionUniqueName, sub);
      done(`removed a subcomponent it left in '${solutionUniqueName}'`);
    }
  }

  /** Throws when the solution still holds the component after a removal Dataverse accepted. */
  private async expectRemoved(solutionId: string, solutionUniqueName: string, row: SolutionComponentRow): Promise<void> {
    if (await this.findSolutionComponent(solutionId, row.objectid, row.componenttype)) {
      throw new Error(
        `Dataverse accepted the removal, but ${componentLabel(componentRef(row))} is still in solution '${solutionUniqueName}'`,
      );
    }
  }

  /**
   * Publish customizations for an entity or all entities.
   * @param entityLogicalName If provided, publishes only this entity. Otherwise publishes all.
   */
  async publishCustomizations(entityLogicalName?: string): Promise<void> {
    if (entityLogicalName) {
      await this.client.post(
        'api/data/v9.2/PublishXml',
        {
          ParameterXml: `<importexportxml><entities><entity>${entityLogicalName}</entity></entities></importexportxml>`,
        },
      );
    } else {
      await this.client.post('api/data/v9.2/PublishAllXml');
    }
  }
}
