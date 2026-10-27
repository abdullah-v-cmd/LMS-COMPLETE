import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import {
  User,
  KeyRound,
  Shield,
  CheckCircle2,
  AlertCircle,
  Database,
  Trash2,
  RotateCcw,
  Download,
  RefreshCw,
  HardDrive,
  Clock,
  Archive,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'backup' | 'recycle_bin'>('profile');

  const isAuthorizedEntity =
    user?.role === 'ROLE_SUPER_ADMIN' || user?.role === 'ROLE_INSTITUTION_ADMIN';

  // Profile Form State
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Database Backup State
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState('');
  const [backupError, setBackupError] = useState('');
  const [lastBackupInfo, setLastBackupInfo] = useState<{
    timestamp: string;
    size: string;
    filename: string;
  } | null>(null);

  // Recycle Bin State
  const [binItems, setBinItems] = useState<any[]>([]);
  const [binLoading, setBinLoading] = useState(false);
  const [binNotice, setBinNotice] = useState('');
  const [binError, setBinError] = useState('');

  const fetchRecycleBin = async () => {
    try {
      setBinLoading(true);
      setBinError('');
      const res = await apiClient.get('/system/recycle-bin');
      if (res.data.success) {
        setBinItems(res.data.data || []);
      }
    } catch (err: any) {
      setBinError(err.response?.data?.error?.message || 'Failed to load recycle bin records.');
    } finally {
      setBinLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorizedEntity && activeTab === 'recycle_bin') {
      fetchRecycleBin();
    }
  }, [activeTab, isAuthorizedEntity]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setProfileLoading(true);

    try {
      const res = await apiClient.patch('/auth/profile', {
        firstName,
        lastName,
        email,
      });

      if (res.data.success) {
        updateUser(res.data.data);
        setProfileSuccess('Profile details updated successfully.');
      }
    } catch (err: any) {
      setProfileError(err.response?.data?.error?.message || 'Failed to update profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirm password do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }

    setPasswordLoading(true);

    try {
      const res = await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      if (res.data.success) {
        setPasswordSuccess('Password changed successfully. Your account is now secured with the new password.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      setPasswordError(
        err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Failed to change password. Please verify your current password.'
      );
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    setBackupError('');
    setBackupSuccess('');

    try {
      const res = await apiClient.get('/system/backup', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/json' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `lms_database_backup_${timestamp}.json`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      const sizeKb = (blob.size / 1024).toFixed(1);
      setBackupSuccess(`Database snapshot successfully created and downloaded (${sizeKb} KB).`);
      setLastBackupInfo({
        timestamp: new Date().toLocaleString(),
        size: `${sizeKb} KB`,
        filename,
      });
    } catch (err: any) {
      setBackupError(err.response?.data?.error?.message || 'Failed to generate database backup.');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBinItem = async (item: any) => {
    setBinNotice('');
    setBinError('');
    try {
      const res = await apiClient.post(`/system/recycle-bin/${item.id}/restore`);
      if (res.data.success) {
        setBinNotice(`Successfully restored "${item.entityTitle}" back to active database records!`);
        await fetchRecycleBin();
      }
    } catch (err: any) {
      setBinError(err.response?.data?.error?.message || 'Failed to restore record.');
    }
  };

  const handlePermanentDeleteBinItem = async (item: any) => {
    if (
      !window.confirm(
        `PERMANENT DELETE CONFIRMATION:\n\nAre you sure you want to permanently delete "${item.entityTitle}" from the database?\n\nThis cannot be undone.`
      )
    ) {
      return;
    }
    setBinNotice('');
    setBinError('');
    try {
      const res = await apiClient.delete(`/system/recycle-bin/${item.id}`);
      if (res.data.success) {
        setBinNotice(`Permanently deleted "${item.entityTitle}" from the database.`);
        await fetchRecycleBin();
      }
    } catch (err: any) {
      setBinError(err.response?.data?.error?.message || 'Failed to permanently delete record.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System & Account Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage profile details, credentials, database backups, and deleted records recovery.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition shrink-0 ${
            activeTab === 'profile'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <User className="w-4 h-4" />
          Profile & Email
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition shrink-0 ${
            activeTab === 'security'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          Security & Password
        </button>

        {isAuthorizedEntity && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('backup')}
              className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition shrink-0 ${
                activeTab === 'backup'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Database className="w-4 h-4" />
              Database Backup
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('recycle_bin')}
              className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition shrink-0 ${
                activeTab === 'recycle_bin'
                  ? 'border-rose-600 text-rose-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              Recycle Bin (Trash)
              {binItems.length > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                  {binItems.length}
                </span>
              )}
            </button>
          </>
        )}
      </div>

      {/* Tab 1: Profile & Email */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Personal Details</h2>
            <p className="text-xs text-slate-500">
              Update your name and primary email address used for notifications and sign-in.
            </p>
          </div>

          {profileSuccess && (
            <div className="flex items-center gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}

          {profileError && (
            <div className="flex items-center gap-2.5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4 max-w-xl">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Assigned Role
              </label>
              <input
                type="text"
                disabled
                value={user?.role || 'ROLE_STUDENT'}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed font-mono text-xs"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={profileLoading}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
              >
                {profileLoading ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Security & Password */}
      {activeTab === 'security' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
            <p className="text-xs text-slate-500">
              Ensure your account is using a secure password of at least 6 characters.
            </p>
          </div>

          {passwordSuccess && (
            <div className="flex items-center gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{passwordSuccess}</span>
            </div>
          )}

          {passwordError && (
            <div className="flex items-center gap-2.5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
              <div className="mt-1.5 flex gap-2 text-[11px] text-slate-500">
                <span className={newPassword.length >= 6 ? 'text-emerald-600 font-medium' : ''}>
                  • At least 6 characters
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
              >
                {passwordLoading ? 'Updating Password...' : 'Update Password'}
              </button>
            </div>
          </form>

          <div className="border-t border-slate-100 pt-4 flex items-center gap-3 text-xs text-slate-500">
            <Shield className="w-4 h-4 text-primary-600" />
            <span>Passwords are hashed with bcrypt rounds and verified against double-spend salt invariants.</span>
          </div>
        </div>
      )}

      {/* Tab 3: Database Backup (Authorized Entities) */}
      {isAuthorizedEntity && activeTab === 'backup' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Database Backup & Disaster Recovery</h2>
                  <p className="text-xs text-slate-500">
                    Export a full JSON snapshot of all institutional data, courses, marks, and student profiles.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreateBackup}
              disabled={backupLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{backupLoading ? 'Exporting Database...' : 'Create & Download Backup'}</span>
            </button>
          </div>

          {backupSuccess && (
            <div className="flex items-center gap-2.5 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
              <span>{backupSuccess}</span>
            </div>
          )}

          {backupError && (
            <div className="flex items-center gap-2.5 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
              <span>{backupError}</span>
            </div>
          )}

          {/* Backup Information Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                <HardDrive className="w-4 h-4 text-indigo-600" />
                <span>Scope & Engine</span>
              </div>
              <p className="mt-2 text-base font-bold text-slate-800">Complete PostgreSQL Snapshot</p>
              <p className="mt-1 text-xs text-slate-500">
                Includes all students, courses, assignments, submissions, marks & fees.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>Authorization Role</span>
              </div>
              <p className="mt-2 text-base font-bold text-slate-800">{user?.role}</p>
              <p className="mt-1 text-xs text-slate-500">
                Encrypted multi-tenant data isolation active for this institution.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Last Export Event</span>
              </div>
              <p className="mt-2 text-base font-bold text-slate-800">
                {lastBackupInfo ? lastBackupInfo.size : 'Ready to export'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {lastBackupInfo ? `Downloaded: ${lastBackupInfo.timestamp}` : 'Click the button above to generate.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Recycle Bin / Trash (Authorized Entities) */}
      {isAuthorizedEntity && activeTab === 'recycle_bin' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Recycle Bin (Trash)</h2>
                  <p className="text-xs text-slate-500">
                    Deleted student and course records are safely stored here. You can <strong>Restore</strong> them to active status or <strong>Permanently Delete</strong> them.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchRecycleBin}
              disabled={binLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${binLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Bin</span>
            </button>
          </div>

          {binNotice && (
            <div className="flex items-center gap-2.5 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
              <span>{binNotice}</span>
            </div>
          )}

          {binError && (
            <div className="flex items-center gap-2.5 p-4 bg-rose-50 border border-rose-200 text-rose-800 text-sm rounded-xl">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
              <span>{binError}</span>
            </div>
          )}

          {binLoading ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-400 mb-2" />
              Loading recycle bin records...
            </div>
          ) : binItems.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Archive className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Recycle Bin is currently empty</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                When you click "Delete (To Bin)" on any student or course record, it is preserved here with full restoration options.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Entity & Record Details</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Deleted At</th>
                    <th className="py-3 px-4">Deleted By</th>
                    <th className="py-3 px-4 text-right">Actions (2 Options)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {binItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {item.entityTitle}
                        {item.reason && (
                          <p className="text-xs text-slate-400 font-normal mt-0.5">{item.reason}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            item.entityType === 'STUDENT'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {item.entityType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {new Date(item.deletedAt).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 font-medium">
                        {item.deletedBy}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {/* OPTION 1: RESTORE */}
                        <button
                          type="button"
                          onClick={() => handleRestoreBinItem(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100 shadow-sm transition"
                          title="Restore record to active database status"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                          Restore Record
                        </button>

                        {/* OPTION 2: PERMANENT DELETE */}
                        <button
                          type="button"
                          onClick={() => handlePermanentDeleteBinItem(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-xs font-bold text-red-700 hover:bg-red-100 shadow-sm transition"
                          title="Permanently remove record from database"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                          Permanent Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
