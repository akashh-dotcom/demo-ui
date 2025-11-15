import axios from 'axios';
import environment from '../config/environment';

const api = axios.create({
  baseURL: `${environment.apiUrl}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('manuscript_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear storage and redirect to login
      localStorage.removeItem('manuscript_token');
      localStorage.removeItem('manuscript_refresh_token');
      localStorage.removeItem('manuscript_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
