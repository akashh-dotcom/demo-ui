import { useState, useEffect } from 'react';
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
  Loader2,
  RotateCcw,
  Sliders,
  Mail,
  FolderOpen,
  Key,
  DollarSign,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  checkExternalServicesHealth,
  getEpubPublishers,
  createEpubPublisher,
  updateEpubPublisher,
  deleteEpubPublisher,
  getAdminConfig,
  updateAdminConfig,
  updatePdfConfig,
  updateEpubConfig,
  resetAdminConfig,
  getConfigOptions
} from '../../utils/api';

export const SystemSettings = () => {
  const { showSuccess, showError, handleError } = useNotification();

  // Tab state
  const [activeTab, setActiveTab] = useState('health');

  // Health check state
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);

  // Admin config state
  const [adminConfig, setAdminConfig] = useState(null);
  const [configOptions, setConfigOptions] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);

  // PDF config form state
  const [pdfForm, setPdfForm] = useState({});
  const [pdfSaving, setPdfSaving] = useState(false);
  const [pdfDirty, setPdfDirty] = useState(false);

  // EPUB config form state
  const [epubForm, setEpubForm] = useState({});
  const [epubSaving, setEpubSaving] = useState(false);
  const [epubDirty, setEpubDirty] = useState(false);

  // Publishers state
  const [publishers, setPublishers] = useState([]);
  const [publishersLoading, setPublishersLoading] = useState(false);
  const [showPublisherModal, setShowPublisherModal] = useState(false);
  const [editingPublisher, setEditingPublisher] = useState(null);
  const [publisherForm, setPublisherForm] = useState({ name: '', config: {} });
  const [savingPublisher, setSavingPublisher] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Load health data on mount
  useEffect(() => {
    loadHealthData();
    loadAdminConfig();
  }, []);

  // Load tab-specific data when tab changes
  useEffect(() => {
    if (activeTab === 'publishers' && publishers.length === 0) {
      loadPublishers();
    }
  }, [activeTab]);

  // Sync form state when admin config loads
  useEffect(() => {
    if (adminConfig) {
      setPdfForm(adminConfig.pdf || {});
      setEpubForm(adminConfig.epub || {});
    }
  }, [adminConfig]);

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

  const loadAdminConfig = async () => {
    setConfigLoading(true);
    try {
      const [configResult, optionsResult] = await Promise.all([
        getAdminConfig(),
        getConfigOptions()
      ]);
      setAdminConfig(configResult.data);
      setConfigOptions(optionsResult.data);
    } catch (error) {
      console.error('Failed to load admin config:', error);
    } finally {
      setConfigLoading(false);
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

  const handlePdfChange = (field, value) => {
    setPdfForm(prev => ({ ...prev, [field]: value }));
    setPdfDirty(true);
  };

  const handleEpubChange = (field, value) => {
    setEpubForm(prev => ({ ...prev, [field]: value }));
    setEpubDirty(true);
  };

  const handleSavePdfConfig = async () => {
    setPdfSaving(true);
    try {
      await updatePdfConfig(pdfForm);
      showSuccess('Configuration Saved', 'PDF pipeline configuration has been updated');
      setPdfDirty(false);
      await loadAdminConfig();
    } catch (error) {
      handleError(error, 'Failed to save PDF configuration');
    } finally {
      setPdfSaving(false);
    }
  };

  const handleSaveEpubConfig = async () => {
    setEpubSaving(true);
    try {
      await updateEpubConfig(epubForm);
      showSuccess('Configuration Saved', 'EPUB pipeline configuration has been updated');
      setEpubDirty(false);
      await loadAdminConfig();
    } catch (error) {
      handleError(error, 'Failed to save EPUB configuration');
    } finally {
      setEpubSaving(false);
    }
  };

  const handleResetConfig = async () => {
    try {
      await resetAdminConfig();
      showSuccess('Configuration Reset', 'All settings have been reset to defaults');
      setResetConfirm(false);
      await loadAdminConfig();
    } catch (error) {
      handleError(error, 'Failed to reset configuration');
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

  // Email templates state
  const [emailTemplates, setEmailTemplates] = useState({
    success: '<h1>Conversion Complete</h1>\n<p>Your file {{fileName}} has been successfully converted.</p>',
    failure: '<h1>Conversion Failed</h1>\n<p>Your file {{fileName}} could not be converted. Error: {{error}}</p>',
    batchComplete: '<h1>Batch Complete</h1>\n<p>Your batch {{batchId}} has finished processing. {{completed}} of {{total}} files succeeded.</p>'
  });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailDirty, setEmailDirty] = useState(false);
  const [emailPreview, setEmailPreview] = useState(null);

  // Path config state
  const [pathConfig, setPathConfig] = useState({
    defaultOutputPath: '',
    defaultUploadPath: '',
    tempDirectory: ''
  });
  const [pathSaving, setPathSaving] = useState(false);
  const [pathDirty, setPathDirty] = useState(false);

  // Cost settings state
  const [costRates, setCostRates] = useState([
    { model: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', inputCost: 3.0, outputCost: 15.0 },
    { model: 'claude-opus-4-20250514', label: 'Claude Opus 4', inputCost: 15.0, outputCost: 75.0 },
    { model: 'gpt-4', label: 'GPT-4', inputCost: 30.0, outputCost: 60.0 },
    { model: 'gpt-4-turbo', label: 'GPT-4 Turbo', inputCost: 10.0, outputCost: 30.0 }
  ]);
  const [costSaving, setCostSaving] = useState(false);
  const [costDirty, setCostDirty] = useState(false);

  // Sync additional config
  useEffect(() => {
    if (adminConfig) {
      if (adminConfig.emailTemplates) setEmailTemplates(adminConfig.emailTemplates);
      if (adminConfig.paths) setPathConfig(adminConfig.paths);
      if (adminConfig.costRates) setCostRates(adminConfig.costRates);
    }
  }, [adminConfig]);

  const handleSaveEmailTemplates = async () => {
    setEmailSaving(true);
    try {
      await updateAdminConfig({ emailTemplates });
      showSuccess('Saved', 'Email templates have been updated');
      setEmailDirty(false);
    } catch (error) {
      handleError(error, 'Failed to save email templates');
    } finally {
      setEmailSaving(false);
    }
  };

  const handleSavePathConfig = async () => {
    setPathSaving(true);
    try {
      await updateAdminConfig({ paths: pathConfig });
      showSuccess('Saved', 'Path configuration has been updated');
      setPathDirty(false);
    } catch (error) {
      handleError(error, 'Failed to save path configuration');
    } finally {
      setPathSaving(false);
    }
  };

  const handleSaveCostRates = async () => {
    setCostSaving(true);
    try {
      await updateAdminConfig({ costRates });
      showSuccess('Saved', 'Cost settings have been updated');
      setCostDirty(false);
    } catch (error) {
      handleError(error, 'Failed to save cost settings');
    } finally {
      setCostSaving(false);
    }
  };

  const tabs = [
    { id: 'health', label: 'Service Health', icon: Server },
    { id: 'pdf', label: 'PDF Pipeline', icon: FileText },
    { id: 'epub', label: 'EPUB Pipeline', icon: BookOpen },
    { id: 'publishers', label: 'Publishers', icon: Settings },
    { id: 'email', label: 'Email Templates', icon: Mail },
    { id: 'paths', label: 'Path Config', icon: FolderOpen },
    { id: 'apikeys', label: 'API Keys', icon: Key },
    { id: 'costs', label: 'Cost Settings', icon: DollarSign }
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

  const renderSelectField = (label, field, value, options, onChange, disabled = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(field, e.target.value)}
        disabled={disabled}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );

  const renderNumberField = (label, field, value, onChange, min, max, step = 1, disabled = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(field, parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
      />
    </div>
  );

  const renderToggleField = (label, field, value, onChange, disabled = false) => (
    <div className="flex items-center justify-between py-2">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <button
        type="button"
        onClick={() => onChange(field, !value)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
          value ? 'bg-purple-600' : 'bg-gray-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            value ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #e8f0f8, #f5f9fc)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
            <p className="text-gray-600 mt-1">Configure pipeline settings and manage publishers</p>
          </div>
          <button
            onClick={() => setResetConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 text-red-600 border border-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <RotateCcw size={18} />
            Reset All
          </button>
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

                    {/* Last Updated */}
                    {adminConfig?.updatedAt && (
                      <div className="md:col-span-2 text-sm text-gray-500 text-center">
                        Configuration last updated: {new Date(adminConfig.updatedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* PDF Config Tab */}
            {activeTab === 'pdf' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">PDF Pipeline Configuration</h2>
                    <p className="text-sm text-gray-500 mt-1">These settings will be used for all new PDF conversions</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={loadAdminConfig}
                      disabled={configLoading}
                      className="flex items-center gap-2 px-4 py-2 text-purple-600 border border-purple-600 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={18} className={configLoading ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                    <button
                      onClick={handleSavePdfConfig}
                      disabled={pdfSaving || !pdfDirty}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        pdfDirty
                          ? 'bg-purple-600 text-white hover:bg-purple-700'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {pdfSaving ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Save size={18} />
                      )}
                      Save Changes
                    </button>
                  </div>
                </div>

                {configLoading ? (
                  <Loading />
                ) : configOptions ? (
                  <div className="space-y-6">
                    {/* AI Configuration */}
                    <div className="border rounded-lg p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Sliders size={20} className="text-purple-600" />
                        <h3 className="font-semibold text-gray-900">AI Configuration</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderSelectField('AI Model', 'model', pdfForm.model, configOptions.pdf.models, handlePdfChange)}
                        {renderNumberField('Temperature', 'temperature', pdfForm.temperature, handlePdfChange, 0, 1, 0.1)}
                        {renderNumberField('Batch Size', 'batchSize', pdfForm.batchSize, handlePdfChange, 1, 20)}
                        {renderNumberField('Max Retries', 'maxRetries', pdfForm.maxRetries, handlePdfChange, 0, 10)}
                      </div>
                    </div>

                    {/* Processing Configuration */}
                    <div className="border rounded-lg p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <FileText size={20} className="text-blue-600" />
                        <h3 className="font-semibold text-gray-900">Processing Configuration</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderSelectField('Processing Mode', 'processingMode', pdfForm.processingMode, configOptions.pdf.processingModes, handlePdfChange)}
                        {renderSelectField('DPI', 'dpi', pdfForm.dpi, configOptions.pdf.dpiOptions, handlePdfChange)}
                        {renderSelectField('Language', 'language', pdfForm.language, configOptions.pdf.languages, handlePdfChange)}
                        {renderNumberField('Retry Delay (ms)', 'retryDelay', pdfForm.retryDelay, handlePdfChange, 1000, 30000, 1000)}
                      </div>
                    </div>

                    {/* Output Configuration */}
                    <div className="border rounded-lg p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <BookOpen size={20} className="text-green-600" />
                        <h3 className="font-semibold text-gray-900">Output Configuration</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderSelectField('Template Type', 'templateType', pdfForm.templateType, configOptions.pdf.templateTypes, handlePdfChange)}
                        {renderNumberField('TOC Depth', 'tocDepth', pdfForm.tocDepth, handlePdfChange, 1, 6)}
                      </div>
                      <div className="mt-4 border-t pt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">Output Options</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {renderToggleField('Create DOCX', 'createDocx', pdfForm.createDocx, handlePdfChange)}
                          {renderToggleField('Create RittDoc', 'createRittdoc', pdfForm.createRittdoc, handlePdfChange)}
                          {renderToggleField('Include Table of Contents', 'includeToc', pdfForm.includeToc, handlePdfChange)}
                          {renderToggleField('Skip Extraction', 'skipExtraction', pdfForm.skipExtraction, handlePdfChange)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <AlertCircle size={48} className="mx-auto mb-4 text-gray-400" />
                    <p>Unable to load PDF configuration.</p>
                    <p className="text-sm">Make sure you have admin privileges.</p>
                  </div>
                )}
              </div>
            )}

            {/* EPUB Config Tab */}
            {activeTab === 'epub' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">EPUB Pipeline Configuration</h2>
                    <p className="text-sm text-gray-500 mt-1">These settings will be used for all new EPUB conversions</p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={loadAdminConfig}
                      disabled={configLoading}
                      className="flex items-center gap-2 px-4 py-2 text-purple-600 border border-purple-600 rounded-lg hover:bg-purple-50 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={18} className={configLoading ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                    <button
                      onClick={handleSaveEpubConfig}
                      disabled={epubSaving || !epubDirty}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        epubDirty
                          ? 'bg-purple-600 text-white hover:bg-purple-700'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {epubSaving ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Save size={18} />
                      )}
                      Save Changes
                    </button>
                  </div>
                </div>

                {configLoading ? (
                  <Loading />
                ) : configOptions ? (
                  <div className="space-y-6">
                    {/* Output Configuration */}
                    <div className="border rounded-lg p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <BookOpen size={20} className="text-green-600" />
                        <h3 className="font-semibold text-gray-900">Output Configuration</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderSelectField('Output Format', 'outputFormat', epubForm.outputFormat, configOptions.epub.outputFormats, handleEpubChange)}
                        {renderSelectField('Chapter Split Option', 'chapterSplitOption', epubForm.chapterSplitOption, configOptions.epub.chapterSplitOptions, handleEpubChange)}
                        {renderSelectField('Validation Rule', 'validationRule', epubForm.validationRule, configOptions.epub.validationRules, handleEpubChange)}
                        {renderSelectField('Default Language', 'defaultLanguage', epubForm.defaultLanguage, configOptions.epub.languages, handleEpubChange)}
                      </div>
                    </div>

                    {/* Processing Options */}
                    <div className="border rounded-lg p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Sliders size={20} className="text-purple-600" />
                        <h3 className="font-semibold text-gray-900">Processing Options</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderNumberField('Max Retries', 'maxRetries', epubForm.maxRetries, handleEpubChange, 0, 10)}
                        {renderNumberField('Retry Delay (ms)', 'retryDelay', epubForm.retryDelay, handleEpubChange, 1000, 30000, 1000)}
                      </div>
                      <div className="mt-4 border-t pt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">Processing Flags</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {renderToggleField('Preserve Metadata', 'preserveMetadata', epubForm.preserveMetadata, handleEpubChange)}
                          {renderToggleField('Enable Validation', 'enableValidation', epubForm.enableValidation, handleEpubChange)}
                          {renderToggleField('Generate Report', 'generateReport', epubForm.generateReport, handleEpubChange)}
                        </div>
                      </div>
                    </div>

                    {/* Default Publisher */}
                    <div className="border rounded-lg p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Settings size={20} className="text-orange-600" />
                        <h3 className="font-semibold text-gray-900">Default Publisher</h3>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Default Publisher for New Conversions</label>
                        <select
                          value={epubForm.defaultPublisher || ''}
                          onChange={(e) => handleEpubChange('defaultPublisher', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                          <option value="">None (Select at upload time)</option>
                          {publishers.map(pub => (
                            <option key={pub.id || pub.name} value={pub.id || pub.name}>
                              {pub.name || pub.id}
                            </option>
                          ))}
                        </select>
                        <p className="text-sm text-gray-500 mt-1">
                          Configure publishers in the Publishers tab
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <AlertCircle size={48} className="mx-auto mb-4 text-gray-400" />
                    <p>Unable to load EPUB configuration.</p>
                    <p className="text-sm">Make sure you have admin privileges.</p>
                  </div>
                )}
              </div>
            )}

            {/* Email Templates Tab */}
            {activeTab === 'email' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Email Templates</h2>
                    <p className="text-sm text-gray-500 mt-1">Configure notification email templates using HTML with {'{{variable}}'} placeholders</p>
                  </div>
                  <button
                    onClick={handleSaveEmailTemplates}
                    disabled={emailSaving || !emailDirty}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      emailDirty
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {emailSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    Save Templates
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Success template */}
                  <div className="border rounded-lg p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <CheckCircle size={18} className="text-green-500" />
                        Success Template
                      </h3>
                      <button
                        onClick={() => setEmailPreview(emailPreview === 'success' ? null : 'success')}
                        className="text-sm text-purple-600 hover:text-purple-700"
                      >
                        {emailPreview === 'success' ? 'Hide Preview' : 'Preview'}
                      </button>
                    </div>
                    <textarea
                      value={emailTemplates.success}
                      onChange={(e) => { setEmailTemplates(prev => ({ ...prev, success: e.target.value })); setEmailDirty(true); }}
                      rows={5}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                      placeholder="HTML template for conversion success..."
                    />
                    {emailPreview === 'success' && (
                      <div className="mt-3 p-4 bg-gray-50 border rounded-lg">
                        <p className="text-xs text-gray-500 mb-2">Preview:</p>
                        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: emailTemplates.success.replace(/\{\{fileName\}\}/g, 'sample-book.pdf') }} />
                      </div>
                    )}
                  </div>

                  {/* Failure template */}
                  <div className="border rounded-lg p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <XCircle size={18} className="text-red-500" />
                        Failure Template
                      </h3>
                      <button
                        onClick={() => setEmailPreview(emailPreview === 'failure' ? null : 'failure')}
                        className="text-sm text-purple-600 hover:text-purple-700"
                      >
                        {emailPreview === 'failure' ? 'Hide Preview' : 'Preview'}
                      </button>
                    </div>
                    <textarea
                      value={emailTemplates.failure}
                      onChange={(e) => { setEmailTemplates(prev => ({ ...prev, failure: e.target.value })); setEmailDirty(true); }}
                      rows={5}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                      placeholder="HTML template for conversion failure..."
                    />
                    {emailPreview === 'failure' && (
                      <div className="mt-3 p-4 bg-gray-50 border rounded-lg">
                        <p className="text-xs text-gray-500 mb-2">Preview:</p>
                        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: emailTemplates.failure.replace(/\{\{fileName\}\}/g, 'sample-book.pdf').replace(/\{\{error\}\}/g, 'Processing timeout') }} />
                      </div>
                    )}
                  </div>

                  {/* Batch complete template */}
                  <div className="border rounded-lg p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                        <Mail size={18} className="text-blue-500" />
                        Batch Complete Template
                      </h3>
                      <button
                        onClick={() => setEmailPreview(emailPreview === 'batch' ? null : 'batch')}
                        className="text-sm text-purple-600 hover:text-purple-700"
                      >
                        {emailPreview === 'batch' ? 'Hide Preview' : 'Preview'}
                      </button>
                    </div>
                    <textarea
                      value={emailTemplates.batchComplete}
                      onChange={(e) => { setEmailTemplates(prev => ({ ...prev, batchComplete: e.target.value })); setEmailDirty(true); }}
                      rows={5}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                      placeholder="HTML template for batch completion..."
                    />
                    {emailPreview === 'batch' && (
                      <div className="mt-3 p-4 bg-gray-50 border rounded-lg">
                        <p className="text-xs text-gray-500 mb-2">Preview:</p>
                        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: emailTemplates.batchComplete.replace(/\{\{batchId\}\}/g, 'batch-001').replace(/\{\{completed\}\}/g, '8').replace(/\{\{total\}\}/g, '10') }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Path Configuration Tab */}
            {activeTab === 'paths' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Path Configuration</h2>
                    <p className="text-sm text-gray-500 mt-1">Configure default file system paths for processing</p>
                  </div>
                  <button
                    onClick={handleSavePathConfig}
                    disabled={pathSaving || !pathDirty}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      pathDirty
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {pathSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    Save Changes
                  </button>
                </div>

                <div className="border rounded-lg p-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Default Output Path</label>
                      <input
                        type="text"
                        value={pathConfig.defaultOutputPath}
                        onChange={(e) => { setPathConfig(prev => ({ ...prev, defaultOutputPath: e.target.value })); setPathDirty(true); }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="/var/output or C:\Output"
                      />
                      <p className="text-xs text-gray-500 mt-1">Where converted files will be saved by default</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Default Upload Path</label>
                      <input
                        type="text"
                        value={pathConfig.defaultUploadPath}
                        onChange={(e) => { setPathConfig(prev => ({ ...prev, defaultUploadPath: e.target.value })); setPathDirty(true); }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="/var/uploads or C:\Uploads"
                      />
                      <p className="text-xs text-gray-500 mt-1">Temporary directory for uploaded files</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Temp Directory</label>
                      <input
                        type="text"
                        value={pathConfig.tempDirectory}
                        onChange={(e) => { setPathConfig(prev => ({ ...prev, tempDirectory: e.target.value })); setPathDirty(true); }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="/tmp/processing"
                      />
                      <p className="text-xs text-gray-500 mt-1">Directory for temporary processing files</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* API Keys Tab */}
            {activeTab === 'apikeys' && (
              <div>
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">API Keys</h2>
                  <p className="text-sm text-gray-500 mt-1">View API key status. Keys are managed via environment variables (.env file).</p>
                </div>

                <div className="space-y-4">
                  {/* Anthropic Key */}
                  <div className="border rounded-lg p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                          <Key size={20} className="text-orange-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">ANTHROPIC_API_KEY</h3>
                          <p className="text-sm text-gray-500">Used for Claude AI models</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {adminConfig?.apiKeyStatus?.anthropic ? (
                          <>
                            <CheckCircle size={18} className="text-green-500" />
                            <span className="text-sm text-gray-600">
                              ****{adminConfig.apiKeyStatus.anthropic}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-sm font-mono text-gray-500 bg-gray-100 px-3 py-1 rounded">
                              {process.env.ANTHROPIC_API_KEY ? '****' + '(set)' : 'Not configured'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* OpenAI Key */}
                  <div className="border rounded-lg p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <Key size={20} className="text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">OPENAI_API_KEY</h3>
                          <p className="text-sm text-gray-500">Used for GPT-4 models</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {adminConfig?.apiKeyStatus?.openai ? (
                          <>
                            <CheckCircle size={18} className="text-green-500" />
                            <span className="text-sm text-gray-600">
                              ****{adminConfig.apiKeyStatus.openai}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-mono text-gray-500 bg-gray-100 px-3 py-1 rounded">
                            Not configured
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Guidance */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <p className="font-medium mb-1">Updating API Keys</p>
                        <p>API keys are managed through environment variables for security. To update:</p>
                        <ol className="list-decimal ml-5 mt-2 space-y-1">
                          <li>Open the <code className="bg-blue-100 px-1 rounded">.env</code> file in the backend directory</li>
                          <li>Update <code className="bg-blue-100 px-1 rounded">ANTHROPIC_API_KEY</code> or <code className="bg-blue-100 px-1 rounded">OPENAI_API_KEY</code></li>
                          <li>Restart the backend service for changes to take effect</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cost Settings Tab */}
            {activeTab === 'costs' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Cost Settings</h2>
                    <p className="text-sm text-gray-500 mt-1">Configure cost rates per million tokens for each model</p>
                  </div>
                  <button
                    onClick={handleSaveCostRates}
                    disabled={costSaving || !costDirty}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      costDirty
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {costSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    Save Rates
                  </button>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Input Cost ($/M tokens)</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Output Cost ($/M tokens)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {costRates.map((rate, index) => (
                        <tr key={rate.model} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{rate.label}</p>
                              <p className="text-xs text-gray-500 font-mono">{rate.model}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">$</span>
                              <input
                                type="number"
                                value={rate.inputCost}
                                onChange={(e) => {
                                  const updated = [...costRates];
                                  updated[index] = { ...updated[index], inputCost: parseFloat(e.target.value) || 0 };
                                  setCostRates(updated);
                                  setCostDirty(true);
                                }}
                                step="0.1"
                                min="0"
                                className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">$</span>
                              <input
                                type="number"
                                value={rate.outputCost}
                                onChange={(e) => {
                                  const updated = [...costRates];
                                  updated[index] = { ...updated[index], outputCost: parseFloat(e.target.value) || 0 };
                                  setCostRates(updated);
                                  setCostDirty(true);
                                }}
                                step="0.1"
                                min="0"
                                className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 bg-gray-50 border rounded-lg p-4">
                  <p className="text-sm text-gray-600">
                    <DollarSign size={14} className="inline text-gray-500 mr-1" />
                    Costs are specified per million tokens. These rates are used for estimating conversion costs in the dashboard.
                  </p>
                </div>
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

      {/* Reset Confirmation */}
      <ConfirmationDialog
        isOpen={resetConfirm}
        onClose={() => setResetConfirm(false)}
        onConfirm={handleResetConfig}
        title="Reset All Configuration"
        message="Are you sure you want to reset all PDF and EPUB pipeline settings to their default values? This action cannot be undone."
        confirmText="Reset All"
        type="danger"
      />
    </div>
  );
};

export default SystemSettings;
