import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, RefreshCw, ShoppingBag, Edit, Eye, Search,
  Flower2, X, AlertTriangle, TrendingUp, Sparkles,
  ImagePlus, Camera, Trash2
} from 'lucide-react';
import api, { formatMoney, calcularMargen } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3002/api').replace('/api', '');
const getImgUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_BASE}${url}`;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function MargenBadge({ margen, minimo }) {
  const ok  = margen >= minimo;
  const mid = margen >= 15 && margen < minimo;
  if (ok)  return <span className="badge badge-green">{margen.toFixed(1)}%</span>;
  if (mid) return <span className="badge badge-yellow">{margen.toFixed(1)}%</span>;
  return <span className="badge badge-red">{margen.toFixed(1)}%</span>;
}

function MargenBar({ margen, minimo }) {
  const pct   = Math.min(100, Math.max(0, margen));
  const color = margen >= minimo ? '#10b981' : margen >= 15 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-full h-2 bg-gray-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }} />
      <div className="absolute top-0 bottom-0 w-px bg-gray-500 opacity-70"
        style={{ left: `${Math.min(100, minimo)}%` }} />
    </div>
  );
}

// ── Modal ficha técnica (solo lectura) ─────────────────────────────────────

function FichaModal({ arreglo, onClose, onEditar }) {
  if (!arreglo) return null;
  const imgUrl = getImgUrl(arreglo.imagen_url);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-xl my-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{arreglo.nombre}</h3>
            <p className="text-gray-400 text-sm">{arreglo.descripcion}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        {imgUrl && (
          <img src={imgUrl} alt={arreglo.nombre}
            className="w-full h-48 object-cover rounded-xl mb-4 border border-gray-700" />
        )}

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Precio venta', value: formatMoney(arreglo.precio_venta), cls: 'text-white' },
            { label: 'Costo actual',  value: formatMoney(arreglo.costo_actual),  cls: 'text-yellow-400' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-gray-800 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-lg font-bold ${cls}`}>{value}</p>
            </div>
          ))}
          <div className="bg-gray-800 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-2">Margen</p>
            <div className="flex justify-center">
              <MargenBadge margen={arreglo.margen_real || 0} minimo={arreglo.margen_minimo} />
            </div>
          </div>
        </div>

        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ingredientes</h4>
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="th">Insumo</th>
                <th className="th text-right">Cantidad</th>
                <th className="th text-right">Costo/u</th>
                <th className="th text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {arreglo.ingredientes?.map(ing => (
                <tr key={ing.id} className="table-row">
                  <td className="td text-white">{ing.insumo_nombre}</td>
                  <td className="td text-right text-gray-300">{parseFloat(ing.cantidad)} {ing.unidad}</td>
                  <td className="td text-right text-gray-400">{formatMoney(ing.costo_unitario)}</td>
                  <td className="td text-right text-yellow-400">{formatMoney(ing.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-700">
                <td colSpan={3} className="td text-right text-sm font-semibold text-gray-400">Total costo:</td>
                <td className="td text-right font-bold text-yellow-400">{formatMoney(arreglo.costo_actual)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={onEditar} className="btn-secondary flex-1 justify-center text-sm">
            <Edit size={14} /> Editar arreglo
          </button>
          <button onClick={onClose} className="btn-primary flex-1 justify-center text-sm">Cerrar</button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Modal crear / editar arreglo ───────────────────────────────────────────

function ArregloModal({ arreglo, insumos, onClose, onSave, isPending }) {
  const esEdicion = !!arreglo?.id;
  const fileRef   = useRef(null);

  const [form, setForm] = useState({
    nombre:             arreglo?.nombre          ?? '',
    descripcion:        arreglo?.descripcion     ?? '',
    categoria:          arreglo?.categoria       ?? 'General',
    margen_minimo:      arreglo?.margen_minimo   ?? 30,
    disponible_externo: arreglo?.disponible_externo !== false,
    codigo:             arreglo?.codigo          ?? '',
  });

  const [ingredientes, setIngredientes] = useState(
    arreglo?.ingredientes?.map(i => ({
      insumo_id:      i.insumo_id,
      nombre:         i.insumo_nombre,
      unidad:         i.unidad,
      costo_unitario: parseFloat(i.costo_unitario),
      cantidad:       Math.round(parseFloat(i.cantidad)),
    })) ?? []
  );

  // Imagen
  const [imagenFile,    setImagenFile]    = useState(null);   // File object
  const [imagenPreview, setImagenPreview] = useState(        // URL para preview
    getImgUrl(arreglo?.imagen_url)
  );
  const [imagenUrl,     setImagenUrl]     = useState(arreglo?.imagen_url ?? null); // URL guardada

  // Selector de ingrediente
  const [buscarIns, setBuscarIns] = useState('');
  const [insumoSel, setInsumoSel] = useState(null);
  const [cantTemp,  setCantTemp]  = useState(1);
  const [showDrop,  setShowDrop]  = useState(false);

  // Precio
  const [precioVenta,  setPrecioVenta]  = useState(parseFloat(arreglo?.precio_venta) || 0);
  const [precioManual, setPrecioManual] = useState(!!arreglo?.id);

  const costoTotal = useMemo(
    () => ingredientes.reduce((s, i) => s + i.cantidad * i.costo_unitario, 0),
    [ingredientes]
  );

  const precioSugerido = useMemo(() => {
    if (costoTotal <= 0) return 0;
    const m = parseFloat(form.margen_minimo) / 100;
    return Math.ceil(costoTotal / (1 - m) / 100) * 100;
  }, [costoTotal, form.margen_minimo]);

  const margenReal = useMemo(
    () => calcularMargen(precioVenta, costoTotal),
    [precioVenta, costoTotal]
  );

  useEffect(() => {
    if (!precioManual && precioSugerido > 0) setPrecioVenta(precioSugerido);
  }, [precioSugerido, precioManual]);

  const insumosFiltrados = insumos.filter(i =>
    !buscarIns || i.nombre.toLowerCase().includes(buscarIns.toLowerCase())
  ).slice(0, 8);

  // Manejo de imagen
  const handleImagenChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImagenFile(file);
    setImagenPreview(URL.createObjectURL(file));
  };

  const quitarImagen = () => {
    setImagenFile(null);
    setImagenPreview(null);
    setImagenUrl(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Agregar ingrediente
  const agregarIngrediente = () => {
    if (!insumoSel || cantTemp < 1) return;
    const cant = Math.max(1, Math.round(cantTemp));
    setIngredientes(prev => {
      const existe = prev.find(i => i.insumo_id === insumoSel.id);
      if (existe) {
        return prev.map(i => i.insumo_id === insumoSel.id
          ? { ...i, cantidad: i.cantidad + cant }
          : i
        );
      }
      return [...prev, {
        insumo_id:      insumoSel.id,
        nombre:         insumoSel.nombre,
        unidad:         insumoSel.unidad,
        costo_unitario: parseFloat(insumoSel.costo_unitario),
        cantidad:       cant,
      }];
    });
    setInsumoSel(null);
    setBuscarIns('');
    setCantTemp(1);
    setShowDrop(false);
  };

  const cambiarCantidad = (insumo_id, valor) => {
    const v = Math.max(0, Math.round(Number(valor)));
    if (v === 0) {
      setIngredientes(prev => prev.filter(i => i.insumo_id !== insumo_id));
    } else {
      setIngredientes(prev => prev.map(i => i.insumo_id === insumo_id ? { ...i, cantidad: v } : i));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return toast.error('Escribe un nombre para el arreglo');
    if (precioVenta <= 0)    return toast.error('El precio de venta debe ser mayor a 0');

    let urlFinal = imagenUrl;

    // Subir imagen si hay una nueva
    if (imagenFile) {
      try {
        const fd = new FormData();
        fd.append('imagen', imagenFile);
        const res = await api.post('/catalogo/upload-imagen', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        urlFinal = res.data.url;
      } catch (err) {
        toast.error('Error al subir la imagen');
        return;
      }
    }

    onSave({
      ...form,
      precio_venta:   precioVenta,
      margen_minimo:  parseFloat(form.margen_minimo),
      imagen_url:     urlFinal,
      ingredientes:   ingredientes.map(i => ({ insumo_id: i.insumo_id, cantidad: i.cantidad })),
      ...(esEdicion && { id: arreglo.id }),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="card w-full max-w-2xl my-4">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">
            {esEdicion ? 'Editar arreglo' : 'Nuevo arreglo'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Imagen ── */}
          <div>
            <label className="label mb-2 block">Imagen del arreglo</label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
              className="hidden" onChange={handleImagenChange} />

            {imagenPreview ? (
              <div className="relative w-full h-44 rounded-xl overflow-hidden border border-gray-700 group">
                <img src={imagenPreview} alt="preview"
                  className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="btn-secondary text-xs py-1.5 px-3">
                    <Camera size={13} /> Cambiar
                  </button>
                  <button type="button" onClick={quitarImagen}
                    className="btn-danger text-xs py-1.5 px-3">
                    <X size={13} /> Quitar
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full h-36 border-2 border-dashed border-gray-700 hover:border-brand-500 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors group">
                <ImagePlus size={28} className="text-gray-600 group-hover:text-brand-400 transition-colors" />
                <p className="text-sm text-gray-600 group-hover:text-gray-400 transition-colors">
                  Clic para subir imagen
                </p>
                <p className="text-xs text-gray-700">JPG, PNG o WEBP · máx 5MB</p>
              </button>
            )}
          </div>

          {/* ── Info básica ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Nombre del arreglo *</label>
              <input className="input" required placeholder="Ej: Arreglo Romance #5"
                value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="label">Código (opcional)</label>
              <input className="input" placeholder="Ej: ROM-01, F001, RAMO-ROSAS"
                value={form.codigo} onChange={e => setForm(p => ({ ...p, codigo: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label className="label">Categoría</label>
              <input className="input" placeholder="Románticos, Ramos, Eventos..."
                value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} />
            </div>
            <div>
              <label className="label">Margen mínimo (%)</label>
              <input className="input" type="number" min="0" max="100"
                value={form.margen_minimo}
                onChange={e => setForm(p => ({ ...p, margen_minimo: Number(e.target.value) }))} />
            </div>
            <div className="col-span-2">
              <label className="label">Descripción</label>
              <textarea className="input resize-none" rows={2}
                placeholder="Descripción del arreglo..."
                value={form.descripcion}
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} />
            </div>
          </div>

          {/* ── Ingredientes ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Flower2 size={15} className="text-brand-400" />
              <h4 className="text-sm font-semibold text-white">Ingredientes del arreglo</h4>
              {ingredientes.length > 0 && (
                <span className="ml-auto text-xs text-gray-500">{ingredientes.length} insumo(s)</span>
              )}
            </div>

            {/* Buscador */}
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  className="input pl-9 text-sm"
                  placeholder="Buscar flor o material..."
                  value={buscarIns}
                  onChange={e => { setBuscarIns(e.target.value); setShowDrop(true); setInsumoSel(null); }}
                  onFocus={() => setShowDrop(true)}
                />
                <AnimatePresence>
                  {showDrop && insumosFiltrados.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden z-10 shadow-xl">
                      {insumosFiltrados.map(ins => (
                        <button key={ins.id} type="button"
                          onClick={() => { setInsumoSel(ins); setBuscarIns(ins.nombre); setShowDrop(false); }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-700 transition-colors flex items-center justify-between">
                          <div>
                            <span className="text-white">{ins.nombre}</span>
                            <span className="text-gray-500 text-xs ml-2">{ins.categoria_nombre}</span>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <span className="text-yellow-400 text-xs">{formatMoney(ins.costo_unitario)}/{ins.unidad}</span>
                            <span className="text-gray-600 text-xs ml-2">Stock: {parseFloat(ins.stock_actual)}</span>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Cantidad — solo enteros */}
              <input
                type="number" min="1" step="1"
                className="input w-24 text-sm text-center"
                placeholder="Cant."
                value={cantTemp}
                onChange={e => setCantTemp(Math.max(1, Math.round(Number(e.target.value))))}
              />
              <button type="button" onClick={agregarIngrediente}
                disabled={!insumoSel}
                className="btn-primary px-4 text-sm disabled:opacity-40">
                <Plus size={15} />
              </button>
            </div>

            {insumoSel && (
              <p className="text-xs text-brand-400 mb-2 ml-1">
                Seleccionado: <strong>{insumoSel.nombre}</strong> — {formatMoney(insumoSel.costo_unitario)}/{insumoSel.unidad}
              </p>
            )}

            {ingredientes.length > 0 ? (
              <div className="rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/50">
                      <th className="th">Insumo</th>
                      <th className="th text-center">Cantidad</th>
                      <th className="th text-right">Costo/u</th>
                      <th className="th text-right">Subtotal</th>
                      <th className="th w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredientes.map(ing => (
                      <tr key={ing.insumo_id} className="table-row">
                        <td className="td">
                          <p className="text-white text-sm">{ing.nombre}</p>
                          <p className="text-xs text-gray-500">{ing.unidad}</p>
                        </td>
                        <td className="td">
                          <input
                            type="number" min="1" step="1"
                            className="input w-20 text-sm text-center mx-auto block py-1"
                            value={ing.cantidad}
                            onChange={e => cambiarCantidad(ing.insumo_id, e.target.value)}
                          />
                        </td>
                        <td className="td text-right text-gray-400 text-sm">
                          {formatMoney(ing.costo_unitario)}
                        </td>
                        <td className="td text-right text-yellow-400 font-medium text-sm">
                          {formatMoney(ing.cantidad * ing.costo_unitario)}
                        </td>
                        <td className="td">
                          <button type="button"
                            onClick={() => setIngredientes(p => p.filter(i => i.insumo_id !== ing.insumo_id))}
                            className="text-gray-600 hover:text-red-400 transition-colors">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-700 bg-gray-900/30">
                      <td colSpan={3} className="td text-right text-sm font-semibold text-gray-400">
                        Costo total:
                      </td>
                      <td className="td text-right font-bold text-yellow-400">
                        {formatMoney(costoTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="border border-dashed border-gray-700 rounded-xl p-6 text-center">
                <Flower2 size={24} className="text-gray-700 mx-auto mb-2" />
                <p className="text-gray-600 text-sm">
                  Busca y agrega las flores e insumos que lleva este arreglo
                </p>
              </div>
            )}
          </div>

          {/* ── Precio ── */}
          <div className="bg-gray-800/60 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <TrendingUp size={15} className="text-brand-400" /> Precio y margen
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Precio de venta (₡)</label>
                <input
                  className="input text-brand-400 font-bold text-base"
                  type="number" min="0" step="100"
                  value={precioVenta || ''}
                  onChange={e => { setPrecioVenta(Number(e.target.value)); setPrecioManual(true); }}
                />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <Sparkles size={12} className="text-yellow-400" /> Precio sugerido
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-yellow-400 font-semibold text-base">
                    {formatMoney(precioSugerido)}
                  </span>
                  {precioManual && precioSugerido > 0 && (
                    <button type="button"
                      onClick={() => { setPrecioVenta(precioSugerido); setPrecioManual(false); }}
                      className="text-xs text-brand-400 hover:text-brand-300 underline">
                      Usar éste
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-600 mt-0.5">Con margen {form.margen_minimo}%</p>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-500">Margen real</span>
                <span className={`font-semibold ${
                  margenReal >= form.margen_minimo ? 'text-emerald-400' :
                  margenReal >= 15 ? 'text-yellow-400' : 'text-red-400'
                }`}>{margenReal.toFixed(1)}%</span>
              </div>
              <MargenBar margen={margenReal} minimo={parseFloat(form.margen_minimo)} />
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>0%</span>
                <span className="text-gray-500">mín {form.margen_minimo}%</span>
                <span>100%</span>
              </div>
              {costoTotal > 0 && margenReal < form.margen_minimo && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-yellow-500">
                  <AlertTriangle size={12} />
                  El margen está por debajo del mínimo configurado
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" id="disp-ext" className="rounded"
                checked={form.disponible_externo}
                onChange={e => setForm(p => ({ ...p, disponible_externo: e.target.checked }))} />
              <label htmlFor="disp-ext" className="text-sm text-gray-400 cursor-pointer">
                Disponible en canales externos (WhatsApp, app)
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isPending}
              className="btn-primary flex-1 justify-center">
              {isPending ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear arreglo'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
              Cancelar
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Página principal ───────────────────────────────────────────────────────

export default function CatalogPage() {
  const qc = useQueryClient();
  const [fichaModal,     setFichaModal]     = useState(null);
  const [editModal,      setEditModal]      = useState(null);
  const [busqueda,       setBusqueda]       = useState('');
  const [confirmarBorrar, setConfirmarBorrar] = useState(null);

  const { data: catalogo = [] } = useQuery({
    queryKey: ['catalogo'],
    queryFn: () => api.get('/catalogo').then(r => r.data.data),
  });

  const { data: fichaDetalle } = useQuery({
    queryKey: ['catalogo-ficha', fichaModal?.id],
    queryFn: () => api.get(`/catalogo/${fichaModal.id}`).then(r => r.data.data),
    enabled: !!fichaModal,
  });

  const { data: insumos = [] } = useQuery({
    queryKey: ['insumos'],
    queryFn: () => api.get('/insumos').then(r => r.data.data),
  });

  const { data: arregloParaEditar } = useQuery({
    queryKey: ['catalogo-ficha-edit', editModal?.id],
    queryFn: () => api.get(`/catalogo/${editModal.id}`).then(r => r.data.data),
    enabled: !!editModal?.id,
  });

  const recalcularMut = useMutation({
    mutationFn: () => api.post('/catalogo/recalcular-costos'),
    onSuccess: (res) => {
      qc.invalidateQueries(['catalogo']);
      const { alertas } = res.data.data;
      if (alertas.length > 0) toast.error(`${alertas.length} arreglos con margen bajo`);
      else toast.success('Costos recalculados. Todos los márgenes están bien.');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error'),
  });

  const createMut = useMutation({
    mutationFn: (data) => api.post('/catalogo', data),
    onSuccess: () => {
      qc.invalidateQueries(['catalogo']);
      toast.success('Arreglo creado correctamente');
      setEditModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al crear'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/catalogo/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries(['catalogo']);
      qc.invalidateQueries(['catalogo-ficha']);
      toast.success('Arreglo actualizado');
      setEditModal(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al actualizar'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/catalogo/${id}`),
    onSuccess: () => {
      qc.invalidateQueries(['catalogo']);
      toast.success('Arreglo eliminado correctamente');
      setConfirmarBorrar(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al eliminar'),
  });

  const handleSave = (data) => {
    if (data.id) updateMut.mutate(data);
    else createMut.mutate(data);
  };

  const catalogoFiltrado = catalogo.filter(a =>
    !busqueda || a.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Catálogo</h1>
          <p className="text-gray-500 text-sm mt-1">Arreglos, fichas técnicas y precios</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => recalcularMut.mutate()} disabled={recalcularMut.isPending}
            className="btn-secondary">
            <RefreshCw size={15} className={recalcularMut.isPending ? 'animate-spin' : ''} />
            Recalcular costos
          </button>
          <button onClick={() => setEditModal('nuevo')} className="btn-primary">
            <Plus size={16} /> Nuevo arreglo
          </button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9" placeholder="Buscar arreglo..."
          value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {catalogoFiltrado.map(a => {
          const costo  = parseFloat(a.costo_actual || a.costo_calculado || 0);
          const precio = parseFloat(a.precio_venta);
          const margen = a.margen_real !== undefined ? a.margen_real : calcularMargen(precio, costo);
          const imgUrl = getImgUrl(a.imagen_url);

          return (
            <motion.div key={a.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className={`card hover:border-brand-600/30 transition-colors ${!a.activo ? 'opacity-50' : ''}`}>

              {/* Imagen o placeholder */}
              {imgUrl ? (
                <img src={imgUrl} alt={a.nombre}
                  className="w-full h-36 object-cover rounded-xl mb-4 border border-gray-700" />
              ) : (
                <div className="w-full h-36 bg-gradient-to-br from-brand-900/30 to-gray-800 rounded-xl mb-4 flex items-center justify-center relative border border-gray-800">
                  <Flower2 size={32} className="text-brand-400/40" />
                  {!a.activo && (
                    <span className="absolute top-2 right-2 badge badge-red text-xs">Inactivo</span>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white leading-tight">{a.nombre}</h3>
                    {a.codigo && <span className="text-xs text-brand-500 font-mono">{a.codigo}</span>}
                  </div>
                  <MargenBadge margen={margen} minimo={parseFloat(a.margen_minimo)} />
                </div>
                <p className="text-xs text-gray-500">{a.categoria}</p>

                <div className="flex justify-between items-end pt-1">
                  <div>
                    <p className="text-xl font-bold text-white">{formatMoney(a.precio_venta)}</p>
                    <p className="text-xs text-gray-500">
                      Costo: <span className="text-yellow-400">{formatMoney(costo)}</span>
                    </p>
                  </div>
                  {a.alerta_margen && (
                    <AlertTriangle size={16} className="text-yellow-400 mb-1 flex-shrink-0"
                      title="Margen bajo" />
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button onClick={() => setFichaModal(a)}
                    className="btn-secondary flex-1 justify-center text-xs py-1.5">
                    <Eye size={13} /> Ver ficha
                  </button>
                  <button onClick={() => setEditModal(a)}
                    className="btn-secondary flex-1 justify-center text-xs py-1.5">
                    <Edit size={13} /> Editar
                  </button>
                  <button onClick={() => setConfirmarBorrar(a)}
                    className="btn-danger justify-center text-xs py-1.5 px-3">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}

        {catalogoFiltrado.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-600">
            {busqueda
              ? 'No se encontraron arreglos con esa búsqueda'
              : 'No hay arreglos en el catálogo aún'}
          </div>
        )}
      </div>

      <AnimatePresence>
        {fichaModal && fichaDetalle && (
          <FichaModal
            arreglo={fichaDetalle}
            onClose={() => setFichaModal(null)}
            onEditar={() => { setEditModal(fichaModal); setFichaModal(null); }}
          />
        )}
        {editModal && (
          <ArregloModal
            arreglo={editModal === 'nuevo' ? null : (arregloParaEditar || editModal)}
            insumos={insumos}
            onClose={() => setEditModal(null)}
            onSave={handleSave}
            isPending={isPending}
          />
        )}
        {confirmarBorrar && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="card w-full max-w-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={18} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Eliminar arreglo</h3>
                  <p className="text-sm text-gray-400">Esta acción no se puede deshacer</p>
                </div>
              </div>
              <p className="text-sm text-gray-300 mb-5">
                ¿Segura que quieres eliminar <span className="text-white font-semibold">"{confirmarBorrar.nombre}"</span>?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => deleteMut.mutate(confirmarBorrar.id)}
                  disabled={deleteMut.isPending}
                  className="btn-danger flex-1 justify-center">
                  {deleteMut.isPending ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
                <button onClick={() => setConfirmarBorrar(null)} className="btn-secondary flex-1 justify-center">
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
