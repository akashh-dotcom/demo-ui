// Environment configuration - Static app (no backend)
const environment = {
  production: import.meta.env.PROD,
  apiUrl: '', // No backend connection
  isStatic: true, // Static app flag
};

export default environment;
