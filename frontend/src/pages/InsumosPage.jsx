import React, { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, Trash2, Tag, X, Camera, ImagePlus, Package, AlertTriangle, CheckCircle, TrendingDown } from 'lucide-react';
import api, { formatMoney } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3002/api').replace('/api', '');
const getImgUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_BASE}${url}`;
};

const UNIDADES = ['tallo', 'unidad', 'bloque', 'metro'];

// ── Categorías Modal ─────────────────────────────────────────────────────────
function CategoriasModal({ onClose }) {
  const qc = useQueryClient();
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ nombre: '', color: '#10b981', tipo: 'flor' });

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias'],
    queryFn: () => api.get('/insumos/categorias').then(r => r.data.data)
  });

  const refresh = () => { qc.invalidateQueries(['categorias']); qc.invalidateQueries(['insumos']); };

  const createMut = useMutation({
    mutationFn: (data) => api.post('/insumos/categorias', data),
    onSuccess: () => { refresh(); toast.success('Categoría creada'); setShowNew(false); setNewForm({ nombre: '', color: '#10b981', tipo: 'flor' }); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al crear categoría')
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

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="card w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Tag size={18} className="text-brand-400" />
            <h3 className="text-lg font-semibold text-white">Categorías</h3>
            <span className="badge badge-blue text-xs">{categorias.length}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {categorias.map(cat => (
            <div key={cat.id}>
              {editId === cat.id ? (
                <form onSubmit={e => { e.preventDefault(); if (!editForm.nombre?.trim()) return; updateMut.mutate(editForm); }}
                  className="p-3 bg-gray-800 rounded-xl border border-gray-700 space-y-2">
                  <input className="input text-sm" value={editForm.nombre} autoFocus required
                    onChange={e => setEditForm(p => ({ ...p, nombre: e.target.value }))} />
                  <div className="flex items-center gap-2">
                    <input type="color" value={editForm.color || '#6b7280'}
                      onChange={e => setEditForm(p => ({ ...p, color: e.target.value }))}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-gray-700 bg-gray-900 p-0.5" />
                    <select className="input text-xs flex-1" value={editForm.tipo || 'otro'}
                      onChange={e => setEditForm(p => ({ ...p, tipo: e.target.value }))}>
                      <option value="flor">🌸 Flor</option>
                      <option value="material">🪢 Material</option>
                      <option value="empaque">📦 Empaque</option>
                      <option value="otro">📌 Otro</option>
                    </select>
                    <div className="flex gap-2 ml-auto">
                      <button type="submit" disabled={updateMut.isPending} className="btn-primary text-xs px-3 py-1.5">Guardar</button>
                      <button type="button" onClick={() => setEditId(null)} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-800/50 transition-colors group">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: cat.color }} />
                  <span className="badge text-sm px-2.5 py-1"
                    style={{ backgroundColor: `${cat.color}20`, color: cat.color, borderColor: `${cat.color}40` }}>
                    {cat.nombre}
                  </span>
                  <span className="text-xs text-gray-500 capitalize">{cat.tipo}</span>
                  <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditId(cat.id); setEditForm({ ...cat }); setShowNew(false); }}
                      className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-brand-400">
                      <Edit size={13} />
                    </button>
                    <button onClick={() => deleteMut.mutate(cat.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {categorias.length === 0 && <p className="text-gray-600 text-sm text-center py-6">Sin categorías</p>}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-800">
          {showNew ? (
            <form onSubmit={e => { e.preventDefault(); if (!newForm.nombre.trim()) return; createMut.mutate(newForm); }} className="space-y-3">
              <input className="input" placeholder="Nombre de la categoría" value={newForm.nombre} autoFocus required
                onChange={e => setNewForm(p => ({ ...p, nombre: e.target.value }))} />
              <div className="flex items-center gap-3">
                <select className="input text-sm flex-1" value={newForm.tipo}
                  onChange={e => setNewForm(p => ({ ...p, tipo: e.target.value }))}>
                  <option value="flor">🌸 Flor</option>
                  <option value="material">🪢 Material</option>
                  <option value="empaque">📦 Empaque</option>
                  <option value="otro">📌 Otro</option>
                </select>
                <input type="color" value={newForm.color}
                  onChange={e => setNewForm(p => ({ ...p, color: e.target.value }))}
                  className="w-10 h-10 rounded-xl cursor-pointer border border-gray-700 bg-gray-800 p-1" />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={createMut.isPending} className="btn-primary flex-1 justify-center">
                  <Plus size={15} /> {createMut.isPending ? 'Creando...' : 'Crear'}
                </button>
                <button type="button" onClick={() => setShowNew(false)} className="btn-secondary">Cancelar</button>
              </div>
            </form>
          ) : (
            <button onClick={() => { setShowNew(true); setEditId(null); }} className="btn-secondary w-full justify-center text-sm">
              <Plus size={15} /> Nueva Categoría
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Modal editar / crear insumo ───────────────────────────────────────────────
function InsumoModal({ insumo, categorias, proveedores, onClose, onSave }) {
  const [form, setForm] = useState(insumo || {
    nombre: '', categoria_id: categorias[0]?.id || '', proveedor_id: '',
    unidad: 'tallo', stock_actual: 0, stock_minimo: 10, costo_unitario: 0,
    vida_util_dias: '', codigo: ''
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
    } finally { setSubiendoImg(false); }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="card w-full max-w-lg my-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">{insumo ? 'Editar insumo' : 'Nuevo insumo'}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <form onSubmit={e => { e.preventDefault(); onSave({ ...form, imagen_url: imagenUrl }); }} className="space-y-4">

          {/* Imagen */}
          <div>
            <label className="label mb-2 block">Foto</label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
            <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
            {imagenPreview ? (
              <div className="relative w-full h-36 rounded-xl overflow-hidden border border-gray-700 group">
                <img src={imagenPreview} alt="preview" className="w-full h-full object-cover" />
                {subiendoImg && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary text-xs py-1.5 px-3"><ImagePlus size={13} /> Archivo</button>
                  <button type="button" onClick={() => camaraRef.current?.click()} className="btn-secondary text-xs py-1.5 px-3"><Camera size={13} /> Cámara</button>
                  <button type="button" onClick={() => { setImagenPreview(null); setImagenUrl(null); }} className="btn-danger text-xs py-1.5 px-3"><X size={13} /> Quitar</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex-1 h-24 border-2 border-dashed border-gray-700 hover:border-brand-500 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors group">
                  <ImagePlus size={20} className="text-gray-600 group-hover:text-brand-400" />
                  <span className="text-xs text-gray-600 group-hover:text-gray-400">Archivo</span>
                </button>
                <button type="button" onClick={() => camaraRef.current?.click()}
                  className="flex-1 h-24 border-2 border-dashed border-gray-700 hover:border-emerald-500 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-colors group">
                  <Camera size={20} className="text-gray-600 group-hover:text-emerald-400" />
                  <span className="text-xs text-gray-600 group-hover:text-gray-400">Cámara</span>
                </button>
              </div>
            )}
          </div>

          {/* Nombre + código */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre *</label>
              <input className="input" required value={form.nombre} onChange={e => set('nombre', e.target.value)} />
            </div>
            <div>
              <label className="label">Código</label>
              <input className="input" placeholder="Ej: R001" value={form.codigo || ''}
                onChange={e => set('codigo', e.target.value.toUpperCase())} />
            </div>
          </div>

          {/* Categoría + unidad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoría</label>
              <select className="input" value={form.categoria_id} onChange={e => set('categoria_id', e.target.value)}>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Unidad</label>
              <select className="input" value={form.unidad} onChange={e => set('unidad', e.target.value)}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Stock actual + mínimo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Cantidad actual</label>
              <input className="input font-bold text-emerald-400" type="number" step="0.01" value={form.stock_actual}
                onChange={e => set('stock_actual', e.target.value)} />
            </div>
            <div>
              <label className="label">Stock mínimo</label>
              <input className="input" type="number" step="0.01" value={form.stock_minimo}
                onChange={e => set('stock_minimo', e.target.value)} />
            </div>
          </div>

          {/* Precio + vida útil */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Precio unitario (₡)</label>
              <input className="input" type="number" step="1" value={form.costo_unitario}
                onChange={e => set('costo_unitario', e.target.value)} />
            </div>
            <div>
              <label className="label">Vida útil (días)</label>
              <input className="input" type="number" placeholder="Solo flores" value={form.vida_util_dias || ''}
                onChange={e => set('vida_util_dias', e.target.value)} />
            </div>
          </div>

          {/* Proveedor */}
          <div>
            <label className="label">Proveedor</label>
            <select className="input" value={form.proveedor_id} onChange={e => set('proveedor_id', e.target.value)}>
              <option value="">Sin proveedor</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={subiendoImg} className="btn-primary flex-1 justify-center disabled:opacity-50">
              {subiendoImg ? 'Subiendo...' : 'Guardar'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Tarjeta de insumo ─────────────────────────────────────────────────────────
function InsumoCard({ insumo, onEdit, onDelete, confirmDeleteId, setConfirmDeleteId }) {
  const stock  = parseFloat(insumo.stock_actual);
  const minimo = parseFloat(insumo.stock_minimo);
  const pct    = minimo > 0 ? Math.min(100, (stock / minimo) * 100) : 100;

  const status = stock === 0 ? 'agotado' : stock <= minimo ? 'bajo' : 'ok';
  const statusConfig = {
    agotado: { label: 'Agotado',      bg: 'bg-red-500/15',    text: 'text-red-400',    bar: 'bg-red-500',    icon: <AlertTriangle size={11} /> },
    bajo:    { label: 'Stock bajo',   bg: 'bg-yellow-500/15', text: 'text-yellow-400', bar: 'bg-yellow-500', icon: <TrendingDown size={11} /> },
    ok:      { label: 'Disponible',   bg: 'bg-emerald-500/15',text: 'text-emerald-400',bar: 'bg-brand-500',  icon: <CheckCircle size={11} /> },
  }[status];

  const imgUrl = getImgUrl(insumo.imagen_url);

  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      className="card p-0 overflow-hidden flex flex-col">

      {/* Imagen o placeholder */}
      <div className="relative h-32 bg-gradient-to-br from-gray-800 to-gray-900 flex-shrink-0">
        {imgUrl ? (
          <img src={imgUrl} alt={insumo.nombre} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl opacity-30">🌿</span>
          </div>
        )}
        {/* Badge de estado */}
        <div className={`absolute top-2 right-2 flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
          {statusConfig.icon}
          {statusConfig.label}
        </div>
        {/* Badge categoría */}
        {insumo.categoria_color && (
          <div className="absolute top-2 left-2">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: `${insumo.categoria_color}30`, color: insumo.categoria_color }}>
              {insumo.categoria_nombre}
            </span>
          </div>
        )}
      </div>

      {/* Contenido */}
      <div className="p-3 flex flex-col flex-1 gap-2">

        {/* Nombre + código */}
        <div>
          <p className="text-white font-semibold text-sm leading-tight">{insumo.nombre}</p>
          {insumo.codigo && <p className="text-xs text-brand-500 font-mono mt-0.5">{insumo.codigo}</p>}
        </div>

        {/* Stock bar */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className={`font-bold tabular-nums ${statusConfig.text}`}>{stock} {insumo.unidad}</span>
            <span className="text-gray-600">mín {minimo}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${statusConfig.bar}`} style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Precio + proveedor */}
        <div className="flex items-center justify-between text-xs text-gray-500 mt-auto">
          <span className="text-white font-medium">{formatMoney(insumo.costo_unitario)}<span className="text-gray-600"> / {insumo.unidad}</span></span>
          {insumo.vida_util_dias && <span className="badge badge-yellow text-xs">{insumo.vida_util_dias}d</span>}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-800/60">
          <button onClick={() => onEdit(insumo)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg py-1.5 transition-colors">
            <Edit size={13} /> Editar
          </button>
          {confirmDeleteId === insumo.id ? (
            <div className="flex items-center gap-1 flex-1 justify-center">
              <button onClick={() => onDelete(insumo.id)}
                className="text-xs font-semibold text-red-400 hover:text-red-300">Eliminar</button>
              <span className="text-gray-700">|</span>
              <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-500 hover:text-gray-300">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDeleteId(insumo.id)}
              className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function InsumosPage() {
  const qc = useQueryClient();
  const [modal, setModal]                   = useState(null);
  const [showCategorias, setShowCategorias] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busqueda, setBusqueda]             = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEstado, setFiltroEstado]     = useState('');

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
  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/insumos/${id}`),
    onSuccess: () => { qc.invalidateQueries(['insumos']); toast.success('Insumo eliminado'); setConfirmDeleteId(null); },
    onError: (e) => { toast.error(e.response?.data?.message || 'Error al eliminar'); setConfirmDeleteId(null); }
  });

  const handleSave = (form) => form.id ? updateMut.mutate(form) : createMut.mutate(form);

  // Estadísticas
  const stats = useMemo(() => {
    const total    = insumos.length;
    const agotados = insumos.filter(i => parseFloat(i.stock_actual) === 0).length;
    const bajos    = insumos.filter(i => parseFloat(i.stock_actual) > 0 && parseFloat(i.stock_actual) <= parseFloat(i.stock_minimo)).length;
    const ok       = total - agotados - bajos;
    const valorTotal = insumos.reduce((s, i) => s + parseFloat(i.stock_actual) * parseFloat(i.costo_unitario), 0);
    return { total, agotados, bajos, ok, valorTotal };
  }, [insumos]);

  // Filtro de estado
  const insumosFiltrados = useMemo(() => {
    if (!filtroEstado) return insumos;
    return insumos.filter(i => {
      const s = parseFloat(i.stock_actual);
      const m = parseFloat(i.stock_minimo);
      if (filtroEstado === 'agotado') return s === 0;
      if (filtroEstado === 'bajo')    return s > 0 && s <= m;
      if (filtroEstado === 'ok')      return s > m;
      return true;
    });
  }, [insumos, filtroEstado]);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventario</h1>
          <p className="text-gray-500 text-sm mt-0.5">Flores, materiales y empaques</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCategorias(true)} className="btn-secondary">
            <Tag size={15} /> Categorías
          </button>
          <button onClick={() => setModal('nuevo')} className="btn-primary">
            <Plus size={16} /> Nuevo
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => setFiltroEstado('')}
          className={`card text-left transition-all hover:border-gray-600 ${!filtroEstado ? 'border-brand-500/50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <Package size={18} className="text-brand-400" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-white tabular-nums">{stats.total}</p>
              <p className="text-xs text-gray-500">Total insumos</p>
            </div>
          </div>
        </button>

        <button onClick={() => setFiltroEstado(filtroEstado === 'ok' ? '' : 'ok')}
          className={`card text-left transition-all hover:border-emerald-500/40 ${filtroEstado === 'ok' ? 'border-emerald-500/50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-emerald-400 tabular-nums">{stats.ok}</p>
              <p className="text-xs text-gray-500">Disponibles</p>
            </div>
          </div>
        </button>

        <button onClick={() => setFiltroEstado(filtroEstado === 'bajo' ? '' : 'bajo')}
          className={`card text-left transition-all hover:border-yellow-500/40 ${filtroEstado === 'bajo' ? 'border-yellow-500/50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-yellow-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <TrendingDown size={18} className="text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-yellow-400 tabular-nums">{stats.bajos}</p>
              <p className="text-xs text-gray-500">Stock bajo</p>
            </div>
          </div>
        </button>

        <button onClick={() => setFiltroEstado(filtroEstado === 'agotado' ? '' : 'agotado')}
          className={`card text-left transition-all hover:border-red-500/40 ${filtroEstado === 'agotado' ? 'border-red-500/50' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={18} className="text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-red-400 tabular-nums">{stats.agotados}</p>
              <p className="text-xs text-gray-500">Agotados</p>
            </div>
          </div>
        </button>
      </div>

      {/* Buscador + filtro categoría */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input pl-9" placeholder="Buscar insumo..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        {categorias.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFiltroCategoria('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!filtroCategoria ? 'bg-brand-600 border-brand-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
              Todas
            </button>
            {categorias.map(cat => {
              const activa = String(filtroCategoria) === String(cat.id);
              return (
                <button key={cat.id} onClick={() => setFiltroCategoria(p => String(p) === String(cat.id) ? '' : String(cat.id))}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors`}
                  style={activa
                    ? { backgroundColor: cat.color, borderColor: cat.color, color: '#fff' }
                    : { borderColor: `${cat.color}40`, color: cat.color }}>
                  {cat.nombre}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Valor total */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {insumosFiltrados.length} insumo{insumosFiltrados.length !== 1 ? 's' : ''}
          {filtroEstado && <span className="ml-1 text-gray-600">· filtrado por estado</span>}
        </p>
        <p className="text-sm text-gray-500">
          Valor en stock: <span className="text-white font-semibold">{formatMoney(stats.valorTotal)}</span>
        </p>
      </div>

      {/* Grid de tarjetas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <AnimatePresence>
          {insumosFiltrados.map(i => (
            <InsumoCard key={i.id} insumo={i}
              onEdit={setModal}
              onDelete={deleteMut.mutate}
              confirmDeleteId={confirmDeleteId}
              setConfirmDeleteId={setConfirmDeleteId}
            />
          ))}
        </AnimatePresence>
        {insumosFiltrados.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-600 gap-3">
            <Package size={40} className="opacity-30" />
            <p className="text-sm">No se encontraron insumos</p>
          </div>
        )}
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
      </AnimatePresence>
    </div>
  );
}
