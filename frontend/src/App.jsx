import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InsumosPage from './pages/InsumosPage';
import CatalogPage from './pages/CatalogPage';
import MermasPage from './pages/MermasPage';
import ProveedoresPage from './pages/ProveedoresPage';
import GastosPage from './pages/GastosPage';
import NominaPage from './pages/NominaPage';
import ComprasPage from './pages/ComprasPage';
import PuntoVentaPage from './pages/PuntoVentaPage';
import RegistroVentasPage from './pages/RegistroVentasPage';
import WhatsAppPage from './pages/WhatsAppPage';
import ReportesPage from './pages/ReportesPage';
import CotizacionesPage from './pages/CotizacionesPage';
import PedidosPage from './pages/PedidosPage';
import CajaPage from './pages/CajaPage';

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { isAuthenticated, fetchProfile } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) fetchProfile();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="insumos" element={<InsumosPage />} />
          <Route path="catalogo" element={<CatalogPage />} />
          <Route path="mermas" element={<MermasPage />} />
          <Route path="proveedores" element={<ProveedoresPage />} />
          <Route path="gastos" element={<GastosPage />} />
          <Route path="nomina" element={<NominaPage />} />
          <Route path="compras" element={<ComprasPage />} />
          <Route path="punto-venta" element={<PuntoVentaPage />} />
          <Route path="registro-ventas" element={<RegistroVentasPage />} />
          <Route path="whatsapp" element={<WhatsAppPage />} />
          <Route path="reportes" element={<ReportesPage />} />
          <Route path="cotizaciones" element={<CotizacionesPage />} />
          <Route path="pedidos" element={<PedidosPage />} />
          <Route path="caja" element={<CajaPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
