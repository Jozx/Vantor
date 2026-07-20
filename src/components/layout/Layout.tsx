import { useState, useCallback } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import DesktopSidebar from './DesktopSidebar';
import BottomTabs from './BottomTabs';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col text-zinc-900 dark:text-zinc-100 overflow-x-hidden">
      <Header onMenuOpen={openSidebar} />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1">
        <DesktopSidebar />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 pb-24 sm:pb-6">{children}</main>
      </div>
      <BottomTabs />
    </div>
  );
}
