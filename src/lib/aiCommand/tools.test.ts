import { describe, it, expect } from 'vitest';
import {
  AI_TOOLS, READ_TOOLS, REQUIRES_APPROVAL, toolByName, riskLabel, riskTone, roleMayRun,
} from './tools';

describe('AI_TOOLS registry', () => {
  it('mirrors the server registry: 10 read tools + 5 Phase 2 writes', () => {
    expect(AI_TOOLS).toHaveLength(15);
    expect(READ_TOOLS).toHaveLength(10);
    expect(REQUIRES_APPROVAL).toHaveLength(5);
  });

  it('keeps every Phase 1 read tool read-only', () => {
    for (const t of READ_TOOLS) {
      expect(t.phase).toBe(1);
      expect(t.risk).toBe('READ');
      expect(t.readOnly).toBe(true);
      expect(['staff', 'admin']).toContain(t.role);
      expect(t.category).toBeTruthy();
    }
  });

  it('staff can run the staff tools, admins only the admin tools', () => {
    const adminTools = READ_TOOLS.filter((t) => t.role === 'admin');
    expect(adminTools.map((t) => t.name).sort()).toEqual(['security_snapshot', 'system_health']);
    expect(READ_TOOLS.filter((t) => t.role === 'staff')).toHaveLength(8);
  });

  it('keeps every Phase 2 write admin-only and approval-gated', () => {
    for (const t of REQUIRES_APPROVAL) {
      expect(t.phase).toBe(2);
      expect(t.readOnly).toBe(false);
      expect(t.role).toBe('admin');
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(t.risk);
    }
  });

  it('has non-empty metadata and unique names', () => {
    const names = new Set(AI_TOOLS.map((t) => t.name));
    expect(names.size).toBe(AI_TOOLS.length);
    for (const t of AI_TOOLS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('exposes the Phase 2 writes by name', () => {
    expect(toolByName('merge_business')?.riskLabel).toBe('Critical, irreversible');
    expect(toolByName('approve_claim')?.risk).toBe('HIGH');
    expect(toolByName('send_outreach')?.risk).toBe('HIGH');
    expect(toolByName('update_business')?.risk).toBe('MEDIUM');
    expect(toolByName('toggle_feature')?.risk).toBe('MEDIUM');
  });

  it('returns undefined for unknown tools', () => {
    expect(toolByName('delete_everything')).toBeUndefined();
  });
});

describe('risk labels', () => {
  it('phrases every risk level honestly', () => {
    expect(riskLabel('READ')).toBe('Read-only');
    expect(riskLabel('LOW')).toBe('Low impact');
    expect(riskLabel('MEDIUM')).toBe('Medium impact');
    expect(riskLabel('HIGH')).toBe('High impact');
    expect(riskLabel('CRITICAL')).toBe('Critical, irreversible');
  });

  it('provides a tone class for every risk level', () => {
    for (const risk of ['READ', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const) {
      expect(riskTone(risk).length).toBeGreaterThan(0);
    }
  });
});

describe('roleMayRun', () => {
  const staffTool = toolByName('claim_pipeline')!;
  const adminTool = toolByName('system_health')!;

  it('lets any staff-capable tool run for staff, editors and admins', () => {
    expect(roleMayRun(null, staffTool)).toBe(true);
    expect(roleMayRun('staff', staffTool)).toBe(true);
    expect(roleMayRun('editor', staffTool)).toBe(true);
    expect(roleMayRun('admin', staffTool)).toBe(true);
  });

  it('keeps admin-only tools away from non-admins', () => {
    expect(roleMayRun(null, adminTool)).toBe(false);
    expect(roleMayRun('staff', adminTool)).toBe(false);
    expect(roleMayRun('editor', adminTool)).toBe(false);
    expect(roleMayRun('admin', adminTool)).toBe(true);
  });
});