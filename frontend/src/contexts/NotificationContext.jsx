import { createContext, useState, useContext, useCallback } from 'react';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const generateId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const addNotification = useCallback((type, title, message, duration = 5000) => {
    const notification = {
      id: generateId(),
      type,
      title,
      message,
      timestamp: new Date(),
      duration,
    };

    setNotifications((prev) => [...prev, notification]);

    if (duration > 0) {
      setTimeout(() => {
        removeNotification(notification.id);
      }, duration);
    }

    return notification.id;
  }, []);

  const showSuccess = useCallback(
    (title, message, duration = 5000) => {
      return addNotification('success', title, message, duration);
    },
    [addNotification]
  );

  const showError = useCallback(
    (title, message, duration = 8000) => {
      return addNotification('error', title, message, duration);
    },
    [addNotification]
  );

  const showWarning = useCallback(
    (title, message, duration = 6000) => {
      return addNotification('warning', title, message, duration);
    },
    [addNotification]
  );

  const showInfo = useCallback(
    (title, message, duration = 5000) => {
      return addNotification('info', title, message, duration);
    },
    [addNotification]
  );

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const handleError = useCallback(
    (error, context = 'An error occurred') => {
      let errorMessage = 'An unexpected error occurred';
      let errorTitle = context;

      if (error.response) {
        // HTTP error response
        const status = error.response.status;
        const data = error.response.data;

        if (data?.message) {
          errorMessage = data.message;
        } else if (data?.detail) {
          errorMessage = data.detail;
        } else {
          errorMessage = `Error ${status}: ${error.message}`;
        }

        if (status === 400) {
          errorTitle = 'Bad Request';
        } else if (status === 401) {
          errorTitle = 'Unauthorized';
        } else if (status === 403) {
          errorTitle = 'Forbidden';
        } else if (status === 404) {
          errorTitle = 'Not Found';
        } else if (status === 500) {
          errorTitle = 'Server Error';
        }
      } else if (error.request) {
        // Network error
        errorMessage = 'Unable to connect to the server. Please check your connection.';
        errorTitle = 'Network Error';
      } else if (error.message) {
        errorMessage = error.message;
      }

      showError(errorTitle, errorMessage);
      return { title: errorTitle, message: errorMessage };
    },
    [showError]
  );

  const value = {
    notifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    removeNotification,
    clearAllNotifications,
    handleError,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;
