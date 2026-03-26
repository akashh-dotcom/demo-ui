import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  DollarSign,
  Layers,
  User,
  Settings,
  BarChart3,
  Users,
  ClipboardList,
  Sliders,
  Activity,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

const STORAGE_KEY = 'sidebar_collapsed';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/manuscripts', label: 'Manuscripts', icon: FileText },
  { path: '/cost-analytics', label: 'Cost Analytics', icon: DollarSign },
  { path: '/batch-operations', label: 'Batch Operations', icon: Layers },
];

const userItems = [
  { path: '/profile', label: 'Profile', icon: User },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const adminItems = [
  { path: '/admin', label: 'Admin Dashboard', icon: BarChart3 },
  { path: '/admin/users', label: 'User Management', icon: Users },
  { path: '/admin/reports', label: 'Conversion Reports', icon: ClipboardList },
  { path: '/admin/system', label: 'System Settings', icon: Sliders },
  { path: '/admin/activities', label: 'Activity Logs', icon: Activity },
];

function NavItem({ item, isActive, isCollapsed, onClick }) {
  const Icon = item.icon;

  return (
    <button
      onClick={() => onClick(item.path)}
      className={`
        group relative flex items-center w-full rounded-lg transition-all duration-200
        ${isCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
        ${
          isActive
            ? 'bg-primary-500 text-white shadow-md'
            : 'text-secondary-200 hover:bg-secondary-700 hover:text-white'
        }
      `}
      title={isCollapsed ? item.label : undefined}
    >
      <Icon className={`flex-shrink-0 ${isCollapsed ? 'w-5 h-5' : 'w-5 h-5 mr-3'}`} />
      {!isCollapsed && (
        <span className="text-sm font-medium truncate">{item.label}</span>
      )}
      {/* Tooltip for collapsed state */}
      {isCollapsed && (
        <div className="
          absolute left-full ml-2 px-2.5 py-1.5 bg-secondary-900 text-white text-xs
          rounded-md whitespace-nowrap opacity-0 invisible
          group-hover:opacity-100 group-hover:visible
          transition-all duration-200 z-50 pointer-events-none
          shadow-lg
        ">
          {item.label}
          <div className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-secondary-900" />
        </div>
      )}
    </button>
  );
}

function SectionSeparator({ isCollapsed }) {
  return (
    <div className={`my-2 ${isCollapsed ? 'mx-2' : 'mx-3'}`}>
      <div className="border-t border-secondary-600" />
    </div>
  );
}

function SectionLabel({ label, isCollapsed }) {
  if (isCollapsed) return null;
  return (
    <div className="px-3 py-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-secondary-400">
        {label}
      </span>
    </div>
  );
}

function Sidebar({ mobileOpen, onMobileClose }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, getUserDisplayName } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const sidebarRef = useRef(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // Persist collapse state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // localStorage unavailable
    }
  }, [collapsed]);

  // Close mobile sidebar on route change
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Close mobile sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && mobileOpen && onMobileClose) {
        onMobileClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onMobileClose]);

  const handleNavigate = useCallback(
    (path) => {
      navigate(path);
    },
    [navigate]
  );

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const isActive = (path) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-secondary-800">
      {/* Header */}
      <div
        className={`flex items-center h-16 border-b border-secondary-700 flex-shrink-0 ${
          collapsed ? 'justify-center px-2' : 'px-4'
        }`}
      >
        {!collapsed && (
          <div className="flex items-center min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="ml-3 text-base font-bold text-white truncate">
              Manuscript Hub
            </span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-thin">
        {navItems.map((item) => (
          <NavItem
            key={item.path}
            item={item}
            isActive={isActive(item.path)}
            isCollapsed={collapsed}
            onClick={handleNavigate}
          />
        ))}

        <SectionSeparator isCollapsed={collapsed} />

        {userItems.map((item) => (
          <NavItem
            key={item.path}
            item={item}
            isActive={isActive(item.path)}
            isCollapsed={collapsed}
            onClick={handleNavigate}
          />
        ))}

        {isAdmin && (
          <>
            <SectionSeparator isCollapsed={collapsed} />
            <SectionLabel label="Admin" isCollapsed={collapsed} />
            {adminItems.map((item) => (
              <NavItem
                key={item.path}
                item={item}
                isActive={isActive(item.path)}
                isCollapsed={collapsed}
                onClick={handleNavigate}
              />
            ))}
          </>
        )}
      </nav>

      {/* Footer / User section */}
      <div className="border-t border-secondary-700 dark:border-secondary-600 p-2 flex-shrink-0">
        {!collapsed && user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-sm font-medium text-white truncate">
              {getUserDisplayName()}
            </p>
            <p className="text-xs text-secondary-400 truncate">{user.email}</p>
          </div>
        )}
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={`
            group relative flex items-center w-full rounded-lg transition-all duration-200
            text-secondary-300 hover:bg-secondary-700 hover:text-white
            ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
          `}
          title={collapsed ? (isDark ? 'Switch to light mode' : 'Switch to dark mode') : undefined}
        >
          {isDark ? (
            <Sun className={`flex-shrink-0 ${collapsed ? 'w-5 h-5' : 'w-5 h-5 mr-3'}`} />
          ) : (
            <Moon className={`flex-shrink-0 ${collapsed ? 'w-5 h-5' : 'w-5 h-5 mr-3'}`} />
          )}
          {!collapsed && (
            <span className="text-sm font-medium">
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </span>
          )}
          {collapsed && (
            <div className="
              absolute left-full ml-2 px-2.5 py-1.5 bg-secondary-900 text-white text-xs
              rounded-md whitespace-nowrap opacity-0 invisible
              group-hover:opacity-100 group-hover:visible
              transition-all duration-200 z-50 pointer-events-none shadow-lg
            ">
              {isDark ? 'Light Mode' : 'Dark Mode'}
              <div className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-secondary-900" />
            </div>
          )}
        </button>
        <button
          onClick={handleLogout}
          className={`
            group relative flex items-center w-full rounded-lg transition-all duration-200
            text-secondary-300 hover:bg-red-500/20 hover:text-red-400
            ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}
          `}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className={`flex-shrink-0 ${collapsed ? 'w-5 h-5' : 'w-5 h-5 mr-3'}`} />
          {!collapsed && <span className="text-sm font-medium">Logout</span>}
          {collapsed && (
            <div className="
              absolute left-full ml-2 px-2.5 py-1.5 bg-secondary-900 text-white text-xs
              rounded-md whitespace-nowrap opacity-0 invisible
              group-hover:opacity-100 group-hover:visible
              transition-all duration-200 z-50 pointer-events-none shadow-lg
            ">
              Logout
              <div className="absolute top-1/2 -left-1 -translate-y-1/2 border-4 border-transparent border-r-secondary-900" />
            </div>
          )}
        </button>
      </div>

      {/* Collapse toggle (desktop only) */}
      <div className="hidden lg:block border-t border-secondary-700 p-2 flex-shrink-0">
        <button
          onClick={toggleCollapse}
          className="flex items-center justify-center w-full py-2 rounded-lg text-secondary-400 hover:bg-secondary-700 hover:text-white transition-colors duration-200"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <div className="flex items-center">
              <ChevronLeft className="w-5 h-5 mr-2" />
              <span className="text-xs font-medium">Collapse</span>
            </div>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        ref={sidebarRef}
        className={`
          hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:z-30
          transition-all duration-300 ease-in-out
          ${collapsed ? 'lg:w-[72px]' : 'lg:w-64'}
        `}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity duration-300"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          {/* Sidebar panel */}
          <div className="relative flex w-64 flex-col bg-secondary-800 shadow-xl animate-slide-in z-50">
            {/* Close button */}
            <div className="absolute top-4 right-4">
              <button
                onClick={onMobileClose}
                className="p-1 rounded-md text-secondary-300 hover:text-white hover:bg-secondary-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Force expanded view on mobile */}
            <div className="flex flex-col h-full bg-secondary-800">
              {/* Header */}
              <div className="flex items-center h-16 border-b border-secondary-700 px-4 flex-shrink-0">
                <div className="flex items-center min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-white" />
                  </div>
                  <span className="ml-3 text-base font-bold text-white truncate">
                    Manuscript Hub
                  </span>
                </div>
              </div>

              {/* Navigation */}
              <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-thin">
                {navItems.map((item) => (
                  <NavItem
                    key={item.path}
                    item={item}
                    isActive={isActive(item.path)}
                    isCollapsed={false}
                    onClick={handleNavigate}
                  />
                ))}
                <SectionSeparator isCollapsed={false} />
                {userItems.map((item) => (
                  <NavItem
                    key={item.path}
                    item={item}
                    isActive={isActive(item.path)}
                    isCollapsed={false}
                    onClick={handleNavigate}
                  />
                ))}
                {isAdmin && (
                  <>
                    <SectionSeparator isCollapsed={false} />
                    <SectionLabel label="Admin" isCollapsed={false} />
                    {adminItems.map((item) => (
                      <NavItem
                        key={item.path}
                        item={item}
                        isActive={isActive(item.path)}
                        isCollapsed={false}
                        onClick={handleNavigate}
                      />
                    ))}
                  </>
                )}
              </nav>

              {/* Footer */}
              <div className="border-t border-secondary-700 p-2 flex-shrink-0">
                {user && (
                  <div className="px-3 py-2 mb-1">
                    <p className="text-sm font-medium text-white truncate">
                      {getUserDisplayName()}
                    </p>
                    <p className="text-xs text-secondary-400 truncate">{user.email}</p>
                  </div>
                )}
                {/* Theme toggle (mobile) */}
                <button
                  onClick={toggleTheme}
                  className="flex items-center w-full rounded-lg px-3 py-2.5 text-secondary-300 hover:bg-secondary-700 hover:text-white transition-all duration-200"
                >
                  {isDark ? (
                    <Sun className="w-5 h-5 mr-3 flex-shrink-0" />
                  ) : (
                    <Moon className="w-5 h-5 mr-3 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium">
                    {isDark ? 'Light Mode' : 'Dark Mode'}
                  </span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full rounded-lg px-3 py-2.5 text-secondary-300 hover:bg-red-500/20 hover:text-red-400 transition-all duration-200"
                >
                  <LogOut className="w-5 h-5 mr-3 flex-shrink-0" />
                  <span className="text-sm font-medium">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Export the mobile trigger button as a named export for PageLayout
export function SidebarMobileTrigger({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden p-2 rounded-md text-secondary-500 hover:text-secondary-700 hover:bg-secondary-100 dark:text-secondary-400 dark:hover:text-secondary-200 dark:hover:bg-secondary-700 transition-colors"
      aria-label="Open sidebar"
    >
      <Menu className="w-6 h-6" />
    </button>
  );
}

export default Sidebar;
