import { describe, it, expect, beforeAll } from 'vitest';
import { hasCredentials, createBusinessRuleService } from './test-helpers.js';
import type { BusinessRuleService } from '../services/businessrule-service.js';

describe.skipIf(!hasCredentials())('BusinessRuleService (integration)', () => {
  let service: BusinessRuleService;

  beforeAll(() => {
    service = createBusinessRuleService();
  });

  it('getBusinessRules returns business rules', async () => {
    const result = await service.getBusinessRules(false, 5);
    expect(result).toBeDefined();
    expect(typeof result.totalCount).toBe('number');
    expect(result.businessRules).toBeInstanceOf(Array);
  });

  it('getBusinessRule returns a specific business rule', async () => {
    const list = await service.getBusinessRules(false, 1);
    if (list.businessRules.length === 0) {
      console.log('No business rules found, skipping detail test');
      return;
    }

    const ruleId = (list.businessRules[0] as any).workflowid;
    const result = await service.getBusinessRule(ruleId);
    expect(result).toBeDefined();
    expect((result as any).workflowid).toBe(ruleId);
  });
});
