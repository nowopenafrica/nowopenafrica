import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideOpen, editorPathFor, PROJECT_KINDS, readProjectKind } from './projectKind';

describe('projectKind', () => {
  it('reads known kinds and refuses anything else', () => {
    expect(readProjectKind('design')).toBe('design');
    expect(readProjectKind('video')).toBe('video');
    expect(readProjectKind('Design')).toBeNull();
    expect(readProjectKind('motion')).toBeNull();
    expect(readProjectKind(null)).toBeNull();
    expect(readProjectKind(undefined)).toBeNull();
  });

  it('opens a design row in the Design Editor', () => {
    expect(decideOpen('design', 'design', 'abc')).toEqual({ action: 'open' });
  });

  it('sends a video row from the Design Editor to Video Studio, and back the other way', () => {
    expect(decideOpen('design', 'video', 'abc')).toEqual({ action: 'redirect', path: '/media/video/abc' });
    expect(decideOpen('video', 'design', 'abc')).toEqual({ action: 'redirect', path: '/media/studio/abc' });
    expect(decideOpen('video', 'video', 'abc')).toEqual({ action: 'open' });
  });

  it('never treats an unknown kind as a design', () => {
    expect(decideOpen('design', 'presentation', 'abc').action).toBe('refuse');
    expect(decideOpen('design', undefined, 'abc').action).toBe('refuse');
  });

  it('builds editor paths with the id encoded', () => {
    expect(editorPathFor('design', 'a/b')).toBe('/media/studio/a%2Fb');
    expect(editorPathFor('video', 'x')).toBe('/media/video/x');
  });

  it('matches the database check constraint exactly', () => {
    const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261118040000_design_projects_kind.sql'), 'utf8');
    const m = sql.match(/check \(kind in \(([^)]*)\)\)/);
    expect(m).not.toBeNull();
    const inDb = m![1].split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(inDb).toEqual([...PROJECT_KINDS]);
  });
});
