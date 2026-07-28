import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Printer, Edit, Trash2, X, Clock, Package,
  CheckCircle, XCircle, Search, ChevronDown, Flower2,
  Wallet, History, Banknote, CreditCard, Smartphone, PlusCircle, FileText, Archive
} from 'lucide-react';
import api, { formatMoney, hoyCR } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';

// ── Estado config ─────────────────────────────────────────────────────────────
const ESTADO = {
  pendiente: { label: 'Pendiente',  cls: 'badge-yellow', Icon: Clock },
  listo:     { label: 'Listo',      cls: 'badge-blue',   Icon: Package },
  entregado: { label: 'Entregado',  cls: 'badge-green',  Icon: CheckCircle },
  cancelado: { label: 'Cancelado',  cls: 'badge-red',    Icon: XCircle },
};

const FORMAS_PAGO = [
  { value: 'efectivo', label: 'Efectivo', Icon: Banknote },
  { value: 'tarjeta',  label: 'Tarjeta',  Icon: CreditCard },
  { value: 'sinpe',    label: 'Sinpe',    Icon: Smartphone },
];

const TIPO_MOVIMIENTO = {
  creacion:       { label: 'Pedido creado',  Icon: PlusCircle, color: 'text-brand-400' },
  cambio_estado:  { label: 'Cambio de estado', Icon: History,  color: 'text-sky-400' },
  abono:          { label: 'Abono registrado', Icon: Wallet,   color: 'text-emerald-400' },
};

// ── PDF idéntico al facturero físico ──────────────────────────────────────────
function imprimirPedido(p) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [148, 210] });
  const W = 148, L = 7, R = 141, cw = R - L;
  const navy = [0, 0, 120], black = [0, 0, 0], red = [180, 0, 0];

  doc.setDrawColor(...navy); doc.setLineWidth(0.6);
  doc.rect(L - 1, 4, cw + 2, 198, 'S');

  doc.setTextColor(...navy); doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(15);
  doc.text('Alma Caribena', 38, 13);
  doc.text('Floristeria', 42, 20);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  doc.text('Telefono: 6358-3644', W / 2, 26, { align: 'center' });
  doc.text('SIQUIRRES, FRENTE A LA IMPRENTA', W / 2, 31, { align: 'center' });

  const bx = R - 34, by = 6, bw = 34, bh = 20;
  doc.setLineWidth(0.4); doc.rect(bx, by, bw, bh, 'S');
  doc.line(bx + 11.3, by, bx + 11.3, by + bh);
  doc.line(bx + 22.6, by, bx + 22.6, by + bh);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.text('DIA', bx + 5.6, by + 5, { align: 'center' });
  doc.text('MES', bx + 17, by + 5, { align: 'center' });
  doc.text('ANO', bx + 28.3, by + 5, { align: 'center' });
  if (p.fecha) {
    const parts = (typeof p.fecha === 'string' ? p.fecha : new Date(p.fecha).toISOString()).split('T')[0].split('-');
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(parts[2], bx + 5.6, by + 14, { align: 'center' });
    doc.text(parts[1], bx + 17, by + 14, { align: 'center' });
    doc.text(parts[0].slice(2), bx + 28.3, by + 14, { align: 'center' });
  }

  doc.setTextColor(...black);
  const hline = (label, value, y) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(label, L + 1, y - 1.2);
    doc.setLineWidth(0.2); doc.line(L, y, R, y);
    if (value) { doc.setFontSize(8.5); doc.text(String(value), L + doc.getTextWidth(label) + 3, y - 1.5); }
  };

  let y = 36;
  doc.setLineWidth(0.35); doc.rect(L - 1, y - 3, cw + 2, 30, 'S');
  hline('Senor(es):', p.cliente_nombre || '', y + 2); y += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('Tel:', L + 1, y - 1.2); doc.setLineWidth(0.2);
  doc.line(L, y, L + 52, y);
  if (p.cliente_telefono) doc.text(p.cliente_telefono, L + 8, y - 1.5);
  doc.text('Hora de Entrega:', L + 56, y - 1.2);
  doc.line(L + 56, y, R, y);
  if (p.hora_entrega) doc.text(p.hora_entrega, L + 56 + doc.getTextWidth('Hora de Entrega:') + 2, y - 1.5);
  y += 10;
  hline('Direccion:', p.direccion || '', y + 2); y += 13;

  // Arreglos del pedido
  const arreglos = (p.items || []).filter(i => i.tipo === 'arreglo');
  const insumos  = (p.items || []).filter(i => i.tipo === 'insumo');
  const tipoText = p.tipo_arreglo || arreglos.map(a => a.nombre).join(', ') || '';
  const ramoText = arreglos.map(a => `${a.cantidad}x ${a.nombre}`).join(' / ');
  const insumosText = insumos.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');

  doc.setLineWidth(0.35); doc.rect(L - 1, y - 3, cw + 2, 26, 'S');
  hline('Tipo de arreglo:', tipoText, y + 2); y += 12;
  hline('Ramo:', ramoText, y + 2);
  if (insumosText) { doc.setFontSize(7.5); doc.text(`Flores: ${insumosText}`, L + 1, y + 5); }
  y += 14;

  const saldo = (parseFloat(p.precio) || 0) - (parseFloat(p.adelanto) || 0);
  const fmtN = n => 'CRC ' + Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 0 });

  doc.setLineWidth(0.35); doc.rect(L - 1, y - 3, cw + 2, 44, 'S');
  const moneyLine = (label, val, ly) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...black);
    doc.text(label, L + 1, ly - 1.2); doc.setLineWidth(0.2); doc.line(L, ly, R, ly);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(fmtN(val), R - 1, ly - 1.5, { align: 'right' }); doc.setFont('helvetica', 'normal');
  };
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text('Tributo #', L + 1, y - 1.2); doc.setLineWidth(0.2); doc.line(L, y, R, y);
  if (p.tributo_numero) doc.text(p.tributo_numero, L + 18, y - 1.5);
  y += 11;
  moneyLine('PRECIO', p.precio, y); y += 11;
  moneyLine('ADELANTO', p.adelanto, y); y += 11;
  moneyLine('SALDO', saldo, y); y += 14;

  doc.setLineWidth(0.35); doc.rect(L - 1, y - 3, cw + 2, 22, 'S');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...black);
  doc.text('Tipo de Pago:', L + 1, y + 3);
  const chk = (cx, cy, checked) => {
    doc.setLineWidth(0.3); doc.rect(cx, cy - 3.5, 4, 4, 'S');
    if (checked) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...navy); doc.text('X', cx + 0.7, cy); doc.setTextColor(...black); }
  };
  const pago = p.tipo_pago || 'efectivo';
  chk(L + 30, y + 3, pago === 'efectivo'); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text('Efectivo', L + 36, y + 3);
  chk(L + 62, y + 3, pago === 'sinpe');    doc.text('Sinpe', L + 68, y + 3);
  chk(L + 86, y + 3, pago === 'tarjeta');  doc.text('Tarjeta', L + 92, y + 3);
  y += 11;
  const entrega = p.tipo_entrega || 'tienda';
  chk(L + 1, y + 3, entrega === 'tienda');   doc.text('Retira en Tienda', L + 7, y + 3);
  chk(L + 46, y + 3, entrega === 'express'); doc.text('Envio por Express', L + 52, y + 3);
  y += 13;

  doc.setLineWidth(0.35); doc.rect(L - 1, y - 3, cw + 2, 28, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('DEDICATORIA:', L + 1, y + 3);
  doc.setLineWidth(0.15); [7, 14, 21].forEach(off => doc.line(L, y + off, R, y + off));
  if (p.dedicatoria) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(doc.splitTextToSize(p.dedicatoria, cw - 4).slice(0, 3), L + 2, y + 6); }
  y += 28;

  doc.setLineWidth(0.35); doc.rect(L - 1, y - 3, cw + 2, 26, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('OBSERVACIONES:', L + 1, y + 3);
  doc.setLineWidth(0.15); [7, 14, 20].forEach(off => doc.line(L, y + off, R, y + off));
  if (p.observaciones) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(doc.splitTextToSize(p.observaciones, cw - 4).slice(0, 2), L + 2, y + 6); }
  y += 26;

  doc.setLineWidth(0.5); doc.setDrawColor(...navy);
  doc.rect(L - 1, y - 2, cw + 2, 16, 'S');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...black);
  doc.text('ORDEN DE PEDIDO', W / 2, y + 5, { align: 'center' });
  doc.setFontSize(14); doc.setTextColor(...red);
  doc.text(`No. ${p.numero || '0000001'}`, W / 2, y + 12, { align: 'center' });

  doc.save(`pedido_${p.numero || 'nuevo'}.pdf`);
}

// ── Buscador con dropdown ─────────────────────────────────────────────────────
function BuscadorDropdown({ placeholder, items, onSelect, renderItem, renderTag, disabled }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const filtrados = useMemo(() =>
    items.filter(i => !query || i.nombre.toLowerCase().includes(query.toLowerCase())).slice(0, 8),
    [items, query]
  );

  // cerrar al clic fuera
  React.useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="input pl-9 text-sm" placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
        />
      </div>
      <AnimatePresence>
        {open && filtrados.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl z-20 shadow-xl overflow-hidden">
            {filtrados.map(item => (
              <button key={item.id} type="button"
                onClick={() => { onSelect(item); setQuery(''); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-700 transition-colors border-b border-gray-700/50 last:border-0">
                {renderItem(item)}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Formulario ────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  fecha: hoyCR(),
  cliente_nombre: '', cliente_telefono: '', hora_entrega: '', direccion: '',
  tipo_arreglo: '', tributo_numero: '',
  adelanto: '',
  tipo_pago: 'efectivo', tipo_entrega: 'tienda',
  dedicatoria: '', observaciones: '',
};

function PedidoModal({ pedido, onClose, onSave, isPending }) {
  const [form, setForm] = useState(pedido ? {
    fecha:            (typeof pedido.fecha === 'string' ? pedido.fecha : new Date(pedido.fecha).toISOString()).split('T')[0],
    cliente_nombre:   pedido.cliente_nombre   || '',
    cliente_telefono: pedido.cliente_telefono || '',
    hora_entrega:     pedido.hora_entrega     || '',
    direccion:        pedido.direccion        || '',
    tipo_arreglo:     pedido.tipo_arreglo     || '',
    tributo_numero:   pedido.tributo_numero   || '',
    adelanto:         pedido.adelanto         || '',
    tipo_pago:        pedido.tipo_pago        || 'efectivo',
    tipo_entrega:     pedido.tipo_entrega     || 'tienda',
    dedicatoria:      pedido.dedicatoria      || '',
    observaciones:    pedido.observaciones    || '',
  } : { ...EMPTY_FORM });

  const [items, setItems] = useState(pedido?.items || []);
  // null = modo automático (usa totalItems); '' o string = valor manual del usuario
  const [precioOverride, setPrecioOverride] = useState(
    pedido?.precio != null ? String(parseFloat(pedido.precio) || '') : null
  );

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: catalogo = [] } = useQuery({
    queryKey: ['catalogo'],
    queryFn: () => api.get('/catalogo').then(r => r.data.data),
  });
  const { data: insumos = [] } = useQuery({
    queryKey: ['insumos'],
    queryFn: () => api.get('/insumos').then(r => r.data.data),
  });

  const agregarArreglo = (a) => {
    setItems(prev => {
      const existe = prev.find(i => i.tipo === 'arreglo' && i.referencia_id === a.id);
      if (existe) return prev.map(i => i.tipo === 'arreglo' && i.referencia_id === a.id
        ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * parseFloat(i.precio_unitario) }
        : i);
      return [...prev, {
        tipo: 'arreglo', referencia_id: a.id, nombre: a.nombre,
        cantidad: 1, precio_unitario: parseFloat(a.precio_venta) || 0,
        subtotal: parseFloat(a.precio_venta) || 0
      }];
    });
  };

  const agregarInsumo = (ins) => {
    setItems(prev => {
      const existe = prev.find(i => i.tipo === 'insumo' && i.referencia_id === ins.id);
      if (existe) return prev.map(i => i.tipo === 'insumo' && i.referencia_id === ins.id
        ? { ...i, cantidad: i.cantidad + 1, subtotal: (i.cantidad + 1) * parseFloat(i.precio_unitario) }
        : i);
      return [...prev, {
        tipo: 'insumo', referencia_id: ins.id, nombre: ins.nombre,
        cantidad: 1, precio_unitario: parseFloat(ins.costo_unitario) || 0,
        subtotal: parseFloat(ins.costo_unitario) || 0
      }];
    });
  };

  const cambiarCantidad = (idx, nueva) => {
    const n = Math.max(1, parseInt(nueva) || 1);
    setItems(prev => prev.map((item, i) => i === idx
      ? { ...item, cantidad: n, subtotal: n * parseFloat(item.precio_unitario) }
      : item));
  };

  const cambiarPrecio = (idx, nuevo) => {
    const p = parseFloat(nuevo) || 0;
    setItems(prev => prev.map((item, i) => i === idx
      ? { ...item, precio_unitario: p, subtotal: item.cantidad * p }
      : item));
  };

  const quitarItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const totalItems  = items.reduce((s, i) => s + parseFloat(i.subtotal || 0), 0);
  const precioFinal = precioOverride !== null ? parseFloat(precioOverride) || 0 : totalItems;
  const adelantoNum = parseFloat(form.adelanto) || 0;
  const saldo       = precioFinal - adelantoNum;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.fecha) return toast.error('La fecha es requerida');
    if (items.length === 0) return toast.error('Agrega al menos un arreglo o flor');
    onSave({ ...form, items, precio: precioFinal, ...(pedido?.id && { id: pedido.id }) });
  };

  const arreglosCatalogo = catalogo.filter(a => a.activo !== false);
  const insumosDisponibles = insumos.filter(i => i.activo !== false);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="card w-full max-w-2xl my-4">

        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">
            {pedido ? `Editar Pedido #${pedido.numero}` : 'Nuevo Pedido'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Fecha ── */}
          <div>
            <label className="label">Fecha del pedido *</label>
            <input type="date" className="input" required
              value={form.fecha} onChange={e => set('fecha', e.target.value)} />
          </div>

          {/* ── Cliente ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Nombre del cliente</label>
              <input className="input" placeholder="Señor(es)..."
                value={form.cliente_nombre} onChange={e => set('cliente_nombre', e.target.value)} />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input" placeholder="6358-0000"
                value={form.cliente_telefono} onChange={e => set('cliente_telefono', e.target.value)} />
            </div>
            <div>
              <label className="label">Hora de entrega</label>
              <input className="input" placeholder="Ej: 2:00 PM"
                value={form.hora_entrega} onChange={e => set('hora_entrega', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Dirección</label>
              <input className="input" placeholder="Dirección o referencia"
                value={form.direccion} onChange={e => set('direccion', e.target.value)} />
            </div>
          </div>

          {/* ── Artículos del pedido ── */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <Flower2 size={15} className="text-brand-400" />
              Qué lleva el pedido
            </h4>

            {/* Buscar arreglo del catálogo */}
            <div>
              <label className="label mb-1.5 block">Arreglos del catálogo</label>
              <BuscadorDropdown
                placeholder="Buscar arreglo (rosas, corona, centro...)"
                items={arreglosCatalogo}
                onSelect={agregarArreglo}
                renderItem={(a) => (
                  <div className="flex items-center justify-between">
                    <span className="text-white">{a.nombre}</span>
                    <span className="text-brand-400 text-xs font-semibold">{formatMoney(a.precio_venta)}</span>
                  </div>
                )}
              />
            </div>

            {/* Buscar flores sueltas */}
            <div>
              <label className="label mb-1.5 block">Flores sueltas / materiales</label>
              <BuscadorDropdown
                placeholder="Buscar flor o material suelto (rosa, girasol...)"
                items={insumosDisponibles}
                onSelect={agregarInsumo}
                renderItem={(i) => (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-white">{i.nombre}</span>
                      <span className="text-gray-500 text-xs ml-2">{i.categoria_nombre}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-yellow-400 text-xs">{formatMoney(i.costo_unitario)}/{i.unidad}</span>
                      <span className="text-gray-600 text-xs ml-2">Stock: {parseFloat(i.stock_actual)}</span>
                    </div>
                  </div>
                )}
              />
            </div>

            {/* Lista de items agregados */}
            {items.length > 0 && (
              <div className="rounded-xl border border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/50">
                      <th className="th">Artículo</th>
                      <th className="th text-center w-20">Cant.</th>
                      <th className="th text-right">Precio</th>
                      <th className="th text-right">Subtotal</th>
                      <th className="th w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className="table-row">
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              item.tipo === 'arreglo' ? 'bg-brand-500/20 text-brand-400' : 'bg-yellow-500/20 text-yellow-400'
                            }`}>
                              {item.tipo === 'arreglo' ? 'Arreglo' : 'Flor'}
                            </span>
                            <span className="text-sm text-white">{item.nombre}</span>
                          </div>
                        </td>
                        <td className="td">
                          <div className="flex items-center justify-center gap-1">
                            <button type="button"
                              onClick={() => cambiarCantidad(idx, item.cantidad - 1)}
                              className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-base font-bold flex-shrink-0 touch-manipulation select-none">
                              −
                            </button>
                            <input type="number" min="1" step="1" inputMode="numeric"
                              className="input w-12 text-sm text-center py-1"
                              value={item.cantidad}
                              onChange={e => cambiarCantidad(idx, e.target.value)} />
                            <button type="button"
                              onClick={() => cambiarCantidad(idx, item.cantidad + 1)}
                              className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center text-base font-bold flex-shrink-0 touch-manipulation select-none">
                              +
                            </button>
                          </div>
                        </td>
                        <td className="td text-right">
                          <input type="number" min="0" step="1" inputMode="numeric"
                            className="input w-24 text-sm text-right py-1 ml-auto block"
                            value={item.precio_unitario}
                            onChange={e => cambiarPrecio(idx, e.target.value)} />
                        </td>
                        <td className="td text-right font-semibold text-brand-400 text-sm tabular-nums">
                          {formatMoney(item.subtotal)}
                        </td>
                        <td className="td">
                          <button type="button" onClick={() => quitarItem(idx)}
                            className="text-gray-600 hover:text-red-400 transition-colors">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-700 bg-gray-900/30">
                      <td colSpan={3} className="td text-right text-sm font-semibold text-gray-400">Total:</td>
                      <td className="td text-right font-bold text-white text-base tabular-nums">{formatMoney(totalItems)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>
            )}

            {items.length === 0 && (
              <div className="border border-dashed border-gray-700 rounded-xl p-6 text-center">
                <Flower2 size={24} className="text-gray-700 mx-auto mb-2" />
                <p className="text-gray-600 text-sm">Busca y agrega arreglos o flores sueltas</p>
              </div>
            )}
          </div>

          {/* ── Descripción adicional ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tipo de arreglo (descripción libre)</label>
              <input className="input" placeholder="Ej: Corona fúnebre, Bouquet novia..."
                value={form.tipo_arreglo} onChange={e => set('tipo_arreglo', e.target.value)} />
            </div>
            <div>
              <label className="label">Tributo # (opcional)</label>
              <input className="input" placeholder="Número de tributo"
                value={form.tributo_numero} onChange={e => set('tributo_numero', e.target.value)} />
            </div>
          </div>

          {/* ── Pago ── */}
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-semibold text-white">Pago</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label className="label">Total ₡</label>
                <div className="relative">
                  <input
                    type="number" min="0" step="1" inputMode="numeric"
                    className="input font-bold text-white tabular-nums pr-14"
                    value={precioOverride !== null ? precioOverride : totalItems}
                    onChange={e => setPrecioOverride(e.target.value)}
                  />
                  {precioOverride !== null && (
                    <button
                      type="button"
                      onClick={() => setPrecioOverride(null)}
                      title="Restaurar total calculado"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-600/20 text-brand-400 hover:bg-brand-600/40 transition-colors"
                    >
                      auto
                    </button>
                  )}
                </div>
                {precioOverride !== null && totalItems > 0 && parseFloat(precioOverride) !== totalItems && (
                  <p className="text-[11px] text-gray-500 mt-1">Calculado: {formatMoney(totalItems)}</p>
                )}
              </div>
              <div>
                <label className="label">Adelanto ₡</label>
                {pedido ? (
                  <>
                    <div className="input font-semibold text-gray-400 tabular-nums">{formatMoney(form.adelanto)}</div>
                    <p className="text-[11px] text-gray-600 mt-1">Usa el botón "Abonar" para registrar pagos adicionales</p>
                  </>
                ) : (
                  <input type="number" min="0" step="1" inputMode="numeric" className="input"
                    placeholder="0" value={form.adelanto}
                    onChange={e => set('adelanto', e.target.value)} />
                )}
              </div>
              <div>
                <label className="label">Saldo ₡</label>
                <div className={`input font-bold tabular-nums ${saldo > 0 ? 'text-yellow-400' : saldo < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                  {formatMoney(saldo)}
                </div>
              </div>
            </div>

            <div>
              <label className="label mb-2 block">Tipo de pago</label>
              <div className="flex gap-2">
                {['efectivo', 'sinpe', 'tarjeta'].map(op => (
                  <button key={op} type="button" onClick={() => set('tipo_pago', op)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all capitalize ${
                      form.tipo_pago === op ? 'bg-brand-600/20 border-brand-600/40 text-brand-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}>
                    {op.charAt(0).toUpperCase() + op.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label mb-2 block">Entrega</label>
              <div className="flex gap-2">
                {[{ val: 'tienda', label: 'Retira en Tienda' }, { val: 'express', label: 'Envío por Express' }].map(op => (
                  <button key={op.val} type="button" onClick={() => set('tipo_entrega', op.val)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                      form.tipo_entrega === op.val ? 'bg-brand-600/20 border-brand-600/40 text-brand-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}>
                    {op.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Dedicatoria y observaciones ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Dedicatoria</label>
              <textarea className="input resize-none" rows={3} placeholder="Mensaje para la dedicatoria..."
                value={form.dedicatoria} onChange={e => set('dedicatoria', e.target.value)} />
            </div>
            <div>
              <label className="label">Observaciones</label>
              <textarea className="input resize-none" rows={3} placeholder="Instrucciones especiales..."
                value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 justify-center">
              {isPending ? 'Guardando...' : pedido ? 'Guardar cambios' : 'Registrar pedido'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancelar</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Modal: abonar saldo pendiente ──────────────────────────────────────────────
function AbonoModal({ pedido, onClose, onConfirm, isPending }) {
  const saldo = (parseFloat(pedido.precio) || 0) - (parseFloat(pedido.adelanto) || 0);
  const [monto, setMonto] = useState(String(saldo));
  const [formaPago, setFormaPago] = useState(pedido.tipo_pago || 'efectivo');

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-lg">Abonar pedido #{pedido.numero}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Saldo pendiente: <span className="text-yellow-400 font-bold">{formatMoney(saldo)}</span>
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Monto a abonar (₡)</label>
            <input type="number" min="0" step="100" className="input font-bold text-brand-400"
              value={monto} onChange={e => setMonto(e.target.value)} />
          </div>
          <div>
            <label className="label mb-2 block">Forma de pago</label>
            <div className="flex gap-2">
              {FORMAS_PAGO.map(({ value, label, Icon }) => (
                <button key={value} type="button" onClick={() => setFormaPago(value)}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                    formaPago === value ? 'bg-brand-600/20 border-brand-600/40 text-brand-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}>
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-5">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancelar</button>
          <button onClick={() => onConfirm({ monto: parseFloat(monto) || 0, tipo_pago: formaPago })}
            disabled={isPending} className="btn-primary flex-1 text-sm">
            {isPending ? 'Registrando...' : 'Confirmar abono'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Modal: historial de movimientos del pedido ─────────────────────────────────
function MovimientosModal({ pedido, onClose }) {
  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ['pedido-movimientos', pedido.id],
    queryFn: () => api.get(`/pedidos/${pedido.id}/movimientos`).then(r => r.data.data),
  });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="card w-full max-w-md" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h3 className="text-white font-bold text-lg">Movimientos · #{pedido.numero}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto space-y-2" style={{ maxHeight: '60vh' }}>
          {isLoading ? (
            <p className="text-gray-600 text-sm text-center py-6">Cargando...</p>
          ) : movimientos.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">Sin movimientos registrados</p>
          ) : movimientos.map(m => {
            const cfg = TIPO_MOVIMIENTO[m.tipo] || TIPO_MOVIMIENTO.cambio_estado;
            const fecha = new Date(m.fecha).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Costa_Rica' });
            return (
              <div key={m.id} className="flex items-start gap-3 bg-gray-800/50 rounded-xl px-3 py-2.5">
                <cfg.Icon size={16} className={`mt-0.5 flex-shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">
                    {m.tipo === 'cambio_estado' && m.estado_anterior && m.estado_nuevo
                      ? `${ESTADO[m.estado_anterior]?.label || m.estado_anterior} → ${ESTADO[m.estado_nuevo]?.label || m.estado_nuevo}`
                      : cfg.label}
                  </p>
                  {m.descripcion && <p className="text-xs text-gray-400 mt-0.5">{m.descripcion}</p>}
                  <p className="text-xs text-gray-600 mt-0.5">{fecha}</p>
                </div>
                {m.monto != null && <span className="text-sm font-bold text-emerald-400 tabular-nums flex-shrink-0">{formatMoney(m.monto)}</span>}
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

// ── Modal: historial de movimientos de TODOS los pedidos ──────────────────────
function MovimientosGlobalModal({ onClose }) {
  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ['pedido-movimientos-global'],
    queryFn: () => api.get('/pedidos/movimientos').then(r => r.data.data),
  });

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="card w-full max-w-lg" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h3 className="text-white font-bold text-lg">Movimientos de pedidos</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto space-y-2" style={{ maxHeight: '65vh' }}>
          {isLoading ? (
            <p className="text-gray-600 text-sm text-center py-6">Cargando...</p>
          ) : movimientos.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">Sin movimientos registrados</p>
          ) : movimientos.map(m => {
            const cfg = TIPO_MOVIMIENTO[m.tipo] || TIPO_MOVIMIENTO.cambio_estado;
            const fecha = new Date(m.fecha).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Costa_Rica' });
            return (
              <div key={m.id} className="flex items-start gap-3 bg-gray-800/50 rounded-xl px-3 py-2.5">
                <cfg.Icon size={16} className={`mt-0.5 flex-shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">
                    #{m.numero} · {m.cliente_nombre || '(sin nombre)'}
                  </p>
                  <p className="text-xs text-gray-300 mt-0.5">
                    {m.tipo === 'cambio_estado' && m.estado_anterior && m.estado_nuevo
                      ? `${ESTADO[m.estado_anterior]?.label || m.estado_anterior} → ${ESTADO[m.estado_nuevo]?.label || m.estado_nuevo}`
                      : cfg.label}
                  </p>
                  {m.descripcion && <p className="text-xs text-gray-400 mt-0.5">{m.descripcion}</p>}
                  <p className="text-xs text-gray-600 mt-0.5">{fecha}</p>
                </div>
                {m.monto != null && <span className="text-sm font-bold text-emerald-400 tabular-nums flex-shrink-0">{formatMoney(m.monto)}</span>}
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

// ── Tarjeta de pedido ─────────────────────────────────────────────────────────
function PedidoCard({ p, onEdit, onDelete, onEstado, onAbonar, onMovimientos }) {
  const cfg = ESTADO[p.estado] || ESTADO.pendiente;
  const saldo = (parseFloat(p.precio) || 0) - (parseFloat(p.adelanto) || 0);
  const puedeAbonar = saldo > 0 && p.estado !== 'entregado' && p.estado !== 'cancelado';
  const [showEstado, setShowEstado] = useState(false);

  const fecha = p.fecha
    ? new Date((typeof p.fecha === 'string' ? p.fecha : p.fecha).split('T')[0] + 'T12:00:00')
        .toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="card hover:border-gray-700 transition-colors">

      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold text-white tabular-nums">#{p.numero}</span>
            <span className={`badge ${cfg.cls} text-xs`}>{cfg.label}</span>
          </div>
          <p className="text-base font-semibold text-white mt-0.5">{p.cliente_nombre || '(sin nombre)'}</p>
          {p.cliente_telefono && <p className="text-xs text-gray-500 mt-0.5">{p.cliente_telefono}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-500">{fecha}</p>
          {p.hora_entrega && <p className="text-xs text-brand-400 font-medium mt-0.5">{p.hora_entrega}</p>}
        </div>
      </div>

      {p.tipo_arreglo && (
        <p className="text-sm text-gray-300 bg-gray-800/50 rounded-xl px-3 py-2 mb-3">{p.tipo_arreglo}</p>
      )}

      {(p.items || []).length > 0 && (
        <div className="mb-3 space-y-1">
          {(p.items || []).map((item, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  item.tipo === 'arreglo' ? 'bg-brand-500/20 text-brand-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>{item.tipo === 'arreglo' ? 'Arreglo' : 'Flor'}</span>
                <span className="text-gray-300">{item.cantidad}x {item.nombre}</span>
              </div>
              <span className="text-gray-400 tabular-nums">{formatMoney(item.subtotal)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center bg-gray-800/40 rounded-lg p-2">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-sm font-bold text-white tabular-nums">{formatMoney(p.precio)}</p>
        </div>
        <div className="text-center bg-gray-800/40 rounded-lg p-2">
          <p className="text-xs text-gray-500">Adelanto</p>
          <p className="text-sm font-bold text-emerald-400 tabular-nums">{formatMoney(p.adelanto)}</p>
        </div>
        <div className="text-center bg-gray-800/40 rounded-lg p-2">
          <p className="text-xs text-gray-500">Saldo</p>
          <p className={`text-sm font-bold tabular-nums ${saldo > 0 ? 'text-yellow-400' : 'text-gray-400'}`}>{formatMoney(saldo)}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full capitalize">{p.tipo_pago}</span>
        <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full">
          {p.tipo_entrega === 'tienda' ? 'Retira en tienda' : 'Envío Express'}
        </span>
      </div>

      <div className="relative mb-2">
        <button onClick={() => setShowEstado(v => !v)}
          className="btn-secondary w-full justify-center text-xs py-1.5 gap-1">
          <cfg.Icon size={13} />{cfg.label}<ChevronDown size={11} />
        </button>
        <AnimatePresence>
          {showEstado && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute bottom-full mb-1 left-0 w-full bg-gray-800 border border-gray-700 rounded-xl overflow-hidden z-10 shadow-xl">
              {Object.entries(ESTADO).map(([key, c]) => (
                <button key={key} onClick={() => { onEstado(p.id, key); setShowEstado(false); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-700 transition-colors flex items-center gap-2 ${p.estado === key ? 'text-brand-400' : 'text-gray-300'}`}>
                  <c.Icon size={12} /> {c.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => imprimirPedido(p)} className="btn-secondary flex-1 justify-center px-0 py-1.5" title="Imprimir"><Printer size={14} /></button>
        <button onClick={() => onMovimientos(p)} className="btn-secondary flex-1 justify-center px-0 py-1.5" title="Movimientos"><History size={14} /></button>
        <button onClick={() => onEdit(p)} className="btn-secondary flex-1 justify-center px-0 py-1.5" title="Editar"><Edit size={14} /></button>
        <button onClick={() => onDelete(p)} className="btn-danger flex-1 justify-center px-0 py-1.5" title="Eliminar"><Trash2 size={14} /></button>
      </div>
      {puedeAbonar && (
        <button onClick={() => onAbonar(p)} className="btn-primary w-full justify-center text-xs py-1.5 gap-1 mt-2">
          <Wallet size={13} /> Abonar saldo
        </button>
      )}
    </motion.div>
  );
}

// ── Reporte del mes ───────────────────────────────────────────────────────────
function generarPDFReporteMes(data) {
  const { mes, pedidos, movimientos, huerfanos, ventasPedido } = data;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210; const M = 14; const R = W - M;
  let y = 16;
  const tz = { timeZone: 'America/Costa_Rica' };

  const fmtM = (n) => `CRC ${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;
  const fmtF = (f) => f ? new Date(f).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', ...tz }) : '';
  const fmtFH = (f) => f ? new Date(f).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', ...tz }) : '';
  const line = () => { doc.setDrawColor(200); doc.line(M, y, R, y); y += 4; };
  const nl = (n = 4) => { y += n; if (y > 270) { doc.addPage(); y = 16; } };

  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('REPORTE DE PEDIDOS DEL MES', M, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Período: ${mes}  |  Generado: ${new Date().toLocaleString('es-CR', tz)}`, M, y);
  doc.setTextColor(0); nl(6);

  // ── Sección 1: Pedidos activos ────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`PEDIDOS DEL MES (${pedidos.length})`, M, y); nl(2); line();

  if (pedidos.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
    doc.text('Sin pedidos registrados este mes.', M, y); nl(6);
  }

  pedidos.forEach((p, i) => {
    if (y > 255) { doc.addPage(); y = 16; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(`#${p.numero || p.id}  ${p.cliente_nombre || 'Sin nombre'}`, M, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${p.estado?.toUpperCase() || ''}`, R - 20, y, { align: 'right' });
    nl(4);
    doc.setFontSize(8); doc.setTextColor(80);
    doc.text(`Fecha entrega: ${fmtF(p.fecha)}  |  Hora: ${p.hora_entrega || '-'}  |  Tel: ${p.cliente_telefono || '-'}`, M + 2, y); nl(3.5);
    if (p.tipo_arreglo) { doc.text(`Arreglo: ${p.tipo_arreglo}`, M + 2, y); nl(3.5); }
    if (p.items_resumen) { doc.text(`Items: ${p.items_resumen}`, M + 2, y); nl(3.5); }
    doc.text(`Precio: ${fmtM(p.precio)}  |  Adelanto: ${fmtM(p.adelanto)}  |  Saldo: ${fmtM((p.precio || 0) - (p.adelanto || 0))}`, M + 2, y);
    doc.setTextColor(0); nl(4);
    if (p.dedicatoria) { doc.setFontSize(8); doc.setTextColor(80); doc.text(`Dedicatoria: ${p.dedicatoria}`, M + 2, y); doc.setTextColor(0); nl(3.5); }
    if (p.observaciones) { doc.setFontSize(8); doc.setTextColor(80); doc.text(`Obs: ${p.observaciones}`, M + 2, y); doc.setTextColor(0); nl(3.5); }
    if (i < pedidos.length - 1) { doc.setDrawColor(230); doc.line(M, y, R, y); y += 3; doc.setDrawColor(200); }
  });

  // ── Sección 2: Pedidos eliminados (huérfanos) ────────────────────────────
  nl(4);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(180, 60, 60);
  doc.text(`PEDIDOS ELIMINADOS ESTE MES (registros recuperados: ${huerfanos.length})`, M, y);
  doc.setTextColor(0); nl(2); line();

  if (huerfanos.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(80);
    doc.text('No se encontraron movimientos de pedidos eliminados.', M, y); doc.setTextColor(0); nl(6);
  } else {
    doc.setFontSize(9); doc.setTextColor(80);
    doc.text('Los siguientes movimientos corresponden a pedidos que ya no existen en el sistema:', M, y); doc.setTextColor(0); nl(4);
    huerfanos.forEach(m => {
      if (y > 265) { doc.addPage(); y = 16; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.text(`ID Pedido #${m.pedido_id}  —  ${m.tipo}  —  ${fmtFH(m.fecha)}`, M + 2, y); nl(3.5);
      doc.setFont('helvetica', 'normal');
      if (m.descripcion) { doc.text(`  ${m.descripcion}`, M + 2, y); nl(3.5); }
      if (m.monto) { doc.text(`  Monto: ${fmtM(m.monto)}`, M + 2, y); nl(3.5); }
    });
  }

  // ── Sección 3: Trazas en ventas (adelantos/saldos) ───────────────────────
  nl(2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`COBROS REGISTRADOS EN VENTAS (canal pedido: ${ventasPedido.length})`, M, y); nl(2); line();

  if (ventasPedido.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(80);
    doc.text('Sin cobros de pedidos registrados este mes.', M, y); doc.setTextColor(0); nl(6);
  } else {
    doc.setFontSize(8);
    ventasPedido.forEach(v => {
      if (y > 270) { doc.addPage(); y = 16; }
      doc.setFont('helvetica', 'bold');
      doc.text(`${fmtFH(v.fecha_cr)}  ${v.nombre_arreglo || ''}`, M + 2, y);
      doc.setFont('helvetica', 'normal');
      doc.text(fmtM(v.precio_venta), R, y, { align: 'right' }); nl(3.5);
      doc.setTextColor(80);
      doc.text(`  Cliente: ${v.nombre_cliente || '-'}  |  Ref: ${v.notas || '-'}  |  Pago: ${v.forma_pago || '-'}`, M + 2, y);
      doc.setTextColor(0); nl(4);
    });
  }

  // ── Movimientos completos ─────────────────────────────────────────────────
  nl(2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`TODOS LOS MOVIMIENTOS DEL MES (${movimientos.length})`, M, y); nl(2); line();

  doc.setFontSize(8);
  movimientos.forEach(m => {
    if (y > 270) { doc.addPage(); y = 16; }
    const num = m.pedido_numero ? `#${m.pedido_numero}` : `(eliminado ID:${m.pedido_id})`;
    const cliente = m.pedido_cliente ? ` — ${m.pedido_cliente}` : '';
    doc.setFont('helvetica', 'bold'); doc.setTextColor(m.pedido_numero ? 0 : 150);
    doc.text(`${fmtFH(m.fecha)}  ${num}${cliente}`, M + 2, y);
    doc.setFont('helvetica', 'normal');
    if (m.monto) doc.text(fmtM(m.monto), R, y, { align: 'right' });
    nl(3.5); doc.setTextColor(80);
    doc.text(`  ${m.tipo}${m.descripcion ? ' — ' + m.descripcion : ''}${m.estado_nuevo ? ' → ' + m.estado_nuevo : ''}`, M + 2, y);
    doc.setTextColor(0); nl(3.5);
  });

  doc.save(`reporte-pedidos-${mes}.pdf`);
}

function HistorialPedidosModal({ onClose }) {
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('todos');

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['historial-pedidos'],
    queryFn: () => api.get('/pedidos/historial').then(r => r.data.data),
    staleTime: 0,
  });

  const filtrados = useMemo(() => pedidos.filter(p => {
    const matchFiltro = filtro === 'todos' ||
      (filtro === 'eliminados' && p.eliminado_en) ||
      (filtro === 'activos' && !p.eliminado_en);
    const matchBusq = !busqueda ||
      (p.cliente_nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.numero || '').includes(busqueda) ||
      (p.tipo_arreglo || '').toLowerCase().includes(busqueda.toLowerCase());
    return matchFiltro && matchBusq;
  }), [pedidos, filtro, busqueda]);

  const eliminados = pedidos.filter(p => p.eliminado_en).length;

  const fmtFecha = (d) => d ? new Date(d).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const fmtFechaHora = (d) => d ? new Date(d).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="fixed inset-0 bg-black/70 z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 pt-6 pb-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="card w-full max-w-3xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Archive size={18} className="text-brand-400" />
              <h3 className="text-lg font-semibold text-white">Historial de Pedidos</h3>
              {eliminados > 0 && (
                <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5">
                  {eliminados} eliminados
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-40">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input className="input pl-8 w-full text-sm" placeholder="Buscar cliente, número o tipo..."
                value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            </div>
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
              {[['todos','Todos'],['activos','Activos'],['eliminados','Eliminados']].map(([k,l]) => (
                <button key={k} onClick={() => setFiltro(k)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    filtro === k ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30' : 'text-gray-400 hover:text-white'
                  }`}>{l}</button>
              ))}
            </div>
          </div>

          <p className="text-gray-600 text-xs mb-3">{filtrados.length} de {pedidos.length} pedidos — los eliminados permanecen aquí siempre</p>

          {isLoading && <p className="text-gray-500 text-sm text-center py-8">Cargando historial...</p>}

          <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
            {filtrados.map(p => (
              <div key={p.id} className={`rounded-xl p-3 border ${
                p.eliminado_en ? 'bg-red-500/5 border-red-500/20' : 'bg-gray-800/40 border-gray-700/30'
              }`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-white font-bold text-sm">#{p.numero}</span>
                      <span className="text-gray-200 text-sm">{p.cliente_nombre || '(sin nombre)'}</span>
                      {p.eliminado_en
                        ? <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 font-medium">ELIMINADO</span>
                        : <span className={`badge text-xs ${ESTADO[p.estado]?.cls || 'badge-yellow'}`}>{ESTADO[p.estado]?.label || p.estado}</span>
                      }
                    </div>
                    {p.tipo_arreglo && <p className="text-gray-400 text-xs">{p.tipo_arreglo}</p>}
                    {p.items_resumen && <p className="text-gray-500 text-xs mt-0.5 break-words">Items: {p.items_resumen}</p>}
                    {p.cliente_telefono && <p className="text-gray-500 text-xs mt-0.5">Tel: {p.cliente_telefono}</p>}
                    {p.dedicatoria && <p className="text-gray-500 text-xs mt-0.5 break-words">Dedicatoria: {p.dedicatoria}</p>}
                    {p.observaciones && <p className="text-gray-500 text-xs mt-0.5 break-words">Obs: {p.observaciones}</p>}
                    {p.eliminado_en && (
                      <p className="text-red-400/70 text-xs mt-1.5 pt-1.5 border-t border-red-500/10">
                        Eliminado el {fmtFechaHora(p.eliminado_en)}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-emerald-400 font-semibold text-sm">{formatMoney(p.precio)}</p>
                    <p className="text-gray-500 text-xs">Adelanto: {formatMoney(p.adelanto)}</p>
                    {p.precio > 0 && (
                      <p className="text-gray-600 text-xs">Saldo: {formatMoney(Math.max(0, p.precio - p.adelanto))}</p>
                    )}
                    <p className="text-gray-600 text-xs mt-1">{fmtFecha(p.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
            {filtrados.length === 0 && !isLoading && (
              <p className="text-gray-600 text-xs text-center py-8">Sin resultados</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function ReporteMesModal({ onClose }) {
  const mesActual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' }).substring(0, 7);
  const [mes, setMes] = useState(mesActual);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reporte-pedidos-mes', mes],
    queryFn: () => api.get(`/pedidos/reporte-mes?mes=${mes}`).then(r => r.data),
  });

  return (
    <div className="fixed inset-0 bg-black/70 z-50 overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 pt-6 pb-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="card w-full max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-brand-400" />
            <h3 className="text-lg font-semibold text-white">Reporte de Pedidos del Mes</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <label className="label mb-0 whitespace-nowrap">Mes:</label>
          <input type="month" className="input w-44" value={mes} onChange={e => setMes(e.target.value)} />
          {data && (
            <button onClick={() => generarPDFReporteMes(data)} className="btn-primary ml-auto">
              <Printer size={15} /> Descargar PDF
            </button>
          )}
        </div>

        {isLoading && <p className="text-gray-500 text-sm text-center py-8">Cargando reporte...</p>}
        {isError  && <p className="text-red-400 text-sm text-center py-8">Error al cargar el reporte</p>}

        {data && (
          <div className="space-y-5 text-sm">
            {/* Resumen */}
            <div className="grid grid-cols-3 gap-3">
              <div className="card bg-gray-800/50 text-center">
                <p className="text-2xl font-bold text-white">{data.pedidos.length}</p>
                <p className="text-xs text-gray-500">Pedidos activos</p>
              </div>
              <div className="card bg-red-500/10 text-center border-red-500/20">
                <p className="text-2xl font-bold text-red-400">{data.huerfanos.length}</p>
                <p className="text-xs text-gray-500">Pedidos eliminados</p>
              </div>
              <div className="card bg-emerald-500/10 text-center border-emerald-500/20">
                <p className="text-2xl font-bold text-emerald-400">
                  {formatMoney(data.ventasPedido.reduce((s, v) => s + parseFloat(v.precio_venta || 0), 0))}
                </p>
                <p className="text-xs text-gray-500">Cobrado este mes</p>
              </div>
            </div>

            {/* Pedidos eliminados */}
            {data.huerfanos.length > 0 && (
              <div>
                <p className="text-red-400 font-semibold mb-2">⚠ Movimientos de pedidos eliminados</p>
                <div className="space-y-2">
                  {data.huerfanos.map(m => (
                    <div key={m.id} className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                      <p className="text-white font-medium text-xs">ID Pedido #{m.pedido_id} — {m.tipo}</p>
                      {m.descripcion && <p className="text-gray-400 text-xs mt-0.5">{m.descripcion}</p>}
                      {m.monto && <p className="text-emerald-400 text-xs mt-0.5">{formatMoney(m.monto)}</p>}
                      <p className="text-gray-600 text-xs mt-0.5">{new Date(m.fecha).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trazas en ventas */}
            {data.ventasPedido.length > 0 && (
              <div>
                <p className="text-brand-400 font-semibold mb-2">Cobros registrados como ventas</p>
                <div className="space-y-1.5">
                  {data.ventasPedido.map(v => (
                    <div key={v.id} className="flex items-center justify-between gap-2 bg-gray-800/40 rounded-lg px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-white text-xs font-medium truncate">{v.nombre_arreglo}</p>
                        <p className="text-gray-500 text-xs">{v.notas} — {v.nombre_cliente}</p>
                      </div>
                      <p className="text-emerald-400 font-semibold text-xs whitespace-nowrap">{formatMoney(v.precio_venta)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de pedidos activos */}
            <div>
              <p className="text-gray-300 font-semibold mb-2">Pedidos del mes</p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {data.pedidos.map(p => (
                  <div key={p.id} className="bg-gray-800/40 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-white font-medium text-xs">#{p.numero} — {p.cliente_nombre}</p>
                      <span className={`badge text-xs ${p.estado === 'entregado' ? 'badge-green' : p.estado === 'listo' ? 'badge-blue' : p.estado === 'cancelado' ? 'badge-red' : 'badge-yellow'}`}>{p.estado}</span>
                    </div>
                    {p.tipo_arreglo && <p className="text-gray-400 text-xs">{p.tipo_arreglo}</p>}
                    {p.items_resumen && <p className="text-gray-500 text-xs">Items: {p.items_resumen}</p>}
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>Precio: {formatMoney(p.precio)}</span>
                      <span>Adelanto: {formatMoney(p.adelanto)}</span>
                      <span>Saldo: {formatMoney((p.precio || 0) - (p.adelanto || 0))}</span>
                    </div>
                  </div>
                ))}
                {data.pedidos.length === 0 && <p className="text-gray-600 text-xs text-center py-4">Sin pedidos este mes</p>}
              </div>
            </div>
          </div>
        )}
      </motion.div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function PedidosPage() {
  const qc = useQueryClient();
  const [modal, setModal]         = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [busqueda, setBusqueda]   = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [abonando, setAbonando]   = useState(null);
  const [verMovimientos, setVerMovimientos] = useState(null);
  const [verMovimientosGlobal, setVerMovimientosGlobal] = useState(false);
  const [verReporte, setVerReporte] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);

  const { data: pedidos = [] } = useQuery({
    queryKey: ['pedidos'],
    queryFn: () => api.get('/pedidos').then(r => r.data.data),
  });

  // Al editar necesitamos los items completos
  const [editandoConItems, setEditandoConItems] = useState(null);

  const abrirEditar = async (p) => {
    try {
      const res = await api.get(`/pedidos/${p.id}`);
      setEditandoConItems(res.data.data);
      setModal('editar');
    } catch { setModal(p); }
  };

  const createMut = useMutation({
    mutationFn: (data) => api.post('/pedidos', data),
    onSuccess: (res) => { qc.invalidateQueries(['pedidos']); qc.invalidateQueries(['dashboard']); toast.success(`Pedido #${res.data.data.numero} registrado`); setModal(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/pedidos/${id}`, data),
    onSuccess: () => { qc.invalidateQueries(['pedidos']); qc.invalidateQueries(['dashboard']); toast.success('Pedido actualizado'); setModal(null); setEditandoConItems(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error'),
  });

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }) => api.patch(`/pedidos/${id}/estado`, { estado }),
    onSuccess: (_res, { estado }) => {
      qc.invalidateQueries(['pedidos']);
      qc.invalidateQueries(['dashboard']);
      toast.success(`Pedido marcado como ${ESTADO[estado]?.label || estado}`);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al cambiar el estado'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/pedidos/${id}`),
    onSuccess: () => { qc.invalidateQueries(['pedidos']); qc.invalidateQueries(['dashboard']); toast.success('Pedido eliminado'); setConfirmar(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error'),
  });

  const abonoMut = useMutation({
    mutationFn: ({ id, ...data }) => api.post(`/pedidos/${id}/abono`, data),
    onSuccess: () => {
      qc.invalidateQueries(['pedidos']);
      qc.invalidateQueries(['dashboard']);
      qc.invalidateQueries(['pedido-movimientos', abonando?.id]);
      toast.success('Abono registrado');
      setAbonando(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al registrar abono'),
  });

  const handleSave = (data) => {
    if (data.id) updateMut.mutate(data);
    else createMut.mutate(data);
  };

  const pedidosFiltrados = useMemo(() => pedidos.filter(p => {
    const matchEstado = filtroEstado === 'todos' || p.estado === filtroEstado;
    const matchBusq = !busqueda ||
      (p.cliente_nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.numero || '').includes(busqueda);
    return matchEstado && matchBusq;
  }), [pedidos, filtroEstado, busqueda]);

  const conteos = useMemo(() => {
    const c = { todos: pedidos.length };
    Object.keys(ESTADO).forEach(k => { c[k] = pedidos.filter(p => p.estado === k).length; });
    return c;
  }, [pedidos]);

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6 pb-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Pedidos</h1>
          <p className="text-gray-500 text-sm mt-0.5">Órdenes de pedido de clientes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setVerHistorial(true)} className="btn-secondary">
            <Archive size={16} /> Historial
          </button>
          <button onClick={() => setVerReporte(true)} className="btn-secondary">
            <FileText size={16} /> Reporte mes
          </button>
          <button onClick={() => setVerMovimientosGlobal(true)} className="btn-secondary">
            <History size={16} /> Movimientos
          </button>
          <button onClick={() => { setEditandoConItems(null); setModal('nuevo'); }} className="btn-primary">
            <Plus size={16} /> Nuevo Pedido
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input pl-9 w-full sm:w-56 text-sm" placeholder="Buscar cliente o número..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit min-w-max">
            {[['todos', 'Todos'], ...Object.entries(ESTADO).map(([k, v]) => [k, v.label])].map(([key, label]) => (
              <button key={key} onClick={() => setFiltroEstado(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filtroEstado === key ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30' : 'text-gray-400 hover:text-white'
                }`}>
                {label} {conteos[key] > 0 && <span className="ml-1 opacity-60">{conteos[key]}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pedidosFiltrados.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          {busqueda || filtroEstado !== 'todos' ? 'No se encontraron pedidos con ese filtro' : 'Aún no hay pedidos registrados'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pedidosFiltrados.map(p => (
            <PedidoCard key={p.id} p={p}
              onEdit={abrirEditar}
              onDelete={setConfirmar}
              onEstado={(id, estado) => estadoMut.mutate({ id, estado })}
              onAbonar={setAbonando}
              onMovimientos={setVerMovimientos}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {abonando && (
          <AbonoModal
            pedido={abonando}
            onClose={() => setAbonando(null)}
            onConfirm={(data) => abonoMut.mutate({ id: abonando.id, ...data })}
            isPending={abonoMut.isPending}
          />
        )}
        {verMovimientos && (
          <MovimientosModal pedido={verMovimientos} onClose={() => setVerMovimientos(null)} />
        )}
        {verMovimientosGlobal && (
          <MovimientosGlobalModal onClose={() => setVerMovimientosGlobal(false)} />
        )}
        {verReporte && (
          <ReporteMesModal onClose={() => setVerReporte(false)} />
        )}
        {verHistorial && (
          <HistorialPedidosModal onClose={() => setVerHistorial(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(modal === 'nuevo' || modal === 'editar') && (
          <PedidoModal
            pedido={modal === 'editar' ? editandoConItems : null}
            onClose={() => { setModal(null); setEditandoConItems(null); }}
            onSave={handleSave}
            isPending={isPending}
          />
        )}
        {confirmar && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="card w-full max-w-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                  <Trash2 size={18} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Eliminar pedido</h3>
                  <p className="text-sm text-gray-400">Esta acción no se puede deshacer</p>
                </div>
              </div>
              <p className="text-sm text-gray-300 mb-5">
                ¿Eliminar el pedido <span className="text-white font-bold">#{confirmar.numero}</span> de{' '}
                <span className="text-white font-semibold">{confirmar.cliente_nombre || '(sin nombre)'}</span>?
              </p>
              <div className="flex gap-3">
                <button onClick={() => deleteMut.mutate(confirmar.id)} disabled={deleteMut.isPending}
                  className="btn-danger flex-1 justify-center">
                  {deleteMut.isPending ? 'Eliminando...' : 'Sí, eliminar'}
                </button>
                <button onClick={() => setConfirmar(null)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
