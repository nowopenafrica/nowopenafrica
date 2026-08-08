import { useState } from 'react';

export function useCacheBuster() {
  const [cacheKey, setCacheKey] = useState(Date.now());

  const bustCache = () => {
    setCacheKey(Date.now());
  };

  return { cacheKey, bustCache };
}
