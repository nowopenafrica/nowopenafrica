import { describe, it, expect } from 'vitest';
import {
  KB_CATEGORIES,
  summarizeKnowledge, filterKnowledge, searchKnowledge,
  departmentToKbCategory, decisionDoc, KNOWLEDGE_SEED,
  type KnowledgeDoc,
} from './knowledge';

const org = '00000000-0000-4000-8000-00000000a001';

function doc(over: Partial<KnowledgeDoc> = {}): KnowledgeDoc {
  return {
    id: 'k1', org_id: org, category: 'Brand', title: 'Brand voice', summary: 'How NowOpen talks.',
    body: ['Line one.'], tags: ['voice'], source: 'sop',
    ...over,
  };
}

describe('knowledge lib', () => {
  it('mirrors the eight KB categories', () => {
    expect(KB_CATEGORIES).toEqual(['Brand', 'Engineering', 'Marketing', 'Design', 'Growth', 'Legal', 'Finance', 'Support']);
  });

  it('summarizes docs by source and category', () => {
    const summary = summarizeKnowledge([
      doc({ id: 'k1', source: 'sop', category: 'Brand' }),
      doc({ id: 'k2', source: 'sop', category: 'Engineering' }),
      doc({ id: 'k3', source: 'decision', category: 'Finance' }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.sops).toBe(2);
    expect(summary.decisions).toBe(1);
    expect(summary.manual).toBe(0);
    expect(summary.bySource).toEqual({ sop: 2, decision: 1 });
    expect(summary.byCategory).toEqual({ Brand: 1, Engineering: 1, Finance: 1 });
  });

  it('filters by category and source', () => {
    const docs = [
      doc({ id: 'k1', category: 'Brand', source: 'sop' }),
      doc({ id: 'k2', category: 'Finance', source: 'sop' }),
      doc({ id: 'k3', category: 'Finance', source: 'decision' }),
    ];
    expect(filterKnowledge(docs, { category: 'all', source: 'all' })).toHaveLength(3);
    expect(filterKnowledge(docs, { category: 'Finance', source: 'all' }).map((d) => d.id)).toEqual(['k2', 'k3']);
    expect(filterKnowledge(docs, { category: 'all', source: 'decision' }).map((d) => d.id)).toEqual(['k3']);
  });

  it('searches across title, summary and tags', () => {
    const docs = [
      doc({ id: 'k1', title: 'Deploy checklist', summary: 'What to run before shipping.' }),
      doc({ id: 'k2', title: 'Brand voice', summary: 'How NowOpen talks.' }),
      doc({ id: 'k3', title: 'Partnership pipeline', summary: 'Move a partner to active.', tags: ['partners', 'crm'] }),
    ];
    expect(searchKnowledge(docs, 'deploy').map((d) => d.id)).toEqual(['k1']);
    expect(searchKnowledge(docs, 'how nowopen').map((d) => d.id)).toEqual(['k2']);
    expect(searchKnowledge(docs, 'crm').map((d) => d.id)).toEqual(['k3']);
    expect(searchKnowledge(docs, '').map((d) => d.id)).toEqual(['k1', 'k2', 'k3']);
    expect(searchKnowledge(docs, 'zzz')).toHaveLength(0);
  });

  it('maps every department to one of the eight categories', () => {
    const departments = [
      'Founder Office', 'Strategy & BI', 'Marketing & Growth', 'Social Media', 'Communications & PR',
      'Creative & Brand', 'Production', 'Post Production', 'Sales & Business Development', 'Operations',
      'Finance', 'Product & Engineering', 'Customer Success', 'Trust & Safety',
    ];
    const categories = new Set(KB_CATEGORIES);
    for (const d of departments) {
      expect(categories.has(departmentToKbCategory(d)), d).toBe(true);
    }
    expect(departmentToKbCategory('Creative & Brand')).toBe('Brand');
    expect(departmentToKbCategory('Product & Engineering')).toBe('Engineering');
    expect(departmentToKbCategory('Marketing & Growth')).toBe('Marketing');
    expect(departmentToKbCategory('Post Production')).toBe('Design');
    expect(departmentToKbCategory('Finance')).toBe('Finance');
    expect(departmentToKbCategory('Trust & Safety')).toBe('Support');
    expect(departmentToKbCategory('Strategy & BI')).toBe('Growth');
  });

  it('builds decision docs with distinct, safe titles and honest body', () => {
    const approved = decisionDoc({
      approvalId: 'aaaaaaaa-1111-2222-3333-44444444abcd',
      status: 'approved',
      workTitle: 'Monthly finance report',
      department: 'Finance',
      workItemId: 'w-1',
    });
    expect(approved).toMatchObject({
      category: 'Finance',
      source: 'decision',
      linked_work_item_id: 'w-1',
      title: 'Monthly finance report — approved · #44abcd',
      tags: ['decision', 'approved', 'finance'],
    });
    expect(approved.title).toContain('abcd');
    expect(approved.body.some((l) => l.includes('now done on the Work Board'))).toBe(true);

    const rejected = decisionDoc({
      approvalId: 'aaaaaaaa-1111-2222-3333-44444444beef',
      status: 'rejected',
      workTitle: 'Draft Q3 strategy brief',
      department: 'Strategy & BI',
    });
    expect(rejected.title).toBe('Draft Q3 strategy brief — sent back · #44beef');
    expect(rejected.category).toBe('Growth');
    expect(rejected.body.some((l) => l.includes('returns to the Work Board as in progress'))).toBe(true);
    expect(rejected.tags).toContain('rejected');
    expect(rejected.tags).toContain('strategy-bi');
    expect(rejected.linked_work_item_id).toBeNull();
  });

  it('mirrors the fourteen SOP seed docs, one per playbook', () => {
    expect(KNOWLEDGE_SEED).toHaveLength(14);
    expect(new Set(KNOWLEDGE_SEED.map((d) => d.title)).size).toBe(14);
    const categories = new Set(KB_CATEGORIES);
    for (const d of KNOWLEDGE_SEED) {
      expect(d.org_id).toBe(org);
      expect(d.source).toBe('sop');
      expect(categories.has(d.category), d.title).toBe(true);
      expect(d.body.length).toBeGreaterThan(0);
      expect(d.tags.length).toBeGreaterThan(0);
    }
  });
});
