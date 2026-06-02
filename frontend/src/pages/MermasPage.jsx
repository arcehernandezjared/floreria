import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, AlertTriangle } from 'lucide-react';
import api, { formatMoney, formatDate } from '../utils/api';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

const MOTIVO_LABELS = {
  marchita_tienda: 'Marchita en tienda',
  danada_armar: 'Dañada al armar',
  defecto_proveedor: 'Defecto proveedor',
  uso_interno: 'Uso interno'
};

const MOTIVO_COLORS = {
  marchita_tienda: 'text-red-400 bg-red-500/10 border-red-500/20',
  danada_armar: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  defecto_proveedor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  uso_interno: 'text-blue-400 bg-blue-500/10 border-blue-500/20'
};

export default function MermasPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ insumo_id: '', cantidad: '', motivo: 'marchita_tienda', proveedor_id: '', notas: '' });
  const [filtroFecha, setFiltroFecha] = useState(new Date().toISOString().split('T')[0]);

  const { data: insumos = [] } = useQuery({ queryKey: ['insumos-activos'], queryFn: () => api.get('/insumos', { params: { tipo: 'flor' } }).then(r => r.data.data) });
  const { data: proveedores = [] } = useQuery({ queryKey: ['proveedores'], queryFn: () => api.get('/proveedores').then(r => r.data.data) });

  const { data: mermas = [] } = useQuery({
    queryKey: ['mermas', filtroFecha],
    queryFn: () => api.get('/mermas', { params: { desde: filtroFecha, hasta: filtroFecha } }).then(r => r.data.data)
  });

  const { data: mermasMes = [] } = useQuery({
    queryKey: ['mermas-motivo'],
    queryFn: () => api.get('/mermas/por-motivo', {
      params: { desde: new Date().toISOString().substring(0, 8) + '01' }
    }).then(r => r.data.data)
  });

  const registrarMut = useMutation({
    mutationFn: (data) => api.post('/mermas', data),
    onSuccess: () => {
      qc.invalidateQueries(['mermas']);
      qc.invalidateQueries(['mermas-motivo']);
      qc.invalidateQueries(['insumos']);
      qc.invalidateQueries(['insumos-activos']);
      toast.success('Merma registrada');
      setForm({ insumo_id: '', cantidad: '', motivo: 'marchita_tienda', proveedor_id: '', notas: '' });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.insumo_id || !form.cantidad) return toast.error('Selecciona insumo y cantidad');
    registrarMut.mutate({
      ...form,
      proveedor_id: form.proveedor_id || undefined
    });
  };

  const totalDia = mermas.reduce((s, m) => s + parseFloat(m.costo_total), 0);
  const totalMes = mermasMes.reduce((s, m) => s + parseFloat(m.total_perdido), 0);
  const insumoSeleccionado = insumos.find(i => i.id == form.insumo_id);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Mermas</h1>
        <p className="text-gray-500 text-sm mt-1">Registro de flores y materiales perdidos</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario prominente */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card lg:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-red-500/15 rounded-xl flex items-center justify-center">
              <Trash2 size={16} className="text-red-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Registrar Merma</h3>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label">Insumo</label>
              <select className="input" required value={form.insumo_id} onChange={e => setForm(p => ({ ...p, insumo_id: e.target.value }))}>
                <option value="">Seleccionar insumo...</option>
                {insumos.map(i => (
                  <option key={i.id} value={i.id}>{i.nombre} (Stock: {parseFloat(i.stock_actual)} {i.unidad})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Cantidad</label>
              <input className="input" type="number" step="0.01" min="0.01" required
                value={form.cantidad} onChange={e => setForm(p => ({ ...p, cantidad: e.target.value }))} />
              {insumoSeleccionado && form.cantidad && (
                <p className="text-xs text-gray-500 mt-1">
                  Costo aprox: <span className="text-red-400 font-semibold">
                    {formatMoney(parseFloat(form.cantidad) * parseFloat(insumoSeleccionado.costo_unitario))}
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="label">Motivo</label>
              <select className="input" value={form.motivo} onChange={e => setForm(p => ({ ...p, motivo: e.target.value }))}>
                {Object.entries(MOTIVO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {form.motivo === 'defecto_proveedor' && (
              <div>
                <label className="label">Proveedor responsable</label>
                <select className="input" value={form.proveedor_id} onChange={e => setForm(p => ({ ...p, proveedor_id: e.target.value }))}>
                  <option value="">Seleccionar...</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Notas</label>
              <input className="input" placeholder="Observaciones..." value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
            </div>
            <button type="submit" disabled={registrarMut.isPending} className="w-full btn-danger justify-center py-2.5">
              <Trash2 size={15} /> {registrarMut.isPending ? 'Guardando...' : 'Registrar Merma'}
            </button>
          </form>
        </motion.div>

        {/* Mermas del día y resumen */}
        <div className="lg:col-span-2 space-y-4">
          {/* Resumen del mes por motivo */}
          <div className="card">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Pérdidas del Mes por Motivo</h3>
              <span className="text-red-400 font-bold">{formatMoney(totalMes)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {mermasMes.map(m => (
                <div key={m.motivo} className={`flex justify-between items-center p-3 rounded-xl border ${MOTIVO_COLORS[m.motivo] || 'text-gray-400 bg-gray-800 border-gray-700'}`}>
                  <div>
                    <p className="text-xs font-medium">{MOTIVO_LABELS[m.motivo] || m.motivo}</p>
                    <p className="text-xs opacity-70">{m.cantidad} reg.</p>
                  </div>
                  <p className="font-bold">{formatMoney(m.total_perdido)}</p>
                </div>
              ))}
              {mermasMes.length === 0 && <p className="text-gray-600 text-sm col-span-2">Sin mermas este mes</p>}
            </div>
          </div>

          {/* Mermas del día */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Mermas del Día</h3>
              <div className="flex items-center gap-3">
                <input type="date" className="input py-1 text-xs w-36" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
                <span className="text-red-400 font-bold text-sm">{formatMoney(totalDia)}</span>
              </div>
            </div>

            {mermas.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">Sin mermas para esta fecha</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="th">Insumo</th>
                      <th className="th">Cantidad</th>
                      <th className="th">Motivo</th>
                      <th className="th">Costo Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mermas.map(m => (
                      <tr key={m.id} className="table-row">
                        <td className="td">{m.insumo_nombre}</td>
                        <td className="td">{parseFloat(m.cantidad)} {m.unidad}</td>
                        <td className="td">
                          <span className={`badge border ${MOTIVO_COLORS[m.motivo] || ''}`}>
                            {MOTIVO_LABELS[m.motivo] || m.motivo}
                          </span>
                        </td>
                        <td className="td text-red-400 font-semibold">{formatMoney(m.costo_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
