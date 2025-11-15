import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAdmin } from '../../hooks/useAdmin';
import { useNotification } from '../../contexts/NotificationContext';
import Navigation from '../../components/shared/Navigation';
import Loading from '../../components/shared/Loading';

export const AdminDashboard = () => {
  const { getUserStatistics, getConversionStatistics } = useAdmin();
  const { handleError } = useNotification();
  const [userStats, setUserStats] = useState(null);
  const [conversionStats, setConversionStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [uStats, cStats] = await Promise.all([
        getUserStatistics(),
        getConversionStatistics(),
      ]);
      setUserStats(uStats);
      setConversionStats(cStats);
    } catch (error) {
      handleError(error, 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Dashboard</h1>

        {loading ? (
          <Loading />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Link
                to="/admin/users"
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">User Management</h3>
                <p className="text-3xl font-bold text-indigo-600">
                  {userStats?.total_users || 0}
                </p>
                <p className="text-sm text-gray-500">Total Users</p>
              </Link>

              <Link
                to="/admin/activities"
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Activity Logs</h3>
                <p className="text-3xl font-bold text-blue-600">
                  {userStats?.active_users || 0}
                </p>
                <p className="text-sm text-gray-500">Active Users</p>
              </Link>

              <Link
                to="/admin/reports"
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
              >
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Conversion Reports</h3>
                <p className="text-3xl font-bold text-green-600">
                  {conversionStats?.total_conversions || 0}
                </p>
                <p className="text-sm text-gray-500">Total Conversions</p>
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">System Statistics</h2>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Users</span>
                    <span className="font-semibold">{userStats?.total_users || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Active Users</span>
                    <span className="font-semibold">{userStats?.active_users || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Admin Users</span>
                    <span className="font-semibold">{userStats?.admin_users || 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Conversion Statistics
                </h2>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Conversions</span>
                    <span className="font-semibold">
                      {conversionStats?.total_conversions || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Successful</span>
                    <span className="font-semibold text-green-600">
                      {conversionStats?.successful || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Failed</span>
                    <span className="font-semibold text-red-600">
                      {conversionStats?.failed || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
