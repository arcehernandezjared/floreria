import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, Tag, X, Check, Camera, ImagePlus } from 'lucide-react';
import api, { formatMoney } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3002/api').replace('/api', '');
const getImgUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_BASE}${url}`;
};

const MOTIVOS_UNIDAD = ['tallo', 'unidad', 'bloque', 'metro'];

function StockBar({ actual, minimo }) {
  const pct = minimo > 0 ? Math.min(100, (actual / minimo) * 100) : 100;
  const color = actual === 0 ? 'bg-red-500' : actual <= minimo ? 'bg-yellow-500' : 'bg-brand-500';
  return (
    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}


function CategoriasModal({ onClose }) {
  const qc = useQueryClient();
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ nombre: '', color: '#10b981' });

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api.get('/insumos/categorias').then(r => r.data.data)
  });

  const refresh = () => {
    qc.invalidateQueries(['categorias']);
    qc.invalidateQueries(['insumos']);
  };

  const createMut = useMutation({
    mutationFn: (data) => api.post('/insumos/categorias', data),
    onSuccess: () => {
      refresh();
      toast.success('Categoría creada');
      setShowNew(false);
      setNewForm({ nombre: '', color: '#10b981' });
    },
    onError: (e) => {
      console.error('createCategoria error:', e);
      toast.error(e.response?.data?.message || e.message || 'Error al crear categoría');
    }
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/insumos/categorias/${id}`, data),
    onSuccess: () => { refresh(); toast.success('Categoría actualizada'); setEditId(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/insumos/categorias/${id}`),
    onSuccess: () => { refresh(); toast.success('Categoría eliminada'); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al eliminar')
  });

  const handleCreate = () => {
    if (!newForm.nombre.trim()) return toast.error('El nombre es requerido');
    createMut.mutate(newForm);
  };

  const handleUpdate = () => {
    if (!editForm.nombre?.trim()) return toast.error('El nombre es requerido');
    updateMut.mutate(editForm);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card w-full max-w-lg max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-brand-400" />
            <h3 className="text-lg font-semibold text-white">Categorías de Insumos</h3>
            <span className="badge badge-blue text-xs">{categorias.length}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {categorias.map(cat => (
            <div key={cat.id}>
              {editId === cat.id ? (
                /* Modo edición */
                <form
                  onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}
                  className="p-3 bg-gray-800 rounded-xl border border-gray-700 space-y-2"
                >
                  <input
                    className="input text-sm"
                    value={editForm.nombre}
                    onChange={e => setEditForm(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Nombre"
                    autoFocus
                    required
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={editForm.color || '#6b7280'}
                      onChange={e => setEditForm(p => ({ ...p, color: e.target.value }))}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-gray-700 bg-gray-900 p-0.5"
                    />
                    <div
                      className="px-2.5 py-1 rounded-full text-xs font-medium border"
                      style={{ background: `${editForm.color || '#6b7280'}20`, color: editForm.color || '#6b7280', borderColor: `${editForm.color || '#6b7280'}40` }}
                    >
                      {editForm.nombre}
                    </div>
                    <div className="flex gap-2 ml-auto">
                      <button type="submit" disabled={updateMut.isPending} className="btn-primary text-xs px-3 py-1.5">
                        {updateMut.isPending ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button type="button" onClick={() => setEditId(null)} className="btn-secondary text-xs px-3 py-1.5">
                        Cancelar
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                /* Modo vista */
                <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-800/50 transition-colors group">
                  <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                  <span
                    className="badge text-sm px-2.5 py-1"
                    style={{ backgroundColor: `${cat.color}20`, color: cat.color, borderColor: `${cat.color}40` }}
                  >
                    {cat.nombre}
                  </span>
                  <span className="text-xs text-gray-500 capitalize">{cat.tipo}</span>
                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditId(cat.id); setEditForm({ ...cat }); setShowNew(false); }}
                      className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-brand-400 transition-colors"
                      title="Editar"
                    >
                      <Edit size={13} />
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(cat.id)}
                      disabled={deleteMut.isPending}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {categorias.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-6">No hay categorías aún</p>
          )}
        </div>

        {/* Formulario nueva categoría */}
        <div className="mt-4 pt-4 border-t border-gray-800">
          {showNew ? (
            <form
              onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
              className="space-y-3"
            >
              <div>
                <label className="label">Nombre de la categoría</label>
                <input
                  className="input"
                  placeholder="Ej: Flores exóticas, Materiales decorativos..."
                  value={newForm.nombre}
                  onChange={e => setNewForm(p => ({ ...p, nombre: e.target.value }))}
                  autoFocus
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="label mb-0 whitespace-nowrap">Color de etiqueta:</label>
                <input
                  type="color"
                  value={newForm.color}
                  onChange={e => setNewForm(p => ({ ...p, color: e.target.value }))}
                  className="w-10 h-10 rounded-xl cursor-pointer border border-gray-700 bg-gray-800 p-1"
                />
                <div
                  className="px-3 py-1 rounded-full text-xs font-medium border"
                  style={{ background: `${newForm.color}20`, color: newForm.color, borderColor: `${newForm.color}40` }}
                >
                  {newForm.nombre || 'Vista previa'}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={createMut.isPending} className="btn-primary flex-1 justify-center">
                  <Plus size={15} /> {createMut.isPending ? 'Guardando...' : 'Crear Categoría'}
                </button>
                <button type="button" onClick={() => { setShowNew(false); setNewForm({ nombre: '', color: '#10b981' }); }} className="btn-secondary">
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => { setShowNew(true); setEditId(null); }}
              className="btn-secondary w-full justify-center text-sm"
            >
              <Plus size={15} /> Nueva Categoría
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function InsumoModal({ insumo, categorias, proveedores, onClose, onSave }) {
  const [form, setForm] = useState(insumo || {
    nombre: '', categoria_id: categorias[0]?.id || '', proveedor_id: '', unidad: 'tallo',
    stock_actual: 0, stock_minimo: 10, costo_unitario: 0, vida_util_dias: '', codigo: ''
  });

  const [imagenPreview, setImagenPreview] = useState(getImgUrl(insumo?.imagen_url));
  const [imagenUrl, setImagenUrl]         = useState(insumo?.imagen_url || null);
  const [subiendoImg, setSubiendoImg]     = useState(false);
  const fileRef   = useRef(null);
  const camaraRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImagenPreview(URL.createObjectURL(file));
    setSubiendoImg(true);
    try {
      const fd = new FormData();
      fd.append('imagen', file);
      const res = await api.post('/insumos/upload-imagen', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImagenUrl(res.data.url);
    } catch {
      toast.error('Error al subir la imagen');
      setImagenPreview(getImgUrl(insumo?.imagen_url));
      setImagenUrl(insumo?.imagen_url || null);
    } finally {
      setSubiendoImg(false);
    }
  };

  const quitarImagen = () => {
    setImagenPreview(null);
    setImagenUrl(null);
    if (fileRef.current) fileRef.current.value = '';
    if (camaraRef.current) camaraRef.current.value = '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, imagen_url: imagenUrl });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-lg my-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{insumo ? 'Editar Insumo' : 'Nuevo Insumo'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">

          {/* ── Imagen ── */}
          <div>
            <label className="label mb-2 block">Foto del insumo</label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
            <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />

            {imagenPreview ? (
              <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-700 group">
                <img src={imagenPreview} alt="preview" className="w-full h-full object-cover" />
                {subiendoImg && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="btn-secondary text-xs py-1.5 px-3"><ImagePlus size={13} /> Archivo</button>
                  <button type="button" onClick={() => camaraRef.current?.click()}
                    className="btn-secondary text-xs py-1.5 px-3"><Camera size={13} /> Cámara</button>
                  <button type="button" onClick={quitarImagen}
                    className="btn-danger text-xs py-1.5 px-3"><X size={13} /> Quitar</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex-1 h-28 border-2 border-dashed border-gray-700 hover:border-brand-500 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors group">
                  <ImagePlus size={22} className="text-gray-600 group-hover:text-brand-400 transition-colors" />
                  <span className="text-xs text-gray-600 group-hover:text-gray-400">Desde archivo</span>
                </button>
                <button type="button" onClick={() => camaraRef.current?.click()}
                  className="flex-1 h-28 border-2 border-dashed border-gray-700 hover:border-emerald-500 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors group">
                  <Camera size={22} className="text-gray-600 group-hover:text-emerald-400 transition-colors" />
                  <span className="text-xs text-gray-600 group-hover:text-gray-400">Desde cámara</span>
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre *</label>
              <input className="input" required value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="label">Código (opcional)</label>
              <input className="input" placeholder="Ej: R001, GIR-AM"
                value={form.codigo || ''}
                onChange={e => setForm(p => ({ ...p, codigo: e.target.value.toUpperCase() }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoría</label>
              <select className="input" value={form.categoria_id} onChange={e => setForm(p => ({ ...p, categoria_id: e.target.value }))}>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Unidad</label>
              <select className="input" value={form.unidad} onChange={e => setForm(p => ({ ...p, unidad: e.target.value }))}>
                {MOTIVOS_UNIDAD.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Stock actual</label>
              <input className="input" type="number" step="0.01" value={form.stock_actual} onChange={e => setForm(p => ({ ...p, stock_actual: e.target.value }))} />
            </div>
            <div>
              <label className="label">Stock mínimo</label>
              <input className="input" type="number" step="0.01" value={form.stock_minimo} onChange={e => setForm(p => ({ ...p, stock_minimo: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Costo unitario (₡)</label>
              <input className="input" type="number" step="1" value={form.costo_unitario} onChange={e => setForm(p => ({ ...p, costo_unitario: e.target.value }))} />
            </div>
            <div>
              <label className="label">Vida útil (días)</label>
              <input className="input" type="number" placeholder="Solo flores" value={form.vida_util_dias} onChange={e => setForm(p => ({ ...p, vida_util_dias: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Proveedor</label>
            <select className="input" value={form.proveedor_id} onChange={e => setForm(p => ({ ...p, proveedor_id: e.target.value }))}>
              <option value="">Sin proveedor</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={subiendoImg} className="btn-primary flex-1 justify-center disabled:opacity-50">
              {subiendoImg ? 'Subiendo imagen...' : 'Guardar'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function AjusteModal({ insumo, onClose, onSave }) {
  const [ajuste, setAjuste] = useState(0);
  const [notas, setNotas] = useState('');

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-sm">
        <h3 className="text-lg font-semibold text-white mb-2">Ajustar Stock</h3>
        <p className="text-gray-400 text-sm mb-4">{insumo.nombre} — Stock actual: <span className="text-white font-semibold">{parseFloat(insumo.stock_actual)} {insumo.unidad}</span></p>
        <div className="space-y-3">
          <div>
            <label className="label">Ajuste (positivo suma, negativo resta)</label>
            <input className="input" type="number" step="0.01" value={ajuste} onChange={e => setAjuste(e.target.value)} />
            <p className="text-xs text-gray-500 mt-1">Stock resultante: {parseFloat(insumo.stock_actual) + parseFloat(ajuste || 0)} {insumo.unidad}</p>
          </div>
          <div>
            <label className="label">Notas</label>
            <input className="input" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Motivo del ajuste..." />
          </div>
          <div className="flex gap-3">
            <button onClick={() => onSave({ ajuste, notas })} className="btn-primary flex-1 justify-center">Aplicar</button>
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function InsumosPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [ajusteTarget, setAjusteTarget] = useState(null);
  const [showCategorias, setShowCategorias] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busqueda, setBusqueda]           = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');

  const { data: insumos = [] } = useQuery({
    queryKey: ['insumos', busqueda, filtroCategoria],
    queryFn: () => api.get('/insumos', { params: { busqueda: busqueda || undefined, categoria_id: filtroCategoria || undefined } }).then(r => r.data.data)
  });

  const { data: categorias = [] } = useQuery({ queryKey: ['categorias'], queryFn: () => api.get('/insumos/categorias').then(r => r.data.data) });
  const { data: proveedores = [] } = useQuery({ queryKey: ['proveedores'], queryFn: () => api.get('/proveedores').then(r => r.data.data) });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/insumos', data),
    onSuccess: () => { qc.invalidateQueries(['insumos']); toast.success('Insumo creado'); setModal(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/insumos/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['insumos']); toast.success('Insumo actualizado'); setModal(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const ajusteMut = useMutation({
    mutationFn: ({ id, ...data }) => api.post(`/insumos/${id}/ajustar-stock`, data),
    onSuccess: () => { qc.invalidateQueries(['insumos']); toast.success('Stock ajustado'); setAjusteTarget(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error')
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/insumos/${id}`),
    onSuccess: () => { qc.invalidateQueries(['insumos']); toast.success('Insumo eliminado'); setConfirmDeleteId(null); },
    onError: (e) => { toast.error(e.response?.data?.message || 'Error al eliminar'); setConfirmDeleteId(null); }
  });

  const handleSave = (form) => {
    if (form.id) {
      updateMut.mutate(form);
    } else {
      createMut.mutate(form);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Insumos</h1>
          <p className="text-gray-500 text-sm mt-1">Gestión de flores, materiales y empaques</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCategorias(true)} className="btn-secondary">
            <Tag size={15} /> Categorías
          </button>
          <button onClick={() => setModal('nuevo')} className="btn-primary">
            <Plus size={16} /> Nuevo Insumo
          </button>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9" placeholder="Buscar insumo..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {/* Pills de categoría */}
      {categorias.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFiltroCategoria('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!filtroCategoria ? 'bg-brand-600 border-brand-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
            Todos ({insumos.length})
          </button>
          {categorias.map(cat => {
            const count = insumos.filter(i => String(i.categoria_id) === String(cat.id) || i.categoria_nombre === cat.nombre).length;
            const activa = String(filtroCategoria) === String(cat.id);
            return (
              <button key={cat.id}
                onClick={() => setFiltroCategoria(p => String(p) === String(cat.id) ? '' : String(cat.id))}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${activa ? 'text-white' : 'text-gray-400 hover:border-gray-500'}`}
                style={activa
                  ? { backgroundColor: cat.color, borderColor: cat.color }
                  : { borderColor: `${cat.color}40`, color: cat.color }
                }>
                {cat.nombre} {!filtroCategoria && `(${count})`}
              </button>
            );
          })}
        </div>
      )}

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-800">
              <tr>
                <th className="th">Insumo</th>
                <th className="th">Categoría</th>
                <th className="th">Stock</th>
                <th className="th">Costo Unit.</th>
                <th className="th">Vida Útil</th>
                <th className="th">Proveedor</th>
                <th className="th">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {insumos.map(i => {
                const pct = i.stock_minimo > 0 ? (i.stock_actual / i.stock_minimo) * 100 : 100;
                const status = parseFloat(i.stock_actual) === 0 ? 'agotado' : parseFloat(i.stock_actual) <= parseFloat(i.stock_minimo) ? 'bajo' : 'ok';
                return (
                  <tr key={i.id} className="table-row">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        {getImgUrl(i.imagen_url) ? (
                          <img src={getImgUrl(i.imagen_url)} alt={i.nombre}
                            className="w-10 h-10 rounded-lg object-cover border border-gray-700 flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0"
                            style={{ color: i.categoria_color || '#6b7280' }}>
                            <span className="text-lg">🌿</span>
                          </div>
                        )}
                        <div>
                          <p className="text-white font-medium">{i.nombre}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500">{i.unidad}</p>
                            {i.codigo && <span className="text-xs text-brand-500 font-mono">{i.codigo}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      <span className="badge" style={{ backgroundColor: `${i.categoria_color}20`, color: i.categoria_color, borderColor: `${i.categoria_color}40` }}>
                        {i.categoria_nombre}
                      </span>
                    </td>
                    <td className="td w-36">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className={status === 'agotado' ? 'text-red-400 font-semibold' : status === 'bajo' ? 'text-yellow-400' : 'text-white'}>
                            {parseFloat(i.stock_actual)} {i.unidad}
                          </span>
                          <span className="text-gray-500">mín {i.stock_minimo}</span>
                        </div>
                        <StockBar actual={parseFloat(i.stock_actual)} minimo={parseFloat(i.stock_minimo)} />
                      </div>
                    </td>
                    <td className="td">{formatMoney(i.costo_unitario)}</td>
                    <td className="td">
                      {i.vida_util_dias ? (
                        <span className="badge badge-yellow">{i.vida_util_dias} días</span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="td text-gray-400">{i.proveedor_nombre || '—'}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setModal(i)} className="text-gray-400 hover:text-brand-400 transition-colors" title="Editar">
                          <Edit size={15} />
                        </button>
                        <button onClick={() => setAjusteTarget(i)} className="text-gray-400 hover:text-yellow-400 transition-colors text-xs font-medium" title="Ajustar stock">
                          ±Stock
                        </button>
                        {confirmDeleteId === i.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => deleteMut.mutate(i.id)}
                              disabled={deleteMut.isPending}
                              className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors"
                            >
                              Confirmar
                            </button>
                            <span className="text-gray-700">|</span>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(i.id)}
                            className="text-gray-600 hover:text-red-400 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {insumos.length === 0 && (
                <tr><td colSpan={7} className="td text-center text-gray-600 py-8">No se encontraron insumos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showCategorias && <CategoriasModal onClose={() => setShowCategorias(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {(modal === 'nuevo' || (modal && modal.id)) && (
          <InsumoModal
            insumo={modal !== 'nuevo' ? modal : null}
            categorias={categorias}
            proveedores={proveedores}
            onClose={() => setModal(null)}
            onSave={handleSave}
          />
        )}
        {ajusteTarget && (
          <AjusteModal
            insumo={ajusteTarget}
            onClose={() => setAjusteTarget(null)}
            onSave={(data) => ajusteMut.mutate({ id: ajusteTarget.id, ...data })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
