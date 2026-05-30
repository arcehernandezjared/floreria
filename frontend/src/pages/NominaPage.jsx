import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign, Settings, RefreshCw, Users,
  CheckCircle, AlertTriangle, XCircle, TrendingUp,
  ShoppingCart, Receipt, Leaf, MessageSquare, Send, ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { formatMoney, formatDate } from '../utils/api';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

// ── Países (código de marcación + bandera) ────────────────────────────────────
const PAISES = [
  { code: '506', nombre: 'Costa Rica',        bandera: '🇨🇷' },
  { code: '502', nombre: 'Guatemala',          bandera: '🇬🇹' },
  { code: '503', nombre: 'El Salvador',        bandera: '🇸🇻' },
  { code: '504', nombre: 'Honduras',           bandera: '🇭🇳' },
  { code: '505', nombre: 'Nicaragua',          bandera: '🇳🇮' },
  { code: '507', nombre: 'Panamá',             bandera: '🇵🇦' },
  { code: '52',  nombre: 'México',             bandera: '🇲🇽' },
  { code: '57',  nombre: 'Colombia',           bandera: '🇨🇴' },
  { code: '58',  nombre: 'Venezuela',          bandera: '🇻🇪' },
  { code: '593', nombre: 'Ecuador',            bandera: '🇪🇨' },
  { code: '51',  nombre: 'Perú',               bandera: '🇵🇪' },
  { code: '56',  nombre: 'Chile',              bandera: '🇨🇱' },
  { code: '54',  nombre: 'Argentina',          bandera: '🇦🇷' },
  { code: '591', nombre: 'Bolivia',            bandera: '🇧🇴' },
  { code: '598', nombre: 'Uruguay',            bandera: '🇺🇾' },
  { code: '595', nombre: 'Paraguay',           bandera: '🇵🇾' },
  { code: '1809',nombre: 'Rep. Dominicana',    bandera: '🇩🇴' },
  { code: '34',  nombre: 'España',             bandera: '🇪🇸' },
  { code: '1',   nombre: 'EE.UU. / Canadá',   bandera: '🇺🇸' },
];

// Intenta detectar el código de país a partir de un número guardado
function parsearNumero(numero) {
  if (!numero) return { code: '506', local: '' };
  const n = String(numero).replace(/\D/g, '');
  // Probar del código más largo al más corto para evitar falsos positivos
  const sorted = [...PAISES].sort((a, b) => b.code.length - a.code.length);
  for (const p of sorted) {
    if (n.startsWith(p.code)) return { code: p.code, local: n.slice(p.code.length) };
  }
  return { code: '506', local: n };
}

// ── Período ────────────────────────────────────────────────────────────────────
const PRESETS = ['Quincena actual', 'Este mes', 'Mes anterior', 'Personalizado'];

function calcPeriod(idx, customDesde, customHasta) {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  const d = String(hoy.getDate()).padStart(2, '0');
  const hoyStr = `${y}-${m}-${d}`;

  if (idx === 0) {
    const inicio = hoy.getDate() <= 15 ? `${y}-${m}-01` : `${y}-${m}-16`;
    return { desde: inicio, hasta: hoyStr };
  }
  if (idx === 1) return { desde: `${y}-${m}-01`, hasta: hoyStr };
  if (idx === 2) {
    const prev = new Date(y, hoy.getMonth() - 1, 1);
    const py = prev.getFullYear();
    const pm = String(prev.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, hoy.getMonth(), 0).getDate();
    return { desde: `${py}-${pm}-01`, hasta: `${py}-${pm}-${String(lastDay).padStart(2, '0')}` };
  }
  return { desde: customDesde, hasta: customHasta };
}

// ── Indicadores de seguridad ────────────────────────────────────────────────────
const SAFETY = {
  seguro:     { label: 'Seguro para el negocio',  Icon: CheckCircle,   color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', desc: 'Los ingresos cubren todos los costos y hay margen saludable para nómina.' },
  precaucion: { label: 'Precaución',               Icon: AlertTriangle, color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30',  desc: 'El disponible para nómina es bajo. Revisá gastos e inversiones del período.' },
  riesgo:     { label: 'Riesgo financiero',         Icon: AlertTriangle, color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30',  desc: 'Menos del 5% de los ingresos disponibles. Reducí costos con urgencia.' },
  critico:    { label: 'Déficit — no alcanza',      Icon: XCircle,       color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     desc: 'Los egresos superan los ingresos. No hay fondos suficientes para nómina.' },
};

// ── Fila del waterfall ─────────────────────────────────────────────────────────
function WaterfallRow({ label, value, pct, color, icon: Icon, positive = false }) {
  if (!positive && value === 0) return null;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={13} className="text-gray-500" />}
          <span className="text-sm text-gray-400">{label}</span>
        </div>
        <span className={`text-sm font-semibold tabular-nums ${positive ? 'text-emerald-400' : 'text-gray-300'}`}>
          {positive ? '' : '− '}{formatMoney(value)}
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────
export default function NominaPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [presetIdx, setPresetIdx]       = useState(1);
  const [customDesde, setCustomDesde]   = useState('');
  const [customHasta, setCustomHasta]   = useState('');
  const [empleados, setEmpleados]       = useState(1);
  const [configEdit, setConfigEdit]     = useState(false);
  const [configForm, setConfigForm]     = useState({});

  const { desde, hasta } = useMemo(
    () => calcPeriod(presetIdx, customDesde, customHasta),
    [presetIdx, customDesde, customHasta]
  );
  const periodValid = !!desde && !!hasta;

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: calculo, isLoading: loadingCalc } = useQuery({
    queryKey: ['nomina-calculo', desde, hasta, empleados],
    queryFn: () => api.get(`/nomina/calculo-salarios?desde=${desde}&hasta=${hasta}&empleados=${empleados}`).then(r => r.data.data),
    enabled: periodValid,
  });

  const { data: config } = useQuery({
    queryKey: ['nomina-config'],
    queryFn: () => api.get('/nomina/config').then(r => r.data.data),
  });
  const { data: termometro } = useQuery({
    queryKey: ['termometro'],
    queryFn: () => api.get('/nomina/termometro').then(r => r.data.data),
    refetchInterval: 60000,
  });
  const { data: historial = [] } = useQuery({
    queryKey: ['nomina-historial'],
    queryFn: () => api.get('/nomina/historial').then(r => r.data.data),
  });
  // ── Mutations ─────────────────────────────────────────────────────────────────
  const resetMut = useMutation({
    mutationFn: () => api.post('/nomina/reset-periodo'),
    onSuccess: () => {
      qc.invalidateQueries(['termometro']);
      qc.invalidateQueries(['nomina-historial']);
      toast.success('Período cerrado correctamente');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error'),
  });

  const configMut = useMutation({
    mutationFn: (data) => api.put('/nomina/config', data),
    onSuccess: () => {
      qc.invalidateQueries(['nomina-config']);
      qc.invalidateQueries(['termometro']);
      toast.success('Configuración guardada');
      setConfigEdit(false);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error'),
  });

  const testAlertaMut = useMutation({
    mutationFn: () => api.post('/nomina/test-alerta'),
    onSuccess: (r) => toast.success(r.data.message || 'Mensaje enviado'),
    onError: (e) => toast.error(e.response?.data?.message || 'Error al enviar'),
  });

  const forzarAlertaMut = useMutation({
    mutationFn: () => api.post('/nomina/forzar-alerta'),
    onSuccess: (r) => toast.success(r.data.message || 'Revisión ejecutada'),
    onError: (e) => toast.error(e.response?.data?.message || 'Error'),
  });

  // ── Derivados ─────────────────────────────────────────────────────────────────
  const pct          = termometro?.porcentaje_avance || 0;
  const barColor     = pct >= 75 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
  const barColorCls  = pct >= 75 ? 'bg-brand-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  const baseIngresos = calculo?.ingresos || 1;
  const seg          = calculo ? (SAFETY[calculo.seguridad] || SAFETY.critico) : null;

  function pctBar(val) {
    return Math.min(100, Math.max(0, (Math.abs(val) / baseIngresos) * 100));
  }

  return (
    <div className="space-y-6 pb-8 animate-fade-in max-w-2xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Ahorro para Sueldos</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Cada vez que hacés el cierre del día, el {config?.porcentaje_provision}% de las ventas se guarda aquí automáticamente.
        </p>
      </div>

      {/* ── Termómetro principal ── */}
      <div className="card">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-sm text-gray-400 mb-1">Has ahorrado esta quincena</p>
            <p className={`text-4xl font-extrabold tabular-nums leading-none ${pct >= 75 ? 'text-brand-400' : pct >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
              {formatMoney(termometro?.acumulado_periodo)}
            </p>
            <p className="text-sm text-gray-500 mt-1">de {formatMoney(termometro?.meta)} de meta</p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-black tabular-nums ${pct >= 75 ? 'text-brand-400' : pct >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
              {pct.toFixed(0)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">completado</p>
          </div>
        </div>

        <div className="relative w-full h-5 bg-gray-800 rounded-full overflow-hidden mb-4">
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct)}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${barColor}99, ${barColor})` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-800/50 rounded-xl p-3">
            <p className="text-xl font-bold text-white tabular-nums">{termometro?.dias_restantes ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">Días restantes</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3">
            <p className="text-xl font-bold text-brand-400 tabular-nums">{formatMoney(termometro?.provision_diaria_promedio)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Necesitas ahorrar por día</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3">
            <p className="text-xl font-bold text-white tabular-nums">{formatMoney(termometro?.meta && termometro?.acumulado_periodo ? Math.max(0, termometro.meta - termometro.acumulado_periodo) : 0)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Falta para la meta</p>
          </div>
        </div>
      </div>

      {/* ── Cuánto le toca a cada empleada ── */}
      <div className="card">
        <h2 className="text-base font-bold text-white mb-4">¿Cuánto le toca a cada empleada?</h2>
        <div className="flex items-center gap-4 mb-4">
          <p className="text-sm text-gray-400 flex-1">Número de empleadas</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setEmpleados(e => Math.max(1, e - 1))}
              className="w-9 h-9 rounded-xl bg-gray-800 text-white hover:bg-gray-700 flex items-center justify-center text-xl font-bold transition-colors">
              −
            </button>
            <span className="w-8 text-center text-white font-bold text-xl">{empleados}</span>
            <button onClick={() => setEmpleados(e => e + 1)}
              className="w-9 h-9 rounded-xl bg-gray-800 text-white hover:bg-gray-700 flex items-center justify-center text-xl font-bold transition-colors">
              +
            </button>
          </div>
        </div>
        <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Sueldo disponible por persona</p>
          <motion.p
            key={`${termometro?.acumulado_periodo}-${empleados}`}
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-4xl font-extrabold text-brand-400 tabular-nums">
            {formatMoney(termometro?.acumulado_periodo ? termometro.acumulado_periodo / empleados : 0)}
          </motion.p>
          <p className="text-xs text-gray-500 mt-1">
            {formatMoney(termometro?.acumulado_periodo)} ÷ {empleados} persona{empleados !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ── Acciones ── */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => navigate('/cierre')} className="btn-primary justify-center py-3">
          <ExternalLink size={15} /> Ir a Cierre del Día
        </button>
        <button
          onClick={() => { if (confirm('¿Cerrar el período actual? Esta acción no se puede deshacer.')) resetMut.mutate(); }}
          className="btn-secondary justify-center py-3">
          <RefreshCw size={15} /> Cerrar Período
        </button>
      </div>

      {/* ── Configuración ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white">Configuración</h2>
          <button
            onClick={() => {
              if (!configEdit) {
                const { code, local } = parsearNumero(config?.numero_alertas);
                setConfigForm({ ...(config || {}), _paisCode: code, _localNum: local });
              }
              setConfigEdit(v => !v);
            }}
            className="text-sm text-brand-400 hover:text-brand-300">
            {configEdit ? 'Cancelar' : 'Editar'}
          </button>
        </div>

        {configEdit ? (
          <div className="space-y-3">
            <div>
              <label className="label">¿Qué % de las ventas se aparta para sueldos?</label>
              <input className="input" type="number" step="0.5" min="1" max="50"
                value={configForm.porcentaje_provision || ''}
                onChange={e => setConfigForm(p => ({ ...p, porcentaje_provision: e.target.value }))} />
              <p className="text-xs text-gray-500 mt-1">
                Ej: si ponés 15%, de cada ₡100 que vendés, ₡15 van al fondo de sueldos.
              </p>
            </div>
            <div>
              <label className="label">¿Cuánto necesitás juntar por quincena?</label>
              <input className="input" type="number" step="1000"
                value={configForm.meta_quincena || ''}
                onChange={e => setConfigForm(p => ({ ...p, meta_quincena: e.target.value }))} />
            </div>
            <div>
              <label className="label">Número de WhatsApp para alertas (opcional)</label>
              <div className="flex gap-2">
                <select className="input text-sm flex-shrink-0 w-auto"
                  value={configForm._paisCode || '506'}
                  onChange={e => setConfigForm(p => ({ ...p, _paisCode: e.target.value }))}>
                  {PAISES.map(p => <option key={p.code} value={p.code}>{p.bandera} +{p.code}</option>)}
                </select>
                <input className="input flex-1" type="tel" placeholder="Número"
                  value={configForm._localNum || ''}
                  onChange={e => setConfigForm(p => ({ ...p, _localNum: e.target.value.replace(/\D/g, '') }))} />
              </div>
            </div>
            <button
              onClick={() => {
                const { _paisCode, _localNum, ...rest } = configForm;
                const numero = _localNum ? `${_paisCode || '506'}${_localNum}` : null;
                configMut.mutate({ ...rest, numero_alertas: numero });
              }}
              className="btn-primary w-full justify-center">
              Guardar cambios
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-800">
              <span className="text-sm text-gray-400">% que se aparta de cada venta</span>
              <span className="text-white font-bold text-lg">{config?.porcentaje_provision}%</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-800">
              <span className="text-sm text-gray-400">Meta por quincena</span>
              <span className="text-white font-semibold tabular-nums">{formatMoney(config?.meta_quincena)}</span>
            </div>
            {config?.numero_alertas && (
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-400">Alertas WhatsApp</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white font-mono">
                    {(() => { const { code, local } = parsearNumero(config.numero_alertas); const pais = PAISES.find(p => p.code === code); return `${pais?.bandera ?? ''} +${code} ${local}`; })()}
                  </span>
                  <button onClick={() => testAlertaMut.mutate()} disabled={testAlertaMut.isPending}
                    className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1">
                    <Send size={11} /> {testAlertaMut.isPending ? '...' : 'Probar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Historial de la quincena ── */}
      <div className="card">
        <h2 className="text-base font-bold text-white mb-4">Lo que se ha guardado esta quincena</h2>
        {historial.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-4">Aún no hay registros en este período</p>
        ) : (
          <div className="space-y-2">
            {historial.map(h => (
              <div key={h.id} className="flex justify-between items-center py-2 border-b border-gray-800/50 last:border-0">
                <div>
                  <p className="text-sm text-white">{formatDate(h.fecha)}</p>
                  <p className="text-xs text-gray-500">Ventas del día: {formatMoney(h.ingresos_dia)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-brand-400 tabular-nums">+ {formatMoney(h.provision_dia)}</p>
                  <p className="text-xs text-gray-500">Acum: {formatMoney(h.acumulado_periodo)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
