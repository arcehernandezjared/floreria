import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ClipboardList, TrendingUp, DollarSign, ShoppingBag, Filter,
  MessageSquare, ShoppingCart, Store, Printer, Mail, X, Send
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../utils/api';
import toast from 'react-hot-toast';

const CANAL_LABELS = {
  mostrador: { label: 'Mostrador', icon: Store,        color: 'text-blue-400 bg-blue-500/10' },
  externo:   { label: 'Externo',   icon: ShoppingCart, color: 'text-purple-400 bg-purple-500/10' },
  whatsapp:  { label: 'WhatsApp',  icon: MessageSquare, color: 'text-green-400 bg-green-500/10' },
};

function hoy()      { return new Date().toISOString().split('T')[0]; }
function inicioMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function fmtCRC(n) {
  // ₡ no está en las fuentes estándar de jsPDF → usar "CRC"
  return `CRC ${Number(n).toLocaleString('es-CR', { minimumFractionDigits: 0 })}`;
}

function generarReciboPDF(venta) {
  const doc  = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
  const W    = doc.internal.pageSize.getWidth();
  const H    = doc.internal.pageSize.getHeight();
  const precio = parseFloat(venta.precio_venta || 0);
  const d    = new Date(venta.fecha);
  const fechaStr = d.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
  const horaStr  = d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  const numero = `VTA-${d.getFullYear()}-${String(venta.id).padStart(6, '0')}`;
  const canalLabel = CANAL_LABELS[venta.canal]?.label || venta.canal || 'Mostrador';

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(212, 0, 110);
  doc.rect(0, 0, W, 30, 'F');
  doc.setFillColor(240, 117, 37);
  // triángulo diagonal naranja en la derecha
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
  doc.setFontSize(9);
  doc.text(fechaStr, W - 14, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  doc.text(`${horaStr}  ·  ${canalLabel}`, W - 14, 50, { align: 'right' });

  // ── Línea divisora ───────────────────────────────────────────────────────
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
  doc.text(venta.nombre_cliente || 'Cliente mostrador', 14, y + 3);

  doc.setDrawColor(245, 220, 230);
  doc.setLineWidth(0.3);
  doc.line(12, y + 7, W - 12, y + 7);

  // ── Tabla items ──────────────────────────────────────────────────────────
  y += 14;
  autoTable(doc, {
    startY: y,
    head: [['Producto / Servicio', 'Cant.', 'Total']],
    body: [[
      venta.nombre_arreglo || 'Arreglo floral',
      '1',
      fmtCRC(precio),
    ]],
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: { top: 5, bottom: 5, left: 5, right: 5 },
      textColor: [40, 40, 40],
    },
    headStyles: {
      fillColor: [26, 138, 122],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
    },
    alternateRowStyles: { fillColor: [255, 250, 252] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 38, halign: 'right', fontStyle: 'bold', textColor: [26, 138, 122] },
    },
    tableLineColor: [240, 210, 225],
    tableLineWidth: 0.3,
    margin: { left: 12, right: 12 },
  });

  y = doc.lastAutoTable.finalY + 5;

  // ── Totales ──────────────────────────────────────────────────────────────
  doc.setTextColor(130, 130, 130);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', W - 52, y + 4);
  doc.setTextColor(50, 50, 50);
  doc.text(fmtCRC(precio), W - 14, y + 4, { align: 'right' });

  y += 10;
  // Caja total con gradiente simulado
  doc.setFillColor(212, 0, 110);
  doc.roundedRect(W - 76, y - 2, 64, 14, 3, 3, 'F');
  doc.setFillColor(240, 117, 37);
  doc.roundedRect(W - 44, y - 2, 32, 14, 3, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', W - 70, y + 7);
  doc.setFontSize(10);
  doc.text(fmtCRC(precio), W - 15, y + 7, { align: 'right' });

  // ── Notas ────────────────────────────────────────────────────────────────
  if (venta.notas) {
    y += 20;
    doc.setFillColor(255, 248, 251);
    doc.roundedRect(12, y - 3, W - 24, 16, 2, 2, 'F');
    doc.setDrawColor(240, 200, 220);
    doc.roundedRect(12, y - 3, W - 24, 16, 2, 2, 'D');
    doc.setTextColor(212, 0, 110);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('NOTAS', 16, y + 3);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(venta.notas, W - 32)[0], 16, y + 10);
  }

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

function ModalEmail({ venta, onClose }) {
  const [email, setEmail] = useState('');
  const precio = parseFloat(venta.precio_venta || 0);
  const fecha  = new Date(venta.fecha).toLocaleString('es-CR');
  const numero = `VTA-${new Date(venta.fecha).getFullYear()}-${String(venta.id).padStart(6, '0')}`;

  const mutation = useMutation({
    mutationFn: () => api.post('/ventas/enviar-recibo', {
      email,
      cliente_nombre: venta.nombre_cliente || 'Cliente mostrador',
      items: [{
        tipo: 'catalogo',
        nombre: venta.nombre_arreglo || '—',
        cantidad: 1,
        precio_venta: precio,
      }],
      subtotal: precio,
      descuento_pct: 0,
      total: precio,
      numero,
      fecha,
      canal: venta.canal,
    }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Recibo enviado');
      onClose();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Error al enviar'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold">Enviar recibo por correo</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={18} /></button>
        </div>

        <div className="bg-gray-800 rounded-xl p-3 mb-4 text-sm space-y-1">
          <p className="text-gray-400">Venta: <span className="text-white font-medium">{venta.nombre_arreglo}</span></p>
          <p className="text-gray-400">Cliente: <span className="text-white">{venta.nombre_cliente || 'Cliente mostrador'}</span></p>
          <p className="text-gray-400">Total: <span className="text-emerald-400 font-bold">₡{precio.toLocaleString('es-CR')}</span></p>
        </div>

        <label className="text-xs text-gray-500 mb-1 block">Correo del cliente</label>
        <input
          type="email"
          className="input w-full mb-4"
          placeholder="cliente@correo.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && email && mutation.mutate()}
          autoFocus
        />

        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancelar</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!email || mutation.isPending}
            className="btn-primary flex-1 text-sm"
          >
            {mutation.isPending ? 'Enviando...' : <><Send size={14} /> Enviar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RegistroVentasPage() {
  const [desde, setDesde]         = useState(inicioMes());
  const [hasta, setHasta]         = useState(hoy());
  const [canal, setCanal]         = useState('todos');
  const [modalEmail, setModalEmail] = useState(null); // venta seleccionada

  const params = new URLSearchParams({ desde, hasta });
  if (canal !== 'todos') params.set('canal', canal);

  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['registro-ventas', desde, hasta, canal],
    queryFn: () => api.get(`/catalogo/ventas?${params}`).then(r => r.data.data),
  });

  const totalIngresos = ventas.reduce((s, v) => s + parseFloat(v.precio_venta || 0), 0);
  const totalCosto    = ventas.reduce((s, v) => s + parseFloat(v.costo_produccion || 0), 0);
  const utilidad      = totalIngresos - totalCosto;
  const margenProm    = totalIngresos > 0 ? ((utilidad / totalIngresos) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-brand-600/15 rounded-xl flex items-center justify-center">
          <ClipboardList size={20} className="text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Registro de Ventas</h1>
          <p className="text-gray-500 text-sm">Historial completo de ventas por período</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2 text-gray-400">
          <Filter size={15} />
          <span className="text-sm font-medium text-gray-300">Filtros</span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Desde</label>
          <input type="date" className="input text-sm" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Hasta</label>
          <input type="date" className="input text-sm" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Canal</label>
          <select className="input text-sm" value={canal} onChange={e => setCanal(e.target.value)}>
            <option value="todos">Todos los canales</option>
            <option value="mostrador">Mostrador</option>
            <option value="externo">Externo</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        <div className="ml-auto text-xs text-gray-600">
          {isLoading ? 'Cargando...' : `${ventas.length} registro${ventas.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Ventas</p>
          <p className="text-2xl font-bold text-white">{ventas.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Ingresos</p>
          <p className="text-2xl font-bold text-emerald-400">
            ₡{totalIngresos.toLocaleString('es-CR', { minimumFractionDigits: 0 })}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Costo total</p>
          <p className="text-2xl font-bold text-yellow-400">
            ₡{totalCosto.toLocaleString('es-CR', { minimumFractionDigits: 0 })}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Utilidad · Margen</p>
          <p className="text-2xl font-bold text-brand-400">
            ₡{utilidad.toLocaleString('es-CR', { minimumFractionDigits: 0 })}
            <span className="text-sm text-gray-500 ml-1">({margenProm}%)</span>
          </p>
        </div>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Arreglo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Canal</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Precio venta</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Costo</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Margen</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-600">Cargando...</td></tr>
              ) : ventas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <ShoppingBag size={32} className="text-gray-700" />
                      <p className="text-gray-500 text-sm">No hay ventas en este período</p>
                    </div>
                  </td>
                </tr>
              ) : (
                ventas.map(v => {
                  const precio    = parseFloat(v.precio_venta || 0);
                  const costo     = parseFloat(v.costo_produccion || 0);
                  const margen    = precio > 0 ? (((precio - costo) / precio) * 100).toFixed(1) : '0.0';
                  const canalInfo = CANAL_LABELS[v.canal] || { label: v.canal, color: 'text-gray-400 bg-gray-700' };
                  const CanalIcon = canalInfo.icon;
                  const fecha     = new Date(v.fecha).toLocaleDateString('es-CR', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  });
                  return (
                    <tr key={v.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">{fecha}</td>
                      <td className="px-4 py-3 text-white font-medium">{v.nombre_arreglo}</td>
                      <td className="px-4 py-3 text-gray-400">{v.nombre_cliente || <span className="text-gray-700">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg ${canalInfo.color}`}>
                          {CanalIcon && <CanalIcon size={11} />}
                          {canalInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400 font-semibold">
                        ₡{precio.toLocaleString('es-CR', { minimumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right text-yellow-500">
                        ₡{costo.toLocaleString('es-CR', { minimumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${parseFloat(margen) >= 30 ? 'text-emerald-400' : parseFloat(margen) >= 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {margen}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => generarReciboPDF(v)}
                            title="Reimprimir recibo"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
                          >
                            <Printer size={15} />
                          </button>
                          <button
                            onClick={() => setModalEmail(v)}
                            title="Enviar por correo"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
                          >
                            <Mail size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {ventas.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-800 bg-gray-800/30 flex justify-between items-center">
            <p className="text-xs text-gray-600">{ventas.length} ventas mostradas (máx. 100)</p>
            <div className="flex gap-6 text-xs">
              <span className="text-gray-500">Mostrador: <span className="text-white font-medium">{ventas.filter(v => v.canal === 'mostrador').length}</span></span>
              <span className="text-gray-500">Externo: <span className="text-white font-medium">{ventas.filter(v => v.canal === 'externo').length}</span></span>
              <span className="text-gray-500">WhatsApp: <span className="text-white font-medium">{ventas.filter(v => v.canal === 'whatsapp').length}</span></span>
            </div>
          </div>
        )}
      </div>

      {/* Modal email */}
      {modalEmail && <ModalEmail venta={modalEmail} onClose={() => setModalEmail(null)} />}
    </div>
  );
}
