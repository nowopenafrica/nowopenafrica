import { useEffect, useSyncExternalStore } from 'react';
import { allTemplates, onTemplatesChange, type DesignTemplate } from '../lib/designTemplates';
import { loadTemplateLibrary } from '../lib/templateBank/store';

/**
 * The whole design library: built-in layouts plus templates published from the
 * Template Bank. Returns the built-ins immediately and re-renders once the
 * published ones arrive.
 */
export function useTemplateLibrary(): DesignTemplate[] {
  useEffect(() => { void loadTemplateLibrary(); }, []);
  return useSyncExternalStore(onTemplatesChange, allTemplates, allTemplates);
}
