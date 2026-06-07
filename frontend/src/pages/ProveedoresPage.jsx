import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Truck, Edit, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import api, { formatMoney, formatDate } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const TIPO_BADGE = {
  finca: 'badge-green',
  distribuidor: 'badge-blue',
  otro: 'badge-yellow'
};

function ProveedorModal({ proveedor, onClose, onSave }) {
  const [form, setForm] = useState(proveedor || { nombre: '', tipo: 'distribuidor', contacto: '', telefono: '', email: '', notas: '' });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-md">
        <h3 className="text-lg font-semibold text-white mb-4">{proveedor ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Nombre</label>
            <input className="input" required value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
              <option value="finca">Finca</option>
              <option value="distribuidor">Distribuidor</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Contacto</label>
              <input className="input" value={form.contacto} onChange={e => setForm(p => ({ ...p, contacto: e.target.value }))} />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input" value={form.telefono} onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Notas</label>
            <textarea className="input h-20 resize-none" value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
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

function RendimientoCard({ data }) {
  if (!data || data.length === 0) return <p className="text-gray-600 text-sm">Sin incidencias por defecto de proveedor</p>;
  return (
    <div className="space-y-2">
      {data.map(p => (
        <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-800/50">
          <div>
            <p className="text-sm text-white">{p.proveedor_nombre}</p>
            <p className="text-xs text-gray-500">{p.total_incidencias} incidencias — {parseFloat(p.total_unidades_mermadas).toFixed(0)} unidades</p>
          </div>
          <span className="text-red-400 font-semibold">{formatMoney(p.total_perdido)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProveedoresPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const { data: proveedores = [] } = useQuery({ queryKey: ['proveedores-all'], queryFn: () => api.get('/proveedores', { params: { activo: '1' } }).then(r => r.data.data) });
  const { data: rendimiento = [] } = useQuery({ queryKey: ['rendimiento-proveedores'], queryFn: () => api.get('/mermas/rendimiento-proveedores').then(r => r.data.data) });

  const { data: historialCompras } = useQuery({
    queryKey: ['historial-compras', expanded],
    queryFn: () => api.get(`/proveedores/${expanded}/historial-compras`).then(r => r.data.data),
    enabled: !!expanded
  });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/proveedores', data),
    onSuccess: () => { qc.invalidateQueries(['proveedores-all']); toast.success('Proveedor creado'); setModal(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/proveedores/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['proveedores-all']); toast.success('Proveedor actualizado'); setModal(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/proveedores/${id}`),
    onSuccess: () => { qc.invalidateQueries(['proveedores-all']); qc.invalidateQueries(['proveedores']); toast.success('Proveedor eliminado'); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const handleDelete = (p) => {
    if (!confirm(`¿Eliminar a "${p.nombre}"? Sus compras y mermas quedarán en el historial.`)) return;
    deleteMut.mutate(p.id);
  };

  const handleSave = (form) => form.id ? updateMut.mutate(form) : createMut.mutate(form);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Proveedores</h1>
          <p className="text-gray-500 text-sm mt-1">Gestión de fincas y distribuidores</p>
        </div>
        <button onClick={() => setModal('nuevo')} className="btn-primary">
          <Plus size={16} /> Nuevo Proveedor
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista */}
        <div className="lg:col-span-2 space-y-3">
          {proveedores.map(p => (
            <div key={p.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-600/15 rounded-xl flex items-center justify-center">
                    <Truck size={18} className="text-brand-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{p.nombre}</p>
                      <span className={`badge ${TIPO_BADGE[p.tipo] || 'badge-yellow'}`}>{p.tipo}</span>
                      {!p.activo && <span className="badge badge-red">Inactivo</span>}
                    </div>
                    <p className="text-xs text-gray-500">{p.contacto} {p.telefono && `• ${p.telefono}`}</p>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <button onClick={() => setModal(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-400 hover:bg-brand-500/10 transition-colors">
                    <Edit size={15} />
                  </button>
                  <button onClick={() => handleDelete(p)} disabled={deleteMut.isPending} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <Trash2 size={15} />
                  </button>
                  <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-white transition-colors">
                    {expanded === p.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>

              {/* Historial compras expandible */}
              <AnimatePresence>
                {expanded === p.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Historial de Compras</p>
                      {!historialCompras || historialCompras.length === 0 ? (
                        <p className="text-gray-600 text-sm">Sin compras registradas</p>
                      ) : historialCompras.map(c => (
                        <div key={c.id} className="flex justify-between text-sm py-1 border-b border-gray-800/50">
                          <span className="text-gray-400">{formatDate(c.fecha)}</span>
                          <span className={`badge ${c.estado === 'recibida' ? 'badge-green' : c.estado === 'parcial' ? 'badge-yellow' : 'badge-blue'}`}>{c.estado}</span>
                          <span className="text-white">{formatMoney(c.total)}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Rendimiento */}
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Rendimiento — Defectos</h3>
          <RendimientoCard data={rendimiento} />
        </div>
      </div>

      <AnimatePresence>
        {modal && (
          <ProveedorModal proveedor={modal !== 'nuevo' ? modal : null} onClose={() => setModal(null)} onSave={handleSave} />
        )}
      </AnimatePresence>
    </div>
  );
}
