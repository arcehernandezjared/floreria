import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Check, X, Users, TrendingUp } from 'lucide-react';
import api, { formatMoney } from '../utils/api';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function NominaPage() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [form, setForm]         = useState({});

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

  // ── Valores de configuración ──────────────────────────────────────────────
  const salariosMonto = parseFloat(config?.salarios_monto || 0);
  const gastos        = parseFloat(config?.gastos_meta    || 0);
  const diasLab       = parseInt(config?.dias_laborales   || 26);
  const numEmpleados  = parseInt(config?.num_empleados    || 1);

  // Meta mensual = gastos + salarios (monto fijo)
  const metaMensual      = gastos + salariosMonto;
  const ventaDiaria      = diasLab > 0 ? metaMensual / diasLab : 0;
  const salarioPorPersoa = numEmpleados > 0 ? salariosMonto / numEmpleados : salariosMonto;

  // ── Progreso del mes ──────────────────────────────────────────────────────
  const ventasMes          = resumen?.ventas_mes        || 0;
  const diasTransc         = resumen?.dias_transcurridos || 1;
  const promedioActual     = resumen?.promedio_diario    || 0;
  const pctMeta            = metaMensual > 0 ? Math.min(100, (ventasMes / metaMensual) * 100) : 0;
  const diasRestantes      = Math.max(0, diasLab - diasTransc);
  const faltaVender        = Math.max(0, metaMensual - ventasMes);
  const ventaDiariaRestante = diasRestantes > 0 ? faltaVender / diasRestantes : 0;

  const barColor = pctMeta >= 75 ? '#10b981' : pctMeta >= 40 ? '#f59e0b' : '#ef4444';

  // ── Preview en modal ──────────────────────────────────────────────────────
  const prevMeta   = parseFloat(form.gastos_meta || 0) + parseFloat(form.salarios_monto || 0);
  const prevDiario = parseInt(form.dias_laborales || 26) > 0 ? prevMeta / parseInt(form.dias_laborales || 26) : 0;
  const prevPersoa = parseInt(form.num_empleados || 1) > 0
    ? parseFloat(form.salarios_monto || 0) / parseInt(form.num_empleados || 1) : 0;

  const abrirEdicion = () => {
    setForm({
      salarios_monto: config?.salarios_monto || 0,
      num_empleados:  config?.num_empleados  || 1,
      gastos_meta:    config?.gastos_meta    || 0,
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

      {/* ── Meta diaria (número grande) ── */}
      <div className="card text-center py-7">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Debes vender por día</p>
        <motion.p
          key={ventaDiaria}
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="text-5xl font-black text-brand-400 tabular-nums leading-none mb-1">
          {formatMoney(Math.round(ventaDiaria))}
        </motion.p>
        <p className="text-sm text-gray-500">en {diasLab} días laborales del mes</p>

        {metaMensual === 0 && (
          <div className="mt-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
            <p className="text-yellow-400 text-sm">Configura tus gastos y salarios para ver la meta</p>
          </div>
        )}
      </div>

      {/* ── Desglose ── */}
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
                <span className="text-sm text-gray-300">Salarios del mes ({numEmpleados} persona{numEmpleados !== 1 ? 's' : ''})</span>
              </div>
              <span className="text-brand-400 font-semibold tabular-nums">{formatMoney(Math.round(salariosMonto))}</span>
            </div>

            <div className="flex justify-between items-center py-2 bg-gray-800/50 rounded-xl px-3">
              <span className="text-sm font-bold text-white">Meta mensual total</span>
              <span className="text-lg font-black text-white tabular-nums">{formatMoney(Math.round(metaMensual))}</span>
            </div>

            {/* Salario por persona */}
            {numEmpleados > 1 && (
              <div className="flex justify-between items-center px-3 py-2 bg-brand-500/10 border border-brand-500/20 rounded-xl">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-brand-400" />
                  <span className="text-sm text-gray-300">Salario por persona</span>
                </div>
                <span className="text-brand-400 font-bold tabular-nums">{formatMoney(Math.round(salarioPorPersoa))}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Progreso del mes ── */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          Progreso de {new Date().toLocaleString('es-CR', { month: 'long' })}
        </h2>

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
            <p className="text-xs text-gray-500 mt-0.5">Promedio/día</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 text-center">
            <p className="text-lg font-bold tabular-nums"
              style={{ color: ventaDiariaRestante > 0 && ventaDiariaRestante <= ventaDiaria ? '#10b981' : '#f59e0b' }}>
              {formatMoney(Math.round(ventaDiariaRestante))}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Falta/día restante</p>
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

      {/* ── Fondo de salarios acumulado ── */}
      {termometro && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Fondo de salarios ahorrado</h2>
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-3xl font-black text-brand-400 tabular-nums">
                {formatMoney(termometro.acumulado_periodo)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                de {formatMoney(salariosMonto > 0 ? salariosMonto : termometro.meta)} de meta
              </p>
            </div>
            <p className="text-2xl font-black text-gray-400 tabular-nums">
              {salariosMonto > 0
                ? Math.min(100, Math.round((termometro.acumulado_periodo / salariosMonto) * 100))
                : (termometro.porcentaje_avance || 0).toFixed(0)
              }%
            </p>
          </div>
          <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${salariosMonto > 0 ? Math.min(100, (termometro.acumulado_periodo / salariosMonto) * 100) : Math.min(100, termometro.porcentaje_avance || 0)}%` }}
              transition={{ duration: 1 }}
              className="h-full rounded-full bg-brand-500"
            />
          </div>
          <p className="text-xs text-gray-600 mt-2 text-center">
            Se acumula automáticamente al hacer cierre del día
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

              {/* Salarios */}
              <div>
                <label className="label">Monto de salarios del mes (₡)</label>
                <input className="input" type="number" step="1000" placeholder="Ej: 600000"
                  value={form.salarios_monto}
                  onChange={e => setForm(p => ({ ...p, salarios_monto: e.target.value }))} />
                <p className="text-xs text-gray-600 mt-1">Total de sueldos a pagar en el mes</p>
              </div>

              {/* Número de empleados */}
              <div>
                <label className="label">Número de empleados</label>
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, num_empleados: Math.max(1, parseInt(p.num_empleados || 1) - 1) }))}
                    className="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-xl font-bold flex items-center justify-center transition-colors">
                    −
                  </button>
                  <input className="input text-center font-bold text-lg w-20" type="number" min="1"
                    value={form.num_empleados}
                    onChange={e => setForm(p => ({ ...p, num_empleados: e.target.value }))} />
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, num_empleados: parseInt(p.num_empleados || 1) + 1 }))}
                    className="w-10 h-10 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-xl font-bold flex items-center justify-center transition-colors">
                    +
                  </button>
                </div>
                {parseFloat(form.salarios_monto) > 0 && parseInt(form.num_empleados) > 0 && (
                  <p className="text-xs text-brand-400 mt-1">
                    {formatMoney(Math.round(parseFloat(form.salarios_monto) / parseInt(form.num_empleados)))} por persona
                  </p>
                )}
              </div>

              {/* Gastos */}
              <div>
                <label className="label">Gastos del mes (₡)</label>
                <input className="input" type="number" step="1000" placeholder="Ej: 400000"
                  value={form.gastos_meta}
                  onChange={e => setForm(p => ({ ...p, gastos_meta: e.target.value }))} />
                <p className="text-xs text-gray-600 mt-1">Alquiler, servicios, materiales, etc.</p>
              </div>

              {/* Días laborales */}
              <div>
                <label className="label">Días laborales del mes</label>
                <input className="input" type="number" min="1" max="31"
                  value={form.dias_laborales}
                  onChange={e => setForm(p => ({ ...p, dias_laborales: e.target.value }))} />
              </div>

              {/* Preview */}
              {prevMeta > 0 && (
                <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-4 space-y-1.5">
                  <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Vista previa</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Meta mensual</span>
                    <span className="text-white font-bold">{formatMoney(Math.round(prevMeta))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Venta diaria necesaria</span>
                    <span className="text-brand-400 font-black text-base">{formatMoney(Math.round(prevDiario))}</span>
                  </div>
                  {parseInt(form.num_empleados) > 1 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Salario por persona</span>
                      <span className="text-brand-300 font-semibold">{formatMoney(Math.round(prevPersoa))}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => configMut.mutate(form)} disabled={configMut.isPending}
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
