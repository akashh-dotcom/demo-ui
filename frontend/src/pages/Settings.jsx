import { useState, useEffect } from 'react';
import { Moon, Sun, Bell, BellOff, FolderOpen, Sliders, Save, RotateCcw } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import ConversionConfig from '../components/shared/ConversionConfig';

const Settings = () => {
  const { theme, toggleTheme, isDark } = useTheme();
  const { user } = useAuth();
  const { showNotification } = useNotification();

  const [notifications, setNotifications] = useState({
    emailOnComplete: true,
    emailOnFailure: true,
    emailOnBatchComplete: true,
    browserNotifications: false,
  });

  const [paths, setPaths] = useState({
    defaultOutputFolder: '',
  });

  const [conversionDefaults, setConversionDefaults] = useState(null);
  const [dirty, setDirty] = useState(false);

  // Load saved settings from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('user_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.notifications) setNotifications(parsed.notifications);
        if (parsed.paths) setPaths(parsed.paths);
        if (parsed.conversionDefaults) setConversionDefaults(parsed.conversionDefaults);
      } catch (e) {
        // ignore parse errors
      }
    }
  }, []);

  const handleSave = () => {
    const settings = { notifications, paths, conversionDefaults };
    localStorage.setItem('user_settings', JSON.stringify(settings));
    setDirty(false);
    showNotification('Settings saved successfully', 'success');
  };

  const handleReset = () => {
    setNotifications({
      emailOnComplete: true,
      emailOnFailure: true,
      emailOnBatchComplete: true,
      browserNotifications: false,
    });
    setPaths({ defaultOutputFolder: '' });
    setConversionDefaults(null);
    localStorage.removeItem('user_settings');
    setDirty(false);
    showNotification('Settings reset to defaults', 'info');
  };

  const updateNotification = (key, value) => {
    setNotifications(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const updatePath = (key, value) => {
    setPaths(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  return (
    <div className="min-h-screen bg-secondary-50 dark:bg-secondary-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-secondary-900 dark:text-secondary-100">Settings</h1>
            <p className="text-secondary-500 dark:text-secondary-400 mt-1">
              Manage your preferences for {user?.username || 'your account'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="btn-secondary flex items-center gap-2"
            >
              <RotateCcw size={16} />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={!dirty}
              className={`btn-primary flex items-center gap-2 ${!dirty ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Save size={16} />
              Save Changes
            </button>
          </div>
        </div>

        {/* Appearance */}
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100 mb-4 flex items-center gap-2">
            {isDark ? <Moon size={20} /> : <Sun size={20} />}
            Appearance
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-secondary-800 dark:text-secondary-200">Dark Mode</p>
              <p className="text-sm text-secondary-500 dark:text-secondary-400">
                Switch between light and dark themes
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isDark ? 'bg-primary-600' : 'bg-secondary-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isDark ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100 mb-4 flex items-center gap-2">
            <Bell size={20} />
            Notifications
          </h2>
          <div className="space-y-4">
            {[
              { key: 'emailOnComplete', label: 'Email on conversion complete', desc: 'Receive an email when your manuscript finishes converting' },
              { key: 'emailOnFailure', label: 'Email on conversion failure', desc: 'Receive an email when a conversion fails' },
              { key: 'emailOnBatchComplete', label: 'Email on batch complete', desc: 'Receive an email when a batch operation finishes' },
              { key: 'browserNotifications', label: 'Browser notifications', desc: 'Show desktop notifications for conversion updates' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-secondary-800 dark:text-secondary-200">{label}</p>
                  <p className="text-sm text-secondary-500 dark:text-secondary-400">{desc}</p>
                </div>
                <button
                  onClick={() => updateNotification(key, !notifications[key])}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    notifications[key] ? 'bg-primary-600' : 'bg-secondary-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      notifications[key] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Default Output Path */}
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100 mb-4 flex items-center gap-2">
            <FolderOpen size={20} />
            File Paths
          </h2>
          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-1">
              Default Output Folder
            </label>
            <input
              type="text"
              value={paths.defaultOutputFolder}
              onChange={(e) => updatePath('defaultOutputFolder', e.target.value)}
              placeholder="/path/to/output/folder"
              className="input-field"
            />
            <p className="text-xs text-secondary-400 mt-1">
              Converted files will be saved to this folder when specified during upload
            </p>
          </div>
        </div>

        {/* Default Conversion Parameters */}
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100 mb-4 flex items-center gap-2">
            <Sliders size={20} />
            Default Conversion Parameters
          </h2>
          <p className="text-sm text-secondary-500 dark:text-secondary-400 mb-4">
            These defaults will pre-fill the conversion configuration when uploading new manuscripts.
            You can override them per upload.
          </p>
          <ConversionConfig
            config={conversionDefaults || {}}
            onChange={(config) => { setConversionDefaults(config); setDirty(true); }}
            compact={false}
          />
        </div>
      </div>
    </div>
  );
};

export default Settings;
