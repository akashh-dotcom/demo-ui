// Environment configuration
const environment = {
  production: import.meta.env.PROD,
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000/xmlconverter',
};

export default environment;
