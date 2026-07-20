import { useEffect } from 'react';
import { runAccrualEngine } from '@/services/financeService';

export default function AccrualRunner() {
  useEffect(() => {
    runAccrualEngine().catch((err) => {
      console.error('Accrual engine error:', err);
    });
  }, []);
  return null;
}
