import { useState, useCallback } from 'react';
import api from '../utils/api';

export const useManuscripts = () => {
  const [manuscripts, setManuscripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});

  const getManuscripts = useCallback(async (params = {}) => {
    try {
      setLoading(true);
      const response = await api.get('/manuscripts/', { params });
      const data = response.data.data || response.data;
      setManuscripts(Array.isArray(data) ? data : data.manuscripts || []);
      return data;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const getUploadUrl = useCallback(async (fileName, fileSize, contentType) => {
    try {
      const response = await api.post('/manuscripts/upload-url', {
        file_name: fileName,
        file_size: fileSize,
        content_type: contentType,
      });
      return response.data.data;
    } catch (error) {
      throw error;
    }
  }, []);

  const uploadToS3 = useCallback((url, file, manuscriptId) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress((prev) => ({
            ...prev,
            [manuscriptId]: {
              progress: percentComplete,
              loaded: event.loaded,
              total: event.total,
            },
          }));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgress((prev) => ({
            ...prev,
            [manuscriptId]: { progress: 100, loaded: file.size, total: file.size },
          }));
          resolve(xhr.response);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  }, []);

  const uploadManuscript = useCallback(
    async (file) => {
      try {
        // Get upload URL
        const uploadData = await getUploadUrl(file.name, file.size, file.type);
        const { upload_url, manuscript_id } = uploadData;

        // Upload to S3
        await uploadToS3(upload_url, file, manuscript_id);

        // Confirm upload
        const response = await api.post(`/manuscripts/${manuscript_id}/confirm-upload`);

        // Refresh manuscripts list
        await getManuscripts();

        return response.data.data;
      } catch (error) {
        throw error;
      }
    },
    [getUploadUrl, uploadToS3, getManuscripts]
  );

  const confirmUpload = useCallback(async (manuscriptId) => {
    try {
      const response = await api.post(`/manuscripts/${manuscriptId}/confirm-upload`);
      return response.data.data;
    } catch (error) {
      throw error;
    }
  }, []);

  const getDownloadUrl = useCallback(async (manuscriptId, fileType) => {
    try {
      const response = await api.get(`/manuscripts/${manuscriptId}/download-url`, {
        params: { file_type: fileType },
      });
      return response.data.data;
    } catch (error) {
      throw error;
    }
  }, []);

  const deleteManuscript = useCallback(
    async (manuscriptId) => {
      try {
        await api.delete(`/manuscripts/${manuscriptId}`);
        await getManuscripts();
      } catch (error) {
        throw error;
      }
    },
    [getManuscripts]
  );

  const getStatistics = useCallback(async () => {
    try {
      const response = await api.get('/manuscripts/statistics');
      return response.data.data;
    } catch (error) {
      throw error;
    }
  }, []);

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
