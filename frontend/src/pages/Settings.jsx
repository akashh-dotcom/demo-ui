import Navigation from '../components/shared/Navigation';

export const Settings = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Application Settings</h2>
          <p className="text-gray-600">Settings page - Coming soon</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
