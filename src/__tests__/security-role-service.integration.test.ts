import { describe, it, expect, beforeAll } from 'vitest';
import { hasCredentials, createSecurityRoleService } from './test-helpers.js';
import type { SecurityRoleService } from '../services/security-role-service.js';

const SYSTEM_ROLE_NAMES = [
  'System Administrator',
  'System Customizer',
  'Support User',
  'Delegate',
];

describe.skipIf(!hasCredentials())('SecurityRoleService (integration)', () => {
  let service: SecurityRoleService;

  beforeAll(() => {
    service = createSecurityRoleService();
  });

  it('getSecurityRoles returns roles', async () => {
    const result = await service.getSecurityRoles();
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    expect(result.value.length).toBeGreaterThan(0);
  });

  it('getSecurityRoles excludes system roles by default', async () => {
    const result = await service.getSecurityRoles();
    const roleNames = result.value.map((r: Record<string, unknown>) => r.name);
    for (const systemRole of SYSTEM_ROLE_NAMES) {
      expect(roleNames).not.toContain(systemRole);
    }
  });

  it('getSecurityRoles with excludeSystemRoles false returns at least as many roles', async () => {
    const withExclusion = await service.getSecurityRoles({ excludeSystemRoles: true });
    const withoutExclusion = await service.getSecurityRoles({ excludeSystemRoles: false });
    expect(withoutExclusion.value.length).toBeGreaterThanOrEqual(withExclusion.value.length);
  });

  it('getSecurityRoles with includePrivileges returns roles with privileges array', async () => {
    const result = await service.getSecurityRoles({ maxRecords: 2, includePrivileges: true });
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    if (result.value.length > 0) {
      const role = result.value[0] as Record<string, unknown>;
      expect(role.privileges).toBeDefined();
      expect(Array.isArray(role.privileges)).toBe(true);
    }
  });

  it('getSecurityRolePrivileges returns privileges with depth mask', async () => {
    const roles = await service.getSecurityRoles({ maxRecords: 1 });
    if (roles.value.length === 0) {
      console.log('No roles found, skipping privileges test');
      return;
    }

    const roleId = String((roles.value[0] as Record<string, unknown>).roleid);
    const result = await service.getSecurityRolePrivileges(roleId);
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
    if (result.value.length > 0) {
      expect(result.value[0]).toHaveProperty('privilegedepthmask');
    }
  });

  it('getSecurityRolesBySolution returns roles for Default solution', async () => {
    const result = await service.getSecurityRolesBySolution('Default');
    expect(result).toBeDefined();
    expect(result.value).toBeInstanceOf(Array);
  });
});
