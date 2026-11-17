/*
 * Create's engine-made designs (the three concepts under a brief, and the
 * category galleries) are shown in development, and in a build only when it
 * is asked for (VITE_CREATE_CONCEPTS=1). The founder's quality gate has not
 * passed them yet, so merging the branch must not put them in front of
 * customers by accident. A build switch, not a permission.
 */
export const CONCEPTS_ON: boolean = import.meta.env.DEV || import.meta.env.VITE_CREATE_CONCEPTS === '1';
