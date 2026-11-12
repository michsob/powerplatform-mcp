import { describe, expect, it } from 'vitest';
import { DataverseRequestError } from '../powerplatform-client.js';
import { DependencyService } from '../services/dependency-service.js';
import { FlowService } from '../services/flow-service.js';
import { PluginService } from '../services/plugin-service.js';
import { RecordService } from '../services/record-service.js';
import { SecurityRoleService } from '../services/security-role-service.js';
import { WebResourceService } from '../services/webresource-service.js';
import { fakeClient, type RecordedCall } from './fake-client.js';

const GUID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const GUID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('write paths validate ids before any request', () => {
  it('records: a bad id or entity set name fails before the request', async () => {
    const calls: RecordedCall[] = [];
    const records = new RecordService(fakeClient([], calls));

    await expect(records.deleteRecord('accounts', `${GUID})/contacts(${GUID2}`)).rejects.toThrow('recordId must be a GUID');
    await expect(records.updateRecord('accounts?$x=1', GUID, {})).rejects.toThrow('entityNamePlural must be a plain identifier');
    await expect(records.associateRecords('accounts', GUID, 'contact_customer_accounts', 'contacts', 'x')).rejects.toThrow('relatedRecordId must be a GUID');
    await expect(records.disassociateRecords('accounts', GUID, 'nav/x')).rejects.toThrow('navigationProperty must be a plain identifier');
    expect(calls).toHaveLength(0);

    await records.deleteRecord('accounts', `{${GUID.toUpperCase()}}`);
    expect(calls).toEqual([{ method: 'DELETE', endpoint: `api/data/v9.2/accounts(${GUID})`, headers: undefined }]);
  });

  it('security roles: removing privileges checks every id before the first call', async () => {
    const calls: RecordedCall[] = [];
    const roles = new SecurityRoleService(fakeClient([], calls));

    await expect(roles.removeRolePrivileges(GUID, [GUID2, 'prvReadAccount'])).rejects.toThrow('privilegeId must be a GUID');
    await expect(roles.deleteSecurityRole('System Administrator')).rejects.toThrow('roleId must be a GUID');
    await expect(roles.addRolePrivileges(GUID, [{ privilegeId: 'x', depth: 'Global' } as never])).rejects.toThrow('privilegeId must be a GUID');
    expect(calls).toHaveLength(0);
  });

  it('web resources: the lookup an upsert overwrites refuses a row with another name', async () => {
    const calls: RecordedCall[] = [];
    const service = new WebResourceService(fakeClient([
      ['webresourceset', { value: [{ webresourceid: GUID, name: 'contoso_/scripts/other.js' }] }],
    ], calls));

    await expect(service.upsertWebResource({
      name: "contoso_/scripts/it's.js", displayName: 'x', webResourceType: 3, content: 'Y29udGVudA==',
    })).rejects.toThrow('do not match');
    expect(calls[0].endpoint).toContain("name eq 'contoso_%2Fscripts%2Fit''s.js'");
    expect(calls.filter((c) => c.method)).toHaveLength(0);
  });
});

describe('filters escape caller values', () => {
  it('flow search escapes names and validates numbers', async () => {
    const calls: RecordedCall[] = [];
    const flows = new FlowService(fakeClient([['workflows', { value: [] }]], calls));
    await flows.searchWorkflows({ name: "Bob's & co", primaryEntity: 'account' });
    expect(calls[0].endpoint).toContain("contains(name,'Bob''s%20%26%20co')");
    expect(calls[0].endpoint).toContain("primaryentity eq 'account'");
    await expect(flows.searchWorkflows({ category: Number.NaN })).rejects.toThrow('category must be an integer');
  });

  it('plugin trace logs compare correlationid as a GUID, unquoted', async () => {
    const calls: RecordedCall[] = [];
    const plugins = new PluginService(fakeClient([['plugintracelogs', { value: [] }]], calls));
    await plugins.getPluginTraceLogs({ correlationId: GUID.toUpperCase(), entityName: "a'b" });
    expect(calls[0].endpoint).toContain(`correlationid eq ${GUID}`);
    expect(calls[0].endpoint).toContain("primaryentity eq 'a''b'");
    await expect(plugins.getPluginTraceLogs({ correlationId: 'abc' })).rejects.toThrow('correlationId must be a GUID');
  });

  it('flow runs validate the dates they filter on', async () => {
    const flows = new FlowService(fakeClient([['flowruns', { value: [] }]]));
    await expect(flows.getFlowRuns(GUID, { startedAfter: "2026-01-01' or 1 eq 1" })).rejects.toThrow('startedAfter must be an ISO 8601 date');
  });
});

describe('errors keep their HTTP status', () => {
  it('getFlowRuns explains a 403 from the flowruns table', async () => {
    const flows = new FlowService(fakeClient([['flowruns', () => {
      throw new DataverseRequestError('PowerPlatform API request failed: 403', 403);
    }]]));
    await expect(flows.getFlowRuns(GUID)).rejects.toThrow('Access denied to flowruns table');
  });

  it('a failed dependency check is an error, not "cannot delete, no dependencies"', async () => {
    const deps = new DependencyService(fakeClient([['RetrieveDependenciesForDelete', () => {
      throw new DataverseRequestError('PowerPlatform API request failed: 500', 500);
    }]]));
    await expect(deps.checkDeleteEligibility(GUID, 1)).rejects.toThrow('500');
    await expect(deps.checkDeleteEligibility('x', 1)).rejects.toThrow('componentId must be a GUID');
  });
});
