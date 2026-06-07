import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, Trash2, MessageSquare, Pencil } from 'lucide-react';
import api, { formatMoney, formatDate } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const CATEGORIAS = [
  'alquiler', 'servicios', 'transporte', 'materiales',
  'publicidad', 'planilla', 'alimentacion', 'mantenimiento', 'otro',
  // retrocompatibilidad con datos anteriores
  'servicios_publicos', 'ccss', 'compras_insumos', 'marketing', 'nomina',
];

const CAT_LABELS = {
  alquiler:          'Alquiler',
  servicios:         'Servicios (agua, luz...)',
  transporte:        'Transporte',
  materiales:        'Materiales',
  publicidad:        'Publicidad',
  planilla:          'Planilla / Sueldos',
  alimentacion:      'Alimentación',
  mantenimiento:     'Mantenimiento',
  otro:              'Otro',
  // retrocompat
  servicios_publicos:'Servicios Públicos',
  ccss:              'CCSS',
  compras_insumos:   'Materiales',
  marketing:         'Publicidad',
  nomina:            'Planilla / Sueldos',
};

// Solo las categorías que aparecen en el selector del formulario (sin duplicados)
const CATEGORIAS_FORM = [
  'alquiler', 'servicios', 'transporte', 'materiales',
  'publicidad', 'planilla', 'alimentacion', 'mantenimiento', 'otro',
];

function GastoModal({ gasto, onClose, onSave }) {
  const hoy = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState(() => {
    if (!gasto) return { concepto: '', monto: '', tipo: 'variable', categoria: 'otro', fecha: hoy, recurrente: false, notas: '' };
    return {
      ...gasto,
      fecha: gasto.fecha ? gasto.fecha.toString().split('T')[0] : hoy,
      recurrente: Boolean(gasto.recurrente),
      notas: gasto.notas || '',
    };
  });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-md">
        <h3 className="text-lg font-semibold text-white mb-4">{gasto ? 'Editar Gasto' : 'Nuevo Gasto'}</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Concepto</label>
            <input className="input" required value={form.concepto} onChange={e => setForm(p => ({ ...p, concepto: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Monto (₡)</label>
              <input className="input" type="number" step="100" required value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))} />
            </div>
            <div>
              <label className="label">Fecha</label>
              <input className="input" type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                <option value="fijo">Fijo</option>
                <option value="variable">Variable</option>
              </select>
            </div>
            <div>
              <label className="label">Categoría</label>
              <select className="input" value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
                {CATEGORIAS_FORM.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="recurrente" checked={form.recurrente} onChange={e => setForm(p => ({ ...p, recurrente: e.target.checked }))} className="w-4 h-4" />
            <label htmlFor="recurrente" className="text-sm text-gray-400">Gasto recurrente</label>
          </div>
          <div>
            <label className="label">Notas</label>
            <input className="input" value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
          </div>
          <div className="flex gap-3">
            <button onClick={() => onSave(form)} className="btn-primary flex-1 justify-center">Guardar</button>
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function GastosPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().substring(0, 7));

  const mesInicio = filtroMes + '-01';
  const [yy, mm] = filtroMes.split('-').map(Number);
  const mesFin = `${filtroMes}-${new Date(yy, mm, 0).getDate()}`;

  const { data: gastos = [] } = useQuery({
    queryKey: ['gastos', filtroMes],
    queryFn: () => api.get('/gastos', { params: { desde: mesInicio, hasta: mesFin } }).then(r => r.data.data)
  });

  const { data: resumen } = useQuery({ queryKey: ['gastos-resumen'], queryFn: () => api.get('/gastos/resumen').then(r => r.data.data) });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/gastos', data),
    onSuccess: () => { qc.invalidateQueries(['gastos']); qc.invalidateQueries(['gastos-resumen']); toast.success('Gasto registrado'); setModal(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/gastos/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['gastos']); qc.invalidateQueries(['gastos-resumen']); toast.success('Gasto actualizado'); setModal(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/gastos/${id}`),
    onSuccess: () => { qc.invalidateQueries(['gastos']); qc.invalidateQueries(['gastos-resumen']); toast.success('Gasto eliminado'); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const totalMes = gastos.reduce((s, g) => s + parseFloat(g.monto), 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gastos</h1>
          <p className="text-gray-500 text-sm mt-1">Control de gastos fijos y variables</p>
        </div>
        <button onClick={() => setModal('nuevo')} className="btn-primary">
          <Plus size={16} /> Nuevo Gasto
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resumen por categoría */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Por Categoría — Mes Actual</h3>
          <div className="space-y-2">
            {resumen?.por_categoria?.map(r => (
              <div key={r.categoria} className="flex justify-between items-center">
                <p className="text-sm text-gray-300">{CAT_LABELS[r.categoria] || r.categoria}</p>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">{formatMoney(r.mes_actual)}</p>
                  {parseFloat(r.mes_anterior) > 0 && (
                    <p className="text-xs text-gray-500">ant: {formatMoney(r.mes_anterior)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-800 mt-3 pt-3 flex justify-between">
            <span className="text-sm font-semibold text-gray-400">Total mes actual</span>
            <span className="text-white font-bold">{formatMoney(resumen?.total_mes_actual)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-500">Mes anterior</span>
            <span className="text-xs text-gray-500">{formatMoney(resumen?.total_mes_anterior)}</span>
          </div>
        </div>

        {/* Lista gastos */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <input type="month" className="input w-40 py-2" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} />
            <span className="text-gray-500 text-sm">Total: <span className="text-white font-bold">{formatMoney(totalMes)}</span></span>
          </div>

          <div className="card p-0 overflow-hidden">
            {/* Mobile: tarjetas */}
            <div className="sm:hidden divide-y divide-gray-800/60">
              {gastos.map(g => (
                <div key={g.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <p className="text-white font-medium text-sm leading-tight truncate">{g.concepto}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(g.fecha)}</p>
                    </div>
                    <p className="text-white font-bold text-sm whitespace-nowrap flex-shrink-0">{formatMoney(g.monto)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1 flex-wrap">
                      <span className="badge badge-yellow text-xs">{CAT_LABELS[g.categoria] || g.categoria}</span>
                      <span className={`badge text-xs ${g.tipo === 'fijo' ? 'badge-purple' : 'badge-blue'}`}>{g.tipo}</span>
                      {g.recurrente && <span className="badge badge-blue text-xs">Recurrente</span>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => setModal(g)} className="text-gray-600 hover:text-brand-400 p-1"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm('¿Eliminar este gasto?')) deleteMut.mutate(g.id); }} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {g.notas && !g.notas.includes('WhatsApp') && <p className="text-xs text-gray-600 mt-1 truncate">{g.notas}</p>}
                </div>
              ))}
              {gastos.length === 0 && <p className="text-gray-600 text-sm text-center py-8">Sin gastos para este período</p>}
            </div>
            {/* Desktop: tabla */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-800">
                  <tr>
                    <th className="th">Concepto</th>
                    <th className="th">Categoría</th>
                    <th className="th">Tipo</th>
                    <th className="th">Fecha</th>
                    <th className="th">Monto</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody>
                  {gastos.map(g => (
                    <tr key={g.id} className="table-row">
                      <td className="td">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-white">{g.concepto}</p>
                          {g.notas?.includes('WhatsApp') && (
                            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-green-500/15 text-green-400 rounded-full">
                              <MessageSquare size={9} /> WA
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {g.recurrente && <span className="badge badge-blue text-xs">Recurrente</span>}
                          {g.notas && !g.notas.includes('WhatsApp') && <p className="text-xs text-gray-500">{g.notas}</p>}
                        </div>
                      </td>
                      <td className="td"><span className="badge badge-yellow">{CAT_LABELS[g.categoria] || g.categoria}</span></td>
                      <td className="td"><span className={`badge ${g.tipo === 'fijo' ? 'badge-purple' : 'badge-blue'}`}>{g.tipo}</span></td>
                      <td className="td text-gray-400">{formatDate(g.fecha)}</td>
                      <td className="td font-semibold text-white">{formatMoney(g.monto)}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setModal(g)} className="text-gray-600 hover:text-brand-400 transition-colors"><Pencil size={14} /></button>
                          <button onClick={() => { if (confirm('¿Eliminar este gasto?')) deleteMut.mutate(g.id); }} className="text-gray-600 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {gastos.length === 0 && <tr><td colSpan={6} className="td text-center text-gray-600 py-8">Sin gastos para este período</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {modal && (
          <GastoModal
            gasto={modal === 'nuevo' ? null : modal}
            onClose={() => setModal(null)}
            onSave={(data) => {
              if (modal === 'nuevo') {
                createMut.mutate(data);
              } else {
                updateMut.mutate({ id: modal.id, data });
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
