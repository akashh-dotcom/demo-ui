import { createContext, useState, useEffect, useContext } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('manuscript_token');
    const savedUser = localStorage.getItem('manuscript_user');

    if (token && savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        // Validate token and fetch latest user info
        getCurrentUserInfo().catch(() => {
          // If validation fails, clear everything
          logout();
        });
      } catch (error) {
        logout();
      }
    }
    setLoading(false);
  }, []);

  const isTokenExpired = (token) => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expirationTime = payload.exp * 1000;
      return Date.now() >= expirationTime;
    } catch (error) {
      return true;
    }
  };

  const login = async (credentials) => {
    try {
      const response = await api.post('/auth/login', credentials);
      const { access_token } = response.data;

      localStorage.setItem('manuscript_token', access_token);

      // Create basic user object
      const basicUser = {
        id: '',
        email: credentials.email,
        first_name: '',
        last_name: '',
        is_active: true,
        is_verified: true,
        role: 'user',
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        login_count: 1,
        manuscript_count: 0,
      };

      setUser(basicUser);
      localStorage.setItem('manuscript_user', JSON.stringify(basicUser));

      // Fetch actual user info
      try {
        await getCurrentUserInfo();
      } catch (error) {
        console.warn('Could not fetch user info after login:', error);
      }

      return basicUser;
    } catch (error) {
      throw error;
    }
  };

  const register = async (credentials) => {
    try {
      const response = await api.post('/auth/register', credentials);
      const userData = response.data.data;

      const user = {
        id: userData.id || '',
        email: userData.email || credentials.email,
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
        is_active: userData.is_active || true,
        is_verified: userData.is_verified || false,
        role: userData.role || 'user',
        created_at: userData.created_at || new Date().toISOString(),
        last_login: userData.last_login || '',
        login_count: userData.login_count || 0,
        manuscript_count: userData.manuscript_count || 0,
      };

      return user;
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      localStorage.removeItem('manuscript_token');
      localStorage.removeItem('manuscript_refresh_token');
      localStorage.removeItem('manuscript_user');
      setUser(null);
    }
  };

  const getCurrentUserInfo = async () => {
    try {
      const response = await api.get('/auth/me');
      const userData = response.data.data;
      setUser(userData);
      localStorage.setItem('manuscript_user', JSON.stringify(userData));
      return userData;
    } catch (error) {
      throw error;
    }
  };

  const getCurrentUserProfile = async () => {
    try {
      const response = await api.get('/users/profile');
      const userData = response.data.data;
      setUser(userData);
      localStorage.setItem('manuscript_user', JSON.stringify(userData));
      return userData;
    } catch (error) {
      throw error;
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const response = await api.put('/users/profile', profileData);
      const userData = response.data.data;
      setUser(userData);
      localStorage.setItem('manuscript_user', JSON.stringify(userData));
      return userData;
    } catch (error) {
      throw error;
    }
  };

  const changePassword = async (passwordData) => {
    try {
      const response = await api.post('/users/change-password', passwordData);
      return response.data.data;
    } catch (error) {
      throw error;
    }
  };

  const requestPasswordReset = async (email) => {
    try {
      const response = await api.post('/users/request-password-reset', { email });
      return response.data.data;
    } catch (error) {
      throw error;
    }
  };

  const validateToken = async () => {
    try {
      const response = await api.get('/auth/validate');
      const userData = response.data.data;
      setUser(userData);
      localStorage.setItem('manuscript_user', JSON.stringify(userData));
      return userData;
    } catch (error) {
      throw error;
    }
  };

  const isAuthenticated = () => {
    const token = localStorage.getItem('manuscript_token');
    if (!token) return false;

    if (isTokenExpired(token)) {
      logout();
      return false;
    }

    return true;
  };

  const hasRole = (role) => {
    return user?.role === role;
  };

  const isAdmin = () => {
    return hasRole('admin') || hasRole('super_admin');
  };

  const getUserDisplayName = () => {
    if (!user) return '';

    if (user.first_name && user.last_name) {
      return `${user.first_name} ${user.last_name}`;
    } else if (user.first_name) {
      return user.first_name;
    } else if (user.last_name) {
      return user.last_name;
    } else {
      return user.email;
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    getCurrentUserInfo,
    getCurrentUserProfile,
    updateProfile,
    changePassword,
    requestPasswordReset,
    validateToken,
    isAuthenticated,
    hasRole,
    isAdmin,
    getUserDisplayName,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
