import { useState, useCallback } from 'react';

// Mock users data for admin panel
const MOCK_USERS = [
  {
    id: '1',
    email: 'demo@example.com',
    first_name: 'Demo',
    last_name: 'User',
    role: 'user',
    is_active: true,
    is_verified: true,
    created_at: '2024-01-01T10:00:00Z',
    last_login: '2024-01-16T08:30:00Z',
    login_count: 42,
    manuscript_count: 5,
  },
  {
    id: '2',
    email: 'admin@example.com',
    first_name: 'Admin',
    last_name: 'User',
    role: 'admin',
    is_active: true,
    is_verified: true,
    created_at: '2024-01-01T10:00:00Z',
    last_login: '2024-01-16T09:00:00Z',
    login_count: 150,
    manuscript_count: 20,
  },
  {
    id: '3',
    email: 'john.doe@example.com',
    first_name: 'John',
    last_name: 'Doe',
    role: 'user',
    is_active: true,
    is_verified: true,
    created_at: '2024-01-05T14:30:00Z',
    last_login: '2024-01-15T16:20:00Z',
    login_count: 28,
    manuscript_count: 8,
  },
  {
    id: '4',
    email: 'jane.smith@example.com',
    first_name: 'Jane',
    last_name: 'Smith',
    role: 'user',
    is_active: false,
    is_verified: true,
    created_at: '2024-01-10T11:00:00Z',
    last_login: '2024-01-12T10:00:00Z',
    login_count: 5,
    manuscript_count: 2,
  },
];

const MOCK_ACTIVITY_LOGS = [
  {
    id: '1',
    user_id: '1',
    user_email: 'demo@example.com',
    action: 'login',
    resource_type: 'auth',
    resource_id: null,
    details: 'User logged in successfully',
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0',
    timestamp: '2024-01-16T08:30:00Z',
  },
  {
    id: '2',
    user_id: '1',
    user_email: 'demo@example.com',
    action: 'upload',
    resource_type: 'manuscript',
    resource_id: '1',
    details: 'Uploaded manuscript: research-paper-2024.docx',
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0',
    timestamp: '2024-01-15T10:30:00Z',
  },
  {
    id: '3',
    user_id: '2',
    user_email: 'admin@example.com',
    action: 'update_user',
    resource_type: 'user',
    resource_id: '3',
    details: 'Updated user role',
    ip_address: '192.168.1.101',
    user_agent: 'Mozilla/5.0',
    timestamp: '2024-01-15T09:00:00Z',
  },
];

const MOCK_REPORTS = [
  {
    id: '1',
    manuscript_id: '1',
    file_name: 'research-paper-2024.docx',
    user_email: 'demo@example.com',
    status: 'completed',
    created_at: '2024-01-15T10:30:00Z',
    completed_at: '2024-01-15T10:35:00Z',
    conversion_time: 45,
    file_size: 2456789,
    error_message: null,
  },
  {
    id: '2',
    manuscript_id: '4',
    file_name: 'literature-review.pdf',
    user_email: 'demo@example.com',
    status: 'failed',
    created_at: '2024-01-13T16:45:00Z',
    completed_at: null,
    conversion_time: null,
    file_size: 4567890,
    error_message: 'Unsupported PDF format',
  },
];

export const useAdmin = () => {
  const [users, setUsers] = useState([...MOCK_USERS]);
  const [activityLogs, setActivityLogs] = useState([...MOCK_ACTIVITY_LOGS]);
  const [reports, setReports] = useState([...MOCK_REPORTS]);
  const [loading, setLoading] = useState(false);

  const getUsers = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 300));

      let filteredUsers = [...MOCK_USERS];

      // Apply filters
      if (params.role) {
        filteredUsers = filteredUsers.filter(u => u.role === params.role);
      }
      if (params.is_active !== undefined) {
        filteredUsers = filteredUsers.filter(u => u.is_active === params.is_active);
      }

      setUsers(filteredUsers);
      return {
        users: filteredUsers,
        total: filteredUsers.length,
      };
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUser = useCallback(async (userId, userData) => {
    await new Promise(resolve => setTimeout(resolve, 200));

    setUsers((prev) =>
      prev.map((user) =>
        user.id === userId
          ? { ...user, ...userData }
          : user
      )
    );

    return { message: 'User updated successfully' };
  }, []);

  const deleteUser = useCallback(async (userId) => {
    await new Promise(resolve => setTimeout(resolve, 200));
    setUsers((prev) => prev.filter((user) => user.id !== userId));
  }, []);

  const bulkUpdateUsers = useCallback(async (userIds, updateData) => {
    await new Promise(resolve => setTimeout(resolve, 300));

    setUsers((prev) =>
      prev.map((user) =>
        userIds.includes(user.id)
          ? { ...user, ...updateData }
          : user
      )
    );

    return { message: `${userIds.length} users updated successfully` };
  }, []);

  const bulkDeleteUsers = useCallback(async (userIds) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    setUsers((prev) => prev.filter((user) => !userIds.includes(user.id)));
  }, []);

  const getUserStatistics = useCallback(async () => {
    await new Promise(resolve => setTimeout(resolve, 200));

    return {
      total_users: users.length,
      active_users: users.filter(u => u.is_active).length,
      inactive_users: users.filter(u => !u.is_active).length,
      verified_users: users.filter(u => u.is_verified).length,
      admin_users: users.filter(u => u.role === 'admin').length,
      regular_users: users.filter(u => u.role === 'user').length,
      total_manuscripts: users.reduce((sum, u) => sum + u.manuscript_count, 0),
      average_manuscripts_per_user: users.reduce((sum, u) => sum + u.manuscript_count, 0) / users.length,
    };
  }, [users]);

  const getActivityLogs = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 300));

      let filteredLogs = [...MOCK_ACTIVITY_LOGS];

      // Apply filters
      if (params.action) {
        filteredLogs = filteredLogs.filter(log => log.action === params.action);
      }
      if (params.user_id) {
        filteredLogs = filteredLogs.filter(log => log.user_id === params.user_id);
      }

      setActivityLogs(filteredLogs);
      return {
        activities: filteredLogs,
        total: filteredLogs.length,
      };
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const getSystemHealth = useCallback(async () => {
    await new Promise(resolve => setTimeout(resolve, 200));

    return {
      status: 'healthy',
      uptime: 864000, // 10 days in seconds
      cpu_usage: 45.5,
      memory_usage: 62.3,
      disk_usage: 38.7,
      active_connections: 127,
      database_status: 'connected',
      cache_status: 'operational',
      queue_status: 'processing',
      last_backup: '2024-01-16T00:00:00Z',
    };
  }, []);

  const getManuscriptReports = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 300));

      let filteredReports = [...MOCK_REPORTS];

      // Apply filters
      if (params.status) {
        filteredReports = filteredReports.filter(r => r.status === params.status);
      }

      setReports(filteredReports);
      return {
        reports: filteredReports,
        total: filteredReports.length,
      };
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const retryConversion = useCallback(async (manuscriptId) => {
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simulate retry - update report status
    setReports((prev) =>
      prev.map((report) =>
        report.manuscript_id === manuscriptId
          ? { ...report, status: 'processing', error_message: null }
          : report
      )
    );

    return { message: 'Conversion retry initiated' };
  }, []);

  const getConversionStatistics = useCallback(async () => {
    await new Promise(resolve => setTimeout(resolve, 200));

    const totalConversions = 150;
    const successfulConversions = 135;
    const failedConversions = 10;
    const processingConversions = 5;

    return {
      total_conversions: totalConversions,
      successful_conversions: successfulConversions,
      failed_conversions: failedConversions,
      processing_conversions: processingConversions,
      success_rate: (successfulConversions / totalConversions) * 100,
      average_conversion_time: 33.5,
      total_size_processed: 245678901,
      conversions_today: 12,
      conversions_this_week: 47,
      conversions_this_month: 150,
    };
  }, []);

  return {
    users,
    activityLogs,
    reports,
    loading,
    getUsers,
    updateUser,
    deleteUser,
    bulkUpdateUsers,
    bulkDeleteUsers,
    getUserStatistics,
    getActivityLogs,
    getSystemHealth,
    getManuscriptReports,
    retryConversion,
    getConversionStatistics,
  };
};

export default useAdmin;
