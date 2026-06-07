import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard, Package, ShoppingBag, Trash2, Truck,
  Receipt, DollarSign, ShoppingCart, Menu, X, Bell, Flower2, LogOut,
  CreditCard, MessageSquare, BarChart2, ClipboardList, FileText,
  AlertTriangle, Calendar, TrendingDown, CheckCircle, Lock
} from 'lucide-react';
import useAuthStore from '../store/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import api, { formatMoney } from '../utils/api';

const NAV_ITEMS = [
  { path: '/dashboard',        icon: LayoutDashboard, label: 'Inicio' },
  { path: '/punto-venta',      icon: CreditCard,      label: 'Hacer una Venta', highlight: true },
  { path: '/registro-ventas',  icon: ClipboardList,   label: 'Mis Ventas' },
  { path: '/insumos',          icon: Package,         label: 'Inventario' },
  { path: '/catalogo',         icon: ShoppingBag,     label: 'Mis Arreglos' },
  { path: '/mermas',           icon: Trash2,          label: 'Pérdidas' },
  { path: '/proveedores',      icon: Truck,           label: 'Proveedores' },
  { path: '/gastos',           icon: Receipt,         label: 'Mis Gastos' },
  { path: '/nomina',           icon: DollarSign,      label: 'Ahorro Sueldos' },
  { path: '/compras',          icon: ShoppingCart,    label: 'Compras' },
  { path: '/pedidos',          icon: ClipboardList,   label: 'Pedidos', highlight: false },
  { path: '/cotizaciones',     icon: FileText,        label: 'Presupuestos' },
  { path: '/whatsapp',         icon: MessageSquare,   label: 'WhatsApp' },
  { path: '/reportes',         icon: BarChart2,       label: 'Reportes' },
  { path: '/cierre',           icon: CheckCircle,     label: 'Cierre del Día' },
];

const NOTIF_ICONS = {
  Calendar:      Calendar,
  ShoppingBag:   ShoppingBag,
  Package:       Package,
  AlertTriangle: AlertTriangle,
  ShoppingCart:  ShoppingCart,
  TrendingDown:  TrendingDown,
};

const NOTIF_STYLES = {
  danger:  { iconBg: 'bg-red-500/15',     iconColor: 'text-red-400',     titleColor: 'text-red-300',     dot: 'bg-red-500' },
  warning: { iconBg: 'bg-yellow-500/15',  iconColor: 'text-yellow-400',  titleColor: 'text-yellow-300',  dot: 'bg-yellow-500' },
  info:    { iconBg: 'bg-sky-500/15',     iconColor: 'text-sky-400',     titleColor: 'text-sky-300',     dot: 'bg-sky-500' },
  success: { iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-400', titleColor: 'text-emerald-300', dot: 'bg-emerald-500' },
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNotif, setShowNotif]     = useState(false);
  const [dismissed, setDismissed]     = useState(new Set());
  const [efectivoCierre, setEfectivoCierre] = useState('');
  const [notasCierre, setNotasCierre]       = useState('');
  const { user, logout }              = useAuthStore();
  const navigate                      = useNavigate();
  const notifRef                      = useRef(null);
  const qc                            = useQueryClient();

  const { data: notificaciones = [] } = useQuery({
    queryKey: ['notificaciones'],
    queryFn: () => api.get('/notificaciones').then(r => r.data.data),
    refetchInterval: 60_000,
    retry: false,
  });

  // ── Verificar cierre pendiente ─────────────────────────────────────────
  const { data: checkCierre } = useQuery({
    queryKey: ['cierre-check'],
    queryFn: () => api.get('/cierres/check').then(r => r.data.data),
    refetchInterval: 5 * 60_000,
    retry: false,
  });

  const { data: summaryPendiente } = useQuery({
    queryKey: ['cierre-summary', checkCierre?.fecha],
    queryFn: () => api.get(`/cierres/summary/${checkCierre.fecha}`).then(r => r.data.data),
    enabled: !!checkCierre?.pendiente && !!checkCierre?.fecha,
  });

  const cierreMut = useMutation({
    mutationFn: (data) => api.post('/cierres', data),
    onSuccess: () => {
      qc.invalidateQueries(['cierre-check']);
      qc.invalidateQueries(['cierres']);
      qc.invalidateQueries(['termometro']);
      qc.invalidateQueries(['nomina-historial']);
      qc.invalidateQueries(['dashboard']);
      setEfectivoCierre('');
      setNotasCierre('');
    },
    onError: (e) => alert(e.response?.data?.message || 'Error al registrar cierre'),
  });

  const hayBloqueo = checkCierre?.pendiente === true;

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handler(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotif(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  const visibles  = notificaciones.filter(n => !dismissed.has(n.id));
  const hasDanger = visibles.some(n => n.tipo === 'danger');
  const count     = visibles.length;

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <aside className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col overflow-hidden">
          {/* Logo */}
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center">
                <Flower2 size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-white text-base leading-none">Alma Caribeña</h1>
                <p className="text-xs text-gray-500 mt-0.5">Floristería</p>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map(({ path, icon: Icon, label, highlight }) => (
              <NavLink key={path} to={path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                      : highlight
                      ? 'text-white bg-brand-600/10 border border-brand-600/20 hover:bg-brand-600/20'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>

          {/* User */}
          <div className="p-4 border-t border-gray-800">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-emerald-600 flex items-center justify-center text-xs font-bold text-white">
                {user?.nombre?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.nombre}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.rol}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="w-full btn-secondary text-sm justify-center">
              <LogOut size={15} /> Cerrar sesión
            </button>
          </div>
        </aside>
      )}

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 flex-shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white transition-colors">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Sección derecha: campana + separador + fecha — el relative engloba todo para anclar el dropdown */}
          <div className="relative flex items-center gap-3" ref={notifRef}>

            {/* ── Campana ─────────────────────────────────────────────────── */}
            <button
              onClick={() => setShowNotif(v => !v)}
              className={`relative p-2 rounded-lg transition-colors ${
                count > 0
                  ? hasDanger
                    ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
                    : 'text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}>

              {count > 0 ? (
                <motion.div
                  animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 4 }}>
                  <Bell size={18} />
                </motion.div>
              ) : (
                <Bell size={18} />
              )}

              {count > 0 && (
                <motion.span
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-lg">
                  {count > 9 ? '9+' : count}
                </motion.span>
              )}
            </button>

            <div className="h-4 w-px bg-gray-700" />
            <div className="text-xs text-gray-500">
              {new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>

            {/* ── Dropdown — anclado al borde derecho de toda la sección ── */}
            <AnimatePresence>
              {showNotif && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="fixed right-6 top-14 w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl shadow-black/40 z-[9999] overflow-hidden">

                  {/* Cabecera */}
                  <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Notificaciones</h3>
                    {count > 0 ? (
                      <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full font-medium">
                        {count} activa{count !== 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">al día</span>
                    )}
                  </div>

                  {/* Lista */}
                  <div className="max-h-[400px] overflow-y-auto">
                    {visibles.length === 0 ? (
                      <div className="py-10 px-4 text-center">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                          <CheckCircle size={22} className="text-emerald-400" />
                        </div>
                        <p className="text-sm text-white font-medium">Todo al día</p>
                        <p className="text-xs text-gray-500 mt-1">No hay alertas pendientes</p>
                      </div>
                    ) : (
                      visibles.map((n, idx) => {
                        const Icon  = NOTIF_ICONS[n.icono];
                        const style = NOTIF_STYLES[n.tipo] || NOTIF_STYLES.info;
                        return (
                          <button key={n.id}
                            onClick={() => {
                              setDismissed(prev => new Set([...prev, n.id]));
                              navigate(n.accion);
                              setShowNotif(false);
                            }}
                            className={`w-full text-left px-4 py-3.5 hover:bg-gray-800/70 transition-colors flex gap-3 items-start ${
                              idx < visibles.length - 1 ? 'border-b border-gray-800/60' : ''
                            }`}>
                            <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg ${style.iconBg} flex items-center justify-center`}>
                              {Icon ? <Icon size={15} className={style.iconColor} /> : <Bell size={15} className={style.iconColor} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold leading-snug ${style.titleColor}`}>{n.titulo}</p>
                              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.mensaje}</p>
                            </div>
                            <span className={`mt-1.5 flex-shrink-0 w-2 h-2 rounded-full ${style.dot}`} />
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Pie */}
                  <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-900/50">
                    <p className="text-xs text-gray-600 text-center">
                      {count === 0 ? 'Se actualiza cada 60 s' : 'Clic para ir al módulo · se descuenta del conteo'}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* Content */}
        <main className={`flex-1 overflow-y-auto p-6${sidebarOpen ? ' sidebar-open' : ''}`}>
          <Outlet />
        </main>
      </div>

      {/* ── Modal de bloqueo: cierre pendiente ────────────────────────────── */}
      <AnimatePresence>
        {hayBloqueo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[9999] bg-gray-950/95 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="w-full max-w-lg">

              {/* Cabecera */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-yellow-500/15 border-2 border-yellow-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Lock size={28} className="text-yellow-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">Cierre pendiente</h2>
                <p className="text-gray-400 text-sm mt-2">
                  Debes registrar el cierre del{' '}
                  <span className="text-yellow-400 font-semibold capitalize">
                    {checkCierre?.fecha
                      ? new Date(checkCierre.fecha + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })
                      : ''}
                  </span>{' '}
                  antes de continuar.
                </p>
              </div>

              {/* Resumen del día pendiente */}
              {summaryPendiente && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Ventas', valor: summaryPendiente.ventas_count, sub: formatMoney(summaryPendiente.ventas_total), color: 'text-emerald-400' },
                    { label: 'Gastos', valor: formatMoney(summaryPendiente.gastos_total), color: 'text-red-400' },
                    { label: 'Mermas', valor: formatMoney(summaryPendiente.mermas_total), color: 'text-orange-400' },
                    { label: 'Utilidad', valor: formatMoney(summaryPendiente.utilidad), color: parseFloat(summaryPendiente.utilidad) >= 0 ? 'text-blue-400' : 'text-red-400' },
                  ].map(({ label, valor, sub, color }) => (
                    <div key={label} className="bg-gray-800/80 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 mb-1">{label}</p>
                      <p className={`text-base font-bold tabular-nums ${color}`}>{valor}</p>
                      {sub && <p className="text-xs text-gray-600">{sub}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Formulario */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Efectivo en caja (₡)</label>
                    <input type="number" min="0" step="500"
                      className="input text-sm"
                      placeholder="¿Cuánto hay en caja?"
                      value={efectivoCierre}
                      onChange={e => setEfectivoCierre(e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">Diferencia</label>
                    <div className={`input text-sm font-bold tabular-nums ${
                      efectivoCierre && summaryPendiente
                        ? parseFloat(efectivoCierre) >= parseFloat(summaryPendiente.ventas_total) ? 'text-emerald-400' : 'text-red-400'
                        : 'text-gray-600'
                    }`}>
                      {efectivoCierre && summaryPendiente
                        ? formatMoney(parseFloat(efectivoCierre) - parseFloat(summaryPendiente.ventas_total))
                        : '—'}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Notas (opcional)</label>
                  <textarea className="input resize-none text-sm" rows={2}
                    placeholder="Observaciones del día..."
                    value={notasCierre}
                    onChange={e => setNotasCierre(e.target.value)} />
                </div>
                <button
                  onClick={() => cierreMut.mutate({
                    fecha: checkCierre.fecha,
                    efectivo_caja: parseFloat(efectivoCierre) || 0,
                    notas: notasCierre,
                    usuario_nombre: user?.nombre || ''
                  })}
                  disabled={cierreMut.isPending}
                  className="btn-primary w-full justify-center py-3 text-sm">
                  <CheckCircle size={16} />
                  {cierreMut.isPending ? 'Guardando...' : 'Registrar cierre y continuar'}
                </button>
                <p className="text-xs text-gray-600 text-center mt-2">
                  El cierre recalcula automáticamente todas las ventas y gastos del día.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
