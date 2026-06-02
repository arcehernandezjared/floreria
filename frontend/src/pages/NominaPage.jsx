import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Settings, TrendingUp, Calendar, Edit, Check, X } from 'lucide-react';
import api, { formatMoney } from '../utils/api';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function NominaPage() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({});

  const { data: config } = useQuery({
    queryKey: ['nomina-config'],
    queryFn: () => api.get('/nomina/config').then(r => r.data.data),
  });

  const { data: resumen } = useQuery({
    queryKey: ['nomina-resumen-mes'],
    queryFn: () => api.get('/nomina/resumen-mes').then(r => r.data.data),
    refetchInterval: 60000,
  });

  const { data: termometro } = useQuery({
    queryKey: ['termometro'],
    queryFn: () => api.get('/nomina/termometro').then(r => r.data.data),
    refetchInterval: 60000,
  });

  const configMut = useMutation({
    mutationFn: (data) => api.put('/nomina/config', data),
    onSuccess: () => {
      qc.invalidateQueries(['nomina-config']);
      toast.success('Configuración guardada');
      setEditando(false);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error'),
  });

  const pct        = parseFloat(config?.porcentaje_provision || 15);
  const gastos     = parseFloat(config?.gastos_meta || 0);
  const diasLab    = parseInt(config?.dias_laborales || 26);

  // Meta = gastos / (1 - % salarios)
  const metaMensual  = gastos > 0 && pct < 100 ? gastos / (1 - pct / 100) : 0;
  const ventaDiaria  = diasLab > 0 ? metaMensual / diasLab : 0;
  const salariosMes  = metaMensual * (pct / 100);

  const ventasMes       = resumen?.ventas_mes || 0;
  const diasTransc      = resumen?.dias_transcurridos || 1;
  const promedioActual  = resumen?.promedio_diario || 0;
  const pctMeta         = metaMensual > 0 ? Math.min(100, (ventasMes / metaMensual) * 100) : 0;
  const diasRestantes   = (diasLab - diasTransc) > 0 ? (diasLab - diasTransc) : 0;
  const faltaVender     = Math.max(0, metaMensual - ventasMes);
  const ventaDiariaRestante = diasRestantes > 0 ? faltaVender / diasRestantes : 0;

  const barColor = pctMeta >= 75 ? '#10b981' : pctMeta >= 40 ? '#f59e0b' : '#ef4444';

  const abrirEdicion = () => {
    setForm({
      porcentaje_provision: config?.porcentaje_provision || 15,
      gastos_meta:   config?.gastos_meta   || 0,
      dias_laborales: config?.dias_laborales || 26,
    });
    setEditando(true);
  };

  return (
    <div className="space-y-5 pb-8 animate-fade-in max-w-xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Meta del Mes</h1>
          <p className="text-gray-500 text-sm mt-0.5">Cuánto necesitas vender para cubrir todo</p>
        </div>
        <button onClick={abrirEdicion} className="btn-secondary text-sm">
          <Settings size={15} /> Configurar
        </button>
      </div>

      {/* ── Card principal: META DIARIA ── */}
      <div className="card text-center py-6">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Debes vender por día</p>
        <motion.p
          key={ventaDiaria}
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="text-5xl font-black text-brand-400 tabular-nums leading-none mb-1">
          {formatMoney(Math.round(ventaDiaria))}
        </motion.p>
        <p className="text-sm text-gray-500">en {diasLab} días laborales del mes</p>

        {gastos === 0 && (
          <div className="mt-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
            <p className="text-yellow-400 text-sm">Configura tus gastos del mes para ver la meta</p>
          </div>
        )}
      </div>

      {/* ── Desglose de la meta ── */}
      {metaMensual > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Desglose mensual</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-sm text-gray-300">Gastos del mes</span>
              </div>
              <span className="text-white font-semibold tabular-nums">{formatMoney(Math.round(gastos))}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-400" />
                <span className="text-sm text-gray-300">Fondo de salarios ({pct}% de ventas)</span>
              </div>
              <span className="text-brand-400 font-semibold tabular-nums">{formatMoney(Math.round(salariosMes))}</span>
            </div>
            <div className="flex justify-between items-center py-2 bg-gray-800/50 rounded-xl px-3">
              <span className="text-sm font-bold text-white">Meta mensual total</span>
              <span className="text-lg font-black text-white tabular-nums">{formatMoney(Math.round(metaMensual))}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Progreso del mes actual ── */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Progreso de {new Date().toLocaleString('es-CR', { month: 'long' })}</h2>

        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{formatMoney(Math.round(ventasMes))} vendido</span>
          <span>{pctMeta.toFixed(0)}% de la meta</span>
        </div>
        <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden mb-4">
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${pctMeta}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${barColor}99, ${barColor})` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800/50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-white tabular-nums">{formatMoney(Math.round(promedioActual))}</p>
            <p className="text-xs text-gray-500 mt-0.5">Promedio/día actual</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold tabular-nums" style={{ color: ventaDiariaRestante <= ventaDiaria ? '#10b981' : '#f59e0b' }}>
              {formatMoney(Math.round(ventaDiariaRestante))}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Necesitas/día restante</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold text-white tabular-nums">{diasRestantes}</p>
            <p className="text-xs text-gray-500 mt-0.5">Días restantes</p>
          </div>
        </div>

        {promedioActual >= ventaDiaria && metaMensual > 0 && (
          <div className="mt-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5 text-center">
            <p className="text-emerald-400 text-sm font-medium">¡Vas por encima de la meta diaria!</p>
          </div>
        )}
      </div>

      {/* ── Fondo de salarios ── */}
      {termometro && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Fondo de salarios ahorrado</h2>
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-3xl font-black text-brand-400 tabular-nums">
                {formatMoney(termometro.acumulado_periodo)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">de {formatMoney(termometro.meta)} de meta</p>
            </div>
            <p className="text-2xl font-black text-gray-400 tabular-nums">
              {(termometro.porcentaje_avance || 0).toFixed(0)}%
            </p>
          </div>
          <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${Math.min(100, termometro.porcentaje_avance || 0)}%` }}
              transition={{ duration: 1 }}
              className="h-full rounded-full bg-brand-500"
            />
          </div>
          <p className="text-xs text-gray-600 mt-2 text-center">
            El {pct}% de cada venta se va acumulando aquí automáticamente al hacer cierre del día
          </p>
        </div>
      )}

      {/* ── Modal configuración ── */}
      {editando && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="card w-full max-w-sm">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold text-lg">Configuración</h3>
              <button onClick={() => setEditando(false)} className="text-gray-500 hover:text-white"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">% de las ventas para salarios</label>
                <div className="flex items-center gap-2">
                  <input className="input flex-1" type="number" min="1" max="60" step="0.5"
                    value={form.porcentaje_provision}
                    onChange={e => setForm(p => ({ ...p, porcentaje_provision: e.target.value }))} />
                  <span className="text-gray-400 font-bold text-lg">%</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  De cada ₡100 vendidos, ₡{form.porcentaje_provision} van al fondo de salarios
                </p>
              </div>

              <div>
                <label className="label">Gastos del mes (₡)</label>
                <input className="input" type="number" step="1000" placeholder="Ej: 500000"
                  value={form.gastos_meta}
                  onChange={e => setForm(p => ({ ...p, gastos_meta: e.target.value }))} />
                <p className="text-xs text-gray-600 mt-1">
                  Alquiler, servicios, materiales, etc.
                </p>
              </div>

              <div>
                <label className="label">Días laborales del mes</label>
                <input className="input" type="number" min="1" max="31" step="1"
                  value={form.dias_laborales}
                  onChange={e => setForm(p => ({ ...p, dias_laborales: e.target.value }))} />
              </div>

              {/* Preview de la meta */}
              {parseFloat(form.gastos_meta) > 0 && (
                <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-2">Vista previa</p>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Meta mensual</span>
                    <span className="text-white font-bold">
                      {formatMoney(Math.round(parseFloat(form.gastos_meta) / (1 - parseFloat(form.porcentaje_provision) / 100)))}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Venta diaria necesaria</span>
                    <span className="text-brand-400 font-black">
                      {formatMoney(Math.round((parseFloat(form.gastos_meta) / (1 - parseFloat(form.porcentaje_provision) / 100)) / parseInt(form.dias_laborales || 26)))}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => configMut.mutate(form)}
                  disabled={configMut.isPending}
                  className="btn-primary flex-1 justify-center">
                  <Check size={15} /> {configMut.isPending ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={() => setEditando(false)} className="btn-secondary flex-1 justify-center">
                  Cancelar
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
