import { describe, it, expect } from 'vitest';
import {
  JOB_DESCRIPTIONS, PERMISSION_LEVELS, PERMISSION_LABELS,
  jobDescriptionByAgentKey, jobDescriptionsByDepartment, summarizeDepartments, canActAutonomously,
} from './jobDescriptions';
import { AI_ROSTER_SEED, DEPARTMENTS } from './workforce';

describe('job descriptions — registry integrity', () => {
  it('covers every agent in the AI roster, keyed by agent_key', () => {
    const jdKeys = new Set(JOB_DESCRIPTIONS.map((j) => j.agentKey));
    expect(jdKeys.size).toBe(JOB_DESCRIPTIONS.length);
    for (const r of AI_ROSTER_SEED) {
      expect(jdKeys.has(r.agentKey), r.agentKey).toBe(true);
    }
  });

  it('every JD maps to a known department and a valid permission level', () => {
    const deptNames = new Set(DEPARTMENTS.map((d) => d.name));
    for (const j of JOB_DESCRIPTIONS) {
      expect(deptNames.has(j.department), j.role).toBe(true);
      expect(PERMISSION_LEVELS).toContain(j.permission);
      expect(PERMISSION_LABELS[j.permission].length).toBeGreaterThan(0);
      expect(j.purpose.length).toBeGreaterThan(10);
      expect(j.responsibilities.length).toBeGreaterThanOrEqual(2);
      expect(j.kpis.length).toBeGreaterThanOrEqual(2);
      expect(j.cadence.daily.length).toBeGreaterThanOrEqual(2);
      expect(j.cadence.weekly.length).toBeGreaterThanOrEqual(2);
      expect(j.cadence.monthly.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('finds JDs by agent key and department', () => {
    expect(jobDescriptionByAgentKey('data-analyst')?.role).toBe('Data Analyst');
    expect(jobDescriptionByAgentKey('nope')).toBeUndefined();
    expect(jobDescriptionByAgentKey(null)).toBeUndefined();
    expect(jobDescriptionsByDepartment('Data & Analytics').map((j) => j.role)).toEqual(['Data Analyst']);
    expect(jobDescriptionsByDepartment('No Such Dept')).toHaveLength(0);
  });
});

describe('job descriptions — permission levels', () => {
  it('labels every level L0–L5', () => {
    expect(Object.keys(PERMISSION_LABELS).map(Number).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(PERMISSION_LABELS[0]).toBe('Read-only observer');
    expect(PERMISSION_LABELS[5]).toBe('Full control');
  });

  it('marks L3+ roles as autonomous and L2- as needing approval', () => {
    expect(canActAutonomously(jobDescriptionByAgentKey('chief-of-staff'))).toBe(true);
    expect(canActAutonomously(jobDescriptionByAgentKey('comms-director'))).toBe(false);
    expect(canActAutonomously(undefined)).toBe(false);
  });
});

describe('job descriptions — department rollup', () => {
  it('rolls each department up to role count, top permission and approval need', () => {
    const rows = summarizeDepartments();
    const data = rows.find((r) => r.department === 'Data & Analytics');
    expect(data?.roles).toBe(1);
    expect(data?.highestPermission).toBe(2);
    expect(data?.needsApproval).toBe(true);
    const growth = rows.find((r) => r.department === 'Marketing & Growth');
    expect(growth?.highestPermission).toBe(3);
    expect(growth?.needsApproval).toBe(false);
  });

  it('returns rows for all departments that have roles', () => {
    const rows = summarizeDepartments();
    const names = new Set(rows.map((r) => r.department));
    for (const j of JOB_DESCRIPTIONS) expect(names.has(j.department)).toBe(true);
  });
});
