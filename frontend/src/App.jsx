import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { SocketProvider } from './contexts/SocketContext';
import ProtectedRoute from './components/ProtectedRoute';
import Notifications from './components/shared/Notifications';
import PageLayout from './components/shared/PageLayout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Manuscripts from './pages/Manuscripts';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import CostAnalytics from './pages/CostAnalytics';
import BatchOperations from './pages/BatchOperations';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import ActivityLogs from './pages/admin/ActivityLogs';
import ConversionReports from './pages/admin/ConversionReports';
import SystemSettings from './pages/admin/SystemSettings';

function ProtectedPageLayout({ children, title, requireAdmin = false }) {
  return (
    <ProtectedRoute requireAdmin={requireAdmin}>
      <PageLayout title={title}>
        {children}
      </PageLayout>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <NotificationProvider>
        <AuthProvider>
          <SocketProvider>
          <Notifications />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedPageLayout title="Dashboard">
                  <Dashboard />
                </ProtectedPageLayout>
              }
            />
            <Route
              path="/manuscripts"
              element={
                <ProtectedPageLayout title="Manuscripts">
                  <Manuscripts />
                </ProtectedPageLayout>
              }
            />
            <Route
              path="/cost-analytics"
              element={
                <ProtectedPageLayout title="Cost Analytics">
                  <CostAnalytics />
                </ProtectedPageLayout>
              }
            />
            <Route
              path="/batch-operations"
              element={
                <ProtectedPageLayout title="Batch Operations">
                  <BatchOperations />
                </ProtectedPageLayout>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedPageLayout title="Profile">
                  <Profile />
                </ProtectedPageLayout>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedPageLayout title="Settings">
                  <Settings />
                </ProtectedPageLayout>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedPageLayout title="Admin Dashboard" requireAdmin>
                  <AdminDashboard />
                </ProtectedPageLayout>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedPageLayout title="User Management" requireAdmin>
                  <UserManagement />
                </ProtectedPageLayout>
              }
            />
            <Route
              path="/admin/activities"
              element={
                <ProtectedPageLayout title="Activity Logs" requireAdmin>
                  <ActivityLogs />
                </ProtectedPageLayout>
              }
            />
            <Route
              path="/admin/reports"
              element={
                <ProtectedPageLayout title="Conversion Reports" requireAdmin>
                  <ConversionReports />
                </ProtectedPageLayout>
              }
            />
            <Route
              path="/admin/system"
              element={
                <ProtectedPageLayout title="System Settings" requireAdmin>
                  <SystemSettings />
                </ProtectedPageLayout>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </SocketProvider>
        </AuthProvider>
      </NotificationProvider>
    </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
