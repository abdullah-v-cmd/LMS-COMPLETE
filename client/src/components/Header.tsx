import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Bell, LogOut, School, ShieldCheck } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();

  const formatRole = (role: string) => {
    return role.replace('ROLE_', '').replace(/_/g, ' ');
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20" aria-label="Page Header">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-primary-50 text-primary-600 rounded-lg" aria-hidden="true">
          <School className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-900 leading-tight">
            {user?.institutionName || 'Alpha Academy'}
          </h1>
          <p className="text-xs text-slate-500">School Learning Management Portal</p>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200">
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="sr-only">Active role: </span>
          {user ? formatRole(user.role) : ''}
        </span>

        <button
          type="button"
          aria-label="View notifications"
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg relative transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          title="Notifications"
        >
          <Bell className="w-5 h-5" aria-hidden="true" />
          <span className="w-2 h-2 bg-rose-500 rounded-full absolute top-2 right-2 ring-2 ring-white" aria-hidden="true"></span>
          <span className="sr-only">Unread notifications present</span>
        </button>

        <div className="h-6 w-px bg-slate-200" aria-hidden="true"></div>

        <div className="flex items-center space-x-3" aria-label="Current logged in user profile">
          <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-medium text-xs" aria-hidden="true">
            {user?.firstName?.[0]}
            {user?.lastName?.[0]}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-slate-900">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-[11px] text-slate-500">{user?.email}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => logout()}
          aria-label="Sign Out of account"
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
};
