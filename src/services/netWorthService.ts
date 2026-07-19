import { getRepos, withTransaction } from '@/db';
import { todayISO, toLocalISO } from '@/lib/utils';
import { computeNetWorth } from './financeService';

// ─── Throttle Control ────────────────────────────────────────────────────────

let lastSnapshotDate: string | null = null;
const SNAPSHOT_THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Daily Snapshot Job ─────────────────────────────────────────────────────

/**
 * Refresh the daily net worth snapshot.
 * Throttled to run at most once per day.
 * On first run or if >24h since last snapshot, computes net worth and stores it.
 */
export async function refreshNetWorthSnapshot(): Promise<{
  success: boolean;
  snapshotDate: string | null;
  error: string | null;
}> {
  const today = todayISO(); // YYYY-MM-DD

  // Check if we already have a snapshot for today
  const repos = await getRepos();
  const existingSnapshot = await repos.netWorthSnapshots.findByDate(today);
  if (existingSnapshot) {
    return { success: true, snapshotDate: today, error: null };
  }

  // Check throttle
  const now = Date.now();
  if (lastSnapshotDate) {
    const lastDate = new Date(lastSnapshotDate).getTime();
    if (now - lastDate < SNAPSHOT_THROTTLE_MS) {
      return { success: true, snapshotDate: lastSnapshotDate, error: null };
    }
  }

  try {
    // Compute current net worth
    const result = await computeNetWorth();

    // Store snapshot in a serialized transaction
    await withTransaction(async () => {
      await repos.netWorthSnapshots.upsertByDate({
        total_pyg: result.totalPyg,
        total_usd: result.totalUsd,
        breakdown_json: JSON.stringify(result.breakdown),
        snapshot_date: today,
      }, false);
    });

    lastSnapshotDate = today;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('networth-snapshot-created'));
    }
    return { success: true, snapshotDate: today, error: null };
  } catch (error) {
    console.error('Net worth snapshot failed:', error);
    return {
      success: false,
      snapshotDate: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ─── Get Historical Snapshots ────────────────────────────────────────────────

export interface NetWorthHistoryPoint {
  date: string;
  pyg: number;
  usd: number;
}

/**
 * Get net worth history for charting.
 * @param months - Number of months to retrieve (default: 12)
 */
export async function getNetWorthHistory(
  months: number = 12
): Promise<NetWorthHistoryPoint[]> {
  const repos = await getRepos();

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const from = toLocalISO(startDate);
  const to = toLocalISO(endDate);

  const snapshots = await repos.netWorthSnapshots.findAll({ from, to });

  // Convert to chart format (oldest first)
  return snapshots
    .map((s) => ({
      date: s.snapshot_date,
      pyg: s.total_pyg,
      usd: s.total_usd,
    }))
    .reverse();
}
