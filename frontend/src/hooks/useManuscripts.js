import { useState, useCallback } from 'react';

// Mock manuscripts data for static app
const MOCK_MANUSCRIPTS = [
  {
    id: '1',
    file_name: 'research-paper-2024.docx',
    file_size: 2456789,
    original_format: 'docx',
    status: 'completed',
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T10:35:00Z',
    conversion_time: 45,
    error_message: null,
    output_formats: ['xml', 'pdf'],
  },
  {
    id: '2',
    file_name: 'manuscript-draft.pdf',
    file_size: 1234567,
    original_format: 'pdf',
    status: 'completed',
    created_at: '2024-01-14T14:20:00Z',
    updated_at: '2024-01-14T14:22:00Z',
    conversion_time: 30,
    error_message: null,
    output_formats: ['xml'],
  },
  {
    id: '3',
    file_name: 'clinical-study.docx',
    file_size: 3456789,
    original_format: 'docx',
    status: 'processing',
    created_at: '2024-01-16T09:15:00Z',
    updated_at: '2024-01-16T09:15:00Z',
    conversion_time: null,
    error_message: null,
    output_formats: [],
  },
  {
    id: '4',
    file_name: 'literature-review.pdf',
    file_size: 4567890,
    original_format: 'pdf',
    status: 'failed',
    created_at: '2024-01-13T16:45:00Z',
    updated_at: '2024-01-13T16:46:00Z',
    conversion_time: null,
    error_message: 'Unsupported PDF format',
    output_formats: [],
  },
  {
    id: '5',
    file_name: 'data-analysis.docx',
    file_size: 1987654,
    original_format: 'docx',
    status: 'completed',
    created_at: '2024-01-12T11:00:00Z',
    updated_at: '2024-01-12T11:02:00Z',
    conversion_time: 25,
    error_message: null,
    output_formats: ['xml', 'pdf', 'html'],
  },
];

const MOCK_STATISTICS = {
  total_manuscripts: 5,
  completed: 3,
  processing: 1,
  failed: 1,
  total_size: 13703689,
  average_conversion_time: 33.33,
  success_rate: 75.0,
};

export const useManuscripts = () => {
  const [manuscripts, setManuscripts] = useState([...MOCK_MANUSCRIPTS]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});

  const getManuscripts = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 300));

      let filteredManuscripts = [...MOCK_MANUSCRIPTS];

      // Apply filters if provided
      if (params.status) {
        filteredManuscripts = filteredManuscripts.filter(m => m.status === params.status);
      }

      setManuscripts(filteredManuscripts);
      return {
        manuscripts: filteredManuscripts,
        total: filteredManuscripts.length,
      };
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const getUploadUrl = useCallback(async (fileName, fileSize, contentType) => {
    // Simulate getting upload URL
    await new Promise(resolve => setTimeout(resolve, 200));

    const manuscriptId = Date.now().toString();
    return {
      upload_url: '#', // No actual upload in static mode
      manuscript_id: manuscriptId,
      file_name: fileName,
    };
  }, []);

  const uploadToS3 = useCallback((url, file, manuscriptId) => {
    return new Promise((resolve) => {
      // Simulate upload progress
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setUploadProgress((prev) => ({
          ...prev,
          [manuscriptId]: {
            progress,
            loaded: (file.size * progress) / 100,
            total: file.size,
          },
        }));

        if (progress >= 100) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }, []);

  const uploadManuscript = useCallback(
    async (file) => {
      try {
        // Get upload URL
        const uploadData = await getUploadUrl(file.name, file.size, file.type);
        const { manuscript_id } = uploadData;

        // Simulate upload to S3
        await uploadToS3('#', file, manuscript_id);

        // Create new manuscript entry
        const newManuscript = {
          id: manuscript_id,
          file_name: file.name,
          file_size: file.size,
          original_format: file.name.split('.').pop(),
          status: 'processing',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          conversion_time: null,
          error_message: null,
          output_formats: [],
        };

        // Add to manuscripts list
        setManuscripts((prev) => [newManuscript, ...prev]);

        // Simulate conversion completion after 3 seconds
        setTimeout(() => {
          setManuscripts((prev) =>
            prev.map((m) =>
              m.id === manuscript_id
                ? {
                    ...m,
                    status: 'completed',
                    conversion_time: 28,
                    output_formats: ['xml', 'pdf'],
                    updated_at: new Date().toISOString(),
                  }
                : m
            )
          );
        }, 3000);

        return newManuscript;
      } catch (error) {
        throw error;
      }
    },
    [getUploadUrl, uploadToS3]
  );

  const confirmUpload = useCallback(async (manuscriptId) => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return { message: 'Upload confirmed' };
  }, []);

  const getDownloadUrl = useCallback(async (manuscriptId, fileType) => {
    await new Promise(resolve => setTimeout(resolve, 200));

    // Return a mock download URL (blob URL would be generated on actual download)
    return {
      download_url: '#',
      file_name: `manuscript-${manuscriptId}.${fileType}`,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };
  }, []);

  const deleteManuscript = useCallback(
    async (manuscriptId) => {
      try {
        await new Promise(resolve => setTimeout(resolve, 200));
        setManuscripts((prev) => prev.filter((m) => m.id !== manuscriptId));
      } catch (error) {
        throw error;
      }
    },
    []
  );

  const getStatistics = useCallback(async () => {
    await new Promise(resolve => setTimeout(resolve, 200));

    // Calculate statistics from current manuscripts
    const stats = {
      total_manuscripts: manuscripts.length,
      completed: manuscripts.filter(m => m.status === 'completed').length,
      processing: manuscripts.filter(m => m.status === 'processing').length,
      failed: manuscripts.filter(m => m.status === 'failed').length,
      total_size: manuscripts.reduce((sum, m) => sum + m.file_size, 0),
      average_conversion_time: MOCK_STATISTICS.average_conversion_time,
      success_rate: MOCK_STATISTICS.success_rate,
    };

    return stats;
  }, [manuscripts]);

  return {
    manuscripts,
    loading,
    uploadProgress,
    getManuscripts,
    getUploadUrl,
    uploadToS3,
    uploadManuscript,
    confirmUpload,
    getDownloadUrl,
    deleteManuscript,
    getStatistics,
  };
};

export default useManuscripts;
