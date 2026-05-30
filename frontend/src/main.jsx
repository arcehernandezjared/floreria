import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <Toaster position="top-right" toastOptions={{
      style: { background: '#064e3b', color: '#fff', border: '1px solid #10b981' },
      success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
      error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } }
    }} />
  </QueryClientProvider>
);
