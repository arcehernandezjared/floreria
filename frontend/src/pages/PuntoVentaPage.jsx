import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart, Search, Plus, Minus, Trash2, CheckCircle, Flower2,
  User, Tag, X, Leaf, LayoutGrid, Printer, Mail, Send, AtSign, Layers, Wand2,
  Camera, ImagePlus, Wallet, Banknote, CreditCard, Smartphone, ClipboardList
} from 'lucide-react';
import jsPDF from 'jspdf';
import api, { formatMoney } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3002/api').replace('/api', '');
const getImgUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${BACKEND_BASE}${url}`;
};

const CANALES = [
  { value: 'mostrador', label: 'Mostrador' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'externo',   label: 'App Externa' },
];

const FORMAS_PAGO = [
  { value: 'efectivo', label: 'Efectivo', Icon: Banknote },
  { value: 'tarjeta',  label: 'Tarjeta',  Icon: CreditCard },
  { value: 'sinpe',    label: 'Sinpe',    Icon: Smartphone },
];

const TIPO_COLOR = {
  flor:     'text-pink-400',
  material: 'text-yellow-400',
  empaque:  'text-purple-400',
  otro:     'text-gray-400',
};

function fmtCRC(n) {
  return `CRC ${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtQty(n) {
  const v = parseFloat(n);
  if (Math.abs(v - 1) < 0.01) return '1';
  if (Math.abs(v - 0.5) < 0.01) return '½';
  if (Math.abs(v - 1 / 3) < 0.02) return '⅓';
  return parseFloat(v.toFixed(2)).toString();
}

function generarReciboPOS(snap) {
  const { numero, items, cliente, canal, descuento, subtotalProductos, manoDeObra, subtotal, descuentoMonto, total, pagos, fecha } = snap;
  const canalLabel = (CANALES.find(c => c.value === canal)?.label || canal || '').toUpperCase();

  // Formato ticket térmico 80mm — monocromo, monoespaciado, estilo punto de venta
  const W = 80;
  const doc = new jsPDF({ unit: 'mm', format: [W, 250], orientation: 'portrait' });

  const M = 4;
  const R = W - M;
  let y = 8;

  doc.setFont('courier', 'normal');
  doc.setTextColor(0, 0, 0);

  const dashed = () => {
    doc.setLineDashPattern([0.7, 0.7], 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(M, y, R, y);
    doc.setLineDashPattern([], 0);
    y += 4.5;
  };

  // ── Encabezado ──────────────────────────────────────────────────────────
  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.text('FLORISTERIA ALMA', W / 2, y, { align: 'center' }); y += 4.2;
  doc.text('CARIBE\xD1A', W / 2, y, { align: 'center' }); y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.text('Siquirres, Lim\xF3n, Costa Rica', W / 2, y, { align: 'center' }); y += 3.6;
  doc.text('WhatsApp/IG: @almacaribe\xF1a', W / 2, y, { align: 'center' }); y += 4.5;

  dashed();

  // ── Datos del comprobante ─────────────────────────────────────────────────
  doc.setFontSize(7.5);
  doc.setFont('courier', 'bold');
  doc.text('RECIBO DE VENTA', M, y);
  doc.setFont('courier', 'normal');
  doc.text(numero, R, y, { align: 'right' }); y += 4;
  doc.text(fecha, M, y);
  doc.text(canalLabel, R, y, { align: 'right' }); y += 4;

  const clienteLabel = cliente && cliente !== 'Cliente mostrador' ? cliente : null;
  if (clienteLabel) {
    doc.text(`Cliente: ${clienteLabel}`, M, y); y += 4;
  }

  dashed();

  // ── Detalle (multi-item) ───────────────────────────────────────────────────
  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  doc.text('DESCRIPCION', M, y);
  doc.text('TOTAL', R, y, { align: 'right' }); y += 4;

  items.forEach(i => {
    const precioU = i.tipo === 'insumo' ? i.precio_unitario : i.precio_venta;
    const nombre  = i.nombre + (i.tipo === 'insumo' ? ' (suelta)' : '');
    const lineas  = doc.splitTextToSize(nombre, R - M - 2);

    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    lineas.forEach((linea, idx) => {
      doc.text(linea, M, y);
      if (idx === 0) doc.text(fmtCRC(precioU * i.cantidad), R, y, { align: 'right' });
      y += 4;
    });
    doc.setFontSize(7);
    doc.text(`  ${fmtQty(i.cantidad)} x ${fmtCRC(precioU)}`, M, y); y += 4.5;
  });

  dashed();

  // ── Subtotal, mano de obra, descuento y total ─────────────────────────────
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.text('SUBTOTAL', M, y);
  doc.text(fmtCRC(subtotalProductos ?? subtotal), R, y, { align: 'right' }); y += 4.5;

  if (manoDeObra > 0) {
    doc.text('MANO DE OBRA', M, y);
    doc.text(fmtCRC(manoDeObra), R, y, { align: 'right' }); y += 4.5;
  }

  if (descuento > 0) {
    doc.text(`DESCUENTO (${descuento}%)`, M, y);
    doc.text(`-${fmtCRC(descuentoMonto)}`, R, y, { align: 'right' }); y += 4.5;
  }

  y += 1.5;
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL', M, y);
  doc.text(fmtCRC(total), R, y, { align: 'right' }); y += 5.5;

  if (pagos && pagos.length > 0) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    const FORMAS_LABEL = { efectivo: 'EFECTIVO', tarjeta: 'TARJETA', sinpe: 'SINPE' };
    pagos.forEach(p => {
      doc.text(`PAGO ${FORMAS_LABEL[p.metodo] || p.metodo.toUpperCase()}`, M, y);
      doc.text(fmtCRC(p.monto), R, y, { align: 'right' }); y += 4;
    });
    y += 1.5;
  }

  dashed();

  // ── Pie ────────────────────────────────────────────────────────────────────
  doc.setFont('courier', 'bold');
  doc.setFontSize(8.5);
  doc.text('GRACIAS POR SU COMPRA', W / 2, y, { align: 'center' }); y += 5;
  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.text('Floristeria Alma Caribe\xF1a', W / 2, y, { align: 'center' }); y += 3.5;
  doc.text('Flores con alma', W / 2, y, { align: 'center' }); y += 6;

  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
}

function EmailReciboInput({ defaultEmail, onEnviar, enviando }) {
  const [email, setEmail] = useState(defaultEmail || '');
  const [sent, setSent]   = useState(false);

  const handleSend = async () => {
    if (!email) return;
    await onEnviar(email);
    setSent(true);
  };

  if (sent) return (
    <p className="text-xs text-emerald-400 text-center py-1">Recibo enviado a {email}</p>
  );

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Mail size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <input type="email" className="input w-full pl-8 text-xs py-2"
          placeholder="Enviar recibo por email (opcional)"
          value={email} onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()} />
      </div>
      <button onClick={handleSend} disabled={!email || enviando}
        className="btn-secondary px-3 py-2 text-xs flex-shrink-0">
        {enviando ? '...' : <Send size={13} />}
      </button>
    </div>
  );
}

function ArregloPersonalizadoModal({ insumos, onClose, onVender, isPending }) {
  const [nombre, setNombre]       = useState('Arreglo personalizado');
  const [precio, setPrecio]       = useState('');
  const [ingredientes, setIngredientes] = useState([]);
  const [guardar, setGuardar]     = useState(false);
  const [categoria, setCategoria] = useState('General');
  const [buscar, setBuscar]       = useState('');
  const [insumoSel, setInsumoSel] = useState(null);
  const [cant, setCant]           = useState(1);
  const [showDrop, setShowDrop]   = useState(false);
  const [imagenPreview, setImagenPreview] = useState(null);
  const [imagenFile, setImagenFile]       = useState(null);
  const [subiendo, setSubiendo]           = useState(false);
  const fileRef = useRef(null);

  const insumosFiltrados = insumos.filter(i =>
    buscar && i.nombre.toLowerCase().includes(buscar.toLowerCase()) && parseFloat(i.stock_actual) > 0
  ).slice(0, 8);

  const costo = ingredientes.reduce((s, i) => s + i.cantidad * parseFloat(i.costo_unitario), 0);

  const agregar = () => {
    if (!insumoSel) return;
    setIngredientes(prev => {
      const existe = prev.find(i => i.insumo_id === insumoSel.id);
      if (existe) return prev.map(i => i.insumo_id === insumoSel.id ? { ...i, cantidad: i.cantidad + cant } : i);
      return [...prev, { insumo_id: insumoSel.id, nombre: insumoSel.nombre, unidad: insumoSel.unidad, costo_unitario: insumoSel.costo_unitario, cantidad: cant }];
    });
    setInsumoSel(null); setBuscar(''); setCant(1); setShowDrop(false);
  };

  const handleImagenChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImagenFile(file);
    setImagenPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (ingredientes.length === 0) return toast.error('Agrega al menos un ingrediente');
    if (!precio || parseFloat(precio) <= 0) return toast.error('Escribe el precio de venta');

    let imagen_url = null;
    if (imagenFile) {
      setSubiendo(true);
      try {
        const fd = new FormData();
        fd.append('imagen', imagenFile);
        const res = await api.post('/catalogo/upload-imagen', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        imagen_url = res.data.url;
      } catch {
        toast.error('Error al subir la imagen');
        setSubiendo(false);
        return;
      }
      setSubiendo(false);
    }

    onVender({
      ingredientes: ingredientes.map(i => ({ insumo_id: i.insumo_id, cantidad: i.cantidad })),
      precio_venta: parseFloat(precio),
      nombre_arreglo: nombre,
      guardar_catalogo: guardar,
      categoria,
      imagen_url,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="card w-full max-w-lg my-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-brand-400" />
            <h3 className="text-lg font-semibold text-white">Arreglo a medida</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Imagen */}
          <div>
            <label className="label mb-2 block">Foto del arreglo (opcional)</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImagenChange} />
            {imagenPreview ? (
              <div className="relative w-full h-40 rounded-xl overflow-hidden border border-gray-700 group">
                <img src={imagenPreview} alt="preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="btn-secondary text-xs py-1.5 px-3"><Camera size={13} /> Cambiar</button>
                  <button type="button" onClick={() => { setImagenFile(null); setImagenPreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="btn-danger text-xs py-1.5 px-3"><X size={13} /> Quitar</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full h-32 border-2 border-dashed border-gray-700 hover:border-brand-500 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors group">
                <ImagePlus size={24} className="text-gray-600 group-hover:text-brand-400 transition-colors" />
                <p className="text-sm text-gray-600 group-hover:text-gray-400 transition-colors">
                  Tomar foto o cargar imagen
                </p>
                <p className="text-xs text-gray-700">JPG, PNG o WEBP</p>
              </button>
            )}
          </div>

          {/* Nombre */}
          <div>
            <label className="label">Nombre del arreglo</label>
            <input className="input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Arreglo personalizado" />
          </div>

          {/* Buscador de ingredientes */}
          <div>
            <label className="label mb-2 block">Ingredientes</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input className="input pl-9 text-sm" placeholder="Buscar flor o insumo..."
                  value={buscar}
                  onChange={e => { setBuscar(e.target.value); setShowDrop(true); setInsumoSel(null); }}
                  onFocus={() => setShowDrop(true)} />
                <AnimatePresence>
                  {showDrop && insumosFiltrados.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden z-20 shadow-xl">
                      {insumosFiltrados.map(ins => (
                        <button key={ins.id} type="button"
                          onClick={() => { setInsumoSel(ins); setBuscar(ins.nombre); setShowDrop(false); }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-700 flex items-center justify-between">
                          <span className="text-white">{ins.nombre}</span>
                          <span className="text-xs text-gray-500">{parseFloat(ins.stock_actual)} {ins.unidad} disponible</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" onClick={() => setCant(c => Math.max(1, c - 1))}
                  className="w-8 h-9 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg flex items-center justify-center select-none">−</button>
                <span className="w-8 text-center text-white font-bold text-sm tabular-nums">{cant}</span>
                <button type="button" onClick={() => setCant(c => c + 1)}
                  className="w-8 h-9 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg flex items-center justify-center select-none">+</button>
              </div>
              <button type="button" onClick={agregar} disabled={!insumoSel}
                className="btn-primary px-4 disabled:opacity-40"><Plus size={15} /></button>
            </div>

            {ingredientes.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {ingredientes.map(ing => (
                  <div key={ing.insumo_id} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm">{ing.nombre}</span>
                      <span className="text-xs text-gray-500">{ing.unidad}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <button type="button"
                          onClick={() => setIngredientes(prev => prev.map(i => i.insumo_id === ing.insumo_id ? { ...i, cantidad: Math.max(1, i.cantidad - 1) } : i))}
                          className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold flex items-center justify-center select-none">−</button>
                        <span className="w-7 text-center text-white font-bold text-sm tabular-nums">{ing.cantidad}</span>
                        <button type="button"
                          onClick={() => setIngredientes(prev => prev.map(i => i.insumo_id === ing.insumo_id ? { ...i, cantidad: i.cantidad + 1 } : i))}
                          className="w-7 h-7 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-bold flex items-center justify-center select-none">+</button>
                      </div>
                      <button type="button" onClick={() => setIngredientes(prev => prev.filter(i => i.insumo_id !== ing.insumo_id))}
                        className="text-gray-600 hover:text-red-400"><X size={13} /></button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-xs text-gray-500 px-1">
                  <span>Costo estimado</span>
                  <span className="text-yellow-400 font-medium">{formatMoney(Math.round(costo))}</span>
                </div>
              </div>
            )}
          </div>

          {/* Precio */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Precio de venta (₡) *</label>
              <input className="input font-bold text-brand-400" type="number" step="100" placeholder="0"
                value={precio} onChange={e => setPrecio(e.target.value)} required />
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded" checked={guardar}
                  onChange={e => setGuardar(e.target.checked)} />
                <span className="text-sm text-gray-300">Guardar en catálogo</span>
              </label>
              {guardar && (
                <input className="input text-sm mt-2" placeholder="Categoría (ej: Románticos)"
                  value={categoria} onChange={e => setCategoria(e.target.value)} />
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isPending || subiendo || ingredientes.length === 0}
              className="btn-primary flex-1 justify-center disabled:opacity-40">
              <CheckCircle size={15} />
              {subiendo ? 'Subiendo imagen...' : isPending ? 'Registrando...' : 'Registrar venta'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function PuntoVentaPage() {
  const [tab, setTab]               = useState('arreglos');
  const [busqueda, setBusqueda]     = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');   // para arreglos
  const [categoriaVG, setCategoriaVG]         = useState('');   // para venta general
  const [modalCategorias, setModalCategorias] = useState(false);
  const [buscarCategoria, setBuscarCategoria] = useState('');
  const [orden, setOrden]           = useState('nombre');
  const [carrito, setCarrito]       = useState([]);
  const [cliente, setCliente]       = useState('');
  const [emailCliente, setEmailCliente] = useState('');
  const [canal, setCanal]           = useState('mostrador');
  const [formaPago, setFormaPago]   = useState('efectivo');
  const [dividirPago, setDividirPago] = useState(false);
  const [pagosSplit, setPagosSplit] = useState([{ metodo: 'efectivo', monto: '' }, { metodo: 'tarjeta', monto: '' }]);
  const [descuento, setDescuento]   = useState(0);
  const [montoApertura, setMontoApertura] = useState('');
  const [modalAbono, setModalAbono] = useState(null);
  const [montoAbono, setMontoAbono] = useState('');
  const [formaPagoAbono, setFormaPagoAbono] = useState('efectivo');
  const [manoDeObra, setManoDeObra] = useState(() => parseFloat(localStorage.getItem('pos_mano_obra') || '0') || 0);
  const [modalConfirm, setModalConfirm] = useState(false);
  const [ventaSnapshot, setVentaSnapshot] = useState(null);
  const [modalRecibo, setModalRecibo]     = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [modalPersonalizado, setModalPersonalizado] = useState(false);
  const qc = useQueryClient();

  // ── Queries ───────────────────────────────────────────────────────────
  const { data: catalogo = [], isLoading: loadingCat } = useQuery({
    queryKey: ['catalogo-pos'],
    queryFn: () => api.get('/catalogo').then(r => r.data.data || []),
  });
  const { data: insumos = [], isLoading: loadingIns } = useQuery({
    queryKey: ['insumos-pos'],
    queryFn: () => api.get('/insumos').then(r => r.data.data || []),
  });
  const isLoading = tab === 'arreglos' ? loadingCat : loadingIns;

  // ── Caja del día — bloquea la venta hasta que se abra ──────────────────
  const { data: cajaActual, isLoading: loadingCaja } = useQuery({
    queryKey: ['caja-actual'],
    queryFn: () => api.get('/caja/actual').then(r => r.data.data),
  });
  const cajaAbierta = cajaActual && cajaActual.estado === 'abierta';
  const cajaCerradaHoy = cajaActual && cajaActual.estado === 'cerrada';

  const abrirCajaMut = useMutation({
    mutationFn: (data) => api.post('/caja/abrir', data),
    onSuccess: () => {
      qc.invalidateQueries(['caja-actual']);
      toast.success('Caja abierta — ya podés vender');
      setMontoApertura('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al abrir caja'),
  });

  const reabrirCajaMut = useMutation({
    mutationFn: () => api.post('/caja/reabrir'),
    onSuccess: () => {
      qc.invalidateQueries(['caja-actual']);
      toast.success('Caja reabierta — ya podés vender');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al reabrir caja'),
  });

  // ── Pedidos pendientes de pago — para cobrar abonos desde el POS ────────
  const { data: pedidos = [] } = useQuery({
    queryKey: ['pedidos'],
    queryFn: () => api.get('/pedidos').then(r => r.data.data),
    enabled: tab === 'pedidos-pendientes',
  });
  const pedidosPendientes = pedidos.filter(p =>
    (p.estado === 'pendiente' || p.estado === 'listo') &&
    (parseFloat(p.precio) || 0) - (parseFloat(p.adelanto) || 0) > 0
  );

  const abonoMut = useMutation({
    mutationFn: ({ id, monto, tipo_pago }) => api.post(`/pedidos/${id}/abono`, { monto, tipo_pago }),
    onSuccess: () => {
      qc.invalidateQueries(['pedidos']);
      toast.success('Abono registrado');
      setModalAbono(null);
      setMontoAbono('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al registrar abono'),
  });

  // ── Totales ───────────────────────────────────────────────────────────
  const subtotalProductos = carrito.reduce((s, i) =>
    s + (i.tipo === 'insumo' ? i.precio_unitario : i.precio_venta) * i.cantidad, 0);
  const subtotal = subtotalProductos + manoDeObra;
  const descuentoMonto = subtotal * (descuento / 100);
  const total = subtotal - descuentoMonto;

  // ── Pago dividido entre varios métodos ──────────────────────────────────
  const sumaPagosSplit = pagosSplit.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
  const restantePago = total - sumaPagosSplit;

  const actualizarPago = (idx, field, value) =>
    setPagosSplit(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  const agregarLineaPago = () => {
    const usados = pagosSplit.map(p => p.metodo);
    const libre = FORMAS_PAGO.find(f => !usados.includes(f.value))?.value || 'efectivo';
    setPagosSplit(prev => [...prev, { metodo: libre, monto: '' }]);
  };
  const quitarLineaPago = (idx) => setPagosSplit(prev => prev.filter((_, i) => i !== idx));

  // ── Venta personalizada mutation ──────────────────────────────────────
  const ventaPersonalizadaMut = useMutation({
    mutationFn: (data) => api.post('/catalogo/venta-personalizada', { ...data, canal, forma_pago: formaPago }),
    onSuccess: (res) => {
      qc.invalidateQueries(['catalogo-pos']);
      qc.invalidateQueries(['insumos-pos']);
      setModalPersonalizado(false);
      toast.success(res.data.message || 'Venta registrada');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al registrar'),
  });

  // ── Venta mutation ────────────────────────────────────────────────────
  const ventaMutation = useMutation({
    mutationFn: async () => {
      const catalogoItems = carrito.filter(i => i.tipo === 'catalogo');
      const insumoItems   = carrito.filter(i => i.tipo === 'insumo');
      const fechaCR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

      const pagos = dividirPago
        ? pagosSplit.filter(p => parseFloat(p.monto) > 0).map(p => ({ metodo: p.metodo, monto: parseFloat(p.monto) }))
        : [{ metodo: formaPago, monto: total }];

      // Todo el carrito en UNA sola petición — el backend lo registra en una
      // sola transacción (todo o nada). Evita que si una parte falla por stock
      // insuficiente, las partes que ya tuvieron éxito queden duplicadas al reintentar.
      return api.post('/catalogo/venta-pos', {
        catalogo_items: catalogoItems.map(i => ({
          catalogo_id: i.id,
          cantidad: i.cantidad,
          precio_venta: i.precio_venta,
          notas: ''
        })),
        insumo_items: insumoItems.map(i => ({
          insumo_id: i.id,
          cantidad: Math.round(i.cantidad * 10000) / 10000,
          precio_unitario: i.precio_unitario
        })),
        mano_de_obra: manoDeObra,
        nombre_cliente: cliente || 'Cliente mostrador',
        canal,
        forma_pago: formaPago,
        pagos,
        descuento,
        fecha: fechaCR,
      });
    },
    onSuccess: () => {
      const pagos = dividirPago
        ? pagosSplit.filter(p => parseFloat(p.monto) > 0).map(p => ({ metodo: p.metodo, monto: parseFloat(p.monto) }))
        : [{ metodo: formaPago, monto: total }];
      const snap = {
        numero: `VTA-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
        items: carrito.map(i => ({ ...i })),
        cliente: cliente || 'Cliente mostrador',
        email: emailCliente,
        canal,
        descuento,
        subtotalProductos,
        manoDeObra,
        subtotal,
        descuentoMonto,
        total,
        pagos,
        fecha: new Date().toLocaleString('es-CR'),
      };
      setVentaSnapshot(snap);
      setModalConfirm(false);
      setModalRecibo(true);
      qc.invalidateQueries(['catalogo-pos']);
      qc.invalidateQueries(['insumos-pos']);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al registrar venta'),
  });

  const cerrarRecibo = () => {
    setModalRecibo(false);
    setVentaSnapshot(null);
    setCarrito([]);
    setCliente('');
    setEmailCliente('');
    setDescuento(0);
    setFormaPago('efectivo');
    setDividirPago(false);
    setPagosSplit([{ metodo: 'efectivo', monto: '' }, { metodo: 'tarjeta', monto: '' }]);
    toast.success('Venta registrada');
  };

  const enviarReciboEmail = async (email) => {
    if (!ventaSnapshot) return;
    setEnviandoEmail(true);
    try {
      await api.post('/ventas/enviar-recibo', {
        email,
        cliente_nombre: ventaSnapshot.cliente,
        items: ventaSnapshot.items.map(i => ({
          tipo: i.tipo,
          nombre: i.nombre,
          cantidad: i.cantidad,
          precio_venta: i.tipo === 'insumo' ? i.precio_unitario : i.precio_venta,
        })),
        subtotal: ventaSnapshot.subtotal,
        descuento_pct: ventaSnapshot.descuento,
        total: ventaSnapshot.total,
        numero: ventaSnapshot.numero,
        fecha: ventaSnapshot.fecha,
        canal: ventaSnapshot.canal,
      });
      toast.success(`Recibo enviado a ${email}`);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Error al enviar');
    } finally {
      setEnviandoEmail(false);
    }
  };

  // ── Carrito helpers ───────────────────────────────────────────────────
  const agregarArreglo = (arreglo) => {
    const key = `cat-${arreglo.id}`;
    setCarrito(prev => {
      const existe = prev.find(i => i._key === key);
      if (existe) return prev.map(i => i._key === key ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { _key: key, tipo: 'catalogo', id: arreglo.id, nombre: arreglo.nombre, cantidad: 1, precio_venta: arreglo.precio_venta, costo: arreglo.costo_calculado }];
    });
  };

  const agregarFlor = (insumo) => {
    const key = `ins-${insumo.id}`;
    setCarrito(prev => {
      const existe = prev.find(i => i._key === key);
      if (existe) return prev.map(i => i._key === key ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { _key: key, tipo: 'insumo', id: insumo.id, nombre: insumo.nombre, unidad: insumo.unidad, cantidad: 1, precio_unitario: parseFloat(insumo.costo_unitario) || 0, costo_unitario: insumo.costo_unitario }];
    });
  };

  const cambiarCantidad = (key, delta) => {
    setCarrito(prev => prev
      .map(i => i._key === key ? { ...i, cantidad: Math.max(0, Math.round((i.cantidad + delta) * 10000) / 10000) } : i)
      .filter(i => i.cantidad > 0));
  };

  const setCantidadDirecta = (key, valor) => {
    const v = parseFloat(valor);
    if (!isNaN(v) && v > 0) {
      setCarrito(prev => prev.map(i => i._key === key ? { ...i, cantidad: v } : i));
    } else if (valor === '' || valor === '0') {
      setCarrito(prev => prev.map(i => i._key === key ? { ...i, cantidad: valor } : i));
    }
  };

  const confirmarCantidad = (key, valor) => {
    const v = parseFloat(valor);
    if (isNaN(v) || v <= 0) setCarrito(prev => prev.filter(i => i._key !== key));
  };

  const cambiarPrecioInsumo = (key, valor) => {
    setCarrito(prev => prev.map(i => i._key === key ? { ...i, precio_unitario: Number(valor) } : i));
  };

  const cambiarPrecioArreglo = (key, valor) => {
    setCarrito(prev => prev.map(i => i._key === key ? { ...i, precio_venta: Number(valor) } : i));
  };

  const categoriasArreglos = [...new Set(
    catalogo.filter(a => a.activo && a.categoria).map(a => a.categoria)
  )].sort();

  const TIPO_ORDER = { flor: 0, material: 1, empaque: 2, otro: 3 };

  const categoriasInsumos = Object.values(
    insumos.reduce((acc, i) => {
      if (!i.categoria_nombre) return acc;
      if (!acc[i.categoria_nombre]) acc[i.categoria_nombre] = { nombre: i.categoria_nombre, tipo: i.categoria_tipo };
      return acc;
    }, {})
  ).sort((a, b) => {
    const da = TIPO_ORDER[a.tipo] ?? 3, db = TIPO_ORDER[b.tipo] ?? 3;
    return da !== db ? da - db : a.nombre.localeCompare(b.nombre, 'es');
  });

  const sortFn = (a, b) => {
    if (orden === 'precio_asc') return parseFloat(a.precio_venta || a.costo_unitario) - parseFloat(b.precio_venta || b.costo_unitario);
    if (orden === 'precio_desc') return parseFloat(b.precio_venta || b.costo_unitario) - parseFloat(a.precio_venta || a.costo_unitario);
    return a.nombre.localeCompare(b.nombre, 'es');
  };

  const catalogoFiltrado = catalogo
    .filter(a => a.activo &&
      (!busqueda || a.nombre.toLowerCase().includes(busqueda.toLowerCase()) || (a.codigo && a.codigo.toLowerCase() === busqueda.toLowerCase().trim())) &&
      (!categoriaFiltro || a.categoria === categoriaFiltro)
    )
    .sort(sortFn);

  const insumosFiltrados = insumos
    .filter(i =>
      tab === 'venta-general' &&
      (busqueda || categoriaVG) &&
      (!categoriaVG || i.categoria_nombre === categoriaVG) &&
      (!busqueda || i.nombre.toLowerCase().includes(busqueda.toLowerCase()) || (i.codigo && i.codigo.toLowerCase() === busqueda.toLowerCase().trim()))
    )
    .sort(sortFn);

  // Al presionar Enter: si coincide exacto por código → agregar al carrito automáticamente
  const handleBusquedaEnter = (e) => {
    if (e.key !== 'Enter' || !busqueda.trim()) return;
    const term = busqueda.toLowerCase().trim();

    if (tab === 'arreglos') {
      const match = catalogo.find(a => a.activo && a.codigo && a.codigo.toLowerCase() === term);
      if (match) { agregarArreglo(match); setBusqueda(''); toast.success(`${match.nombre} agregado`); }
    } else {
      const pool = categoriaVG ? insumos.filter(i => i.categoria_nombre === categoriaVG) : insumos;
      const match = pool.find(i => i.codigo && i.codigo.toLowerCase() === term && parseFloat(i.stock_actual) > 0);
      if (match) { agregarFlor(match); setBusqueda(''); toast.success(`${match.nombre} agregado`); }
    }
  };


  return (
    <div className="flex flex-row gap-2 lg:gap-6" style={{ height: 'calc(100dvh - 5rem)', maxHeight: 'calc(100dvh - 5rem)' }}>

      {/* ── Panel Izquierdo ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* Header — oculto en móvil para ahorrar espacio */}
        <div className="hidden lg:flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-white">Punto de Venta</h1>
            <p className="text-gray-500 text-sm">
              {tab === 'arreglos' ? `${catalogoFiltrado.length} arreglos` : `${insumosFiltrados.length} productos`}
            </p>
          </div>
        </div>

        {/* Tabs tipo producto */}
        <div className="flex gap-2 mb-3 flex-shrink-0 flex-wrap">
          <button onClick={() => { setTab('arreglos'); setBusqueda(''); setCategoriaFiltro(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'arreglos' ? 'bg-brand-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}>
            <LayoutGrid size={15} /> Arreglos
          </button>
          <button onClick={() => { setTab('venta-general'); setBusqueda(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'venta-general' ? 'bg-brand-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}>
            <Layers size={15} /> Venta General
          </button>
          <button onClick={() => setTab('pedidos-pendientes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'pedidos-pendientes' ? 'bg-brand-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}>
            <ClipboardList size={15} /> Pedidos pendientes
            {pedidosPendientes.length > 0 && (
              <span className="bg-yellow-500 text-gray-900 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">{pedidosPendientes.length}</span>
            )}
          </button>
          <button onClick={() => setModalPersonalizado(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all bg-gray-900 text-emerald-400 hover:text-emerald-300 ml-auto">
            <Wand2 size={15} /> A medida
          </button>
        </div>

        {/* Barra de búsqueda + orden + botón categorías */}
        <div className="flex gap-2 mb-3 flex-shrink-0">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className="input w-full pl-9 text-sm"
              placeholder="Buscar por nombre o código..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={handleBusquedaEnter} />
          </div>
          <select className="input text-xs py-2 w-28 flex-shrink-0" value={orden} onChange={e => setOrden(e.target.value)}>
            <option value="nombre">A – Z</option>
            <option value="precio_asc">Precio ↑</option>
            <option value="precio_desc">Precio ↓</option>
          </select>
          {tab === 'venta-general' && (
            <button onClick={() => setModalCategorias(true)}
              className="btn-secondary flex-shrink-0 flex items-center gap-2 text-sm px-3">
              <Layers size={15} /> Categorías
            </button>
          )}
        </div>

        {/* Arreglos: pills de subcategoría */}
        {tab === 'arreglos' && categoriasArreglos.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-3 flex-shrink-0">
            <button onClick={() => setCategoriaFiltro('')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!categoriaFiltro ? 'bg-brand-600 border-brand-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
              Todos ({catalogo.filter(a => a.activo).length})
            </button>
            {categoriasArreglos.map(cat => {
              const count = catalogo.filter(a => a.activo && a.categoria === cat).length;
              return (
                <button key={cat}
                  onClick={() => setCategoriaFiltro(p => p === cat ? '' : cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${categoriaFiltro === cat ? 'bg-brand-600 border-brand-500 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Venta General: chip de categoría activa */}
        {tab === 'venta-general' && (
          <div className="flex items-center gap-2 mb-3 min-h-[28px]">
            {categoriaVG ? (
              <>
                <span className="text-xs text-gray-500">Categoría:</span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-600/20 border border-brand-500/40 text-brand-300 text-xs font-medium">
                  {categoriaVG}
                  <button onClick={() => setCategoriaVG('')} className="hover:text-white transition-colors ml-0.5">
                    <X size={11} />
                  </button>
                </span>
                <span className="text-xs text-gray-600">{insumosFiltrados.length} productos</span>
              </>
            ) : (
              <span className="text-xs text-gray-600">
                {busqueda ? `${insumosFiltrados.length} resultados` : 'Selecciona una categoría o busca por nombre / código'}
              </span>
            )}
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'pedidos-pendientes' ? (
            <div className="space-y-2">
              {pedidosPendientes.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-8">No hay pedidos con saldo pendiente</p>
              ) : pedidosPendientes.map(p => {
                const saldo = (parseFloat(p.precio) || 0) - (parseFloat(p.adelanto) || 0);
                return (
                  <div key={p.id} className="card flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">#{p.numero} · {p.cliente_nombre || '(sin nombre)'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Total {formatMoney(p.precio)} · Abonado {formatMoney(p.adelanto)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 flex items-center gap-3">
                      <div>
                        <p className="text-xs text-gray-500">Saldo</p>
                        <p className="text-base font-bold text-yellow-400 tabular-nums">{formatMoney(saldo)}</p>
                      </div>
                      <button onClick={() => { setModalAbono(p); setMontoAbono(String(saldo)); setFormaPagoAbono(p.tipo_pago || 'efectivo'); }}
                        className="btn-primary text-xs py-1.5 px-3">
                        <Wallet size={13} /> Abonar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tab === 'arreglos' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {catalogoFiltrado.map(arreglo => {
                const enCarrito = carrito.find(i => i._key === `cat-${arreglo.id}`);
                return (
                  <motion.div key={arreglo.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => agregarArreglo(arreglo)}
                    className={`card cursor-pointer transition-all select-none ${enCarrito ? 'border-brand-500/50 bg-brand-500/5' : 'hover:border-gray-600'}`}>
                    {arreglo.imagen_url ? (
                      <img src={getImgUrl(arreglo.imagen_url)} alt={arreglo.nombre}
                        className="w-full h-24 object-cover rounded-xl mb-3 border border-gray-700" />
                    ) : (
                      <div className="w-full h-24 bg-gradient-to-br from-brand-900/40 to-emerald-900/40 rounded-xl mb-3 flex items-center justify-center border border-gray-700">
                        <Flower2 size={32} className="text-brand-400/60" />
                      </div>
                    )}
                    <p className="font-semibold text-white text-sm leading-tight mb-0.5">{arreglo.nombre}</p>
                    {arreglo.codigo && <p className="text-xs text-brand-600 font-mono mb-0.5">{arreglo.codigo}</p>}
                    <p className="text-brand-400 font-bold">{formatMoney(arreglo.precio_venta)}</p>
                    <div className="flex items-center justify-end mt-1.5">
                      <div className="flex items-center gap-1">
                        {arreglo.costo_calculado > 0
                          ? <span className="text-xs text-emerald-500" title="Descuenta inventario">📦</span>
                          : <span className="text-xs text-gray-600" title="Sin ficha">⚠️</span>}
                        {enCarrito && (
                          <span className="bg-brand-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            ×{enCarrito.cantidad}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {catalogoFiltrado.length === 0 && (
                <p className="text-gray-600 text-sm col-span-3 text-center py-8">Sin arreglos disponibles</p>
              )}
            </div>
          ) : !categoriaVG && !busqueda ? (
            /* Estado vacío de Venta General */
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <Layers size={48} className="text-gray-700 mb-4" />
              <p className="text-gray-400 font-medium mb-1">Selecciona una categoría</p>
              <p className="text-gray-600 text-sm mb-6">o busca directamente por nombre o código</p>
              <button onClick={() => setModalCategorias(true)} className="btn-primary text-sm px-6">
                <Layers size={15} /> Ver Categorías
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {insumosFiltrados.map(insumo => {
                const enCarrito = carrito.find(i => i._key === `ins-${insumo.id}`);
                const stockOk = parseFloat(insumo.stock_actual) > 0;
                return (
                  <motion.div key={insumo.id}
                    whileHover={{ scale: stockOk ? 1.02 : 1 }} whileTap={{ scale: stockOk ? 0.98 : 1 }}
                    onClick={() => stockOk && agregarFlor(insumo)}
                    className={`card transition-all select-none ${!stockOk ? 'opacity-40 cursor-not-allowed' : enCarrito ? 'border-brand-500/50 bg-brand-500/5 cursor-pointer' : 'hover:border-gray-600 cursor-pointer'}`}>
                    {getImgUrl(insumo.imagen_url) ? (
                      <img src={getImgUrl(insumo.imagen_url)} alt={insumo.nombre}
                        className="w-full h-24 object-cover rounded-xl mb-3 border border-gray-700" />
                    ) : (
                      <div className="w-full h-24 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl mb-3 flex items-center justify-center border border-gray-700">
                        <Leaf size={32} className={TIPO_COLOR[insumo.categoria_tipo] || 'text-gray-500'} style={{ opacity: 0.6 }} />
                      </div>
                    )}
                    <p className="font-semibold text-white text-sm leading-tight mb-0.5">{insumo.nombre}</p>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs text-gray-500">{insumo.categoria_nombre}</p>
                      {insumo.codigo && <span className="text-xs text-brand-600 font-mono">{insumo.codigo}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500">Costo: {formatMoney(insumo.costo_unitario)}/{insumo.unidad}</p>
                        <p className={`text-xs font-medium ${stockOk ? 'text-gray-400' : 'text-red-400'}`}>
                          Stock: {parseFloat(insumo.stock_actual)} {insumo.unidad}
                        </p>
                      </div>
                      {enCarrito && (
                        <span className="bg-brand-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          ×{enCarrito.cantidad}
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
              {insumosFiltrados.length === 0 && (
                <p className="text-gray-600 text-sm col-span-3 text-center py-8">Sin productos con ese criterio</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Carrito ── */}
      <div className="w-2/5 lg:w-80 flex-shrink-0 flex flex-col min-h-0">

        <div className="card flex-1 flex flex-col p-0 overflow-hidden min-h-0">
          <div className="p-3 lg:p-4 border-b border-gray-800 flex items-center gap-2">
            <ShoppingCart size={18} className="text-brand-400" />
            <h2 className="font-semibold text-white">Carrito</h2>
            {carrito.length > 0 && (
              <span className="ml-auto bg-brand-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {carrito.length}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <AnimatePresence>
              {carrito.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center">
                  <ShoppingCart size={28} className="text-gray-700 mb-2" />
                  <p className="text-gray-600 text-sm">Toca un producto para agregar</p>
                </div>
              ) : (
                carrito.map(item => (
                  <motion.div key={item._key} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                    className="bg-gray-800 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium leading-tight">{item.nombre}</p>
                        {item.tipo === 'insumo' && <span className="text-xs text-pink-400">Flor suelta · {item.unidad}</span>}
                      </div>
                      <button onClick={() => setCarrito(p => p.filter(i => i._key !== item._key))}
                        className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                    {item.tipo === 'insumo' && (
                      <div className="mb-2">
                        <label className="text-xs text-gray-500 mb-1 block">Precio (₡ c/u)</label>
                        <input type="number" min="0" step="50"
                          className="input w-full text-sm py-1.5 text-brand-400 font-semibold"
                          value={item.precio_unitario}
                          onChange={e => cambiarPrecioInsumo(item._key, e.target.value)}
                          onClick={e => e.stopPropagation()} />
                      </div>
                    )}
                    {item.tipo === 'catalogo' && (
                      <div className="mb-2">
                        <label className="text-xs text-gray-500 mb-1 block">Precio (₡)</label>
                        <input type="number" min="0" step="50"
                          className="input w-full text-sm py-1.5 text-brand-400 font-semibold"
                          value={item.precio_venta}
                          onChange={e => cambiarPrecioArreglo(item._key, e.target.value)}
                          onClick={e => e.stopPropagation()} />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {item.tipo === 'insumo' ? (
                          <div className="flex gap-1">
                            {[{ label: 'Entero', val: 1 }, { label: '½', val: 0.5 }, { label: '⅓', val: 1/3 }].map(({ label, val }) => (
                              <button key={label}
                                onClick={() => setCarrito(prev => prev.map(i => i._key === item._key ? { ...i, cantidad: val } : i))}
                                className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-colors ${Math.abs(item.cantidad - val) < 0.01 ? 'bg-brand-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <>
                            <button onClick={() => cambiarCantidad(item._key, -1)}
                              className="w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors">
                              <Minus size={11} />
                            </button>
                            <span className="text-white font-bold text-sm w-4 text-center">{item.cantidad}</span>
                            <button onClick={() => cambiarCantidad(item._key, 1)}
                              className="w-6 h-6 rounded-full bg-brand-600 hover:bg-brand-500 flex items-center justify-center transition-colors">
                              <Plus size={11} />
                            </button>
                          </>
                        )}
                      </div>
                      <span className="text-brand-400 font-semibold text-sm">
                        {formatMoney((item.tipo === 'insumo' ? item.precio_unitario : item.precio_venta) * item.cantidad)}
                      </span>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          {carrito.length > 0 && (
            <div className="border-t border-gray-800">

              {/* ── Datos del cliente ── */}
              <div className="p-3 space-y-2 border-b border-gray-800/60">
                <div className="relative">
                  <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input className="input w-full pl-8 text-sm py-2" placeholder="Nombre del cliente (opcional)"
                    value={cliente} onChange={e => setCliente(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <AtSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input type="email" className="input w-full pl-8 text-xs py-2" placeholder="Email (opcional)"
                      value={emailCliente} onChange={e => setEmailCliente(e.target.value)} />
                  </div>
                  <select className="input w-full text-xs py-2" value={canal} onChange={e => setCanal(e.target.value)}>
                    {CANALES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Forma de pago</span>
                  <button type="button" onClick={() => setDividirPago(d => !d)}
                    className="text-xs text-brand-400 hover:underline">
                    {dividirPago ? 'Pago único' : 'Dividir pago'}
                  </button>
                </div>
                {!dividirPago ? (
                  <div className="flex gap-1.5">
                    {FORMAS_PAGO.map(({ value, label, Icon }) => (
                      <button key={value} type="button" onClick={() => setFormaPago(value)}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          formaPago === value ? 'bg-brand-600/20 border-brand-600/40 text-brand-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}>
                        <Icon size={12} /> {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5 bg-gray-800/50 rounded-xl p-2">
                    {pagosSplit.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <select className="input text-xs py-1.5 flex-shrink-0 w-[5.5rem]"
                          value={p.metodo} onChange={e => actualizarPago(idx, 'metodo', e.target.value)}>
                          {FORMAS_PAGO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                        <input type="number" min="0" step="100"
                          className="input flex-1 text-xs py-1.5 text-right tabular-nums" placeholder="0"
                          value={p.monto} onChange={e => actualizarPago(idx, 'monto', e.target.value)} />
                        {pagosSplit.length > 1 && (
                          <button type="button" onClick={() => quitarLineaPago(idx)}
                            className="text-gray-500 hover:text-red-400 flex-shrink-0">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-0.5">
                      <button type="button" onClick={agregarLineaPago} className="text-xs text-brand-400 hover:underline">
                        + Agregar método
                      </button>
                      <span className={`text-xs font-semibold tabular-nums ${Math.abs(restantePago) < 1 ? 'text-green-400' : 'text-yellow-400'}`}>
                        {Math.abs(restantePago) < 1
                          ? '✓ Completo'
                          : restantePago > 0
                            ? `Falta ${formatMoney(restantePago)}`
                            : `Sobra ${formatMoney(Math.abs(restantePago))}`}
                      </span>
                    </div>
                  </div>
                )}
                <div className="relative">
                  <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input type="number" min="0" max="100" className="input w-full pl-8 text-sm py-2" placeholder="Descuento %"
                    value={descuento || ''} onChange={e => setDescuento(Math.min(100, Math.max(0, Number(e.target.value))))} />
                </div>

                {/* ── Mano de obra ── */}
                <div className="flex items-center gap-2">
                  <Wand2 size={13} className="text-gray-500 flex-shrink-0" />
                  <span className="text-xs text-gray-400 flex-shrink-0">M. obra</span>
                  <input
                    type="number" min="0" step="500"
                    className="input flex-1 text-xs py-2 text-right tabular-nums"
                    placeholder="0"
                    value={manoDeObra || ''}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0;
                      setManoDeObra(v);
                      localStorage.setItem('pos_mano_obra', v);
                    }}
                  />
                </div>
              </div>

              {/* ── Totales ── */}
              <div className="px-3 pt-3 space-y-1 text-sm">
                {(descuento > 0 || manoDeObra > 0) && (
                  <>
                    <div className="flex justify-between text-gray-500">
                      <span>Productos</span><span>{formatMoney(subtotalProductos)}</span>
                    </div>
                    {manoDeObra > 0 && (
                      <div className="flex justify-between text-gray-500">
                        <span>Mano de obra</span><span>{formatMoney(manoDeObra)}</span>
                      </div>
                    )}
                    {descuento > 0 && (
                      <div className="flex justify-between text-red-400">
                        <span>Descuento ({descuento}%)</span><span>-{formatMoney(descuentoMonto)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
                  <span className="text-gray-300 font-semibold text-base">Total</span>
                  <span className="text-brand-400 font-extrabold text-xl tabular-nums">{formatMoney(total)}</span>
                </div>
              </div>

              <div className="p-3">
                <button
                  onClick={() => setModalConfirm(true)}
                  className="btn-primary w-full text-sm py-3 disabled:opacity-40 disabled:cursor-not-allowed">
                  <CheckCircle size={16} /> Confirmar Venta
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Categorías ── */}
      <AnimatePresence>
        {modalCategorias && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="card w-full max-w-lg flex flex-col" style={{ maxHeight: '80vh' }}>

              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div>
                  <h3 className="text-white font-bold text-lg">Categorías</h3>
                  <p className="text-xs text-gray-500">{categoriasInsumos.length} categorías registradas</p>
                </div>
                <button onClick={() => { setModalCategorias(false); setBuscarCategoria(''); }}
                  className="text-gray-500 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="relative mb-4 flex-shrink-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input className="input w-full pl-9 text-sm" placeholder="Buscar categoría..."
                  value={buscarCategoria} onChange={e => setBuscarCategoria(e.target.value)} autoFocus />
              </div>

              <div className="overflow-y-auto flex-1 space-y-5 pr-1">
                {[
                  { tipo: 'flor',     label: 'Flores',     color: 'text-pink-400',   cardCls: 'bg-pink-500/10 border-pink-500/25 hover:border-pink-400/60'   },
                  { tipo: 'material', label: 'Materiales', color: 'text-yellow-400', cardCls: 'bg-yellow-500/10 border-yellow-500/25 hover:border-yellow-400/60' },
                  { tipo: 'empaque',  label: 'Empaques',   color: 'text-purple-400', cardCls: 'bg-purple-500/10 border-purple-500/25 hover:border-purple-400/60' },
                  { tipo: 'otro',     label: 'Otros',      color: 'text-gray-400',   cardCls: 'bg-gray-700/30 border-gray-600/30 hover:border-gray-500/60'   },
                ].map(({ tipo, label, color, cardCls }) => {
                  const cats = categoriasInsumos.filter(c =>
                    c.tipo === tipo &&
                    (!buscarCategoria || c.nombre.toLowerCase().includes(buscarCategoria.toLowerCase()))
                  );
                  if (!cats.length) return null;
                  return (
                    <div key={tipo}>
                      <p className={`text-xs font-bold uppercase tracking-wider ${color} mb-2`}>{label}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {cats.map(cat => {
                          const count = insumos.filter(i => i.categoria_nombre === cat.nombre).length;
                          const activa = categoriaVG === cat.nombre;
                          return (
                            <button key={cat.nombre}
                              onClick={() => { setCategoriaVG(cat.nombre); setModalCategorias(false); setBuscarCategoria(''); }}
                              className={`flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${cardCls} ${activa ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-gray-900' : ''}`}>
                              <span className={`text-sm font-medium truncate ${activa ? 'text-white' : color}`}>{cat.nombre}</span>
                              <span className="text-xs text-gray-500 ml-2 flex-shrink-0 bg-gray-800/60 px-1.5 py-0.5 rounded-full">{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {categoriasInsumos.filter(c => !buscarCategoria || c.nombre.toLowerCase().includes(buscarCategoria.toLowerCase())).length === 0 && (
                  <p className="text-gray-600 text-sm text-center py-6">No se encontró esa categoría</p>
                )}
              </div>

              {categoriaVG && (
                <div className="pt-3 border-t border-gray-800 mt-3 flex-shrink-0">
                  <button onClick={() => { setCategoriaVG(''); setModalCategorias(false); setBuscarCategoria(''); }}
                    className="btn-secondary w-full text-sm">
                    Quitar filtro · Ver todos los productos
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal Arreglo Personalizado ── */}
      <AnimatePresence>
        {modalPersonalizado && (
          <ArregloPersonalizadoModal
            insumos={insumos}
            onClose={() => setModalPersonalizado(false)}
            onVender={(data) => ventaPersonalizadaMut.mutate(data)}
            isPending={ventaPersonalizadaMut.isPending}
          />
        )}
      </AnimatePresence>

      {/* ── Modal Abonar pedido ── */}
      <AnimatePresence>
        {modalAbono && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="card w-full max-w-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-lg">Abonar pedido #{modalAbono.numero}</h3>
                <button onClick={() => setModalAbono(null)} className="text-gray-500 hover:text-white"><X size={18} /></button>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                Saldo pendiente: <span className="text-yellow-400 font-bold">
                  {formatMoney((parseFloat(modalAbono.precio) || 0) - (parseFloat(modalAbono.adelanto) || 0))}
                </span>
              </p>
              <div className="space-y-3">
                <div>
                  <label className="label">Monto a abonar (₡)</label>
                  <input type="number" min="0" step="100" className="input font-bold text-brand-400"
                    value={montoAbono} onChange={e => setMontoAbono(e.target.value)} />
                </div>
                <div>
                  <label className="label mb-2 block">Forma de pago</label>
                  <div className="flex gap-2">
                    {FORMAS_PAGO.map(({ value, label, Icon }) => (
                      <button key={value} type="button" onClick={() => setFormaPagoAbono(value)}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                          formaPagoAbono === value ? 'bg-brand-600/20 border-brand-600/40 text-brand-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                        }`}>
                        <Icon size={14} /> {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-5">
                <button onClick={() => setModalAbono(null)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                <button
                  onClick={() => abonoMut.mutate({ id: modalAbono.id, monto: parseFloat(montoAbono) || 0, tipo_pago: formaPagoAbono })}
                  disabled={abonoMut.isPending} className="btn-primary flex-1 text-sm">
                  {abonoMut.isPending ? 'Registrando...' : 'Confirmar abono'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal apertura/reapertura de caja — bloquea la venta hasta resolver ── */}
      <AnimatePresence>
        {!loadingCaja && !cajaAbierta && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-950/95 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              className="card w-full max-w-sm text-center">
              <div className="w-14 h-14 bg-yellow-500/15 border-2 border-yellow-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Wallet size={26} className="text-yellow-400" />
              </div>
              {cajaCerradaHoy ? (
                <>
                  <h2 className="text-xl font-bold text-white mb-1">Caja cerrada hoy</h2>
                  <p className="text-gray-400 text-sm mb-5">Ya se cerró la caja de hoy. Reabrila para registrar otra venta.</p>
                  <button
                    onClick={() => reabrirCajaMut.mutate()}
                    disabled={reabrirCajaMut.isPending}
                    className="btn-primary w-full justify-center py-3">
                    <CheckCircle size={16} /> {reabrirCajaMut.isPending ? 'Reabriendo...' : 'Reabrir caja y continuar'}
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-white mb-1">Abrir caja</h2>
                  <p className="text-gray-400 text-sm mb-5">Antes de vender, indicá con cuánto efectivo inicia la caja hoy</p>
                  <input type="number" min="0" step="500" className="input text-center font-bold text-lg mb-4"
                    placeholder="Monto inicial en efectivo (₡)"
                    value={montoApertura} onChange={e => setMontoApertura(e.target.value)} />
                  <button
                    onClick={() => abrirCajaMut.mutate({ monto_inicial: parseFloat(montoApertura) || 0 })}
                    disabled={abrirCajaMut.isPending}
                    className="btn-primary w-full justify-center py-3">
                    <CheckCircle size={16} /> {abrirCajaMut.isPending ? 'Abriendo...' : 'Abrir caja y continuar'}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal confirmación ── */}
      <AnimatePresence>
        {modalConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="card w-full max-w-sm">
              <h3 className="text-white font-bold text-lg mb-1">Confirmar venta</h3>
              <p className="text-gray-400 text-sm mb-4">Se descontará el inventario automáticamente</p>
              <div className="space-y-2 mb-4 max-h-44 overflow-y-auto">
                {carrito.map(item => {
                  const precio = item.tipo === 'insumo' ? item.precio_unitario : item.precio_venta;
                  return (
                    <div key={item._key} className="flex justify-between text-sm">
                      <span className="text-gray-300 flex-1 mr-2">
                        {item.nombre}{item.tipo === 'insumo' && <span className="text-pink-400 text-xs ml-1">(suelta)</span>} ×{fmtQty(item.cantidad)}
                      </span>
                      <span className="text-white font-medium flex-shrink-0">{formatMoney(precio * item.cantidad)}</span>
                    </div>
                  );
                })}
              </div>
              {manoDeObra > 0 && (
                <div className="flex justify-between text-sm text-gray-400 mb-1">
                  <span>Mano de obra</span><span>+{formatMoney(manoDeObra)}</span>
                </div>
              )}
              {descuento > 0 && (
                <div className="flex justify-between text-sm text-red-400 mb-1">
                  <span>Descuento {descuento}%</span><span>-{formatMoney(descuentoMonto)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-gray-700 pt-3 mb-4">
                <span className="text-white">Total</span>
                <span className="text-brand-400">{formatMoney(total)}</span>
              </div>
              <p className="text-xs text-gray-500 mb-1">
                {cliente && <>Cliente: {cliente} · </>}{canal}
              </p>
              {!dividirPago ? (
                <p className="text-xs text-gray-500 mb-4">Pago: {FORMAS_PAGO.find(f => f.value === formaPago)?.label}</p>
              ) : (
                <div className="text-xs text-gray-500 mb-4 space-y-0.5">
                  <p className="text-gray-400">Pago dividido:</p>
                  {pagosSplit.filter(p => parseFloat(p.monto) > 0).map((p, idx) => (
                    <p key={idx} className="flex justify-between">
                      <span>{FORMAS_PAGO.find(f => f.value === p.metodo)?.label}</span>
                      <span className="text-gray-300 font-medium">{formatMoney(parseFloat(p.monto))}</span>
                    </p>
                  ))}
                  {Math.abs(restantePago) >= 1 && (
                    <p className={restantePago > 0 ? 'text-yellow-400' : 'text-red-400'}>
                      {restantePago > 0
                        ? `Falta cubrir ${formatMoney(restantePago)}`
                        : `Excede el total por ${formatMoney(Math.abs(restantePago))}`}
                    </p>
                  )}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setModalConfirm(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                <button onClick={() => ventaMutation.mutate()}
                  disabled={ventaMutation.isPending || (dividirPago && Math.abs(restantePago) >= 1)}
                  className="btn-primary flex-1 text-sm">
                  {ventaMutation.isPending ? 'Registrando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal recibo ── */}
      <AnimatePresence>
        {modalRecibo && ventaSnapshot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="card w-full max-w-sm p-0 overflow-hidden">

              <div className="p-5 border-b border-gray-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle size={20} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-bold">Venta registrada</p>
                  <p className="text-xs text-gray-500">{ventaSnapshot.numero} · {ventaSnapshot.cliente}</p>
                </div>
              </div>

              <div className="p-4 space-y-1.5 max-h-48 overflow-y-auto">
                {ventaSnapshot.items.map((item, i) => {
                  const precio = item.tipo === 'insumo' ? item.precio_unitario : item.precio_venta;
                  return (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-300">{item.nombre} ×{fmtQty(item.cantidad)}</span>
                      <span className="text-white font-medium">{formatMoney(precio * item.cantidad)}</span>
                    </div>
                  );
                })}
                {ventaSnapshot.manoDeObra > 0 && (
                  <div className="flex justify-between text-gray-400 text-xs">
                    <span>Mano de obra</span>
                    <span>+{formatMoney(ventaSnapshot.manoDeObra)}</span>
                  </div>
                )}
                {ventaSnapshot.descuento > 0 && (
                  <div className="flex justify-between text-red-400 text-xs">
                    <span>Descuento ({ventaSnapshot.descuento}%)</span>
                    <span>-{formatMoney(ventaSnapshot.descuentoMonto)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t border-gray-700 pt-2 mt-2">
                  <span className="text-white">Total</span>
                  <span className="text-emerald-400 text-base">{formatMoney(ventaSnapshot.total)}</span>
                </div>
              </div>

              <div className="px-4 pb-3">
                <EmailReciboInput
                  defaultEmail={ventaSnapshot.email}
                  onEnviar={enviarReciboEmail}
                  enviando={enviandoEmail}
                />
              </div>

              <div className="p-4 pt-0 grid grid-cols-2 gap-3">
                <button onClick={() => generarReciboPOS(ventaSnapshot)}
                  className="btn-secondary text-sm flex items-center justify-center gap-2">
                  <Printer size={15} /> Imprimir
                </button>
                <button onClick={cerrarRecibo} className="btn-primary text-sm">
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
