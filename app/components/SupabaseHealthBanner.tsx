'use client';

import { useEffect, useState } from 'react';
import { getDataSource, getStatusMessage } from '@/lib/supabaseHealthContext';

export default function SupabaseHealthBanner() {
  const [source, setSource] = useState<'live' | 'cache' | 'offline'>('live');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkHealth = () => {
      setSource(getDataSource());
    };
    checkHealth();
    const interval = setInterval(checkHealth, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted || source === 'live') return null;

  return (
    <div className="w-full px-4 py-3 bg-yellow-50 border-b-2 border-yellow-300 text-yellow-800 text-center font-semibold">
      {getStatusMessage()}
      <div className="text-xs mt-1 opacity-75">
        Data is from local cache - Registration may be delayed
      </div>
    </div>
  );
}
