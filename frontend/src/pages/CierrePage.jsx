import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, DollarSign, ShoppingBag, Trash2, Receipt, CheckCircle, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import api, { formatMoney } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import useAuthStore from '../store/authStore';

function KpiCierre({ label, valor, color = 'text-white', sub }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-4 text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-extrabold tabular-nums ${color}`}>{valor}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

const normFechaGlobal = (f) => {
  if (!f) return '';
  if (f instanceof Date) return f.toISOString().split('T')[0];
  const s = String(f);
  if (s.includes('T')) return s.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return new Date(s).toISOString().split('T')[0];
};

function FilaCierre({ c }) {
  const [open, setOpen] = useState(false);
  const fechaStr = normFechaGlobal(c.fecha);
  const fecha = new Date(fechaStr + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const util = parseFloat(c.utilidad);

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-800/30 transition-colors text-left">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white capitalize">{fecha}</p>
          <p className="text-xs text-gray-500 mt-0.5">{c.ventas_count} ventas · por {c.usuario_nombre || '—'}</p>
        </div>
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-gray-500">Ingresos</p>
            <p className="text-sm font-bold text-white tabular-nums">{formatMoney(c.ventas_total)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Rentabilidad</p>
            <p className={`text-sm font-bold tabular-nums ${util >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatMoney(c.utilidad)}
            </p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-xs text-gray-500">Efectivo</p>
            <p className="text-sm font-semibold text-white tabular-nums">{formatMoney(c.efectivo_caja)}</p>
          </div>
          {open ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-5 pb-4 pt-1 border-t border-gray-800/60 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Ventas</p>
                  <p className="text-sm font-bold text-emerald-400">{formatMoney(c.ventas_total)}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Nómina</p>
                  <p className="text-sm font-bold text-blue-400">{formatMoney(c.costos_total)}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Gastos</p>
                  <p className="text-sm font-bold text-red-400">{formatMoney(c.gastos_total)}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Mermas</p>
                  <p className="text-sm font-bold text-orange-400">{formatMoney(c.mermas_total)}</p>
                </div>
              </div>
              {c.notas && (
                <div className="bg-gray-900/30 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-500 mb-0.5">Notas</p>
                  <p className="text-sm text-gray-300">{c.notas}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CierrePage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [notasCierre, setNotasCierre] = useState('');
  const [efectivo, setEfectivo] = useState('');
  const [filtroMes, setFiltroMes]   = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  const crHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

  const { data: cierres = [] } = useQuery({
    queryKey: ['cierres'],
    queryFn: () => api.get('/cierres').then(r => r.data.data),
  });

  const { data: summaryHoy } = useQuery({
    queryKey: ['cierre-summary', crHoy],
    queryFn: () => api.get(`/cierres/summary/${crHoy}`).then(r => r.data.data),
    refetchInterval: 30000,
  });

  const cierreMut = useMutation({
    mutationFn: (data) => api.post('/cierres', data),
    onSuccess: () => {
      qc.invalidateQueries(['cierres']);
      qc.invalidateQueries(['cierre-check']);
      qc.invalidateQueries(['cierre-summary']);
      qc.invalidateQueries(['termometro']);
      qc.invalidateQueries(['nomina-historial']);
      qc.invalidateQueries(['dashboard']);
      toast.success('Cierre del día registrado');
      setNotasCierre('');
      setEfectivo('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al registrar cierre'),
  });

  const cierreHoyExiste = cierres.some(c => c.fecha?.split('T')[0] === crHoy || c.fecha === crHoy);

  // Extrae "YYYY-MM" de cualquier formato que devuelva MySQL
  const getMesKey = (f) => {
    if (!f) return '';
    const s = f instanceof Date
      ? `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`
      : String(f).substring(0, 7); // "2026-05-28" → "2026-05"
    return s;
  };

  // Meses disponibles en los datos (para el selector)
  const mesesDisponibles = useMemo(() => {
    const set = new Set(cierres.map(c => getMesKey(c.fecha)).filter(Boolean));
    return Array.from(set).sort().reverse();
  }, [cierres]);

  // Filtrado por mes o por rango de fechas
  const cierresFiltrados = useMemo(() => {
    return cierres.filter(c => {
      const fecha = normFechaGlobal(c.fecha); // "YYYY-MM-DD"
      if (filtroMes   && getMesKey(c.fecha) !== filtroMes) return false;
      if (filtroDesde && fecha < filtroDesde) return false;
      if (filtroHasta && fecha > filtroHasta) return false;
      return true;
    });
  }, [cierres, filtroMes, filtroDesde, filtroHasta]);

  const limpiar = () => { setFiltroMes(''); setFiltroDesde(''); setFiltroHasta(''); };
  const hayFiltros = !!(filtroMes || filtroDesde || filtroHasta);

  // KPIs del rango filtrado
  const totalUtilidad = cierresFiltrados.reduce((s, c) => s + parseFloat(c.utilidad || 0), 0);
  const totalVentas   = cierresFiltrados.reduce((s, c) => s + parseFloat(c.ventas_total || 0), 0);
  const mejorDia      = cierresFiltrados.reduce((best, c) => parseFloat(c.utilidad) > parseFloat(best?.utilidad || -Infinity) ? c : best, null);
  const promDiario    = cierresFiltrados.length > 0 ? totalUtilidad / cierresFiltrados.length : 0;

  const s = summaryHoy;
  const utilHoy = s ? parseFloat(s.utilidad) : 0;

  return (
    <div className="space-y-6 pb-8 animate-fade-in">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Cierre del Día</h1>
        <p className="text-gray-500 text-sm mt-0.5">Control diario del negocio</p>
      </div>

      {/* KPIs del rango seleccionado */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCierre
          label={hayFiltros ? 'Rentabilidad del período' : 'Rentabilidad acumulada'}
          valor={formatMoney(totalUtilidad)}
          color={totalUtilidad >= 0 ? 'text-emerald-400' : 'text-red-400'}
          sub={`${cierresFiltrados.length} días cerrados`}
        />
        <KpiCierre
          label={hayFiltros ? 'Vendido en el período' : 'Total vendido (histórico)'}
          valor={formatMoney(totalVentas)}
          color="text-white"
        />
        <KpiCierre
          label="Promedio rentabilidad / día"
          valor={formatMoney(promDiario)}
          color={promDiario >= 0 ? 'text-blue-400' : 'text-red-400'}
        />
        <KpiCierre
          label="Mejor día"
          valor={mejorDia ? formatMoney(mejorDia.utilidad) : '—'}
          color="text-yellow-400"
          sub={mejorDia ? new Date(normFechaGlobal(mejorDia.fecha) + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
        />
      </div>

      {/* Cierre de hoy */}
      <div className="card">
        <div className="flex items-center gap-3 mb-5">
          {cierreHoyExiste
            ? <CheckCircle size={20} className="text-emerald-400" />
            : <div className="w-5 h-5 rounded-full border-2 border-yellow-500 flex-shrink-0" />
          }
          <div>
            <h2 className="text-base font-bold text-white">
              {cierreHoyExiste ? 'Cierre de hoy registrado' : 'Cierre de hoy pendiente'}
            </h2>
            <p className="text-xs text-gray-500 capitalize">
              {new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Costa_Rica' })}
            </p>
          </div>
        </div>

        {/* Resumen del día */}
        {s && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">Ventas</p>
              <p className="text-lg font-extrabold text-emerald-400 tabular-nums">{s.ventas_count}</p>
              <p className="text-xs text-gray-500">{formatMoney(s.ventas_total)}</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">Gastos</p>
              <p className="text-lg font-extrabold text-red-400 tabular-nums">{formatMoney(s.gastos_total)}</p>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-400">Mermas</p>
              <p className="text-lg font-extrabold text-orange-400 tabular-nums">{formatMoney(s.mermas_total)}</p>
            </div>
            <div className={`border rounded-xl p-3 text-center ${utilHoy >= 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <p className="text-xs text-gray-400">Rentabilidad</p>
              <p className={`text-lg font-extrabold tabular-nums ${utilHoy >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{formatMoney(utilHoy)}</p>
              <p className="text-xs text-gray-600 mt-0.5">sin nómina</p>
            </div>
          </div>
        )}

        {/* Formulario de cierre — siempre visible */}
        <div className="space-y-3 border-t border-gray-800 pt-4">

          {cierreHoyExiste && (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5 mb-1">
              <CheckCircle size={15} className="text-emerald-400 flex-shrink-0" />
              <p className="text-sm text-emerald-300">Cierre registrado. Si vendiste más después, podés actualizarlo.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Efectivo en caja (₡)</label>
              <input type="number" min="0" step="500" className="input"
                placeholder="¿Cuánto hay en caja?"
                value={efectivo} onChange={e => setEfectivo(e.target.value)} />
            </div>
            <div>
              <label className="label">Diferencia con ventas</label>
              <div className={`input font-bold tabular-nums ${
                efectivo && s
                  ? parseFloat(efectivo) >= parseFloat(s.ventas_total) ? 'text-emerald-400' : 'text-red-400'
                  : 'text-gray-500'
              }`}>
                {efectivo && s
                  ? formatMoney(parseFloat(efectivo) - parseFloat(s.ventas_total))
                  : '—'}
              </div>
            </div>
          </div>
          <div>
            <label className="label">Notas del cierre (opcional)</label>
            <textarea className="input resize-none" rows={2}
              placeholder="Observaciones del día, incidentes, notas..."
              value={notasCierre} onChange={e => setNotasCierre(e.target.value)} />
          </div>
          <button
            onClick={() => cierreMut.mutate({
              fecha: crHoy,
              efectivo_caja: parseFloat(efectivo) || 0,
              notas: notasCierre,
              usuario_nombre: user?.nombre || ''
            })}
            disabled={cierreMut.isPending}
            className="btn-primary w-full justify-center py-3">
            <CheckCircle size={16} />
            {cierreMut.isPending
              ? 'Guardando...'
              : cierreHoyExiste
              ? 'Actualizar cierre del día'
              : 'Registrar cierre del día'}
          </button>
        </div>
      </div>

      {/* Historial con filtros */}
      {cierres.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <h2 className="text-base font-bold text-white w-full sm:w-auto sm:mr-auto">Historial de cierres</h2>

            {/* Por mes */}
            <div>
              <label className="label text-xs mb-1 block">Por mes</label>
              <select
                className="input text-sm py-2 w-44"
                value={filtroMes}
                onChange={e => { setFiltroMes(e.target.value); setFiltroDesde(''); setFiltroHasta(''); }}
              >
                <option value="">Todos los meses</option>
                {mesesDisponibles.map(mes => {
                  const [y, m] = mes.split('-');
                  const label = new Date(parseInt(y), parseInt(m) - 1, 1)
                    .toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });
                  return <option key={mes} value={mes}>{label}</option>;
                })}
              </select>
            </div>

            {/* Por rango */}
            <div>
              <label className="label text-xs mb-1 block">Desde</label>
              <input type="date" className="input text-sm py-2 w-36"
                value={filtroDesde}
                onChange={e => { setFiltroDesde(e.target.value); setFiltroMes(''); }} />
            </div>
            <div>
              <label className="label text-xs mb-1 block">Hasta</label>
              <input type="date" className="input text-sm py-2 w-36"
                value={filtroHasta}
                onChange={e => { setFiltroHasta(e.target.value); setFiltroMes(''); }} />
            </div>

            {hayFiltros && (
              <button onClick={limpiar}
                className="btn-secondary text-xs py-2 px-3 flex items-center gap-1">
                <X size={13} /> Limpiar
              </button>
            )}
          </div>

          {/* Resumen del mes filtrado */}
          {hayFiltros && cierresFiltrados.length > 0 && (
            <div className="bg-gray-800/40 border border-gray-700 rounded-xl px-5 py-3 flex flex-wrap gap-6 text-sm">
              <div><span className="text-gray-500">Días cerrados: </span><span className="text-white font-semibold">{cierresFiltrados.length}</span></div>
              <div><span className="text-gray-500">Ventas: </span><span className="text-emerald-400 font-semibold">{formatMoney(totalVentas)}</span></div>
              <div><span className="text-gray-500">Rentabilidad: </span><span className={`font-semibold ${totalUtilidad >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{formatMoney(totalUtilidad)}</span></div>
              <div><span className="text-gray-500">Gastos: </span><span className="text-red-400 font-semibold">{formatMoney(cierresFiltrados.reduce((s, c) => s + parseFloat(c.gastos_total || 0), 0))}</span></div>
              <div><span className="text-gray-500">Mermas: </span><span className="text-orange-400 font-semibold">{formatMoney(cierresFiltrados.reduce((s, c) => s + parseFloat(c.mermas_total || 0), 0))}</span></div>
            </div>
          )}

          {cierresFiltrados.length === 0 ? (
            <div className="text-center py-10 text-gray-600">
              No hay cierres registrados en ese período
            </div>
          ) : (
            cierresFiltrados.map(c => <FilaCierre key={c.id} c={c} />)
          )}
        </div>
      )}

      {cierres.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          Aún no hay cierres registrados
        </div>
      )}
    </div>
  );
}
