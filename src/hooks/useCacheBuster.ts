import { useState } from 'react';

export function useCacheBuster() {
  const [cacheKey, setCacheKey] = useState(Date.now());

  const bustCache = () => {
    console.log('Cache busted with new key:', Date.now());
    setCacheKey(Date.now());
  };

  return { cacheKey, bustCache };
}
