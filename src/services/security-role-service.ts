/**
 * SecurityRoleService
 *
 * Read-only service for querying security roles, role privileges,
 * and solution-scoped role assignments from Dataverse.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import type { ApiCollectionResponse } from '../models/index.js';
import type { SolutionService } from './solution-service.js';

const SYSTEM_ROLE_NAMES = [
  'System Administrator',
  'System Customizer',
  'Support User',
  'Delegate',
];

export interface SecurityRoleOptions {
  /** Filter to roles in a specific solution */
  solutionUniqueName?: string;
  /** Exclude system roles like System Administrator (default: true) */
  excludeSystemRoles?: boolean;
  /** Maximum records to return (default: 100) */
  maxRecords?: number;
  /** Include privilege details for each role (default: false) */
  includePrivileges?: boolean;
}

export interface SecurityRolePrivilegeOptions {
  /** Filter privileges by entity name (contains match) */
  entityFilter?: string;
  /** Filter by access right (e.g., Read, Write, Create, Delete) */
  accessRightFilter?: string;
}

export class SecurityRoleService {
  constructor(
    private client: PowerPlatformClient,
    private solutionService: SolutionService
  ) {}

  /**
   * Get security roles filtered to unmanaged or customizable roles.
   */
  async getSecurityRoles(
    options: SecurityRoleOptions = {}
  ): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const { excludeSystemRoles = true, maxRecords = 100, solutionUniqueName, includePrivileges = false } = options;

    if (solutionUniqueName) {
      return this.getSecurityRolesBySolution(solutionUniqueName, { includePrivileges });
    }

    let filter = '(ismanaged eq false or iscustomizable/Value eq true)';
    if (excludeSystemRoles) {
      const exclusions = SYSTEM_ROLE_NAMES.map(name => `name ne '${name}'`).join(' and ');
      filter += ` and ${exclusions}`;
    }

    const select = 'roleid,name,roleidunique,ismanaged,iscustomizable,businessunitid';
    const endpoint =
      `api/data/v9.2/roles` +
      `?$select=${select}` +
      `&$filter=${filter}` +
      `&$orderby=name` +
      `&$top=${maxRecords}`;

    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(endpoint);

    if (includePrivileges) {
      const rolesWithPrivileges = await Promise.all(
        result.value.map(async (role: Record<string, unknown>) => {
          const privileges = await this.getSecurityRolePrivileges(String(role.roleid));
          return { ...role, privileges: privileges.value };
        })
      );
      return { value: rolesWithPrivileges };
    }

    return result;
  }

  /**
   * Get privileges assigned to a specific security role.
   */
  async getSecurityRolePrivileges(
    roleId: string,
    options: SecurityRolePrivilegeOptions = {}
  ): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const { entityFilter, accessRightFilter } = options;

    const endpoint =
      `api/data/v9.2/roles(${roleId})/roleprivileges_association` +
      `?$select=privilegeid,name,accessright,privilegedepthmask`;

    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(endpoint);

    if (entityFilter || accessRightFilter) {
      result.value = result.value.filter((priv: Record<string, unknown>) => {
        const privName = String(priv.name ?? '');
        if (entityFilter && !privName.toLowerCase().includes(entityFilter.toLowerCase())) {
          return false;
        }
        if (accessRightFilter && !privName.toLowerCase().startsWith(`prv${accessRightFilter.toLowerCase()}`)) {
          return false;
        }
        return true;
      });
    }

    return result;
  }

  /**
   * Get security roles included in a specific solution.
   */
  async getSecurityRolesBySolution(
    solutionUniqueName: string,
    options: { includePrivileges?: boolean } = {}
  ): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const { includePrivileges = false } = options;

    const solution = await this.solutionService.getSolution(solutionUniqueName);
    if (!solution) {
      throw new Error(`Solution '${solutionUniqueName}' not found`);
    }

    const componentsResult = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/solutioncomponents` +
      `?$filter=componenttype eq 20 and _solutionid_value eq ${solution.solutionid}` +
      `&$select=objectid,componenttype,rootcomponentbehavior`
    );

    const roleIds = componentsResult.value.map(c => String(c.objectid));
    if (roleIds.length === 0) {
      return { value: [] };
    }

    const roleIdFilter = roleIds.map(id => `roleid eq ${id}`).join(' or ');
    const select = 'roleid,name,roleidunique,ismanaged,iscustomizable,businessunitid';
    const rolesResult = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/roles` +
      `?$select=${select}` +
      `&$filter=${roleIdFilter}` +
      `&$orderby=name`
    );

    if (includePrivileges) {
      const rolesWithPrivileges = await Promise.all(
        rolesResult.value.map(async (role: Record<string, unknown>) => {
          const privileges = await this.getSecurityRolePrivileges(String(role.roleid));
          return { ...role, privileges: privileges.value };
        })
      );
      return { value: rolesWithPrivileges };
    }

    return rolesResult;
  }
}
