import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Printer, Edit, Trash2, X, Clock, Package,
  CheckCircle, XCircle, Search, ChevronDown, Flower2
} from 'lucide-react';
import api, { formatMoney } from '../utils/api';
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
  fecha: new Date().toISOString().split('T')[0],
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

  const totalItems = items.reduce((s, i) => s + parseFloat(i.subtotal || 0), 0);
  const adelantoNum = parseFloat(form.adelanto) || 0;
  const saldo = totalItems - adelantoNum;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.fecha) return toast.error('La fecha es requerida');
    if (items.length === 0) return toast.error('Agrega al menos un arreglo o flor');
    onSave({ ...form, items, precio: totalItems, ...(pedido?.id && { id: pedido.id }) });
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
            <div className="grid grid-cols-3 gap-3 items-end">
              <div>
                <label className="label">Total</label>
                <div className="input font-bold text-white tabular-nums bg-gray-900/50">{formatMoney(totalItems)}</div>
              </div>
              <div>
                <label className="label">Adelanto ₡</label>
                <input type="number" min="0" step="1" inputMode="numeric" className="input"
                  placeholder="0" value={form.adelanto}
                  onChange={e => set('adelanto', e.target.value)} />
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

// ── Tarjeta de pedido ─────────────────────────────────────────────────────────
function PedidoCard({ p, onEdit, onDelete, onEstado }) {
  const cfg = ESTADO[p.estado] || ESTADO.pendiente;
  const saldo = (parseFloat(p.precio) || 0) - (parseFloat(p.adelanto) || 0);
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

      <div className="flex gap-2">
        <div className="relative flex-1">
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
        <button onClick={() => imprimirPedido(p)} className="btn-secondary px-3 py-1.5" title="Imprimir"><Printer size={14} /></button>
        <button onClick={() => onEdit(p)} className="btn-secondary px-3 py-1.5" title="Editar"><Edit size={14} /></button>
        <button onClick={() => onDelete(p)} className="btn-danger px-3 py-1.5" title="Eliminar"><Trash2 size={14} /></button>
      </div>
    </motion.div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function PedidosPage() {
  const qc = useQueryClient();
  const [modal, setModal]         = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [busqueda, setBusqueda]   = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');

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
    onSuccess: () => { qc.invalidateQueries(['pedidos']); qc.invalidateQueries(['dashboard']); },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/pedidos/${id}`),
    onSuccess: () => { qc.invalidateQueries(['pedidos']); qc.invalidateQueries(['dashboard']); toast.success('Pedido eliminado'); setConfirmar(null); },
    onError: (e) => toast.error(e.response?.data?.message || 'Error'),
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
        <button onClick={() => { setEditandoConItems(null); setModal('nuevo'); }} className="btn-primary">
          <Plus size={16} /> Nuevo Pedido
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className="input pl-9 w-56 text-sm" placeholder="Buscar cliente o número..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
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
            />
          ))}
        </div>
      )}

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
