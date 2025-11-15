// Static mock API - No backend connection
// All API calls are simulated with mock data

const mockDelay = () => new Promise(resolve => setTimeout(resolve, 300));

const api = {
  get: async (url) => {
    await mockDelay();
    return { data: { data: null } };
  },
  post: async (url, data) => {
    await mockDelay();
    return { data: { data: null } };
  },
  put: async (url, data) => {
    await mockDelay();
    return { data: { data: null } };
  },
  delete: async (url) => {
    await mockDelay();
    return { data: { data: null } };
  },
};

export default api;
