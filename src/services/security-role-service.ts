/**
 * SecurityRoleService
 *
 * Service for querying and managing security roles, role privileges,
 * and solution-scoped role assignments in Dataverse.
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

export type PrivilegeDepth = 'Basic' | 'Local' | 'Deep' | 'Global';

export interface PrivilegeAssignment {
  privilegeId: string;
  depth: PrivilegeDepth;
  businessUnitId?: string;
}

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

export interface ListPrivilegeOptions {
  /** Filter privileges by name (contains match — Dataverse privileges follow prv{Action}{Entity}) */
  entityFilter?: string;
  /** Filter by access right (Read, Write, Create, Delete, Append, AppendTo, Assign, Share) */
  accessRightFilter?: string;
  /** Maximum records to return (default: 100) */
  maxRecords?: number;
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
   * Get privileges assigned to a specific security role, including the depth
   * (mask) of each assignment. Depth lives on the roleprivileges intersect,
   * name/accessright on the privilege entity — so this runs two queries and
   * merges the results.
   */
  async getSecurityRolePrivileges(
    roleId: string,
    options: SecurityRolePrivilegeOptions = {}
  ): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const { entityFilter, accessRightFilter } = options;

    const assignments = await this.getRolePrivilegeAssignments(roleId);
    if (assignments.length === 0) return { value: [] };

    const namesById = await this.lookupPrivilegeNames(assignments.map((a) => a.privilegeid));

    let merged: Record<string, unknown>[] = assignments.map((a) => {
      const info = namesById.get(a.privilegeid);
      return {
        privilegeid: a.privilegeid,
        name: info?.name,
        accessright: info?.accessright,
        privilegedepthmask: a.privilegedepthmask,
      };
    });

    if (entityFilter || accessRightFilter) {
      merged = merged.filter((priv) => {
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

    return { value: merged };
  }

  /**
   * Raw rows from the roleprivileges intersect — privilegeid + depth mask only,
   * no names. Used by getSecurityRolePrivileges and the clone fallback path.
   */
  private async getRolePrivilegeAssignments(
    roleId: string
  ): Promise<Array<{ privilegeid: string; privilegedepthmask: number }>> {
    const result = await this.client.get<ApiCollectionResponse<{ privilegeid: string; privilegedepthmask: number }>>(
      `api/data/v9.2/roleprivilegescollection?$filter=roleid eq ${roleId}&$select=privilegeid,privilegedepthmask`,
    );
    return result.value;
  }

  /**
   * Look up privilege names + access rights by id. Batched into chunks of 20
   * to keep the $filter URL within Dataverse limits.
   */
  private async lookupPrivilegeNames(
    privilegeIds: string[]
  ): Promise<Map<string, { name: string; accessright: number }>> {
    const map = new Map<string, { name: string; accessright: number }>();
    const chunkSize = 20;
    for (let i = 0; i < privilegeIds.length; i += chunkSize) {
      const chunk = privilegeIds.slice(i, i + chunkSize);
      const filter = chunk.map((id) => `privilegeid eq ${id}`).join(' or ');
      const result = await this.client.get<ApiCollectionResponse<{ privilegeid: string; name: string; accessright: number }>>(
        `api/data/v9.2/privileges?$select=privilegeid,name,accessright&$filter=${filter}`,
      );
      for (const p of result.value) {
        map.set(p.privilegeid, { name: p.name, accessright: p.accessright });
      }
    }
    return map;
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

  /**
   * List the system privilege catalog. Use this to discover privilegeId GUIDs
   * and the depths each privilege supports before calling addRolePrivileges.
   */
  async listPrivileges(
    options: ListPrivilegeOptions = {}
  ): Promise<ApiCollectionResponse<Record<string, unknown>>> {
    const { entityFilter, accessRightFilter, maxRecords = 100 } = options;

    const select = 'privilegeid,name,accessright,canbebasic,canbelocal,canbedeep,canbeglobal,canbeentityreference,canbeparententityreference';
    const filterParts: string[] = [];
    if (entityFilter) {
      filterParts.push(`contains(name,'${entityFilter.replace(/'/g, "''")}')`);
    }
    if (accessRightFilter) {
      filterParts.push(`startswith(name,'prv${accessRightFilter.replace(/'/g, "''")}')`);
    }

    const filterClause = filterParts.length > 0 ? `&$filter=${filterParts.join(' and ')}` : '';
    const endpoint =
      `api/data/v9.2/privileges` +
      `?$select=${select}` +
      filterClause +
      `&$orderby=name` +
      `&$top=${maxRecords}`;

    return this.client.get<ApiCollectionResponse<Record<string, unknown>>>(endpoint);
  }

  /**
   * Create a new security role. If businessUnitId is omitted, the role is
   * created in the organization's root business unit.
   */
  async createSecurityRole(options: {
    name: string;
    businessUnitId?: string;
    description?: string;
    solutionUniqueName?: string;
  }): Promise<{ roleId: string }> {
    const businessUnitId = options.businessUnitId ?? await this.getRootBusinessUnitId();

    const body: Record<string, unknown> = {
      name: options.name,
      'businessunitid@odata.bind': `/businessunits(${businessUnitId})`,
    };
    if (options.description !== undefined) {
      body.description = options.description;
    }

    const headers = options.solutionUniqueName
      ? { 'MSCRM.SolutionUniqueName': options.solutionUniqueName }
      : undefined;

    const result = await this.client.post<{ entityId?: string }>(
      'api/data/v9.2/roles',
      body,
      headers,
    );

    return { roleId: result?.entityId ?? 'created' };
  }

  /**
   * Update properties of an existing security role (name, description, BU).
   */
  async updateSecurityRole(
    roleId: string,
    patch: { name?: string; description?: string; businessUnitId?: string; solutionUniqueName?: string }
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.businessUnitId !== undefined) {
      body['businessunitid@odata.bind'] = `/businessunits(${patch.businessUnitId})`;
    }

    if (Object.keys(body).length === 0) {
      throw new Error('updateSecurityRole requires at least one field to change');
    }

    const headers = patch.solutionUniqueName
      ? { 'MSCRM.SolutionUniqueName': patch.solutionUniqueName }
      : undefined;

    await this.client.patch(`api/data/v9.2/roles(${roleId})`, body, headers);
  }

  /**
   * Delete a security role.
   */
  async deleteSecurityRole(roleId: string): Promise<void> {
    await this.client.delete(`api/data/v9.2/roles(${roleId})`);
  }

  /**
   * Clone an existing security role. Uses the bound CloneAsRole action so
   * the new role keeps the source role's privileges. If the action fails
   * (older orgs / permissions), falls back to creating a new role and
   * copying privileges via AddPrivilegesRole.
   */
  async cloneSecurityRole(
    sourceRoleId: string,
    options: { newName?: string; targetBusinessUnitId?: string; solutionUniqueName?: string } = {}
  ): Promise<{ roleId: string }> {
    const targetBusinessUnitId = options.targetBusinessUnitId ?? await this.getRootBusinessUnitId();

    try {
      const headers = options.solutionUniqueName
        ? { 'MSCRM.SolutionUniqueName': options.solutionUniqueName }
        : undefined;

      const result = await this.client.post<{ RoleId?: string; entityId?: string }>(
        `api/data/v9.2/roles(${sourceRoleId})/Microsoft.Dynamics.CRM.CloneAsRole`,
        { TargetBusinessUnitId: targetBusinessUnitId },
        headers,
      );

      const newRoleId = result?.RoleId ?? result?.entityId;
      if (!newRoleId) {
        throw new Error('CloneAsRole did not return a new role id');
      }

      if (options.newName) {
        await this.updateSecurityRole(newRoleId, { name: options.newName, solutionUniqueName: options.solutionUniqueName });
      }

      return { roleId: newRoleId };
    } catch (cloneError: any) {
      // Fallback: create a fresh role and copy privileges from the source.
      const sourceRole = await this.client.get<Record<string, unknown>>(
        `api/data/v9.2/roles(${sourceRoleId})?$select=name`,
      );
      const fallbackName = options.newName ?? `${sourceRole.name} (copy)`;

      const created = await this.createSecurityRole({
        name: fallbackName,
        businessUnitId: targetBusinessUnitId,
        solutionUniqueName: options.solutionUniqueName,
      });

      const rawAssignments = await this.getRolePrivilegeAssignments(sourceRoleId);
      const assignments = rawAssignments
        .map((row) => this.toPrivilegeAssignment(row))
        .filter((p): p is PrivilegeAssignment => p !== null);

      if (assignments.length > 0) {
        await this.addRolePrivileges(created.roleId, assignments);
      }

      return created;
    }
  }

  /**
   * Add privileges to a role (additive — existing privileges are preserved).
   */
  async addRolePrivileges(roleId: string, privileges: PrivilegeAssignment[]): Promise<void> {
    if (privileges.length === 0) {
      throw new Error('addRolePrivileges requires at least one privilege');
    }

    const body = {
      Privileges: privileges.map((p) => this.toApiPrivilege(p)),
    };

    await this.client.post(
      `api/data/v9.2/roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`,
      body,
    );
  }

  /**
   * Replace the full set of privileges on a role (destructive — wipes existing).
   */
  async replaceRolePrivileges(roleId: string, privileges: PrivilegeAssignment[]): Promise<void> {
    const body = {
      Privileges: privileges.map((p) => this.toApiPrivilege(p)),
    };

    await this.client.post(
      `api/data/v9.2/roles(${roleId})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole`,
      body,
    );
  }

  /**
   * Remove one or more privileges from a role. The bound RemovePrivilegeRole
   * action removes a single privilege per call, so this loops.
   */
  async removeRolePrivileges(roleId: string, privilegeIds: string[]): Promise<void> {
    if (privilegeIds.length === 0) {
      throw new Error('removeRolePrivileges requires at least one privilegeId');
    }

    for (const privilegeId of privilegeIds) {
      await this.client.post(
        `api/data/v9.2/roles(${roleId})/Microsoft.Dynamics.CRM.RemovePrivilegeRole`,
        { PrivilegeId: privilegeId },
      );
    }
  }

  private toApiPrivilege(p: PrivilegeAssignment): Record<string, unknown> {
    const body: Record<string, unknown> = {
      PrivilegeId: p.privilegeId,
      Depth: p.depth,
    };
    if (p.businessUnitId) {
      body.BusinessUnitId = p.businessUnitId;
    }
    return body;
  }

  /**
   * Convert a role-privilege association row (returned by getSecurityRolePrivileges)
   * back into a PrivilegeAssignment usable by addRolePrivileges. Returns null when
   * the depth mask is unrecognised.
   */
  private toPrivilegeAssignment(priv: Record<string, unknown>): PrivilegeAssignment | null {
    const privilegeId = priv.privilegeid ? String(priv.privilegeid) : null;
    if (!privilegeId) return null;

    const mask = Number(priv.privilegedepthmask ?? 0);
    // Dataverse uses bit flags; the highest set bit wins when copying.
    let depth: PrivilegeDepth | null = null;
    if (mask & 8) depth = 'Global';
    else if (mask & 4) depth = 'Deep';
    else if (mask & 2) depth = 'Local';
    else if (mask & 1) depth = 'Basic';

    return depth ? { privilegeId, depth } : null;
  }

  private async getRootBusinessUnitId(): Promise<string> {
    const result = await this.client.get<ApiCollectionResponse<Record<string, unknown>>>(
      `api/data/v9.2/businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null&$top=1`,
    );
    const bu = result.value[0];
    if (!bu) {
      throw new Error('Unable to locate the root business unit for this organization');
    }
    return String(bu.businessunitid);
  }
}
