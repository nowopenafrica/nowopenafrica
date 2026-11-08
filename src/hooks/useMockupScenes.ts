import { useEffect, useState } from 'react';

import { cachedScenes, loadScenes, subscribeScenes, type MockupScene } from '../lib/create/mockup';

/**
 * The approved mockup scenes, read once for the whole app (module cache in
 * lib/create/mockup.ts) and handed to every Create surface that asks.
 *
 * The first render is whatever is cached (nothing, on a first visit), so a
 * page never waits on this and shows no mockup control until a scene exists.
 * A failed read leaves the list empty: a mockup is an extra, never a gate.
 */
export function useMockupScenes(): MockupScene[] {
  const [scenes, setScenes] = useState<MockupScene[]>(cachedScenes);

  useEffect(() => {
    let live = true;
    const sync = () => { if (live) setScenes(cachedScenes()); };
    const off = subscribeScenes(sync);
    void loadScenes().then(sync);
    return () => { live = false; off(); };
  }, []);

  return scenes;
}
