import { describe, expect, it } from 'vitest';
import { CustomApiService } from '../services/customapi-service.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const api = {
  uniqueName: 'contoso_orderrecord',
  name: 'contoso_orderrecord',
  displayName: 'Order | Record',
  bindingType: 0,
  isFunction: false,
  isPrivate: false,
  allowedCustomProcessingStepType: 0,
};

const privileges = (names: string[]) => ['privileges', { value: names.map((name, i) => ({ privilegeid: `p${i}`, name })) }] as [string, unknown];

describe('createCustomApi', () => {
  it('stores the execute privilege with the environment\'s spelling, in the solution', async () => {
    const calls: RecordedCall[] = [];
    const service = new CustomApiService(fakeClient([privileges(['prvCreateAccount'])], calls));

    const result = await service.createCustomApi({ ...api, executePrivilegeName: ' prvcreateaccount ', solutionName: 'Contoso' });

    expect(result.executePrivilegeName).toBe('prvCreateAccount');
    expect(calls[0].endpoint).toContain(`$filter=name eq 'prvcreateaccount'`);
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.endpoint).toBe('api/data/v9.2/customapis');
    expect(post.data).toMatchObject({ uniquename: 'contoso_orderrecord', executeprivilegename: 'prvCreateAccount' });
    expect(post.headers).toEqual({ 'MSCRM.SolutionUniqueName': 'Contoso' });
  });

  it('refuses a privilege the environment does not have, and creates nothing', async () => {
    const calls: RecordedCall[] = [];
    const service = new CustomApiService(fakeClient([privileges([])], calls));

    await expect(service.createCustomApi({ ...api, executePrivilegeName: 'prvCreateAcount' }))
      .rejects.toThrow("No privilege is named 'prvCreateAcount'");
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('refuses a blank privilege name without asking the environment', async () => {
    const calls: RecordedCall[] = [];
    const service = new CustomApiService(fakeClient([], calls));

    await expect(service.createCustomApi({ ...api, executePrivilegeName: '  ' })).rejects.toThrow('empty');
    expect(calls).toEqual([]);
  });

  it('leaves the privilege out when none is given, so anyone who can call the API may run it', async () => {
    const calls: RecordedCall[] = [];
    const service = new CustomApiService(fakeClient([], calls));

    const result = await service.createCustomApi(api);

    expect(result.executePrivilegeName).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].data).not.toHaveProperty('executeprivilegename');
  });
});

describe('getCustomApi', () => {
  it('reads the execute privilege', async () => {
    const calls: RecordedCall[] = [];
    const service = new CustomApiService(fakeClient([
      ['customapis', { value: [{ uniquename: 'contoso_orderrecord', executeprivilegename: 'prvCreateAccount' }] }],
    ], calls));

    const result = await service.getCustomApi('contoso_orderrecord');

    expect(result?.executeprivilegename).toBe('prvCreateAccount');
    expect(calls[0].endpoint).toContain('executeprivilegename');
  });
});

describe('parameter and property names', () => {
  it('are the API unique name and the member unique name, as Microsoft recommends', () => {
    expect(CustomApiService.memberName('contoso_orderrecord', 'orderid')).toBe('contoso_orderrecord.orderid');
  });

  it('read the API unique name by id', async () => {
    const calls: RecordedCall[] = [];
    const service = new CustomApiService(fakeClient([
      ['customapis(', { uniquename: 'contoso_orderrecord' }],
    ], calls));

    expect(await service.getCustomApiUniqueName('8a2e7d10-77b1-4f0e-a7a4-0d3c62f9b5e2')).toBe('contoso_orderrecord');
    expect(calls[0].endpoint).toBe('api/data/v9.2/customapis(8a2e7d10-77b1-4f0e-a7a4-0d3c62f9b5e2)?$select=uniquename');
  });

  it('refuses an id that is not a GUID before asking the environment', async () => {
    const calls: RecordedCall[] = [];
    await expect(new CustomApiService(fakeClient([], calls)).getCustomApiUniqueName('si_orderrecord')).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
