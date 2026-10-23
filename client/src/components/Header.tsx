import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Bell, LogOut, School, ShieldCheck } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();

  const formatRole = (role: string) => {
    return role.replace('ROLE_', '').replace(/_/g, ' ');
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
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
          <ShieldCheck className="w-3.5 h-3.5" />
          {user ? formatRole(user.role) : ''}
        </span>

        <button
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg relative transition"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="w-2 h-2 bg-rose-500 rounded-full absolute top-2 right-2 ring-2 ring-white"></span>
        </button>

        <div className="h-6 w-px bg-slate-200"></div>

        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-medium text-xs">
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
          onClick={() => logout()}
          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
