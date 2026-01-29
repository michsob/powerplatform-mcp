/**
 * Tests for CustomizationTypes helper functions
 */

import { describe, it, expect } from '@jest/globals';
import { createLabel } from '../../src/models/CustomizationTypes.js';

describe('createLabel', () => {
  it('should create a label with default language code (1033 - English)', () => {
    const label = createLabel('Test Label');

    expect(label).toEqual({
      LocalizedLabels: [
        {
          Label: 'Test Label',
          LanguageCode: 1033,
        },
      ],
    });
  });

  it('should create a label with custom language code', () => {
    const label = createLabel('Étiquette de test', 1036); // French

    expect(label).toEqual({
      LocalizedLabels: [
        {
          Label: 'Étiquette de test',
          LanguageCode: 1036,
        },
      ],
    });
  });

  it('should handle empty string', () => {
    const label = createLabel('');

    expect(label).toEqual({
      LocalizedLabels: [
        {
          Label: '',
          LanguageCode: 1033,
        },
      ],
    });
  });

  it('should handle special characters', () => {
    const label = createLabel('Test <>&"\'');

    expect(label).toEqual({
      LocalizedLabels: [
        {
          Label: 'Test <>&"\'',
          LanguageCode: 1033,
        },
      ],
    });
  });

  it('should handle unicode characters', () => {
    const label = createLabel('テスト', 1041); // Japanese

    expect(label).toEqual({
      LocalizedLabels: [
        {
          Label: 'テスト',
          LanguageCode: 1041,
        },
      ],
    });
  });

  it('should handle long text', () => {
    const longText = 'A'.repeat(1000);
    const label = createLabel(longText);

    expect(label.LocalizedLabels[0].Label).toBe(longText);
    expect(label.LocalizedLabels[0].Label.length).toBe(1000);
  });

  it('should create independent labels (not sharing references)', () => {
    const label1 = createLabel('First');
    const label2 = createLabel('Second');

    expect(label1.LocalizedLabels).not.toBe(label2.LocalizedLabels);
    expect(label1.LocalizedLabels[0]).not.toBe(label2.LocalizedLabels[0]);
  });
});
