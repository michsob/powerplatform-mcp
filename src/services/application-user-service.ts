/**
 * ApplicationUserService
 *
 * Application users: the Dataverse users an app registration or a managed identity signs in as
 * (systemuser rows with an applicationid), and the security roles they hold.
 */

import { PowerPlatformClient } from '../powerplatform-client.js';
import { expectAll, isGuid, odataGuid, odataString } from '../odata.js';
import type { ApiCollectionResponse } from '../models/index.js';
import { getRootBusinessUnitId } from './business-units.js';

export interface ApplicationUserRole {
  roleId: string;
  name: string;
}

export interface ApplicationUser {
  systemUserId: string;
  applicationId: string;
  /** The name Dataverse gives it from Microsoft Entra ID: `# <the app's display name>`. */
  fullName: string;
  businessUnitId: string;
  isDisabled: boolean;
  roles: ApplicationUserRole[];
}

export interface EnsureApplicationUserOptions {
  /** Security roles to give it, each a role id or a role name; resolved in the user's business unit. */
  roles?: string[];
  /** The business unit for a new user (default: the root business unit). */
  businessUnitId?: string;
}

export interface EnsureApplicationUserResult {
  user: ApplicationUser;
  /** False when the user already existed. */
  created: boolean;
  /** The roles this call assigned; roles the user already held are not repeated. */
  rolesAdded: ApplicationUserRole[];
}

interface UserRow {
  systemuserid: string;
  applicationid: string;
  fullname?: string;
  isdisabled?: boolean;
  _businessunitid_value: string;
}

interface RoleRow {
  roleid: string;
  name: string;
  _businessunitid_value?: string;
  _parentrootroleid_value?: string | null;
}

const USER_SELECT = 'systemuserid,applicationid,fullname,isdisabled,_businessunitid_value';
const ROLE_SELECT = 'roleid,name,_businessunitid_value';

export class ApplicationUserService {
  constructor(private client: PowerPlatformClient) {}

  /** The application user for an application (client) id, with its roles; null when there is none. */
  async getApplicationUser(applicationId: string): Promise<ApplicationUser | null> {
    const appId = odataGuid(applicationId, 'applicationId');
    const result = await this.client.get<ApiCollectionResponse<UserRow>>(
      `api/data/v9.2/systemusers?$select=${USER_SELECT}&$filter=applicationid eq ${appId}`,
    );
    const rows = expectAll(result.value, (u) => sameId(u.applicationid, appId), `applicationid ${appId}`);
    if (rows.length === 0) return null;
    if (rows.length > 1) {
      throw new Error(`${rows.length} users have application id ${appId}: ${rows.map((u) => u.systemuserid).join(', ')}`);
    }

    const row = rows[0];
    const roles = await this.client.getAll<RoleRow>(
      `api/data/v9.2/systemusers(${odataGuid(row.systemuserid, 'systemuserid')})/systemuserroles_association?$select=roleid,name`,
    );
    return {
      systemUserId: row.systemuserid,
      applicationId: row.applicationid,
      fullName: row.fullname ?? '',
      businessUnitId: row._businessunitid_value,
      isDisabled: row.isdisabled === true,
      roles: roles.value.map((r) => ({ roleId: r.roleid, name: r.name })),
    };
  }

  /**
   * The application user for an application (client) id, created when there is none, with every role asked for.
   * Safe to run again: an existing user is kept as it is and only the roles it lacks are added. Every role is
   * resolved before the first write, so a wrong name or id changes nothing.
   *
   * Dataverse looks the application up in Microsoft Entra ID when the user is created and fills in its name, so the
   * app registration's or managed identity's service principal must exist in the environment's tenant.
   */
  async ensureApplicationUser(
    applicationId: string,
    options: EnsureApplicationUserOptions = {},
  ): Promise<EnsureApplicationUserResult> {
    const appId = odataGuid(applicationId, 'applicationId');
    const askedUnit = options.businessUnitId === undefined ? undefined : odataGuid(options.businessUnitId, 'businessUnitId');

    const existing = await this.getApplicationUser(appId);
    if (existing?.isDisabled) {
      throw new Error(
        `The application user '${existing.fullName}' (${existing.systemUserId}) for ${appId} is disabled; ` +
        'enable it in the Power Platform admin center, then run this again.',
      );
    }
    if (existing && askedUnit && !sameId(existing.businessUnitId, askedUnit)) {
      throw new Error(
        `The application user '${existing.fullName}' (${existing.systemUserId}) for ${appId} is in business unit ` +
        `${existing.businessUnitId}, not ${askedUnit}; this does not move users.`,
      );
    }

    const businessUnitId = existing?.businessUnitId ?? askedUnit ?? await getRootBusinessUnitId(this.client);
    const roles = await this.resolveRoles(options.roles ?? [], businessUnitId);

    let user = existing;
    if (!user) {
      await this.client.post('api/data/v9.2/systemusers', {
        applicationid: appId,
        'businessunitid@odata.bind': `/businessunits(${odataGuid(businessUnitId, 'businessUnitId')})`,
      });
      user = await this.getApplicationUser(appId);
      if (!user) {
        throw new Error(`Dataverse accepted the application user for ${appId} but it cannot be read back.`);
      }
    }

    const held = new Set(user.roles.map((r) => r.roleId.toLowerCase()));
    const rolesAdded = roles.filter((r) => !held.has(r.roleId.toLowerCase()));
    const userId = odataGuid(user.systemUserId, 'systemuserid');
    for (const role of rolesAdded) {
      await this.client.post(`api/data/v9.2/systemusers(${userId})/systemuserroles_association/$ref`, {
        '@odata.id': `${this.client.organizationUrl}/api/data/v9.2/roles(${odataGuid(role.roleId, 'roleId')})`,
      });
    }

    return { user: { ...user, roles: [...user.roles, ...rolesAdded] }, created: !existing, rolesAdded };
  }

  /** Each role in the business unit, once; a role id from another business unit maps to that role's copy in this one. */
  private async resolveRoles(specs: string[], businessUnitId: string): Promise<ApplicationUserRole[]> {
    const resolved = new Map<string, ApplicationUserRole>();
    for (const spec of specs.map((s) => s.trim()).filter(Boolean)) {
      const role = isGuid(spec) ? await this.roleById(spec, businessUnitId) : await this.roleByName(spec, businessUnitId);
      resolved.set(role.roleId.toLowerCase(), role);
    }
    return [...resolved.values()];
  }

  private async roleById(id: string, businessUnitId: string): Promise<ApplicationUserRole> {
    const roleId = odataGuid(id, 'role');
    const role = await this.client.get<RoleRow>(
      `api/data/v9.2/roles(${roleId})?$select=${ROLE_SELECT},_parentrootroleid_value`,
    );
    if (sameId(role._businessunitid_value, businessUnitId)) return { roleId: role.roleid, name: role.name };

    // Every business unit holds its own copy of a role, under its own id; the root one is the copy's parent root role.
    const rootRoleId = odataGuid(role._parentrootroleid_value ?? role.roleid, 'parentrootroleid');
    const unit = odataGuid(businessUnitId, 'businessUnitId');
    const copies = await this.client.get<ApiCollectionResponse<RoleRow>>(
      `api/data/v9.2/roles?$select=${ROLE_SELECT}&$filter=_parentrootroleid_value eq ${rootRoleId} and _businessunitid_value eq ${unit}`,
    );
    const rows = expectAll(copies.value, (r) => sameId(r._businessunitid_value, unit), `business unit ${unit}`);
    if (rows.length !== 1) {
      throw new Error(`Role '${role.name}' (${roleId}) has ${rows.length === 0 ? 'no copy' : `${rows.length} copies`} in business unit ${unit}.`);
    }
    return { roleId: rows[0].roleid, name: rows[0].name };
  }

  private async roleByName(name: string, businessUnitId: string): Promise<ApplicationUserRole> {
    const unit = odataGuid(businessUnitId, 'businessUnitId');
    const result = await this.client.get<ApiCollectionResponse<RoleRow>>(
      `api/data/v9.2/roles?$select=${ROLE_SELECT}&$filter=name eq ${odataString(name)} and _businessunitid_value eq ${unit}`,
    );
    // Dataverse compares strings without regard to case.
    const rows = expectAll(
      result.value,
      (r) => r.name.toLowerCase() === name.toLowerCase() && sameId(r._businessunitid_value, unit),
      `role name '${name}' in business unit ${unit}`,
    );
    if (rows.length === 0) throw new Error(`No security role named '${name}' in business unit ${unit}.`);
    if (rows.length > 1) {
      throw new Error(`${rows.length} security roles are named '${name}' in business unit ${unit} (${rows.map((r) => r.roleid).join(', ')}); give the role's id.`);
    }
    return { roleId: rows[0].roleid, name: rows[0].name };
  }
}

function sameId(a: string | undefined | null, b: string): boolean {
  return typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
}
