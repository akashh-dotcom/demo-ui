import { useState, useCallback } from 'react';
import Sidebar, { SidebarMobileTrigger } from './Sidebar';

const STORAGE_KEY = 'sidebar_collapsed';

function PageLayout({ children, title }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Read collapsed state to determine content offset
  const getCollapsed = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  };

  const [collapsed, setCollapsed] = useState(getCollapsed);

  // Listen for storage changes to keep content offset in sync
  // We poll localStorage since the sidebar writes to it
  const handleStorageSync = useCallback(() => {
    const current = getCollapsed();
    setCollapsed(current);
  }, []);

  // Check collapsed state on any pointer movement to keep in sync
  // This is lightweight and ensures the layout responds immediately
  const handlePointerMove = useCallback(() => {
    const current = getCollapsed();
    setCollapsed((prev) => (prev !== current ? current : prev));
  }, []);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900" onPointerMove={handlePointerMove}>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={closeMobile} />

      {/* Main content area */}
      <div
        className={`
          transition-all duration-300 ease-in-out min-h-screen
          ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-64'}
        `}
      >
        {/* Top bar for mobile */}
        {title && (
          <header className="sticky top-0 z-20 bg-white dark:bg-secondary-800 border-b border-secondary-200 dark:border-secondary-700 shadow-sm">
            <div className="flex items-center h-16 px-4 sm:px-6 lg:px-8">
              <SidebarMobileTrigger onClick={openMobile} />
              <h1 className="ml-2 lg:ml-0 text-xl font-semibold text-secondary-900 dark:text-secondary-100 truncate">
                {title}
              </h1>
            </div>
          </header>
        )}

        {/* Page content */}
        <main className={!title ? 'pt-0' : ''}>
          {!title && (
            <div className="lg:hidden sticky top-0 z-20 bg-white dark:bg-secondary-800 border-b border-secondary-200 dark:border-secondary-700 shadow-sm">
              <div className="flex items-center h-14 px-4">
                <SidebarMobileTrigger onClick={openMobile} />
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

export default PageLayout;
