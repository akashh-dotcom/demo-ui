import { useState, useCallback, useRef } from 'react';
import api from '../utils/api';

export const useCostAnalytics = () => {
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const lastFiltersRef = useRef({});

  const fetchSummary = useCallback(async () => {
    try {
      const response = await api.get('/files/cost-summary');
      const data = response.data?.data || response.data;
      setSummary(data);
      return data;
    } catch (err) {
      console.error('Failed to fetch cost summary:', err);
      setError(err.message || 'Failed to fetch cost summary');
      return null;
    }
  }, []);

  const fetchAnalytics = useCallback(async (filters = {}) => {
    try {
      // Build params, stripping empty values
      const params = {};
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.fileType) params.fileType = filters.fileType;
      if (filters.publisher) params.publisher = filters.publisher;
      if (filters.model) params.model = filters.model;

      lastFiltersRef.current = filters;
      const response = await api.get('/files/cost-analytics', { params });
      const data = response.data?.data || response.data;
      setAnalytics(data);
      return data;
    } catch (err) {
      console.error('Failed to fetch cost analytics:', err);
      setError(err.message || 'Failed to fetch cost analytics');
      return null;
    }
  }, []);

  const fetchAll = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, analyticsData] = await Promise.all([
        fetchSummary(),
        fetchAnalytics(filters),
      ]);
      return { summary: summaryData, analytics: analyticsData };
    } catch (err) {
      setError(err.message || 'Failed to load cost data');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchSummary, fetchAnalytics]);

  const refetch = useCallback(async () => {
    return fetchAll(lastFiltersRef.current);
  }, [fetchAll]);

  return {
    summary,
    analytics,
    loading,
    error,
    fetchAll,
    fetchAnalytics,
    fetchSummary,
    refetch,
  };
};

export default useCostAnalytics;
