import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ShoppingCart, Trash2 } from 'lucide-react';
import api, { formatMoney, formatDate } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

function NuevaCompraModal({ onClose, onSave, proveedores, insumos, categorias }) {
  const [form, setForm] = useState({ proveedor_id: '', fecha: new Date().toISOString().split('T')[0], notas: '' });
  const [items, setItems] = useState([{ insumo_id: '', cantidad: '', costo_unitario: '', _cat: '' }]);

  const addItem = () => setItems(p => [...p, { insumo_id: '', cantidad: '', costo_unitario: '', _cat: '' }]);
  const removeItem = (idx) => setItems(p => p.filter((_, i) => i !== idx));
  const updateItem = (idx, field, val) => setItems(p => p.map((it, i) => {
    if (i !== idx) return it;
    // Al cambiar categoría, limpiar el insumo seleccionado
    if (field === '_cat') return { ...it, _cat: val, insumo_id: '' };
    return { ...it, [field]: val };
  }));

  const total = items.reduce((s, i) => s + (parseFloat(i.cantidad || 0) * parseFloat(i.costo_unitario || 0)), 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.proveedor_id) return toast.error('Selecciona un proveedor');
    const validItems = items.filter(i => i.insumo_id && i.cantidad && i.costo_unitario);
    if (validItems.length === 0) return toast.error('Agrega al menos un item');
    onSave({ ...form, items: validItems });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-2xl my-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Nueva Compra</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Proveedor</label>
              <select className="input" required value={form.proveedor_id} onChange={e => setForm(p => ({ ...p, proveedor_id: e.target.value }))}>
                <option value="">Seleccionar proveedor...</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fecha</label>
              <input className="input" type="date" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="label mb-0">Items</label>
              <button type="button" onClick={addItem} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                <Plus size={12} /> Agregar item
              </button>
            </div>

            {/* Cabecera de columnas — solo desktop */}
            <div className="hidden sm:grid grid-cols-12 gap-2 mb-1 px-1">
              <div className="col-span-3 text-xs text-gray-600">Categoría</div>
              <div className="col-span-4 text-xs text-gray-600">Insumo</div>
              <div className="col-span-2 text-xs text-gray-600">Cantidad</div>
              <div className="col-span-2 text-xs text-gray-600">Precio/u</div>
              <div className="col-span-1"></div>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => {
                const insumosFiltrados = item._cat
                  ? insumos.filter(i => String(i.categoria_id) === String(item._cat))
                  : insumos;
                const catSeleccionada = categorias.find(c => String(c.id) === String(item._cat));

                return (
                  <div key={idx} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center bg-gray-800/20 sm:bg-transparent rounded-xl sm:rounded-none p-2 sm:p-0">
                    {/* Categoría */}
                    <div className="col-span-1 sm:col-span-3">
                      <label className="sm:hidden text-xs text-gray-600 mb-0.5 block">Categoría</label>
                      <select className="input text-sm"
                        value={item._cat}
                        onChange={e => updateItem(idx, '_cat', e.target.value)}
                        style={catSeleccionada ? { borderColor: `${catSeleccionada.color}60`, color: catSeleccionada.color } : {}}>
                        <option value="">Todas...</option>
                        {categorias.map(c => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </select>
                    </div>
                    {/* Insumo */}
                    <div className="col-span-1 sm:col-span-4">
                      <label className="sm:hidden text-xs text-gray-600 mb-0.5 block">Insumo</label>
                      <select className="input text-sm" value={item.insumo_id}
                        onChange={e => {
                          const ins = insumos.find(i => String(i.id) === e.target.value);
                          updateItem(idx, 'insumo_id', e.target.value);
                          if (ins?.costo_unitario && !items[idx].costo_unitario) {
                            setItems(p => p.map((it, i) => i === idx ? { ...it, insumo_id: e.target.value, costo_unitario: ins.costo_unitario } : it));
                          }
                        }}>
                        <option value="">Insumo...</option>
                        {insumosFiltrados.map(i => (
                          <option key={i.id} value={i.id}>{i.nombre}</option>
                        ))}
                      </select>
                    </div>
                    {/* Cantidad */}
                    <div className="col-span-1 sm:col-span-2">
                      <label className="sm:hidden text-xs text-gray-600 mb-0.5 block">Cantidad</label>
                      <input className="input text-sm" type="number" step="0.01" placeholder="Cant."
                        value={item.cantidad} onChange={e => updateItem(idx, 'cantidad', e.target.value)} />
                    </div>
                    {/* Precio */}
                    <div className="col-span-1 sm:col-span-2">
                      <label className="sm:hidden text-xs text-gray-600 mb-0.5 block">Precio/u (₡)</label>
                      <input className="input text-sm" type="number" step="1" placeholder="₡/u"
                        value={item.costo_unitario} onChange={e => updateItem(idx, 'costo_unitario', e.target.value)} />
                    </div>
                    {/* Trash */}
                    <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-end">
                      <span className="text-xs text-gray-600 tabular-nums">
                        {item.cantidad && item.costo_unitario ? formatMoney(parseFloat(item.cantidad) * parseFloat(item.costo_unitario)) : ''}
                      </span>
                      <button type="button" onClick={() => removeItem(idx)} className="text-gray-600 hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-right text-sm font-semibold text-white mt-2">
              Total: <span className="text-brand-400">{formatMoney(total)}</span>
            </div>
          </div>

          <div>
            <label className="label">Notas</label>
            <input className="input" value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1 justify-center">Crear Compra</button>
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

  const { data: compras = [] } = useQuery({ queryKey: ['compras'], queryFn: () => api.get('/compras').then(r => r.data.data) });
  const { data: proveedores = [] } = useQuery({ queryKey: ['proveedores'], queryFn: () => api.get('/proveedores').then(r => r.data.data) });
  const { data: insumos = [] } = useQuery({ queryKey: ['insumos'], queryFn: () => api.get('/insumos').then(r => r.data.data) });
  const { data: categorias = [] } = useQuery({ queryKey: ['categorias'], queryFn: () => api.get('/insumos/categorias').then(r => r.data.data) });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/compras', data),
    onSuccess: () => {
      qc.invalidateQueries(['compras']);
      qc.invalidateQueries(['insumos']);
      toast.success('Compra registrada — Stock actualizado');
      setModal(false);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
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
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-800">
              <tr>
                <th className="th">#</th>
                <th className="th">Proveedor</th>
                <th className="th">Fecha</th>
                <th className="th">Items</th>
                <th className="th">Total</th>
                <th className="th">Estado</th>
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
                  <td className="td">{c.total_items} items</td>
                  <td className="td font-semibold text-white">{formatMoney(c.total)}</td>
                  <td className="td">
                    <span className={`badge ${c.estado === 'recibida' ? 'badge-green' : c.estado === 'parcial' ? 'badge-yellow' : 'badge-blue'}`}>
                      {c.estado}
                    </span>
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
            insumos={insumos}
            categorias={categorias}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
