import { useState, useCallback } from 'react';
import api from '../utils/api';

export const useAdmin = () => {
  const [users, setUsers] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);

  const getUsers = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      const response = await api.get('/admin/users', { params });
      const data = response.data.data || response.data;
      setUsers(Array.isArray(data) ? data : data.users || []);
      return data;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateUser = useCallback(async (userId, userData) => {
    try {
      const response = await api.put(`/admin/users/${userId}`, userData);
      await getUsers();
      return response.data.data;
    } catch (error) {
      throw error;
    }
  }, [getUsers]);

  const deleteUser = useCallback(async (userId) => {
    try {
      await api.delete(`/admin/users/${userId}`);
      await getUsers();
    } catch (error) {
      throw error;
    }
  }, [getUsers]);

  const bulkUpdateUsers = useCallback(async (userIds, updateData) => {
    try {
      const response = await api.post('/admin/users/bulk-update', {
        user_ids: userIds,
        update_data: updateData,
      });
      await getUsers();
      return response.data.data;
    } catch (error) {
      throw error;
    }
  }, [getUsers]);

  const bulkDeleteUsers = useCallback(async (userIds) => {
    try {
      await api.post('/admin/users/bulk-delete', { user_ids: userIds });
      await getUsers();
    } catch (error) {
      throw error;
    }
  }, [getUsers]);

  const getUserStatistics = useCallback(async () => {
    try {
      const response = await api.get('/admin/statistics/users');
      return response.data.data;
    } catch (error) {
      throw error;
    }
  }, []);

  const getActivityLogs = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      const response = await api.get('/admin/activities', { params });
      const data = response.data.data || response.data;
      setActivityLogs(Array.isArray(data) ? data : data.activities || []);
      return data;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const getSystemHealth = useCallback(async () => {
    try {
      const response = await api.get('/health');
      return response.data;
    } catch (error) {
      throw error;
    }
  }, []);

  const getManuscriptReports = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      const response = await api.get('/admin/manuscripts/reports', { params });
      const data = response.data.data || response.data;
      setReports(Array.isArray(data) ? data : data.reports || []);
      return data;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const retryConversion = useCallback(async (manuscriptId) => {
    try {
      const response = await api.post(`/admin/manuscripts/${manuscriptId}/retry`);
      return response.data.data;
    } catch (error) {
      throw error;
    }
  }, []);

  const getConversionStatistics = useCallback(async () => {
    try {
      const response = await api.get('/admin/statistics/conversions');
      return response.data.data;
    } catch (error) {
      throw error;
    }
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
