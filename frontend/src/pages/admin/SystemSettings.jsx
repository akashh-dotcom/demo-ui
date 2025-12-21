import { useState, useEffect } from 'react';
import Navigation from '../../components/shared/Navigation';
import Loading from '../../components/shared/Loading';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import { useNotification } from '../../contexts/NotificationContext';
import {
  Settings,
  Server,
  FileText,
  BookOpen,
  CheckCircle,
  XCircle,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  AlertCircle,
  Loader2
} from 'lucide-react';
import {
  checkExternalServicesHealth,
  getPdfOptions,
  getEpubSchema,
  getEpubPublishers,
  createEpubPublisher,
  updateEpubPublisher,
  deleteEpubPublisher
} from '../../utils/api';

export const SystemSettings = () => {
  const { showSuccess, showError, handleError } = useNotification();

  // Tab state
  const [activeTab, setActiveTab] = useState('health');

  // Health check state
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);

  // PDF config state
  const [pdfOptions, setPdfOptions] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // EPUB config state
  const [epubSchema, setEpubSchema] = useState(null);
  const [epubLoading, setEpubLoading] = useState(false);

  // Publishers state
  const [publishers, setPublishers] = useState([]);
  const [publishersLoading, setPublishersLoading] = useState(false);
  const [showPublisherModal, setShowPublisherModal] = useState(false);
  const [editingPublisher, setEditingPublisher] = useState(null);
  const [publisherForm, setPublisherForm] = useState({ name: '', config: {} });
  const [savingPublisher, setSavingPublisher] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Load health data on mount
  useEffect(() => {
    loadHealthData();
  }, []);

  // Load tab-specific data when tab changes
  useEffect(() => {
    if (activeTab === 'pdf' && !pdfOptions) {
      loadPdfConfig();
    } else if (activeTab === 'epub' && !epubSchema) {
      loadEpubConfig();
    } else if (activeTab === 'publishers' && publishers.length === 0) {
      loadPublishers();
    }
  }, [activeTab]);

  const loadHealthData = async () => {
    setHealthLoading(true);
    try {
      const result = await checkExternalServicesHealth();
      setHealthData(result);
    } catch (error) {
      console.error('Failed to load health data:', error);
      setHealthData({
        success: false,
        error: error.message,
        services: { pdf: { healthy: false }, epub: { healthy: false } }
      });
    } finally {
      setHealthLoading(false);
    }
  };

  const loadPdfConfig = async () => {
    setPdfLoading(true);
    try {
      const result = await getPdfOptions();
      setPdfOptions(result.data);
    } catch (error) {
      handleError(error, 'Failed to load PDF configuration');
    } finally {
      setPdfLoading(false);
    }
  };

  const loadEpubConfig = async () => {
    setEpubLoading(true);
    try {
      const result = await getEpubSchema();
      setEpubSchema(result.data);
    } catch (error) {
      handleError(error, 'Failed to load EPUB configuration');
    } finally {
      setEpubLoading(false);
    }
  };

  const loadPublishers = async () => {
    setPublishersLoading(true);
    try {
      const result = await getEpubPublishers();
      setPublishers(result.data?.publishers || result.data || []);
    } catch (error) {
      handleError(error, 'Failed to load publishers');
    } finally {
      setPublishersLoading(false);
    }
  };

  const handleCreatePublisher = () => {
    setEditingPublisher(null);
    setPublisherForm({ name: '', config: {} });
    setShowPublisherModal(true);
  };

  const handleEditPublisher = (publisher) => {
    setEditingPublisher(publisher);
    setPublisherForm({
      name: publisher.name || publisher.id,
      config: publisher.config || {}
    });
    setShowPublisherModal(true);
  };

  const handleSavePublisher = async () => {
    if (!publisherForm.name.trim()) {
      showError('Validation Error', 'Publisher name is required');
      return;
    }

    setSavingPublisher(true);
    try {
      if (editingPublisher) {
        await updateEpubPublisher(editingPublisher.name || editingPublisher.id, publisherForm);
        showSuccess('Publisher Updated', `${publisherForm.name} has been updated`);
      } else {
        await createEpubPublisher(publisherForm);
        showSuccess('Publisher Created', `${publisherForm.name} has been created`);
      }
      setShowPublisherModal(false);
      await loadPublishers();
    } catch (error) {
      handleError(error, 'Failed to save publisher');
    } finally {
      setSavingPublisher(false);
    }
  };

  const handleDeletePublisher = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteEpubPublisher(deleteConfirm.name || deleteConfirm.id);
      showSuccess('Publisher Deleted', `${deleteConfirm.name || deleteConfirm.id} has been deleted`);
      setDeleteConfirm(null);
      await loadPublishers();
    } catch (error) {
      handleError(error, 'Failed to delete publisher');
    }
  };

  const tabs = [
    { id: 'health', label: 'Service Health', icon: Server },
    { id: 'pdf', label: 'PDF Pipeline', icon: FileText },
    { id: 'epub', label: 'EPUB Pipeline', icon: BookOpen },
    { id: 'publishers', label: 'Publishers', icon: Settings }
  ];

  const renderHealthStatus = (service) => {
    if (!service) return null;
    const isHealthy = service.healthy || service.status === 'healthy';

    return (
      <div className={`flex items-center gap-2 ${isHealthy ? 'text-green-600' : 'text-red-600'}`}>
        {isHealthy ? <CheckCircle size={20} /> : <XCircle size={20} />}
        <span className="font-medium">{isHealthy ? 'Healthy' : 'Unavailable'}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #e8f0f8, #f5f9fc)' }}>
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
            <p className="text-gray-600 mt-1">Configure pipeline settings and manage publishers</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex flex-wrap -mb-px">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 sm:px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-purple-600 text-purple-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-6">
            {/* Health Tab */}
            {activeTab === 'health' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">External Service Health</h2>
                  <button
                    onClick={loadHealthData}
                    disabled={healthLoading}
                    className="flex items-center gap-2 px-4 py-2 text-purple-600 border border-purple-600 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={18} className={healthLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>

                {healthLoading ? (
                  <Loading />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* PDF Service */}
                    <div className="border rounded-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                            <FileText size={24} className="text-blue-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">PDF Processing API</h3>
                            <p className="text-sm text-gray-500">Port 8000</p>
                          </div>
                        </div>
                        {renderHealthStatus(healthData?.services?.pdf)}
                      </div>
                      {healthData?.services?.pdf?.version && (
                        <p className="text-sm text-gray-600">Version: {healthData.services.pdf.version}</p>
                      )}
                    </div>

                    {/* EPUB Service */}
                    <div className="border rounded-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                            <BookOpen size={24} className="text-green-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">EPUB Processing API</h3>
                            <p className="text-sm text-gray-500">Port 5001</p>
                          </div>
                        </div>
                        {renderHealthStatus(healthData?.services?.epub)}
                      </div>
                      {healthData?.services?.epub?.version && (
                        <p className="text-sm text-gray-600">Version: {healthData.services.epub.version}</p>
                      )}
                    </div>

                    {/* External APIs Status */}
                    <div className="md:col-span-2 border rounded-lg p-6 bg-gray-50">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle size={18} className="text-gray-500" />
                        <span className="font-medium text-gray-700">External APIs Mode</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {healthData?.useExternalApis
                          ? 'External APIs are ENABLED. Files are processed by external PDF/EPUB services.'
                          : 'External APIs are DISABLED. Files are processed locally using legacy converters.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PDF Config Tab */}
            {activeTab === 'pdf' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">PDF Pipeline Configuration</h2>
                  <button
                    onClick={loadPdfConfig}
                    disabled={pdfLoading}
                    className="flex items-center gap-2 px-4 py-2 text-purple-600 border border-purple-600 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={18} className={pdfLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>

                {pdfLoading ? (
                  <Loading />
                ) : pdfOptions ? (
                  <div className="space-y-6">
                    {/* Output Formats */}
                    {pdfOptions.outputFormats && (
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3">Output Formats</h3>
                        <div className="flex flex-wrap gap-2">
                          {pdfOptions.outputFormats.map((format) => (
                            <span key={format} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                              {format.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Processing Modes */}
                    {pdfOptions.processingModes && (
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3">Processing Modes</h3>
                        <div className="flex flex-wrap gap-2">
                          {pdfOptions.processingModes.map((mode) => (
                            <span key={mode} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm capitalize">
                              {mode}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Languages */}
                    {pdfOptions.languages && (
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3">Supported Languages</h3>
                        <div className="flex flex-wrap gap-2">
                          {pdfOptions.languages.map((lang) => (
                            <span key={lang} className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm uppercase">
                              {lang}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* AI Assistance */}
                    {pdfOptions.aiAssistance && (
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3">AI Assistance</h3>
                        <div className="flex items-center gap-4">
                          <span className={`px-3 py-1 rounded-full text-sm ${pdfOptions.aiAssistance.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {pdfOptions.aiAssistance.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                          {pdfOptions.aiAssistance.models && (
                            <div className="flex gap-2">
                              {pdfOptions.aiAssistance.models.map((model) => (
                                <span key={model} className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm">
                                  {model}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <AlertCircle size={48} className="mx-auto mb-4 text-gray-400" />
                    <p>Unable to load PDF configuration.</p>
                    <p className="text-sm">Make sure external APIs are enabled and the PDF service is running.</p>
                  </div>
                )}
              </div>
            )}

            {/* EPUB Config Tab */}
            {activeTab === 'epub' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">EPUB Pipeline Configuration</h2>
                  <button
                    onClick={loadEpubConfig}
                    disabled={epubLoading}
                    className="flex items-center gap-2 px-4 py-2 text-purple-600 border border-purple-600 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={18} className={epubLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>

                {epubLoading ? (
                  <Loading />
                ) : epubSchema ? (
                  <div className="space-y-6">
                    {/* Output Formats */}
                    {epubSchema.outputFormats && (
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3">Output Formats</h3>
                        <div className="flex flex-wrap gap-2">
                          {epubSchema.outputFormats.map((format) => (
                            <span key={format} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                              {format.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Chapter Split Options */}
                    {epubSchema.chapterSplitOptions && (
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3">Chapter Split Options</h3>
                        <div className="flex flex-wrap gap-2">
                          {epubSchema.chapterSplitOptions.map((option) => (
                            <span key={option} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm capitalize">
                              {option.replace('-', ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Metadata Fields */}
                    {epubSchema.metadataFields && (
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3">Metadata Fields</h3>
                        <div className="flex flex-wrap gap-2">
                          {epubSchema.metadataFields.map((field) => (
                            <span key={field} className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm capitalize">
                              {field}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Validation Rules */}
                    {epubSchema.validationRules && (
                      <div className="border rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3">Validation Rules</h3>
                        <div className="flex flex-wrap gap-2">
                          {epubSchema.validationRules.map((rule) => (
                            <span key={rule} className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm capitalize">
                              {rule}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <AlertCircle size={48} className="mx-auto mb-4 text-gray-400" />
                    <p>Unable to load EPUB configuration.</p>
                    <p className="text-sm">Make sure external APIs are enabled and the EPUB service is running.</p>
                  </div>
                )}
              </div>
            )}

            {/* Publishers Tab */}
            {activeTab === 'publishers' && (
              <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Publisher Management</h2>
                  <div className="flex gap-3">
                    <button
                      onClick={loadPublishers}
                      disabled={publishersLoading}
                      className="flex items-center gap-2 px-4 py-2 text-purple-600 border border-purple-600 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={18} className={publishersLoading ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                    <button
                      onClick={handleCreatePublisher}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <Plus size={18} />
                      Add Publisher
                    </button>
                  </div>
                </div>

                {publishersLoading ? (
                  <Loading />
                ) : publishers.length > 0 ? (
                  <div className="space-y-4">
                    {publishers.map((publisher, index) => (
                      <div key={publisher.id || publisher.name || index} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-gray-900">{publisher.name || publisher.id}</h3>
                            {publisher.config && (
                              <div className="mt-2 text-sm text-gray-600">
                                {Object.entries(publisher.config).map(([key, value]) => (
                                  <span key={key} className="inline-block mr-4">
                                    <strong>{key}:</strong> {String(value)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditPublisher(publisher)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(publisher)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Settings size={48} className="mx-auto mb-4 text-gray-400" />
                    <p>No publishers configured.</p>
                    <p className="text-sm">Click "Add Publisher" to create one.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Publisher Modal */}
      {showPublisherModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-gray-900 bg-opacity-75" onClick={() => !savingPublisher && setShowPublisherModal(false)} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">
                  {editingPublisher ? 'Edit Publisher' : 'Add Publisher'}
                </h3>
                <button
                  onClick={() => setShowPublisherModal(false)}
                  disabled={savingPublisher}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Publisher Name
                  </label>
                  <input
                    type="text"
                    value={publisherForm.name}
                    onChange={(e) => setPublisherForm({ ...publisherForm, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Enter publisher name"
                    disabled={savingPublisher}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Output Format
                  </label>
                  <select
                    value={publisherForm.config.outputFormat || ''}
                    onChange={(e) => setPublisherForm({
                      ...publisherForm,
                      config: { ...publisherForm.config, outputFormat: e.target.value }
                    })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    disabled={savingPublisher}
                  >
                    <option value="">Select format</option>
                    <option value="xml">XML</option>
                    <option value="docbook">DocBook</option>
                    <option value="html5">HTML5</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chapter Split
                  </label>
                  <select
                    value={publisherForm.config.chapterSplit || ''}
                    onChange={(e) => setPublisherForm({
                      ...publisherForm,
                      config: { ...publisherForm.config, chapterSplit: e.target.value }
                    })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    disabled={savingPublisher}
                  >
                    <option value="">Select option</option>
                    <option value="auto">Auto</option>
                    <option value="manual">Manual</option>
                    <option value="heading-based">Heading Based</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowPublisherModal(false)}
                  disabled={savingPublisher}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePublisher}
                  disabled={savingPublisher}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {savingPublisher ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Save
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDeletePublisher}
        title="Delete Publisher"
        message={`Are you sure you want to delete "${deleteConfirm?.name || deleteConfirm?.id}"? This action cannot be undone.`}
        confirmText="Delete"
        type="danger"
      />
    </div>
  );
};

export default SystemSettings;
