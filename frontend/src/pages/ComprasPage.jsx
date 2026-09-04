import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil } from 'lucide-react';
import api, { formatMoney, formatDate, hoyCR } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

function NuevaCompraModal({ onClose, onSave, proveedores, compra }) {
  const [form, setForm] = useState(compra
    ? { proveedor_id: compra.proveedor_id, fecha: compra.fecha?.slice(0, 10) || hoyCR(), total: compra.total, notas: compra.notas || '' }
    : { proveedor_id: '', fecha: hoyCR(), total: '', notas: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.proveedor_id) return toast.error('Selecciona un proveedor');
    if (!form.total || parseFloat(form.total) <= 0) return toast.error('Ingresa el total de la compra');
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-md my-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">{compra ? 'Editar Compra' : 'Nueva Compra'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Proveedor</label>
            <select className="input" required value={form.proveedor_id} onChange={e => setForm(p => ({ ...p, proveedor_id: e.target.value }))}>
              <option value="">Seleccionar proveedor...</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha</label>
              <input className="input" type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
            </div>
            <div>
              <label className="label">Total (₡)</label>
              <input className="input" type="number" step="1" min="0" placeholder="0" required
                value={form.total} onChange={e => setForm(p => ({ ...p, total: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Notas</label>
            <input className="input" value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1 justify-center">{compra ? 'Guardar Cambios' : 'Crear Compra'}</button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function ComprasPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [editCompra, setEditCompra] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const { data: compras = [] } = useQuery({ queryKey: ['compras'], queryFn: () => api.get('/compras').then(r => r.data.data) });
  const { data: proveedores = [] } = useQuery({ queryKey: ['proveedores'], queryFn: () => api.get('/proveedores').then(r => r.data.data) });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/compras', data),
    onSuccess: () => {
      qc.invalidateQueries(['compras']);
      toast.success('Compra registrada');
      setModal(false);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/compras/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries(['compras']);
      toast.success('Compra actualizada');
      setEditCompra(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/compras/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['compras']);
      toast.success('Compra eliminada');
      setConfirmDeleteId(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al eliminar')
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Compras</h1>
          <p className="text-gray-500 text-sm mt-1">Registro de compras a proveedores</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary">
          <Plus size={16} /> Nueva Compra
        </button>
      </div>

      <div className="card p-0 overflow-hidden">

        {/* ── Móvil: tarjetas ── */}
        <div className="card-view">
          {compras.length === 0 && <p className="text-gray-600 text-sm text-center py-8">Sin compras registradas</p>}
          <div className="divide-y divide-gray-800/60">
            {compras.map(c => (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm">{c.proveedor_nombre}</p>
                    {c.notas && <p className="text-xs text-gray-500 truncate">{c.notas}</p>}
                  </div>
                  <p className="text-white font-bold text-sm whitespace-nowrap flex-shrink-0">{formatMoney(c.total)}</p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${c.estado === 'recibida' ? 'badge-green' : c.estado === 'parcial' ? 'badge-yellow' : 'badge-blue'}`}>
                      {c.estado}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{formatDate(c.fecha)}</span>
                    {confirmDeleteId === c.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteMut.mutate(c.id)} disabled={deleteMut.isPending}
                          className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-2 py-1 rounded-lg font-medium">
                          {deleteMut.isPending ? '...' : 'Confirmar'}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-500 hover:text-gray-300 px-1 py-1">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <button onClick={() => setEditCompra(c)}
                          className="text-gray-600 hover:text-brand-400 transition-colors p-1 rounded">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setConfirmDeleteId(c.id)}
                          className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Desktop: tabla ── */}
        <div className="table-view overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-800">
              <tr>
                <th className="th">#</th>
                <th className="th">Proveedor</th>
                <th className="th">Fecha</th>
                <th className="th">Total</th>
                <th className="th">Estado</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {compras.map(c => (
                <tr key={c.id} className="table-row">
                  <td className="td text-gray-500">#{c.id}</td>
                  <td className="td">
                    <p className="text-white">{c.proveedor_nombre}</p>
                    {c.notas && <p className="text-xs text-gray-500 truncate max-w-32">{c.notas}</p>}
                  </td>
                  <td className="td text-gray-400">{formatDate(c.fecha)}</td>
                  <td className="td font-semibold text-white">{formatMoney(c.total)}</td>
                  <td className="td">
                    <span className={`badge ${c.estado === 'recibida' ? 'badge-green' : c.estado === 'parcial' ? 'badge-yellow' : 'badge-blue'}`}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="td">
                    {confirmDeleteId === c.id ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => deleteMut.mutate(c.id)} disabled={deleteMut.isPending}
                          className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-2 py-1 rounded-lg font-medium whitespace-nowrap">
                          {deleteMut.isPending ? '...' : '¿Eliminar?'}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-500 hover:text-gray-300">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditCompra(c)}
                          className="text-gray-600 hover:text-brand-400 transition-colors p-1 rounded">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => setConfirmDeleteId(c.id)}
                          className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {compras.length === 0 && (
                <tr><td colSpan={6} className="td text-center text-gray-600 py-8">Sin compras registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {modal && (
          <NuevaCompraModal
            onClose={() => setModal(false)}
            onSave={(data) => createMut.mutate(data)}
            proveedores={proveedores}
          />
        )}
        {editCompra && (
          <NuevaCompraModal
            compra={editCompra}
            onClose={() => setEditCompra(null)}
            onSave={(data) => updateMut.mutate({ id: editCompra.id, data })}
            proveedores={proveedores}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
