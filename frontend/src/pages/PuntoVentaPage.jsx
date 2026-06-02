import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart, Search, Plus, Minus, Trash2, CheckCircle, Flower2,
  User, Tag, X, Leaf, LayoutGrid, Printer, Mail, Send, AtSign, Layers
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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

const TIPO_COLOR = {
  flor:     'text-pink-400',
  material: 'text-yellow-400',
  empaque:  'text-purple-400',
  otro:     'text-gray-400',
};

function fmtCRC(n) {
  return `CRC ${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;
}

function generarReciboPOS(snap) {
  const { numero, items, cliente, canal, descuento, subtotal, descuentoMonto, total, fecha } = snap;
  const doc  = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const W    = doc.internal.pageSize.getWidth();
  const H    = doc.internal.pageSize.getHeight();
  const canalLabel = CANALES.find(c => c.value === canal)?.label || canal;

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(212, 0, 110);
  doc.rect(0, 0, W, 30, 'F');
  doc.setFillColor(240, 117, 37);
  doc.triangle(W * 0.4, 0, W, 0, W, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Floristeria Alma Caribeña', W / 2, 13, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Flores con alma  |  Recibo de Compra', W / 2, 21, { align: 'center' });

  // ── Número + fecha ───────────────────────────────────────────────────────
  doc.setFillColor(255, 248, 251);
  doc.rect(0, 30, W, 22, 'F');

  doc.setTextColor(212, 0, 110);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('RECIBO No.', 14, 38);
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14);
  doc.text(numero, 14, 46);

  doc.setTextColor(130, 130, 130);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('FECHA', W - 14, 38, { align: 'right' });
  doc.setTextColor(50, 50, 50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(fecha, W - 14, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(130, 130, 130);
  doc.setFontSize(7);
  doc.text(canalLabel, W - 14, 50, { align: 'right' });

  doc.setDrawColor(240, 210, 225);
  doc.setLineWidth(0.4);
  doc.line(12, 54, W - 12, 54);

  // ── Cliente ──────────────────────────────────────────────────────────────
  let y = 62;
  doc.setTextColor(200, 0, 100);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('PARA', 14, y - 3);
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(12);
  doc.text(cliente, 14, y + 3);
  doc.setDrawColor(245, 220, 230);
  doc.setLineWidth(0.3);
  doc.line(12, y + 7, W - 12, y + 7);

  // ── Tabla items ──────────────────────────────────────────────────────────
  y += 14;
  const tableData = items.map(i => {
    const precio = i.tipo === 'insumo' ? i.precio_unitario : i.precio_venta;
    return [
      i.nombre + (i.tipo === 'insumo' ? ' (suelta)' : ''),
      String(i.cantidad),
      fmtCRC(precio),
      fmtCRC(precio * i.cantidad),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Producto / Servicio', 'Cant.', 'Precio', 'Total']],
    body: tableData,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      textColor: [40, 40, 40],
    },
    headStyles: {
      fillColor: [26, 138, 122],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
    },
    alternateRowStyles: { fillColor: [255, 250, 252] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right', fontStyle: 'bold', textColor: [26, 138, 122] },
    },
    tableLineColor: [240, 210, 225],
    tableLineWidth: 0.3,
    margin: { left: 12, right: 12 },
  });

  y = doc.lastAutoTable.finalY + 5;

  // ── Totales ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  doc.text('Subtotal:', W - 52, y + 4);
  doc.setTextColor(50, 50, 50);
  doc.text(fmtCRC(subtotal), W - 14, y + 4, { align: 'right' });

  if (descuento > 0) {
    y += 7;
    doc.setTextColor(220, 60, 60);
    doc.text(`Descuento (${descuento}%):`, W - 60, y + 4);
    doc.text(`- ${fmtCRC(descuentoMonto)}`, W - 14, y + 4, { align: 'right' });
  }

  y += 10;
  doc.setFillColor(212, 0, 110);
  doc.roundedRect(W - 76, y - 2, 64, 13, 3, 3, 'F');
  doc.setFillColor(240, 117, 37);
  doc.roundedRect(W - 44, y - 2, 32, 13, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', W - 70, y + 7);
  doc.text(fmtCRC(total), W - 15, y + 7, { align: 'right' });

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFillColor(212, 0, 110);
  doc.rect(0, H - 18, W, 18, 'F');
  doc.setFillColor(240, 117, 37);
  doc.triangle(W * 0.55, H - 18, W, H - 18, W, H, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Gracias por su compra!', W / 2, H - 10, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Floristeria Alma Caribeña  ·  Flores con alma', W / 2, H - 4, { align: 'center' });

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
  const [descuento, setDescuento]   = useState(0);
  const [modalConfirm, setModalConfirm] = useState(false);
  const [ventaSnapshot, setVentaSnapshot] = useState(null);
  const [modalRecibo, setModalRecibo]     = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [pagoCliente, setPagoCliente]     = useState('');
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

  // ── Totales ───────────────────────────────────────────────────────────
  const subtotal = carrito.reduce((s, i) =>
    s + (i.tipo === 'insumo' ? i.precio_unitario : i.precio_venta) * i.cantidad, 0);
  const descuentoMonto = subtotal * (descuento / 100);
  const total = subtotal - descuentoMonto;

  // ── Venta mutation ────────────────────────────────────────────────────
  const ventaMutation = useMutation({
    mutationFn: async () => {
      const catalogoItems = carrito.filter(i => i.tipo === 'catalogo');
      const insumoItems   = carrito.filter(i => i.tipo === 'insumo');
      const promises = [];
      catalogoItems.forEach(item => {
        for (let n = 0; n < item.cantidad; n++) {
          promises.push(api.post('/catalogo/venta', {
            catalogo_id: item.id,
            nombre_cliente: cliente || 'Cliente mostrador',
            canal,
            precio_venta: item.precio_venta * (1 - descuento / 100),
            notas: ''
          }));
        }
      });
      if (insumoItems.length > 0) {
        promises.push(api.post('/insumos/venta-directa', {
          items: insumoItems.map(i => ({ insumo_id: i.id, cantidad: i.cantidad, precio_unitario: i.precio_unitario })),
          nombre_cliente: cliente || 'Cliente mostrador',
          canal,
          descuento,
        }));
      }
      return Promise.all(promises);
    },
    onSuccess: () => {
      const snap = {
        numero: `VTA-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
        items: carrito.map(i => ({ ...i })),
        cliente: cliente || 'Cliente mostrador',
        email: emailCliente,
        canal,
        descuento,
        subtotal,
        descuentoMonto,
        total,
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
    setPagoCliente('');
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
      const precioSugerido = Math.ceil(parseFloat(insumo.costo_unitario) * 2 / 50) * 50;
      return [...prev, { _key: key, tipo: 'insumo', id: insumo.id, nombre: insumo.nombre, unidad: insumo.unidad, cantidad: 1, precio_unitario: precioSugerido, costo_unitario: insumo.costo_unitario }];
    });
  };

  const cambiarCantidad = (key, delta) => {
    setCarrito(prev => prev
      .map(i => i._key === key ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i)
      .filter(i => i.cantidad > 0));
  };

  const cambiarPrecioInsumo = (key, valor) => {
    setCarrito(prev => prev.map(i => i._key === key ? { ...i, precio_unitario: Number(valor) } : i));
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

  const pagoNum  = parseFloat(pagoCliente) || 0;
  const vuelto   = pagoNum > 0 ? pagoNum - total : null;

  const getMargenColor = (precio, costo) => {
    if (!precio || !costo) return 'text-gray-500';
    const m = ((precio - costo) / precio) * 100;
    return m >= 30 ? 'text-emerald-400' : m >= 15 ? 'text-yellow-400' : 'text-red-400';
  };

  return (
    <div className="flex gap-6 h-full" style={{ maxHeight: 'calc(100vh - 8rem)' }}>

      {/* ── Panel Izquierdo ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Punto de Venta</h1>
            <p className="text-gray-500 text-sm">
              {tab === 'arreglos' ? `${catalogoFiltrado.length} arreglos` : `${insumosFiltrados.length} productos`}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => { setTab('arreglos'); setBusqueda(''); setCategoriaFiltro(''); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === 'arreglos' ? 'bg-brand-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}>
            <LayoutGrid size={15} /> Arreglos
          </button>
          <button onClick={() => { setTab('venta-general'); setBusqueda(''); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${tab === 'venta-general' ? 'bg-brand-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'}`}>
            <Layers size={15} /> Venta General
          </button>
        </div>

        {/* Barra de búsqueda + orden + botón categorías */}
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className="input w-full pl-9 text-sm"
              placeholder="Buscar por nombre o código (Enter para agregar)"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={handleBusquedaEnter} />
          </div>
          <select className="input text-xs py-2 w-32 flex-shrink-0" value={orden} onChange={e => setOrden(e.target.value)}>
            <option value="nombre">A – Z</option>
            <option value="precio_asc">Precio ↑</option>
            <option value="precio_desc">Precio ↓</option>
          </select>
          {tab === 'venta-general' && (
            <button onClick={() => setModalCategorias(true)}
              className="btn-secondary flex-shrink-0 flex items-center gap-2 text-sm px-4">
              <Layers size={15} /> Categorías
            </button>
          )}
        </div>

        {/* Arreglos: pills de subcategoría */}
        {tab === 'arreglos' && categoriasArreglos.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-3">
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
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tab === 'arreglos' ? (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {catalogoFiltrado.map(arreglo => {
                const enCarrito = carrito.find(i => i._key === `cat-${arreglo.id}`);
                const margen = arreglo.precio_venta && arreglo.costo_calculado
                  ? (((arreglo.precio_venta - arreglo.costo_calculado) / arreglo.precio_venta) * 100).toFixed(0) : 0;
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
                    <div className="flex items-center justify-between mt-1.5">
                      <span className={`text-xs font-medium ${getMargenColor(arreglo.precio_venta, arreglo.costo_calculado)}`}>
                        Margen {margen}%
                      </span>
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
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {insumosFiltrados.map(insumo => {
                const enCarrito = carrito.find(i => i._key === `ins-${insumo.id}`);
                const stockOk = parseFloat(insumo.stock_actual) > 0;
                return (
                  <motion.div key={insumo.id}
                    whileHover={{ scale: stockOk ? 1.02 : 1 }} whileTap={{ scale: stockOk ? 0.98 : 1 }}
                    onClick={() => stockOk && agregarFlor(insumo)}
                    className={`card transition-all select-none ${!stockOk ? 'opacity-40 cursor-not-allowed' : enCarrito ? 'border-brand-500/50 bg-brand-500/5 cursor-pointer' : 'hover:border-gray-600 cursor-pointer'}`}>
                    <div className="w-full h-24 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl mb-3 flex items-center justify-center border border-gray-700">
                      <Leaf size={32} className={TIPO_COLOR[insumo.categoria_tipo] || 'text-gray-500'} style={{ opacity: 0.6 }} />
                    </div>
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
      <div className="w-80 flex-shrink-0 flex flex-col">
        <div className="card flex-1 flex flex-col p-0 overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center gap-2">
            <ShoppingCart size={18} className="text-brand-400" />
            <h2 className="font-semibold text-white">Carrito</h2>
            {carrito.length > 0 && (
              <span className="ml-auto bg-brand-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {carrito.reduce((s, i) => s + i.cantidad, 0)}
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
                        <label className="text-xs text-gray-500 mb-1 block">Precio de venta (₡ c/u)</label>
                        <input type="number" min="0" step="50"
                          className="input w-full text-sm py-1.5 text-brand-400 font-semibold"
                          value={item.precio_unitario}
                          onChange={e => cambiarPrecioInsumo(item._key, e.target.value)}
                          onClick={e => e.stopPropagation()} />
                        <p className="text-xs text-gray-600 mt-0.5">Costo: {formatMoney(item.costo_unitario)}/u</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => cambiarCantidad(item._key, -1)}
                          className="w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors">
                          <Minus size={11} />
                        </button>
                        <span className="text-white font-bold text-sm w-4 text-center">{item.cantidad}</span>
                        <button onClick={() => cambiarCantidad(item._key, 1)}
                          className="w-6 h-6 rounded-full bg-brand-600 hover:bg-brand-500 flex items-center justify-center transition-colors">
                          <Plus size={11} />
                        </button>
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
                <div className="relative">
                  <Tag size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input type="number" min="0" max="100" className="input w-full pl-8 text-sm py-2" placeholder="Descuento %"
                    value={descuento || ''} onChange={e => setDescuento(Math.min(100, Math.max(0, Number(e.target.value))))} />
                </div>
              </div>

              {/* ── Totales ── */}
              <div className="px-3 pt-3 space-y-1 text-sm">
                {descuento > 0 && (
                  <>
                    <div className="flex justify-between text-gray-500">
                      <span>Subtotal</span><span>{formatMoney(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-red-400">
                      <span>Descuento ({descuento}%)</span><span>-{formatMoney(descuentoMonto)}</span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
                  <span className="text-gray-300 font-semibold text-base">Total</span>
                  <span className="text-brand-400 font-extrabold text-xl tabular-nums">{formatMoney(total)}</span>
                </div>
              </div>

              {/* ── Pago y vuelto ── */}
              <div className="px-3 pt-2 pb-1">
                <p className="text-xs text-gray-500 mb-1.5 font-medium">Pago del cliente</p>
                <input
                  type="number" min="0" step="500"
                  className="input w-full text-base font-bold py-2.5 text-center tabular-nums"
                  placeholder="₡ 0"
                  value={pagoCliente}
                  onChange={e => setPagoCliente(e.target.value)}
                />
              </div>

              {vuelto !== null && (
                <div className={`mx-3 mb-1 flex items-center justify-between rounded-xl px-4 py-3 ${
                  vuelto >= 0
                    ? 'bg-emerald-500/15 border border-emerald-500/25'
                    : 'bg-red-500/15 border border-red-500/25'
                }`}>
                  <span className={`text-sm font-bold ${vuelto >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {vuelto >= 0 ? 'Vuelto' : 'Falta'}
                  </span>
                  <span className={`text-2xl font-extrabold tabular-nums ${vuelto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatMoney(Math.abs(vuelto))}
                  </span>
                </div>
              )}

              <div className="p-3">
                <button
                  onClick={() => setModalConfirm(true)}
                  disabled={pagoNum > 0 && vuelto < 0}
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
                        {item.nombre}{item.tipo === 'insumo' && <span className="text-pink-400 text-xs ml-1">(suelta)</span>} ×{item.cantidad}
                      </span>
                      <span className="text-white font-medium flex-shrink-0">{formatMoney(precio * item.cantidad)}</span>
                    </div>
                  );
                })}
              </div>
              {descuento > 0 && (
                <div className="flex justify-between text-sm text-red-400 mb-1">
                  <span>Descuento {descuento}%</span><span>-{formatMoney(descuentoMonto)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-gray-700 pt-3 mb-4">
                <span className="text-white">Total</span>
                <span className="text-brand-400">{formatMoney(total)}</span>
              </div>
              {cliente && <p className="text-xs text-gray-500 mb-4">Cliente: {cliente} · {canal}</p>}
              <div className="flex gap-3">
                <button onClick={() => setModalConfirm(false)} className="btn-secondary flex-1 text-sm">Cancelar</button>
                <button onClick={() => ventaMutation.mutate()} disabled={ventaMutation.isPending} className="btn-primary flex-1 text-sm">
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
                      <span className="text-gray-300">{item.nombre} ×{item.cantidad}</span>
                      <span className="text-white font-medium">{formatMoney(precio * item.cantidad)}</span>
                    </div>
                  );
                })}
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
