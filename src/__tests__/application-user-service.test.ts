import { describe, it, expect } from 'vitest';
import { ApplicationUserService } from '../services/application-user-service.js';
import { fakeClient, type Answer, type RecordedCall } from './fake-client.js';

const APP = '7a1215b2-8f49-47ac-8571-1a847e6458d4';
const USER = 'aaaaaaaa-0000-0000-0000-000000000001';
const ROOT_BU = 'bbbbbbbb-0000-0000-0000-000000000001';
const CHILD_BU = 'bbbbbbbb-0000-0000-0000-000000000002';
const ROLE = 'cccccccc-0000-0000-0000-000000000001';
const ROLE_IN_CHILD = 'cccccccc-0000-0000-0000-000000000002';
const OTHER_ROLE = 'cccccccc-0000-0000-0000-000000000003';

const user = (overrides: Record<string, unknown> = {}) => ({
  systemuserid: USER,
  applicationid: APP,
  fullname: '# func-dev-contoso',
  isdisabled: false,
  _businessunitid_value: ROOT_BU,
  ...overrides,
});

/** Routes for a user that `users` answers (an array, or a function of the call number), holding `held` roles. */
function routes(users: unknown[] | (() => unknown[]), held: unknown[] = [], extra: [string, Answer][] = []): [string, Answer][] {
  return [
    ['systemuserroles_association', { value: held }],
    ['systemusers?', () => ({ value: typeof users === 'function' ? users() : users })],
    ['businessunits?', { value: [{ businessunitid: ROOT_BU }] }],
    ...extra,
  ];
}

const writes = (calls: RecordedCall[]) => calls.filter((c) => c.method);

describe('ApplicationUserService.getApplicationUser', () => {
  it('reads the user by its application id, with its roles', async () => {
    const calls: RecordedCall[] = [];
    const service = new ApplicationUserService(fakeClient(routes([user()], [{ roleid: ROLE, name: 'Contoso App' }]), calls));

    const result = await service.getApplicationUser(APP.toUpperCase());

    expect(result).toEqual({
      systemUserId: USER,
      applicationId: APP,
      fullName: '# func-dev-contoso',
      businessUnitId: ROOT_BU,
      isDisabled: false,
      roles: [{ roleId: ROLE, name: 'Contoso App' }],
    });
    expect(calls[0].endpoint).toContain(`$filter=applicationid eq ${APP}`);
  });

  it('is null when there is none', async () => {
    const service = new ApplicationUserService(fakeClient(routes([])));

    expect(await service.getApplicationUser(APP)).toBeNull();
  });

  it('refuses a row for another application', async () => {
    const service = new ApplicationUserService(fakeClient(routes([user({ applicationid: OTHER_ROLE })])));

    await expect(service.getApplicationUser(APP)).rejects.toThrow(/do not match/);
  });
});

describe('ApplicationUserService.ensureApplicationUser', () => {
  it('creates the user in the root business unit, then gives it the role named', async () => {
    const calls: RecordedCall[] = [];
    let reads = 0;
    const service = new ApplicationUserService(fakeClient(routes(() => (reads++ === 0 ? [] : [user()]), [], [
      ["roles?", { value: [{ roleid: ROLE, name: 'Contoso App', _businessunitid_value: ROOT_BU }] }],
    ]), calls));

    const result = await service.ensureApplicationUser(APP, { roles: ['Contoso App'] });

    expect(result.created).toBe(true);
    expect(result.rolesAdded).toEqual([{ roleId: ROLE, name: 'Contoso App' }]);
    expect(result.user.roles).toEqual([{ roleId: ROLE, name: 'Contoso App' }]);
    expect(calls.find((c) => c.endpoint.startsWith('api/data/v9.2/roles?'))?.endpoint)
      .toContain(`$filter=name eq 'Contoso%20App' and _businessunitid_value eq ${ROOT_BU}`);
    expect(writes(calls)).toEqual([
      {
        method: 'POST',
        endpoint: 'api/data/v9.2/systemusers',
        data: { applicationid: APP, 'businessunitid@odata.bind': `/businessunits(${ROOT_BU})` },
        headers: undefined,
      },
      {
        method: 'POST',
        endpoint: `api/data/v9.2/systemusers(${USER})/systemuserroles_association/$ref`,
        data: { '@odata.id': `https://org.example.crm.dynamics.com/api/data/v9.2/roles(${ROLE})` },
        headers: undefined,
      },
    ]);
  });

  it('keeps an existing user and adds only the roles it lacks', async () => {
    const calls: RecordedCall[] = [];
    const service = new ApplicationUserService(fakeClient(routes([user()], [{ roleid: ROLE, name: 'Contoso App' }], [
      [`roles(${ROLE})`, { roleid: ROLE, name: 'Contoso App', _businessunitid_value: ROOT_BU, _parentrootroleid_value: ROLE }],
      [`roles(${OTHER_ROLE})`, { roleid: OTHER_ROLE, name: 'Basic User', _businessunitid_value: ROOT_BU, _parentrootroleid_value: OTHER_ROLE }],
    ]), calls));

    const result = await service.ensureApplicationUser(APP, { roles: [ROLE, OTHER_ROLE, ROLE] });

    expect(result.created).toBe(false);
    expect(result.rolesAdded).toEqual([{ roleId: OTHER_ROLE, name: 'Basic User' }]);
    expect(writes(calls).map((c) => c.data)).toEqual([
      { '@odata.id': `https://org.example.crm.dynamics.com/api/data/v9.2/roles(${OTHER_ROLE})` },
    ]);
    expect(calls.some((c) => c.endpoint.includes('businessunits'))).toBe(false);
  });

  it('writes nothing when the user already holds every role', async () => {
    const calls: RecordedCall[] = [];
    const service = new ApplicationUserService(fakeClient(routes([user()], [{ roleid: ROLE, name: 'Contoso App' }], [
      ['roles?', { value: [{ roleid: ROLE, name: 'contoso app', _businessunitid_value: ROOT_BU }] }],
    ]), calls));

    const result = await service.ensureApplicationUser(APP, { roles: ['Contoso App'] });

    expect(result).toMatchObject({ created: false, rolesAdded: [] });
    expect(writes(calls)).toHaveLength(0);
  });

  it("gives a role id from another business unit as that role's copy in the user's", async () => {
    const calls: RecordedCall[] = [];
    const service = new ApplicationUserService(fakeClient(routes([user({ _businessunitid_value: CHILD_BU })], [], [
      [`roles(${ROLE})`, { roleid: ROLE, name: 'Contoso App', _businessunitid_value: ROOT_BU, _parentrootroleid_value: ROLE }],
      ['roles?', { value: [{ roleid: ROLE_IN_CHILD, name: 'Contoso App', _businessunitid_value: CHILD_BU }] }],
    ]), calls));

    const result = await service.ensureApplicationUser(APP, { roles: [ROLE] });

    expect(result.rolesAdded).toEqual([{ roleId: ROLE_IN_CHILD, name: 'Contoso App' }]);
    expect(calls.find((c) => c.endpoint.startsWith('api/data/v9.2/roles?'))?.endpoint)
      .toContain(`$filter=_parentrootroleid_value eq ${ROLE} and _businessunitid_value eq ${CHILD_BU}`);
    expect(writes(calls)[0].data).toEqual({ '@odata.id': `https://org.example.crm.dynamics.com/api/data/v9.2/roles(${ROLE_IN_CHILD})` });
  });

  it('creates nothing when a role cannot be found', async () => {
    const calls: RecordedCall[] = [];
    const service = new ApplicationUserService(fakeClient(routes([], [], [['roles?', { value: [] }]]), calls));

    await expect(service.ensureApplicationUser(APP, { roles: ['Contoso Ap'] }))
      .rejects.toThrow(`No security role named 'Contoso Ap' in business unit ${ROOT_BU}.`);
    expect(writes(calls)).toHaveLength(0);
  });

  it('asks for the id when two roles share the name', async () => {
    const service = new ApplicationUserService(fakeClient(routes([user()], [], [['roles?', {
      value: [
        { roleid: ROLE, name: 'Contoso App', _businessunitid_value: ROOT_BU },
        { roleid: OTHER_ROLE, name: 'Contoso App', _businessunitid_value: ROOT_BU },
      ],
    }]])));

    await expect(service.ensureApplicationUser(APP, { roles: ['Contoso App'] })).rejects.toThrow(/give the role's id/);
  });

  it('creates the user in the business unit asked for', async () => {
    const calls: RecordedCall[] = [];
    let reads = 0;
    const service = new ApplicationUserService(fakeClient(routes(() => (reads++ === 0 ? [] : [user({ _businessunitid_value: CHILD_BU })])), calls));

    const result = await service.ensureApplicationUser(APP, { businessUnitId: CHILD_BU.toUpperCase() });

    expect(result).toMatchObject({ created: true, rolesAdded: [] });
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0].data).toEqual({ applicationid: APP, 'businessunitid@odata.bind': `/businessunits(${CHILD_BU})` });
    expect(calls.some((c) => c.endpoint.includes('businessunits?'))).toBe(false);
  });

  it('refuses a disabled user', async () => {
    const calls: RecordedCall[] = [];
    const service = new ApplicationUserService(fakeClient(routes([user({ isdisabled: true })]), calls));

    await expect(service.ensureApplicationUser(APP, { roles: ['Contoso App'] })).rejects.toThrow(/is disabled/);
    expect(writes(calls)).toHaveLength(0);
  });

  it('refuses to move an existing user to another business unit', async () => {
    const service = new ApplicationUserService(fakeClient(routes([user()])));

    await expect(service.ensureApplicationUser(APP, { businessUnitId: CHILD_BU })).rejects.toThrow(/does not move users/);
  });

  it('refuses an application id that is not a GUID before any request', async () => {
    const calls: RecordedCall[] = [];
    const service = new ApplicationUserService(fakeClient([], calls));

    await expect(service.ensureApplicationUser('func-dev-contoso')).rejects.toThrow(/applicationId must be a GUID/);
    expect(calls).toHaveLength(0);
  });
});
