import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardLayout } from './layouts/DashboardLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardOverview } from './pages/DashboardOverview';
import { InstitutionsPage } from './pages/InstitutionsPage';
import { AttendancePage } from './pages/AttendancePage';
import { CommunicationPage } from './pages/CommunicationPage';
import { LeavePage } from './pages/LeavePage';
import { ExamsPage } from './pages/ExamsPage';
import { FinancePage } from './pages/FinancePage';
import { LibraryPage } from './pages/LibraryPage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Application Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardOverview />} />

              {/* Super Admin Only */}
              <Route element={<ProtectedRoute allowedRoles={['ROLE_SUPER_ADMIN']} />}>
                <Route path="/institutions" element={<InstitutionsPage />} />
              </Route>

              {/* Module Placeholders mapped to active modules */}
              <Route
                path="/academic"
                element={
                  <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Academic Structure & Programs</h2>
                    <p className="text-sm text-slate-600">
                      Configure Academic Years, Classes, Sections (Grade 10 Section A), and Subjects (MATH-101, PHYS-101).
                    </p>
                  </div>
                }
              />

              <Route
                path="/students"
                element={
                  <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Student Information System (SIS)</h2>
                    <p className="text-sm text-slate-600">
                      Student enrollment, roll allocations, medical details, and Parent-Student relations.
                    </p>
                  </div>
                }
              />

              <Route
                path="/courses"
                element={
                  <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Learning Management System (LMS)</h2>
                    <p className="text-sm text-slate-600">
                      Interactive course modules, lessons, assignments, and online quizzes.
                    </p>
                  </div>
                }
              />

              <Route path="/attendance" element={<AttendancePage />} />
              <Route path="/communication" element={<CommunicationPage />} />
              <Route path="/leave" element={<LeavePage />} />

              <Route path="/exams" element={<ExamsPage />} />

              <Route path="/finance" element={<FinancePage />} />

              <Route path="/library" element={<LibraryPage />} />

              <Route
                path="/transport"
                element={
                  <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Transport Fleet & Logistics</h2>
                    <p className="text-sm text-slate-600">
                      Bus routes, pickup stops, vehicle capacity, and student allocations.
                    </p>
                  </div>
                }
              />

              <Route
                path="/hostel"
                element={
                  <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Hostel & Housing</h2>
                    <p className="text-sm text-slate-600">
                      Building blocks, room capacity, bed assignments, and visitor gate passes.
                    </p>
                  </div>
                }
              />

              <Route
                path="/counseling"
                element={
                  <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Counseling & Student Welfare</h2>
                    <p className="text-sm text-slate-600">
                      Confidential case files, mental health interventions, and at-risk academic indicators.
                    </p>
                  </div>
                }
              />

              <Route
                path="/audits"
                element={
                  <div className="bg-white p-6 rounded-2xl border border-slate-200">
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Compliance & Audit Trail</h2>
                    <p className="text-sm text-slate-600">
                      Tamper-evident system audit log stream recording user mutations, IP addresses, and before/after diffs.
                    </p>
                  </div>
                }
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
