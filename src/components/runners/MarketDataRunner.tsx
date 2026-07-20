import { useEffect } from 'react';
import { autoRefreshMarketData } from '@/services/marketService';

export default function MarketDataRunner() {
  useEffect(() => {
    autoRefreshMarketData().catch((err) => {
      console.error('Market data refresh error:', err);
    });
  }, []);
  return null;
}
