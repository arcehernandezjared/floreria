import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
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
  return `${symbol}${Number(amount).toLocaleString('es-CR')}`;
};

export const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const calcularMargen = (precio, costo) => {
  if (!precio || precio === 0) return 0;
  return parseFloat((((precio - costo) / precio) * 100).toFixed(1));
};
