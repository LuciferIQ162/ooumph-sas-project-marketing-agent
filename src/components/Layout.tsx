import React from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { 
  HomeIcon, 
  SparklesIcon, 
  MegaphoneIcon, 
  DocumentTextIcon, 
  UsersIcon,
  ChartBarIcon,
  CogIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  StarIcon,
  WrenchScrewdriverIcon,
  BellIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon
} from '@heroicons/react/24/outline';
import { useStore } from '../lib/store';
import { hasPermission } from '../lib/auth';

const Layout: React.FC = () => {
  const { sidebarCollapsed, toggleSidebar, user, notifications } = useStore();
  const location = useLocation();
  const unreadCount = notifications.filter(n => !n.read).length;

  const navigation = [
    { name: 'Dashboard', href: '/', icon: HomeIcon, permission: 'view_dashboard' },
    { name: 'Brand Studio', href: '/brand-studio', icon: SparklesIcon, permission: 'manage_content' },
    { name: 'Campaign Manager', href: '/campaigns', icon: MegaphoneIcon, permission: 'manage_campaigns' },
    { name: 'Content Hub', href: '/content', icon: DocumentTextIcon, permission: 'manage_content' },
    { name: 'Audience Intelligence', href: '/audience', icon: UsersIcon, permission: 'manage_audience' },
    { name: 'Ad Platform', href: '/ads', icon: ChartBarIcon, permission: 'manage_campaigns' },
    { name: 'Influencer Network', href: '/influencers', icon: StarIcon, permission: 'manage_campaigns' },
    { name: 'Affiliate Portal', href: '/affiliates', icon: CurrencyDollarIcon, permission: 'view_affiliate_dashboard' },
    { name: 'Analytics Center', href: '/analytics', icon: ChartBarIcon, permission: 'view_analytics' },
    { name: 'Workflow Orchestrator', href: '/workflows', icon: WrenchScrewdriverIcon, permission: 'manage_workflows' },
    { name: 'Settings', href: '/settings', icon: CogIcon, permission: '*' },
  ];

  const filteredNavigation = navigation.filter(item => 
    hasPermission(user, item.permission)
  );

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`${sidebarCollapsed ? 'w-16' : 'w-64'} bg-white shadow-lg transition-all duration-300 ease-in-out`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            {!sidebarCollapsed && (
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                  <SparklesIcon className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-gray-900">Agentic</span>
              </div>
            )}
            <button
              onClick={toggleSidebar}
              className="p-1 rounded-md hover:bg-gray-100 transition-colors"
            >
              {sidebarCollapsed ? (
                <ChevronDoubleRightIcon className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDoubleLeftIcon className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {filteredNavigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive(item.href)
                    ? 'bg-purple-100 text-purple-700 border-r-2 border-purple-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="ml-3">{item.name}</span>}
              </Link>
            ))}
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-semibold text-gray-900">
                {filteredNavigation.find(item => isActive(item.href))?.name || 'Dashboard'}
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <button className="relative p-2 text-gray-400 hover:text-gray-500 transition-colors">
                <BellIcon className="w-6 h-6" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Tenant Selector */}
              <div className="flex items-center space-x-2 px-3 py-2 bg-gray-100 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">{user?.tenant?.name}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;