/**
 * SolutionService
 *
 * Service for querying solutions, publishers, solution components,
 * exporting solutions, adding components, and publishing customizations.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import { odataString } from '../odata.js';
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
   * @param solutionUniqueName The unique name of the target solution
   * @param componentId The GUID of the component
   * @param componentType Dataverse component type code (see COMPONENT_TYPE_NAMES: 1=Entity, 2=Attribute, 61=WebResource, 91=PluginAssembly, 92=SdkMessageProcessingStep, etc.)
   * @param addRequiredComponents Whether to also add required dependencies
   */
  async addSolutionComponent(
    solutionUniqueName: string,
    componentId: string,
    componentType: number,
    addRequiredComponents: boolean = false,
  ): Promise<unknown> {
    return this.client.post(
      'api/data/v9.2/AddSolutionComponent',
      {
        ComponentId: componentId,
        ComponentType: componentType,
        SolutionUniqueName: solutionUniqueName,
        AddRequiredComponents: addRequiredComponents,
      },
    );
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
