import { useEffect } from 'react';
import { refreshNetWorthSnapshot } from '@/services/netWorthService';

export default function NetWorthSnapshotRunner() {
  useEffect(() => {
    refreshNetWorthSnapshot().catch((err) => {
      console.error('Net worth snapshot error:', err);
    });
  }, []);
  return null;
}
