import { describe, it, expect } from 'vitest';
import { askNowOpen, ASK_SUGGESTIONS, osNavigationActions, type AskInput } from './askNowOpen';
import { seedMembers } from './workforce';
import type { WorkItem } from './work';
import type { ApprovalRequest } from './approvals';

const members = seedMembers({ id: 'u-owner', email: 'owner@nowopen.africa' });
const items: WorkItem[] = [
  { id: 'w1', org_id: 'o', kind: 'task', title: 'Draft Q3 strategy brief', status: 'blocked', priority: 'high', department: 'Strategy & BI', assignee_id: 'ai-1' },
  { id: 'w2', org_id: 'o', kind: 'task', title: 'Social calendar', status: 'in_progress', priority: 'medium', department: 'Social Media', assignee_id: 'ai-2' },
];
const approvals: ApprovalRequest[] = [
  { id: 'a1', org_id: 'o', work_item_id: 'w2', requested_by: 'ai-2', reason: 'Ship the social calendar', status: 'pending' },
];

const input: AskInput = { members, items, approvals };

describe('osNavigationActions', () => {
  it('offers every live admin section as a jump target', () => {
    const actions = osNavigationActions();
    expect(actions.length).toBeGreaterThan(0);
    for (const a of actions) {
      expect(a.kind).toBe('go');
      expect(a.sectionId).toBeTruthy();
    }
    expect(actions.some((a) => a.sectionId === 'work-board')).toBe(true);
  });
});

describe('askNowOpen', () => {
  it('shows honest suggestion chips before anyone types', () => {
    const items = askNowOpen(input, '');
    expect(items.filter((i) => i.kind === 'suggest').map((i) => i.runQuery).filter(Boolean)).toEqual(
      ASK_SUGGESTIONS.map((s) => s.question),
    );
  });

  it('lists blocked work only when rows are actually blocked', () => {
    const asks = askNowOpen(input, 'who is blocked').filter((i) => i.kind === 'ask');
    expect(asks).toHaveLength(1);
    expect(asks[0].title).toContain('Draft Q3 strategy brief');
    expect(asks[0].sectionId).toBe('work-board');
  });

  it('says the board is clear when nothing is blocked', () => {
    const asks = askNowOpen({ ...input, items: [items[1]] }, 'blocked').filter((i) => i.kind === 'ask');
    expect(asks[0].title).toContain('No blocked work');
  });

  it('surfaces pending sign-offs with who requested them', () => {
    const asks = askNowOpen(input, 'what needs approval').filter((i) => i.kind === 'ask');
    expect(asks[0].title).toContain('Ship the social calendar');
    expect(asks[0].sectionId).toBe('approvals');
  });

  it('reports OS health derived from the ledgers', () => {
    const asks = askNowOpen(input, 'how healthy is the OS').filter((i) => i.kind === 'ask');
    expect(asks[0].title).toMatch(/OS health \d+\/100/);
    expect(asks[0].sectionId).toBe('founder');
  });

  it('names departments that genuinely need attention', () => {
    const asks = askNowOpen(input, 'which departments need attention').filter((i) => i.kind === 'ask');
    expect(asks[0].title).toContain('needs attention');
    expect(asks[0].sectionId).toBe('workforce');
  });

  it('keeps navigation in every answer', () => {
    const asks = askNowOpen(input, 'blocked');
    expect(asks.filter((i) => i.kind === 'go').length).toBeGreaterThan(0);
  });

  it('never invents data when an intent has nothing behind it', () => {
    const empty = askNowOpen({ members, items: [], approvals: [] }, 'blocked');
    const asks = empty.filter((i) => i.kind === 'ask');
    expect(asks).toHaveLength(1);
    expect(asks[0].title).toContain('No blocked work');
  });
});
