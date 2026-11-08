import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, templateByKey, type DesignTemplate, type SlotSpec } from '../../designTemplates';
import { previewCriticals } from './preview';

describe('previewCriticals (C6)', () => {
  it('reports a render that throws', () => {
    const broken: DesignTemplate = { ...templateByKey('tiered-sale'), key: 'qa-broken', slots: undefined as unknown as SlotSpec[] };
    const out = previewCriticals(broken);
    expect(out.map((f) => f.code)).toEqual(['C6']);
    expect(out[0].detail).toMatch(/threw/);
  });

  it('renders every code template, every page, without throwing or a missing image', () => {
    const failures = DESIGN_TEMPLATES.flatMap((t) => previewCriticals(t).map((f) => `${t.key}: ${f.detail}`));
    expect(failures).toEqual([]);
  });
});
