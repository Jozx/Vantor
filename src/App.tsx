import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/components/ThemeProvider';
import Layout from '@/components/layout/Layout';
import BackButtonHandler from '@/components/runners/BackButtonHandler';
import AccrualRunner from '@/components/runners/AccrualRunner';
import MarketDataRunner from '@/components/runners/MarketDataRunner';
import NetWorthSnapshotRunner from '@/components/runners/NetWorthSnapshotRunner';

import Home from '@/pages/Home';
import Health from '@/pages/Health';
import Accounts from '@/pages/Accounts';
import AccountDetails from '@/pages/AccountDetails';
import Transactions from '@/pages/Transactions';
import CashFlow from '@/pages/CashFlow';
import SettingsPage from '@/pages/Settings';
import Reports from '@/pages/Reports';

import type { AccountType } from '@/db';

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <BackButtonHandler />
        <AccrualRunner />
        <MarketDataRunner />
        <NetWorthSnapshotRunner />
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/accounts" element={<Accounts filterType="bank" />} />
            <Route path="/investments" element={<Accounts filterType={['broker', 'mutual_fund'] as AccountType[]} />} />
            <Route path="/credit-cards" element={<Accounts filterType="credit_card" />} />
            <Route path="/accounts/:id" element={<AccountDetails />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/cash-flow" element={<CashFlow />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/health" element={<Health />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}
