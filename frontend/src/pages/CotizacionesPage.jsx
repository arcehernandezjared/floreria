import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Plus, Send, Trash2, Edit, Eye, X, Download,
  User, Mail, Phone, Calendar, Tag, CheckCircle, Clock, XCircle, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import toast from 'react-hot-toast';
import api, { formatMoney } from '../utils/api';

const TIPOS_EVENTO = ['Boda', 'Quinceaños', 'Baby Shower', 'Cumpleaños', 'Corporativo', 'Aniversario', 'Graduación', 'Otro'];

const ESTADO_CONFIG = {
  borrador: { label: 'Borrador',  icon: Clock,        color: 'text-gray-400 bg-gray-700' },
  enviada:  { label: 'Enviada',   icon: Send,         color: 'text-blue-400 bg-blue-500/15' },
  aceptada: { label: 'Aceptada',  icon: CheckCircle,  color: 'text-emerald-400 bg-emerald-500/15' },
  rechazada:{ label: 'Rechazada', icon: XCircle,      color: 'text-red-400 bg-red-500/15' },
};

const TERMINOS_DEFAULT = `• Precios en Colones costarricenses (₡), incluyen mano de obra.
• Cotización válida por el período indicado.
• Se requiere un adelanto del 50% para reservar la fecha.
• El saldo restante se cancela una semana antes del evento.
• Los arreglos se entregan el día del evento según hora coordinada.`;

function ItemRow({ item, idx, onChange, onRemove }) {
  const subtotal = (parseFloat(item.cantidad || 0) * parseFloat(item.precio_unitario || 0));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center bg-gray-800/20 sm:bg-transparent rounded-xl sm:rounded-none p-2 sm:p-0">
      <input
        className="input text-sm col-span-2 sm:col-span-5"
        placeholder="Descripción del servicio/producto"
        value={item.descripcion}
        onChange={e => onChange(idx, 'descripcion', e.target.value)}
      />
      <input
        type="number" min="1"
        className="input text-sm col-span-1 sm:col-span-2 text-center"
        placeholder="Cant."
        value={item.cantidad}
        onChange={e => {
          const cant = e.target.value;
          const sub = parseFloat(cant || 0) * parseFloat(item.precio_unitario || 0);
          onChange(idx, 'cantidad', cant);
          onChange(idx, 'subtotal', sub);
        }}
      />
      <input
        type="number" min="0"
        className="input text-sm col-span-1 sm:col-span-2 text-right"
        placeholder="Precio"
        value={item.precio_unitario}
        onChange={e => {
          const p = e.target.value;
          const sub = parseFloat(item.cantidad || 0) * parseFloat(p || 0);
          onChange(idx, 'precio_unitario', p);
          onChange(idx, 'subtotal', sub);
        }}
      />
      <div className="col-span-1 sm:col-span-2 text-right text-emerald-400 font-semibold text-sm">
        {formatMoney(subtotal)}
      </div>
      <button onClick={() => onRemove(idx)} className="col-span-1 sm:col-span-1 text-gray-600 hover:text-red-400 transition-colors flex justify-end sm:justify-center">
        <X size={14} />
      </button>
    </div>
  );
}

function generarPDF(cot) {
  const doc = new jsPDF();
  const items = Array.isArray(cot.items) ? cot.items : JSON.parse(cot.items || '[]');
  const descuento = parseFloat(cot.descuento_pct || 0);

  // Header
  doc.setFillColor(124, 58, 237);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Floristería Alma Caribeña', 105, 18, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Flores con alma · Alma Caribeña', 105, 28, { align: 'center' });

  // Número y fecha
  doc.setTextColor(80, 0, 160);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`Cotización ${cot.numero}`, 14, 52);

  const validez = new Date();
  validez.setDate(validez.getDate() + (cot.validez_dias || 15));
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Válida hasta: ${validez.toLocaleDateString('es-CR')}`, 196, 52, { align: 'right' });

  // Datos cliente
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', 14, 65);
  doc.setFont('helvetica', 'normal');
  doc.text(cot.cliente_nombre, 40, 65);
  if (cot.cliente_email) doc.text(cot.cliente_email, 40, 71);
  if (cot.cliente_telefono) doc.text(cot.cliente_telefono, 40, 77);

  if (cot.tipo_evento) {
    doc.setFont('helvetica', 'bold');
    doc.text('Evento:', 120, 65);
    doc.setFont('helvetica', 'normal');
    doc.text(cot.tipo_evento, 145, 65);
    if (cot.fecha_evento) {
      doc.text(`Fecha: ${new Date(cot.fecha_evento).toLocaleDateString('es-CR')}`, 145, 71);
    }
  }

  // Tabla de items
  autoTable(doc, {
    startY: 88,
    head: [['Descripción', 'Cant.', 'Precio unit.', 'Subtotal']],
    body: items.map(i => [
      i.descripcion,
      i.cantidad,
      `₡${Number(i.precio_unitario).toLocaleString('es-CR')}`,
      `₡${Number(i.subtotal).toLocaleString('es-CR')}`,
    ]),
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontSize: 9 },
    alternateRowStyles: { fillColor: [250, 245, 255] },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 40 },
      3: { halign: 'right', cellWidth: 40, fontStyle: 'bold', textColor: [124, 58, 237] },
    },
    styles: { fontSize: 9 },
  });

  const finalY = doc.lastAutoTable.finalY + 8;

  // Totales
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Subtotal:', 140, finalY);
  doc.setTextColor(50, 50, 50);
  doc.text(`₡${Number(cot.subtotal).toLocaleString('es-CR')}`, 196, finalY, { align: 'right' });

  if (descuento > 0) {
    doc.setTextColor(220, 50, 50);
    doc.text(`Descuento (${descuento}%):`, 130, finalY + 7);
    doc.text(`-₡${Number(cot.subtotal * descuento / 100).toLocaleString('es-CR')}`, 196, finalY + 7, { align: 'right' });
  }

  doc.setFillColor(124, 58, 237);
  doc.roundedRect(130, finalY + 12, 66, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL:', 135, finalY + 20);
  doc.text(`₡${Number(cot.total).toLocaleString('es-CR')}`, 193, finalY + 20, { align: 'right' });

  // Notas
  let y = finalY + 32;
  if (cot.notas) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(124, 58, 237);
    doc.text('Notas:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    const lines = doc.splitTextToSize(cot.notas, 180);
    doc.text(lines, 14, y + 6);
    y += 8 + lines.length * 5;
  }

  if (cot.terminos) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text('Términos y condiciones:', 14, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(cot.terminos, 180);
    doc.text(lines, 14, y + 12);
  }

  doc.save(`Cotizacion_${cot.numero}.pdf`);
}

// ── Modal formulario ──────────────────────────────────────────────────────────
function ModalForm({ inicial, onClose, onSaved }) {
  const emptyItem = () => ({ descripcion: '', cantidad: 1, precio_unitario: '', subtotal: 0 });
  const [form, setForm] = useState({
    cliente_nombre: '', cliente_email: '', cliente_telefono: '',
    tipo_evento: '', fecha_evento: '', validez_dias: 15,
    notas: '', terminos: TERMINOS_DEFAULT, descuento_pct: 0,
    items: [emptyItem()],
    ...inicial,
    items: inicial?.items?.length ? inicial.items : [emptyItem()],
  });

  const qc = useQueryClient();
  const isEdit = !!inicial?.id;

  const saveMutation = useMutation({
    mutationFn: (data) => isEdit
      ? api.put(`/cotizaciones/${inicial.id}`, data)
      : api.post('/cotizaciones', data),
    onSuccess: () => {
      qc.invalidateQueries(['cotizaciones']);
      toast.success(isEdit ? 'Cotización actualizada' : 'Cotización creada');
      onSaved?.();
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || 'Error al guardar'),
  });

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setItem = (idx, k, v) => setForm(p => ({
    ...p, items: p.items.map((it, i) => i === idx ? { ...it, [k]: v } : it)
  }));
  const addItem = () => setForm(p => ({ ...p, items: [...p.items, emptyItem()] }));
  const removeItem = (idx) => setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

  const subtotal = form.items.reduce((s, i) => s + parseFloat(i.subtotal || 0), 0);
  const descuentoMonto = subtotal * (parseFloat(form.descuento_pct || 0) / 100);
  const total = subtotal - descuentoMonto;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header modal */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-600/15 rounded-xl flex items-center justify-center">
              <FileText size={18} className="text-purple-400" />
            </div>
            <div>
              <h2 className="text-white font-bold">{isEdit ? `Editar ${inicial.numero}` : 'Nueva Cotización'}</h2>
              <p className="text-xs text-gray-500">Completa los datos del cliente y los servicios</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Datos del cliente */}
          <div>
            <p className="text-xs text-purple-400 font-semibold uppercase tracking-wider mb-3">Datos del cliente</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Nombre *</label>
                <div className="relative">
                  <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input className="input w-full pl-8 text-sm" placeholder="Nombre completo"
                    value={form.cliente_nombre} onChange={e => setF('cliente_nombre', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Correo electrónico</label>
                <div className="relative">
                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input type="email" className="input w-full pl-8 text-sm" placeholder="cliente@email.com"
                    value={form.cliente_email} onChange={e => setF('cliente_email', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Teléfono</label>
                <div className="relative">
                  <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input className="input w-full pl-8 text-sm" placeholder="8888-8888"
                    value={form.cliente_telefono} onChange={e => setF('cliente_telefono', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Datos del evento */}
          <div>
            <p className="text-xs text-purple-400 font-semibold uppercase tracking-wider mb-3">Datos del evento</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Tipo de evento</label>
                <select className="input w-full text-sm" value={form.tipo_evento} onChange={e => setF('tipo_evento', e.target.value)}>
                  <option value="">-- Seleccionar --</option>
                  {TIPOS_EVENTO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fecha del evento</label>
                <div className="relative">
                  <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input type="date" className="input w-full pl-8 text-sm"
                    value={form.fecha_evento} onChange={e => setF('fecha_evento', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Validez (días)</label>
                <input type="number" min="1" max="90" className="input w-full text-sm" placeholder="15"
                  value={form.validez_dias} onChange={e => setF('validez_dias', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-purple-400 font-semibold uppercase tracking-wider">Servicios y productos</p>
              <button onClick={addItem} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors">
                <Plus size={13} /> Agregar línea
              </button>
            </div>
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-12 gap-2 text-xs text-gray-600 px-0 mb-1">
                <span className="col-span-5">Descripción</span>
                <span className="col-span-2 text-center">Cant.</span>
                <span className="col-span-2 text-right">Precio unit.</span>
                <span className="col-span-2 text-right">Subtotal</span>
                <span className="col-span-1" />
              </div>
              {form.items.map((item, idx) => (
                <ItemRow key={idx} item={item} idx={idx} onChange={setItem} onRemove={removeItem} />
              ))}
            </div>

            {/* Totales */}
            <div className="mt-4 flex justify-end">
              <div className="w-64 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Subtotal</span><span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Tag size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input type="number" min="0" max="100" placeholder="Descuento %"
                      className="input w-full pl-6 text-sm py-1.5"
                      value={form.descuento_pct || ''} onChange={e => setF('descuento_pct', e.target.value)} />
                  </div>
                  {descuentoMonto > 0 && <span className="text-red-400 text-sm flex-shrink-0">-{formatMoney(descuentoMonto)}</span>}
                </div>
                <div className="flex justify-between text-white font-bold text-base bg-purple-600/15 border border-purple-600/30 rounded-xl px-3 py-2">
                  <span>Total</span><span className="text-purple-300">{formatMoney(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notas y términos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Notas adicionales</label>
              <textarea rows={3} className="input w-full text-sm resize-none" placeholder="Observaciones, acuerdos especiales..."
                value={form.notas} onChange={e => setF('notas', e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Términos y condiciones</label>
              <textarea rows={3} className="input w-full text-sm resize-none text-xs"
                value={form.terminos} onChange={e => setF('terminos', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-gray-800 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancelar</button>
          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending || !form.cliente_nombre}
            className="btn-primary flex-1 text-sm bg-purple-600 hover:bg-purple-500 border-purple-600"
          >
            {saveMutation.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cotización'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function CotizacionesPage() {
  const [showForm, setShowForm]       = useState(false);
  const [editando, setEditando]       = useState(null);
  const [enviando, setEnviando]       = useState(null);
  const qc = useQueryClient();

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ['cotizaciones'],
    queryFn: () => api.get('/cotizaciones').then(r => r.data.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/cotizaciones/${id}`),
    onSuccess: () => { qc.invalidateQueries(['cotizaciones']); toast.success('Cotización eliminada'); },
    onError: () => toast.error('Error al eliminar'),
  });

  const enviarMutation = useMutation({
    mutationFn: (id) => api.post(`/cotizaciones/${id}/enviar`),
    onSuccess: (_, id) => {
      qc.invalidateQueries(['cotizaciones']);
      toast.success('¡Cotización enviada por correo!');
      setEnviando(null);
    },
    onError: (e) => {
      toast.error(e.response?.data?.message || 'Error al enviar');
      setEnviando(null);
    },
  });

  const handleEditar = async (cot) => {
    const full = await api.get(`/cotizaciones/${cot.id}`).then(r => r.data.data);
    setEditando(full);
    setShowForm(true);
  };

  const handleEnviar = (cot) => {
    if (!cot.cliente_email) {
      toast.error('Esta cotización no tiene email del cliente');
      return;
    }
    setEnviando(cot.id);
    enviarMutation.mutate(cot.id);
  };

  const totalActivas = cotizaciones.filter(c => c.estado !== 'rechazada').reduce((s, c) => s + parseFloat(c.total || 0), 0);
  const aceptadas = cotizaciones.filter(c => c.estado === 'aceptada').length;
  const pendientes = cotizaciones.filter(c => c.estado === 'enviada').length;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600/15 rounded-xl flex items-center justify-center">
            <FileText size={20} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Cotizaciones</h1>
            <p className="text-gray-500 text-sm">Eventos, bodas y servicios especiales</p>
          </div>
        </div>
        <button
          onClick={() => { setEditando(null); setShowForm(true); }}
          className="btn-primary text-sm bg-purple-600 hover:bg-purple-500 border-purple-600"
        >
          <Plus size={15} /> Nueva cotización
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Total cotizaciones</p>
          <p className="text-2xl font-bold text-white">{cotizaciones.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Pendientes respuesta</p>
          <p className="text-2xl font-bold text-blue-400">{pendientes}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Valor aceptadas</p>
          <p className="text-2xl font-bold text-emerald-400">
            {formatMoney(cotizaciones.filter(c => c.estado === 'aceptada').reduce((s, c) => s + parseFloat(c.total || 0), 0))}
          </p>
        </div>
      </div>

      {/* Tabla / Tarjetas */}
      <div className="card p-0 overflow-hidden">

        {/* ── Móvil: tarjetas ── */}
        <div className="card-view">
          {isLoading && <p className="text-center text-gray-600 py-8 text-sm">Cargando...</p>}
          {!isLoading && cotizaciones.length === 0 && (
            <div className="py-10 text-center">
              <FileText size={28} className="text-gray-700 mx-auto mb-2" />
              <p className="text-gray-500 text-sm mb-3">No hay cotizaciones aún</p>
              <button onClick={() => setShowForm(true)} className="text-purple-400 text-xs hover:text-purple-300">+ Crear primera cotización</button>
            </div>
          )}
          <div className="divide-y divide-gray-800/60">
            {cotizaciones.map(cot => {
              const est = ESTADO_CONFIG[cot.estado] || ESTADO_CONFIG.borrador;
              const EstIcon = est.icon;
              const fechaEvento = cot.fecha_evento
                ? new Date(cot.fecha_evento).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
                : '—';
              return (
                <div key={cot.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-purple-400 text-xs font-semibold">{cot.numero}</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg ${est.color}`}>
                          <EstIcon size={10} />{est.label}
                        </span>
                      </div>
                      <p className="text-white font-medium text-sm">{cot.cliente_nombre}</p>
                      {cot.cliente_email && <p className="text-gray-500 text-xs">{cot.cliente_email}</p>}
                    </div>
                    <p className="text-emerald-400 font-bold text-sm whitespace-nowrap flex-shrink-0">{formatMoney(cot.total)}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <div className="text-xs text-gray-500">
                      {cot.tipo_evento && <span className="mr-2">{cot.tipo_evento}</span>}
                      <span>{fechaEvento}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => generarPDF({...cot, items: typeof cot.items === 'string' ? JSON.parse(cot.items || '[]') : cot.items})}
                        className="p-2 text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg" title="Descargar PDF">
                        <Download size={14} />
                      </button>
                      <button onClick={() => handleEnviar(cot)} disabled={enviando === cot.id || !cot.cliente_email}
                        className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg disabled:opacity-30" title={cot.cliente_email ? 'Enviar correo' : 'Sin email'}>
                        {enviando === cot.id ? <div className="w-3.5 h-3.5 border border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Send size={14} />}
                      </button>
                      <button onClick={() => handleEditar(cot)} className="p-2 text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg" title="Editar">
                        <Edit size={14} />
                      </button>
                      <button onClick={() => { if (confirm('¿Eliminar esta cotización?')) deleteMutation.mutate(cot.id); }}
                        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg" title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Desktop: tabla ── */}
        <div className="table-view overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/50">
                {['#', 'Cliente', 'Evento', 'Fecha evento', 'Total', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-600">Cargando...</td></tr>
              ) : cotizaciones.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <FileText size={32} className="text-gray-700 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No hay cotizaciones aún</p>
                    <button onClick={() => setShowForm(true)} className="mt-3 text-purple-400 text-xs hover:text-purple-300">
                      + Crear primera cotización
                    </button>
                  </td>
                </tr>
              ) : cotizaciones.map(cot => {
                const est = ESTADO_CONFIG[cot.estado] || ESTADO_CONFIG.borrador;
                const EstIcon = est.icon;
                const fechaEvento = cot.fecha_evento
                  ? new Date(cot.fecha_evento).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—';
                return (
                  <tr key={cot.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-purple-400 text-xs font-semibold">{cot.numero}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white font-medium text-sm">{cot.cliente_nombre}</p>
                      {cot.cliente_email && <p className="text-gray-500 text-xs">{cot.cliente_email}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{cot.tipo_evento || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fechaEvento}</td>
                    <td className="px-4 py-3 text-emerald-400 font-semibold">{formatMoney(cot.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg ${est.color}`}>
                        <EstIcon size={11} />{est.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => generarPDF({...cot, items: typeof cot.items === 'string' ? JSON.parse(cot.items || '[]') : cot.items})}
                          className="p-1.5 text-gray-500 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-all" title="Descargar PDF">
                          <Download size={14} />
                        </button>
                        <button onClick={() => handleEnviar(cot)} disabled={enviando === cot.id || !cot.cliente_email}
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all disabled:opacity-30" title={cot.cliente_email ? 'Enviar por correo' : 'Sin email'}>
                          {enviando === cot.id ? <div className="w-3.5 h-3.5 border border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Send size={14} />}
                        </button>
                        <button onClick={() => handleEditar(cot)} className="p-1.5 text-gray-500 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition-all" title="Editar">
                          <Edit size={14} />
                        </button>
                        <button onClick={() => { if (confirm('¿Eliminar esta cotización?')) deleteMutation.mutate(cot.id); }}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showForm && (
          <ModalForm
            inicial={editando}
            onClose={() => { setShowForm(false); setEditando(null); }}
            onSaved={() => {}}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
