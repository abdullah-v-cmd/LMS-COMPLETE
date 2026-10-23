import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { School, ShieldAlert, ArrowRight, UserCheck } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { label: 'Super Admin', user: 'superadmin@alpha.edu', pass: 'Password123!', role: 'Platform Owner' },
  { label: 'Principal', user: 'principal@alpha.edu', pass: 'Password123!', role: 'Institution Admin' },
  { label: 'Academic Head', user: 'hod.science@alpha.edu', pass: 'Password123!', role: 'HOD Science' },
  { label: 'Class Teacher', user: 'teacher.homeroom@alpha.edu', pass: 'Password123!', role: 'Grade 10 Homeroom' },
  { label: 'Subject Teacher', user: 'teacher.math@alpha.edu', pass: 'Password123!', role: 'Mathematics Teacher' },
  { label: 'Teaching Assistant', user: 'ta.physics@alpha.edu', pass: 'Password123!', role: 'Physics TA' },
  { label: 'Exam Controller', user: 'exam.controller@alpha.edu', pass: 'Password123!', role: 'Exam Controller' },
  { label: 'Finance Head', user: 'finance.head@alpha.edu', pass: 'Password123!', role: 'Senior Accountant' },
  { label: 'Fee Clerk', user: 'fee.clerk@alpha.edu', pass: 'Password123!', role: 'Junior Accountant' },
  { label: 'Librarian', user: 'librarian@alpha.edu', pass: 'Password123!', role: 'Library Admin' },
  { label: 'Transport Coord', user: 'transport@alpha.edu', pass: 'Password123!', role: 'Transport Fleet' },
  { label: 'Hostel Warden', user: 'hostel.warden@alpha.edu', pass: 'Password123!', role: 'Hostel Warden' },
  { label: 'Counselor', user: 'counselor@alpha.edu', pass: 'Password123!', role: 'Student Welfare' },
  { label: 'Parent', user: 'parent.john@alpha.edu', pass: 'Password123!', role: 'Parent (Alice Doe)' },
  { label: 'Student', user: 'student.alice@alpha.edu', pass: 'Password123!', role: 'Grade 10 Student' },
  { label: 'Auditor', user: 'auditor@alpha.edu', pass: 'Password123!', role: 'Compliance Officer' },
];

export const LoginPage: React.FC = () => {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(usernameOrEmail, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
          'Failed to sign in. Please verify your credentials.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectDemo = (account: (typeof DEMO_ACCOUNTS)[0]) => {
    setUsernameOrEmail(account.user);
    setPassword(account.pass);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center text-white mx-auto shadow-lg shadow-primary-500/30">
          <School className="w-7 h-7" />
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
          Sign In to Portal
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Advanced School LMS & Management System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-100">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Email or Username
              </label>
              <input
                type="text"
                required
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="e.g. principal@alpha.edu"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 focus:ring-4 focus:ring-primary-500/20 disabled:opacity-50 transition shadow-sm"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-3">
              <UserCheck className="w-4 h-4 text-primary-600" />
              <span>Quick Demo Sign-in (16 Roles)</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.label}
                  type="button"
                  onClick={() => handleSelectDemo(acc)}
                  className="text-left p-1.5 rounded text-[11px] bg-slate-50 hover:bg-primary-50 hover:text-primary-700 border border-slate-200 transition truncate"
                  title={`${acc.label} (${acc.role}): ${acc.user}`}
                >
                  <span className="font-semibold block truncate">{acc.label}</span>
                  <span className="text-[9px] text-slate-500 block truncate">{acc.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
