import { describe, expect, it } from 'vitest';
import { SecurityRoleService } from '../services/security-role-service.js';
import type { SolutionService } from '../services/solution-service.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const roleId = '35b05200-99e2-f111-84ea-70a8a54b020b';
const first = '94c3ac2c-eb23-41cb-a903-4e2e49e910b4';
const second = '{4B1B300B-5781-440B-87B0-03A7EF6AE205}';

const service = (calls: RecordedCall[]) => new SecurityRoleService(fakeClient([], calls), {} as SolutionService);

describe('removeRolePrivileges', () => {
  it('removes each privilege in its own call, passing a reference to the privilege record', async () => {
    const calls: RecordedCall[] = [];

    await service(calls).removeRolePrivileges(roleId, [first, second]);

    expect(calls).toEqual([
      {
        method: 'POST',
        endpoint: `api/data/v9.2/roles(${roleId})/Microsoft.Dynamics.CRM.RemovePrivilegeRole`,
        data: { Privilege: { '@odata.type': 'Microsoft.Dynamics.CRM.privilege', privilegeid: first } },
        headers: undefined,
      },
      {
        method: 'POST',
        endpoint: `api/data/v9.2/roles(${roleId})/Microsoft.Dynamics.CRM.RemovePrivilegeRole`,
        data: { Privilege: { '@odata.type': 'Microsoft.Dynamics.CRM.privilege', privilegeid: '4b1b300b-5781-440b-87b0-03a7ef6ae205' } },
        headers: undefined,
      },
    ]);
  });

  it('refuses a malformed id before the first call, so the role is not left half-changed', async () => {
    const calls: RecordedCall[] = [];

    await expect(service(calls).removeRolePrivileges(roleId, [first, 'prvReadAccount'])).rejects.toThrow('privilegeId must be a GUID');
    expect(calls).toEqual([]);
  });

  it('refuses an empty list', async () => {
    await expect(service([]).removeRolePrivileges(roleId, [])).rejects.toThrow('at least one privilegeId');
  });
});
