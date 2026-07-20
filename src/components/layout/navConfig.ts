import {
  Home,
  Landmark,
  TrendingUp,
  CreditCard,
  ArrowLeftRight,
  ArrowRightLeft,
  Database,
  Settings,
  FileText,
} from 'lucide-react';

export const bottomTabs = [
  { name: 'Dashboard', path: '/', icon: Home },
  { name: 'Bank Accounts', path: '/accounts', icon: Landmark },
  { name: 'Investments', path: '/investments', icon: TrendingUp },
  { name: 'Credit Cards', path: '/credit-cards', icon: CreditCard },
];

export const sidebarItems = [
  { name: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
  { name: 'Cash Flow', path: '/cash-flow', icon: ArrowRightLeft },
  { name: 'Reports', path: '/reports', icon: FileText },
  { name: 'Settings', path: '/settings', icon: Settings },
  { name: 'DB Health', path: '/health', icon: Database },
];

export function isActivePath(pathname: string, itemPath: string): boolean {
  return pathname === itemPath || (itemPath !== '/' && pathname.startsWith(itemPath));
}
