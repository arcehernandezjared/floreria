import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3002/api',
  headers: { 'Content-Type': 'application/json' }
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('floreria_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('floreria_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

export const formatMoney = (amount, symbol = '₡') => {
  if (!amount && amount !== 0) return `${symbol}0`;
  return `${symbol}${Number(amount).toLocaleString('es-CR', { maximumFractionDigits: 0 })}`;
};

export const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Costa_Rica' });
};

// Fecha de "hoy" en zona horaria de Costa Rica, formato YYYY-MM-DD.
// NUNCA usar new Date().toISOString() para esto — toISOString() es siempre UTC
// y después de las 6pm hora CR ya muestra el día siguiente.
export const hoyCR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

export const calcularMargen = (precio, costo) => {
  if (!precio || precio === 0) return 0;
  return parseFloat((((precio - costo) / precio) * 100).toFixed(1));
};
