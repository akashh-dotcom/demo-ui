import { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

// Mock user data for static app
const MOCK_USERS = {
  'demo@example.com': {
    id: '1',
    email: 'demo@example.com',
    first_name: 'Demo',
    last_name: 'User',
    is_active: true,
    is_verified: true,
    role: 'user',
    created_at: '2024-01-01T00:00:00Z',
    last_login: new Date().toISOString(),
    login_count: 42,
    manuscript_count: 5,
  },
  'admin@example.com': {
    id: '2',
    email: 'admin@example.com',
    first_name: 'Admin',
    last_name: 'User',
    is_active: true,
    is_verified: true,
    role: 'admin',
    created_at: '2024-01-01T00:00:00Z',
    last_login: new Date().toISOString(),
    login_count: 150,
    manuscript_count: 20,
  },
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in (static mode)
    const savedUser = localStorage.getItem('manuscript_user');

    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);
      } catch (error) {
        console.error('Failed to parse saved user:', error);
      }
    }
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    // Static login - check against mock users
    const mockUser = MOCK_USERS[credentials.email];

    if (mockUser) {
      const userData = {
        ...mockUser,
        last_login: new Date().toISOString(),
      };

      setUser(userData);
      localStorage.setItem('manuscript_user', JSON.stringify(userData));
      localStorage.setItem('manuscript_token', 'static-token-' + Date.now());

      return userData;
    } else {
      // Auto-create user for any email
      const newUser = {
        id: Date.now().toString(),
        email: credentials.email,
        first_name: credentials.email.split('@')[0],
        last_name: 'User',
        is_active: true,
        is_verified: true,
        role: 'user',
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
        login_count: 1,
        manuscript_count: 0,
      };

      setUser(newUser);
      localStorage.setItem('manuscript_user', JSON.stringify(newUser));
      localStorage.setItem('manuscript_token', 'static-token-' + Date.now());

      return newUser;
    }
  };

  const register = async (credentials) => {
    // Static registration - auto-create user
    const newUser = {
      id: Date.now().toString(),
      email: credentials.email,
      first_name: credentials.first_name || '',
      last_name: credentials.last_name || '',
      is_active: true,
      is_verified: true,
      role: 'user',
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      login_count: 1,
      manuscript_count: 0,
    };

    setUser(newUser);
    localStorage.setItem('manuscript_user', JSON.stringify(newUser));
    localStorage.setItem('manuscript_token', 'static-token-' + Date.now());

    return newUser;
  };

  const logout = async () => {
    localStorage.removeItem('manuscript_token');
    localStorage.removeItem('manuscript_refresh_token');
    localStorage.removeItem('manuscript_user');
    setUser(null);
  };

  const getCurrentUserInfo = async () => {
    return user;
  };

  const getCurrentUserProfile = async () => {
    return user;
  };

  const updateProfile = async (profileData) => {
    const updatedUser = {
      ...user,
      ...profileData,
    };
    setUser(updatedUser);
    localStorage.setItem('manuscript_user', JSON.stringify(updatedUser));
    return updatedUser;
  };

  const changePassword = async (passwordData) => {
    // Static mode - just simulate success
    return { message: 'Password changed successfully' };
  };

  const requestPasswordReset = async (email) => {
    // Static mode - just simulate success
    return { message: 'Password reset email sent' };
  };

  const validateToken = async () => {
    return user;
  };

  const isAuthenticated = () => {
    return !!user;
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
