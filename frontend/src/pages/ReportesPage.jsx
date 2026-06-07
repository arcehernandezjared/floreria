import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart2, TrendingUp, Package, Trash2, DollarSign,
  FileText, Sheet, Calendar, ChevronDown
} from 'lucide-react';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement, Tooltip, Legend, Filler
} from 'chart.js';
import api, { formatMoney } from '../utils/api';
import { motion } from 'framer-motion';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

// ── Constantes ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'ventas',      label: 'Ventas',      icon: TrendingUp  },
  { id: 'inventario',  label: 'Inventario',  icon: Package     },
  { id: 'mermas',      label: 'Mermas',      icon: Trash2      },
  { id: 'financiero',  label: 'Financiero',  icon: DollarSign  },
];

const PRESETS = [
  { label: 'Este mes',        days: 0,   type: 'month'  },
  { label: 'Mes anterior',    days: -1,  type: 'month'  },
  { label: 'Últimos 30 días', days: 30,  type: 'days'   },
  { label: 'Últimos 90 días', days: 90,  type: 'days'   },
  { label: 'Este año',        days: 0,   type: 'year'   },
  { label: 'Personalizado',   days: -99, type: 'custom' },
];

const MOTIVO_ES = {
  marchita_tienda: 'Marchita tienda', danada_armar: 'Dañada al armar',
  defecto_proveedor: 'Defecto proveedor', uso_interno: 'Uso interno'
};
const CANAL_ES = { mostrador: 'Mostrador', externo: 'Externo', whatsapp: 'WhatsApp', todos: 'Todos' };
const DONUT_COLORS = ['#ef4444','#f59e0b','#8b5cf6','#3b82f6','#10b981','#ec4899'];
const BRAND = '#10b981';

const chartBase = {
  responsive: true, maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: '#1f2937', borderColor: '#374151', borderWidth: 1, titleColor: '#9ca3af', bodyColor: '#f9fafb', padding: 10 }
  },
  scales: {
    x: { grid: { color: '#1f2937' }, border: { display: false }, ticks: { color: '#6b7280', font: { size: 11 } } },
    y: { grid: { color: '#1f2937' }, border: { display: false }, ticks: { color: '#6b7280', font: { size: 11 }, callback: v => v >= 1000 ? `₡${(v/1000).toFixed(0)}k` : `₡${v}` } }
  }
};

// ── Helpers de rango de fechas ────────────────────────────────────────────────
function calcRange(presetIdx) {
  const hoy = new Date();
  const fmt = d => d.toISOString().split('T')[0];
  const p = PRESETS[presetIdx];
  if (p.type === 'month') {
    const ref = new Date(hoy.getFullYear(), hoy.getMonth() + p.days, 1);
    const fin = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    return { desde: fmt(ref), hasta: fmt(fin) };
  }
  if (p.type === 'year') {
    return { desde: `${hoy.getFullYear()}-01-01`, hasta: fmt(hoy) };
  }
  if (p.type === 'days') {
    const ini = new Date(); ini.setDate(ini.getDate() - p.days);
    return { desde: fmt(ini), hasta: fmt(hoy) };
  }
  return null;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function Kpi({ title, value, sub, color = '#10b981' }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="h-[3px]" style={{ background: color }} />
      <div className="p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
        <p className="text-xl font-bold text-white mt-1.5 tabular-nums leading-none">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ── Estado badge ──────────────────────────────────────────────────────────────
function EstadoBadge({ estado }) {
  const map = { ok: 'badge-green', bajo: 'badge-yellow', agotado: 'badge-red' };
  const lbl = { ok: 'OK', bajo: 'Bajo', agotado: 'Agotado' };
  return <span className={`badge ${map[estado] || 'badge-blue'}`}>{lbl[estado] || estado}</span>;
}

// ── Formato moneda para PDF (jsPDF no soporta ₡ en WinAnsi) ─────────────────
function fmtPDF(n) {
  return 'CRC ' + Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Exportar PDF ──────────────────────────────────────────────────────────────
function exportPDF(tab, data, periodo) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const dateStr = new Date().toLocaleDateString('es-CR', { year: 'numeric', month: 'long', day: 'numeric' });
  const periodoStr = periodo ? `${periodo.desde} al ${periodo.hasta}` : 'Inventario actual';
  const titles = { ventas: 'Reporte de Ventas', inventario: 'Reporte de Inventario', mermas: 'Reporte de Mermas', financiero: 'Reporte Financiero' };

  // ─ Header ─
  doc.setFillColor(6, 78, 59);
  doc.rect(0, 0, W, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Floristería Alma Caribeña', 14, 16);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(titles[tab] || 'Reporte', 14, 25);
  doc.setFontSize(9);
  doc.text(`Período: ${periodoStr}`, 14, 32);
  doc.setFontSize(9);
  doc.text(`Generado: ${dateStr}`, W - 14, 32, { align: 'right' });

  let y = 46;

  const sectionTitle = (txt) => {
    doc.setFillColor(240, 253, 244);
    doc.rect(0, y - 4, W, 9, 'F');
    doc.setTextColor(6, 78, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(txt.toUpperCase(), 14, y + 2);
    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'normal');
    y += 12;
  };

  const kpiRow = (items) => {
    const boxW = (W - 28) / items.length;
    items.forEach((item, i) => {
      const x = 14 + i * (boxW + 3);
      doc.setFillColor(249, 250, 251);
      doc.roundedRect(x, y, boxW, 18, 2, 2, 'F');
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(x, y, boxW, 18, 2, 2, 'S');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(item.label, x + boxW / 2, y + 6, { align: 'center' });
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 24, 39);
      doc.text(String(item.value), x + boxW / 2, y + 14, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    });
    y += 24;
  };

  const addTable = (head, rows, opts = {}) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [6, 78, 59], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: [31, 41, 55] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
      ...opts
    });
    y = doc.lastAutoTable.finalY + 8;
  };

  // ─ Contenido por tipo ─
  if (tab === 'ventas' && data) {
    const r = data.resumen || {};
    sectionTitle('Resumen Ejecutivo');
    kpiRow([
      { label: 'Total Ventas', value: r.total_ventas || 0 },
      { label: 'Ingresos', value: fmtPDF(r.total_ingresos) },
      { label: 'Ticket Promedio', value: fmtPDF(r.ticket_promedio) }
    ]);
    sectionTitle('Top Productos');
    addTable(
      ['Producto', 'Veces vendido', 'Total ingresos', 'Precio promedio'],
      (data.topProductos || []).map(p => [p.nombre_arreglo, p.veces, fmtPDF(p.total), fmtPDF(p.promedio)])
    );
    sectionTitle('Ventas por Canal');
    addTable(
      ['Canal', 'Cantidad', 'Ingresos'],
      (data.porCanal || []).map(c => [CANAL_ES[c.canal] || c.canal, c.ventas, fmtPDF(c.ingresos)])
    );
    sectionTitle('Detalle de Ventas');
    addTable(
      ['Producto', 'Precio', 'Costo', 'Canal', 'Cliente', 'Fecha'],
      (data.detalle || []).slice(0, 50).map(v => [
        v.nombre_arreglo, fmtPDF(v.precio_venta), fmtPDF(v.costo_produccion),
        CANAL_ES[v.canal] || v.canal, v.nombre_cliente || '-',
        new Date(v.fecha).toLocaleDateString('es-CR')
      ])
    );
  }

  if (tab === 'inventario' && data) {
    const r = data.resumen || {};
    sectionTitle('Resumen de Inventario');
    kpiRow([
      { label: 'Total Items', value: r.total_items || 0 },
      { label: 'Valor Total', value: fmtPDF(r.valor_total) },
      { label: 'Agotados', value: r.agotados || 0 },
      { label: 'Bajo Minimo', value: r.bajo_minimo || 0 }
    ]);
    sectionTitle('Inventario Completo');
    addTable(
      ['Insumo', 'Categoria', 'Stock', 'Minimo', 'Unidad', 'Costo Unit.', 'Valor Stock', 'Estado'],
      (data.insumos || []).map(i => [
        i.nombre, i.categoria,
        parseFloat(i.stock_actual).toFixed(1),
        parseFloat(i.stock_minimo).toFixed(1),
        i.unidad, fmtPDF(i.costo_unitario),
        fmtPDF(i.valor_stock), i.estado.toUpperCase()
      ])
    );
  }

  if (tab === 'mermas' && data) {
    const r = data.resumen || {};
    sectionTitle('Resumen de Mermas');
    kpiRow([
      { label: 'Registros', value: r.total_registros || 0 },
      { label: 'Perdida Total', value: fmtPDF(r.perdida_total) },
      { label: 'Promedio/Registro', value: fmtPDF(r.perdida_promedio) },
      { label: 'Total Unidades', value: parseFloat(r.total_unidades || 0).toFixed(0) }
    ]);
    sectionTitle('Perdidas por Motivo');
    addTable(
      ['Motivo', 'Registros', 'Perdida Total'],
      (data.porMotivo || []).map(m => [MOTIVO_ES[m.motivo] || m.motivo, m.cantidad, fmtPDF(m.total)])
    );
    sectionTitle('Top Insumos con Merma');
    addTable(
      ['Insumo', 'Registros', 'Unidades', 'Perdida'],
      (data.topInsumos || []).map(m => [m.nombre, m.registros, parseFloat(m.unidades).toFixed(1), fmtPDF(m.perdida)])
    );
    sectionTitle('Detalle de Mermas');
    addTable(
      ['Insumo', 'Cantidad', 'Costo', 'Motivo', 'Notas', 'Fecha'],
      (data.detalle || []).slice(0, 60).map(m => [
        m.insumo, parseFloat(m.cantidad).toFixed(1), fmtPDF(m.costo_total),
        MOTIVO_ES[m.motivo] || m.motivo, m.notas || '-',
        new Date(m.fecha).toLocaleDateString('es-CR')
      ])
    );
  }

  if (tab === 'financiero' && data) {
    sectionTitle('Estado Financiero');
    kpiRow([
      { label: 'Ingresos', value: fmtPDF(data.ingresos) },
      { label: 'Ahorros Nomina', value: fmtPDF(data.nomina) },
      { label: 'Gastos + Mermas', value: fmtPDF(data.total_gastos + data.mermas) },
      { label: 'Rentabilidad', value: fmtPDF(data.rentabilidad) }
    ]);
    sectionTitle('Desglose de Egresos');
    addTable(
      ['Concepto', 'Monto', '% del Ingreso'],
      [
        ['Ahorros nomina', fmtPDF(data.nomina), data.ingresos > 0 ? `${((data.nomina / data.ingresos) * 100).toFixed(1)}%` : '0%'],
        ['Mermas (perdidas)', fmtPDF(data.mermas), data.ingresos > 0 ? `${((data.mermas / data.ingresos) * 100).toFixed(1)}%` : '0%'],
        ['Gastos operativos', fmtPDF(data.total_gastos), data.ingresos > 0 ? `${((data.total_gastos / data.ingresos) * 100).toFixed(1)}%` : '0%'],
      ]
    );
    if ((data.gastos || []).length) {
      sectionTitle('Gastos por Categoria');
      addTable(
        ['Categoria', 'Total'],
        (data.gastos || []).map(g => [g.categoria, fmtPDF(g.total)])
      );
    }
  }

  // ─ Footer ─
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text('Floristería Alma Caribeña — Reporte generado automáticamente', 14, 290);
    doc.text(`Página ${i} de ${pageCount}`, W - 14, 290, { align: 'right' });
  }

  doc.save(`reporte_${tab}_${new Date().toISOString().split('T')[0]}.pdf`);
}

// ── Exportar Excel ────────────────────────────────────────────────────────────
function exportExcel(tab, data, periodo) {
  const wb = XLSX.utils.book_new();
  const periodoStr = periodo ? `${periodo.desde} al ${periodo.hasta}` : 'Inventario actual';

  const headerRow = [`FLORISTERÍA ALMA CARIBEÑA — ${tab.toUpperCase()} | ${periodoStr}`];

  const addSheet = (name, cols, rows) => {
    const sheetData = [headerRow, [], cols, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }];
    ws['!cols'] = cols.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
  };

  if (tab === 'ventas' && data) {
    const r = data.resumen || {};
    addSheet('Resumen', ['Métrica', 'Valor'], [
      ['Total ventas', r.total_ventas || 0],
      ['Ingresos totales', parseFloat(r.total_ingresos || 0)],
      ['Ticket promedio', parseFloat(r.ticket_promedio || 0)],
    ]);
    addSheet('Top Productos', ['Producto', 'Veces vendido', 'Total ingresos (₡)', 'Precio prom (₡)'],
      (data.topProductos || []).map(p => [p.nombre_arreglo, p.veces, parseFloat(p.total), parseFloat(p.promedio)])
    );
    addSheet('Por Canal', ['Canal', 'Ventas', 'Ingresos (₡)'],
      (data.porCanal || []).map(c => [CANAL_ES[c.canal] || c.canal, c.ventas, parseFloat(c.ingresos)])
    );
    addSheet('Detalle Ventas', ['Producto', 'Precio (₡)', 'Costo (₡)', 'Canal', 'Cliente', 'Fecha'],
      (data.detalle || []).map(v => [
        v.nombre_arreglo, parseFloat(v.precio_venta), parseFloat(v.costo_produccion),
        CANAL_ES[v.canal] || v.canal, v.nombre_cliente || '',
        new Date(v.fecha).toLocaleDateString('es-CR')
      ])
    );
    addSheet('Tendencia Diaria', ['Fecha', 'Ventas', 'Ingresos (₡)'],
      (data.porDia || []).map(d => [d.dia, d.ventas, parseFloat(d.ingresos)])
    );
  }

  if (tab === 'inventario' && data) {
    const r = data.resumen || {};
    addSheet('Resumen', ['Métrica', 'Valor'], [
      ['Total ítems', r.total_items || 0],
      ['Valor total inventario (₡)', parseFloat(r.valor_total || 0)],
      ['Ítems agotados', r.agotados || 0],
      ['Ítems bajo mínimo', r.bajo_minimo || 0],
    ]);
    addSheet('Inventario', ['Insumo', 'Categoría', 'Stock actual', 'Stock mínimo', 'Unidad', 'Costo unit (₡)', 'Valor stock (₡)', 'Estado'],
      (data.insumos || []).map(i => [
        i.nombre, i.categoria, parseFloat(i.stock_actual), parseFloat(i.stock_minimo),
        i.unidad, parseFloat(i.costo_unitario), parseFloat(i.valor_stock), i.estado
      ])
    );
    addSheet('Por Categoría', ['Categoría', 'Total ítems', 'Valor (₡)'],
      (data.porCategoria || []).map(c => [c.categoria, c.total, parseFloat(c.valor)])
    );
  }

  if (tab === 'mermas' && data) {
    const r = data.resumen || {};
    addSheet('Resumen', ['Métrica', 'Valor'], [
      ['Total registros', r.total_registros || 0],
      ['Pérdida total (₡)', parseFloat(r.perdida_total || 0)],
      ['Pérdida promedio (₡)', parseFloat(r.perdida_promedio || 0)],
      ['Unidades perdidas', parseFloat(r.total_unidades || 0)],
    ]);
    addSheet('Por Motivo', ['Motivo', 'Cantidad', 'Pérdida (₡)'],
      (data.porMotivo || []).map(m => [MOTIVO_ES[m.motivo] || m.motivo, m.cantidad, parseFloat(m.total)])
    );
    addSheet('Top Insumos', ['Insumo', 'Registros', 'Unidades', 'Pérdida (₡)'],
      (data.topInsumos || []).map(m => [m.nombre, m.registros, parseFloat(m.unidades), parseFloat(m.perdida)])
    );
    addSheet('Detalle Mermas', ['Insumo', 'Cantidad', 'Costo (₡)', 'Motivo', 'Notas', 'Fecha'],
      (data.detalle || []).map(m => [
        m.insumo, parseFloat(m.cantidad), parseFloat(m.costo_total),
        MOTIVO_ES[m.motivo] || m.motivo, m.notas || '',
        new Date(m.fecha).toLocaleDateString('es-CR')
      ])
    );
  }

  if (tab === 'financiero' && data) {
    addSheet('Financiero', ['Concepto', 'Monto (₡)'], [
      ['Ingresos totales', data.ingresos],
      ['Ahorros nómina', data.nomina],
      ['Mermas (pérdidas)', data.mermas],
      ['Gastos operativos', data.total_gastos],
      ['Rentabilidad', data.rentabilidad],
      ['Total ventas (cantidad)', data.total_ventas],
    ]);
    if ((data.gastos || []).length) {
      addSheet('Gastos', ['Categoría', 'Monto (₡)'],
        (data.gastos || []).map(g => [g.categoria, parseFloat(g.total)])
      );
    }
    addSheet('Tendencia', ['Fecha', 'Ingresos (₡)'],
      (data.tendencia || []).map(d => [d.dia, parseFloat(d.ingresos)])
    );
  }

  XLSX.writeFile(wb, `reporte_${tab}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ── Sub-reportes ──────────────────────────────────────────────────────────────
function ReporteVentas({ data }) {
  if (!data) return <Empty />;
  const r = data.resumen || {};
  const topMax = Math.max(1, ...(data.topProductos || []).map(p => parseFloat(p.total)));

  const lineData = useMemo(() => ({
    labels: (data.porDia || []).map(d => {
      const dateStr = typeof d.dia === 'string' ? d.dia.split('T')[0] : new Date(d.dia).toISOString().split('T')[0];
      const dt = new Date(dateStr + 'T12:00:00');
      return dt.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });
    }),
    datasets: [{
      data: (data.porDia || []).map(d => parseFloat(d.ingresos)),
      fill: true, backgroundColor: 'rgba(16,185,129,0.08)', borderColor: BRAND,
      borderWidth: 2, tension: 0.4, pointRadius: 3, pointBackgroundColor: BRAND,
      pointBorderColor: '#111827', pointBorderWidth: 2
    }]
  }), [data.porDia]);

  const canalData = useMemo(() => ({
    labels: (data.porCanal || []).map(c => CANAL_ES[c.canal] || c.canal),
    datasets: [{
      data: (data.porCanal || []).map(c => parseFloat(c.ingresos)),
      backgroundColor: DONUT_COLORS, borderWidth: 0, hoverOffset: 6
    }]
  }), [data.porCanal]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Kpi title="Total Ventas" value={r.total_ventas || 0} sub="transacciones" color="#10b981" />
        <Kpi title="Ingresos Totales" value={formatMoney(r.total_ingresos)} color="#3b82f6" />
        <Kpi title="Ticket Promedio" value={formatMoney(r.ticket_promedio)} color="#8b5cf6" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Ingresos por Día</p>
          <div className="h-52"><Line data={lineData} options={chartBase} /></div>
        </div>
        <div className="card">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Ventas por Canal</p>
          {(data.porCanal || []).length === 0 ? <Empty small /> : (
            <>
              <div className="h-36"><Doughnut data={canalData} options={{ ...chartBase, cutout: '65%', scales: undefined }} /></div>
              <div className="space-y-1.5 mt-3">
                {(data.porCanal || []).map((c, i) => (
                  <div key={c.canal} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: DONUT_COLORS[i] }} />
                      <span className="text-gray-400">{CANAL_ES[c.canal] || c.canal}</span>
                    </div>
                    <span className="text-white font-medium">{formatMoney(c.ingresos)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Top 10 Productos</p>
        {(data.topProductos || []).length === 0 ? <Empty small /> : (
          <div className="space-y-3">
            {(data.topProductos || []).map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-600 w-5 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-white truncate">{p.nombre_arreglo}</p>
                    <div className="text-right ml-3 flex-shrink-0">
                      <p className="text-sm font-bold text-white tabular-nums">{formatMoney(p.total)}</p>
                      <p className="text-xs text-gray-600">{p.veces}× · prom {formatMoney(p.promedio)}</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(parseFloat(p.total) / topMax) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Tabla
        title="Detalle de Ventas"
        cols={['Producto', 'Precio', 'Costo', 'Canal', 'Cliente', 'Fecha']}
        rows={(data.detalle || []).map(v => [
          v.nombre_arreglo, formatMoney(v.precio_venta), formatMoney(v.costo_produccion),
          CANAL_ES[v.canal] || v.canal, v.nombre_cliente || '—',
          new Date(v.fecha).toLocaleDateString('es-CR')
        ])}
      />
    </div>
  );
}

function ReporteInventario({ data }) {
  if (!data) return <Empty />;
  const r = data.resumen || {};

  const barData = useMemo(() => ({
    labels: (data.porCategoria || []).map(c => c.categoria),
    datasets: [{
      data: (data.porCategoria || []).map(c => parseFloat(c.valor)),
      backgroundColor: DONUT_COLORS, borderRadius: 6, borderWidth: 0
    }]
  }), [data.porCategoria]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Total Ítems" value={r.total_items || 0} color="#10b981" />
        <Kpi title="Valor en Inventario" value={formatMoney(r.valor_total)} color="#3b82f6" />
        <Kpi title="Agotados" value={r.agotados || 0} sub="sin stock" color="#ef4444" />
        <Kpi title="Bajo Mínimo" value={r.bajo_minimo || 0} sub="requieren recompra" color="#f59e0b" />
      </div>

      <div className="card">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Valor por Categoría</p>
        <div className="h-52">
          <Bar data={barData} options={{ ...chartBase, plugins: { ...chartBase.plugins, legend: { display: false } } }} />
        </div>
      </div>

      <Tabla
        title="Inventario Completo"
        cols={['Insumo', 'Categoría', 'Stock', 'Mínimo', 'Unidad', 'Costo Unit.', 'Valor Stock', 'Estado']}
        rows={(data.insumos || []).map(i => [
          i.nombre, i.categoria,
          <span key="s" className={parseFloat(i.stock_actual) === 0 ? 'text-red-400 font-semibold' : parseFloat(i.stock_actual) <= parseFloat(i.stock_minimo) ? 'text-yellow-400' : 'text-white'}>{parseFloat(i.stock_actual).toFixed(1)}</span>,
          parseFloat(i.stock_minimo).toFixed(1), i.unidad,
          formatMoney(i.costo_unitario), formatMoney(i.valor_stock),
          <EstadoBadge key="e" estado={i.estado} />
        ])}
      />
    </div>
  );
}

function ReporteMermas({ data }) {
  if (!data) return <Empty />;
  const r = data.resumen || {};

  const donutData = useMemo(() => ({
    labels: (data.porMotivo || []).map(m => MOTIVO_ES[m.motivo] || m.motivo),
    datasets: [{ data: (data.porMotivo || []).map(m => parseFloat(m.total)), backgroundColor: DONUT_COLORS, borderWidth: 0, hoverOffset: 6 }]
  }), [data.porMotivo]);

  const topMax = Math.max(1, ...(data.topInsumos || []).map(m => parseFloat(m.perdida)));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Registros" value={r.total_registros || 0} color="#ef4444" />
        <Kpi title="Pérdida Total" value={formatMoney(r.perdida_total)} color="#ef4444" />
        <Kpi title="Promedio / Registro" value={formatMoney(r.perdida_promedio)} color="#f59e0b" />
        <Kpi title="Unidades Perdidas" value={parseFloat(r.total_unidades || 0).toFixed(0)} color="#8b5cf6" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Pérdida por Motivo</p>
          {(data.porMotivo || []).length === 0 ? <Empty small /> : (
            <>
              <div className="h-40"><Doughnut data={donutData} options={{ ...chartBase, cutout: '65%', scales: undefined }} /></div>
              <div className="space-y-2 mt-3">
                {(data.porMotivo || []).map((m, i) => (
                  <div key={m.motivo} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: DONUT_COLORS[i] }} />
                      <span className="text-gray-400">{MOTIVO_ES[m.motivo] || m.motivo}</span>
                    </div>
                    <span className="text-white font-medium">{formatMoney(m.total)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Top Insumos con Merma</p>
          {(data.topInsumos || []).length === 0 ? <Empty small /> : (
            <div className="space-y-3">
              {(data.topInsumos || []).map((m, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-600 w-5 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm text-white truncate">{m.nombre}</p>
                      <p className="text-xs font-bold text-red-400 ml-2">{formatMoney(m.perdida)}</p>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full">
                      <div className="h-full bg-red-500/60 rounded-full" style={{ width: `${(parseFloat(m.perdida) / topMax) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Tabla
        title="Detalle de Mermas"
        cols={['Insumo', 'Cantidad', 'Pérdida', 'Motivo', 'Notas', 'Fecha']}
        rows={(data.detalle || []).map(m => [
          m.insumo, parseFloat(m.cantidad).toFixed(1), formatMoney(m.costo_total),
          MOTIVO_ES[m.motivo] || m.motivo, m.notas || '—',
          new Date(m.fecha).toLocaleDateString('es-CR')
        ])}
      />
    </div>
  );
}

function ReporteFinanciero({ data }) {
  if (!data) return <Empty />;

  const rentColor = (data.rentabilidad ?? 0) >= 0 ? '#10b981' : '#ef4444';

  const lineData = useMemo(() => {
    const dias = (data.tendencia || []).map(d => {
      const dateStr = typeof d.dia === 'string' ? d.dia.split('T')[0] : new Date(d.dia).toISOString().split('T')[0];
      const dt = new Date(dateStr + 'T12:00:00');
      return dt.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });
    });
    return {
      labels: dias,
      datasets: [
        { label: 'Ingresos', data: (data.tendencia || []).map(d => parseFloat(d.ingresos)), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 2 }
      ]
    };
  }, [data.tendencia]);

  const ingresos = data.ingresos || 0;
  const nominaPct  = ingresos > 0 ? ((data.nomina || 0) / ingresos * 100) : 0;
  const mermasPct  = ingresos > 0 ? (data.mermas / ingresos * 100) : 0;
  const gastosPct  = ingresos > 0 ? (data.total_gastos / ingresos * 100) : 0;
  const rentPct    = ingresos > 0 ? ((data.rentabilidad || 0) / ingresos * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Ingresos Totales" value={formatMoney(data.ingresos)} sub={`${data.total_ventas} ventas`} color="#10b981" />
        <Kpi title="Ahorros Nómina" value={formatMoney(data.nomina || 0)} sub="provisiones del período" color="#3b82f6" />
        <Kpi title="Gastos + Mermas" value={formatMoney((data.total_gastos || 0) + (data.mermas || 0))} sub="egresos operativos" color="#f59e0b" />
        <Kpi title="Rentabilidad" value={formatMoney(data.rentabilidad || 0)} sub={`${rentPct.toFixed(1)}% del ingreso`} color={rentColor} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Tendencia de Ingresos</p>
          <div className="h-52">
            <Line data={lineData} options={{ ...chartBase, plugins: { ...chartBase.plugins, legend: { display: false } } }} />
          </div>
        </div>

        <div className="card">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Distribución del Ingreso</p>
          <div className="space-y-3">
            {[
              { label: 'Ahorros nómina', pct: nominaPct,  color: '#3b82f6', value: data.nomina || 0 },
              { label: 'Mermas',         pct: mermasPct,  color: '#f59e0b', value: data.mermas },
              { label: 'Gastos',         pct: gastosPct,  color: '#8b5cf6', value: data.total_gastos },
              { label: 'Rentabilidad',   pct: rentPct,    color: '#10b981', value: data.rentabilidad || 0 },
            ].map(item => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{item.label}</span>
                  <span className="text-xs font-semibold text-white">{formatMoney(item.value)} ({item.pct.toFixed(1)}%)</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, item.pct))}%`, background: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {(data.gastos || []).length > 0 && (
        <Tabla
          title="Gastos por Categoría"
          cols={['Categoría', 'Monto', '% del Total']}
          rows={(data.gastos || []).map(g => [
            g.categoria,
            formatMoney(g.total),
            `${ingresos > 0 ? ((parseFloat(g.total) / ingresos) * 100).toFixed(1) : 0}%`
          ])}
        />
      )}
    </div>
  );
}

// ── Componentes helper ────────────────────────────────────────────────────────
function Tabla({ title, cols, rows }) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-gray-800">
            <tr>{cols.map(c => <th key={c} className="th">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={cols.length} className="td text-center text-gray-600 py-8">Sin datos en el período</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="table-row">
                {row.map((cell, j) => <td key={j} className="td">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Empty({ small }) {
  if (small) return <p className="text-gray-600 text-sm text-center py-6">Sin datos en el período</p>;
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-700">
      <BarChart2 size={40} className="mb-3 opacity-30" />
      <p className="text-sm">Sin datos para mostrar</p>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ReportesPage() {
  const [tab, setTab] = useState('ventas');
  const [presetIdx, setPresetIdx] = useState(0);
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [showPreset, setShowPreset] = useState(false);

  const isCustom = presetIdx === 5;
  const range = useMemo(() => {
    if (isCustom) return customDesde && customHasta ? { desde: customDesde, hasta: customHasta } : null;
    return calcRange(presetIdx);
  }, [presetIdx, customDesde, customHasta, isCustom]);

  const params = range ? { desde: range.desde, hasta: range.hasta } : {};

  const { data: ventasData, isFetching: fV } = useQuery({ queryKey: ['rep-ventas', params], queryFn: () => api.get('/reportes/ventas', { params }).then(r => r.data.data), enabled: tab === 'ventas' && !!range });
  const { data: invData,    isFetching: fI } = useQuery({ queryKey: ['rep-inventario'],       queryFn: () => api.get('/reportes/inventario').then(r => r.data.data),                  enabled: tab === 'inventario' });
  const { data: mermasData, isFetching: fM } = useQuery({ queryKey: ['rep-mermas', params],   queryFn: () => api.get('/reportes/mermas', { params }).then(r => r.data.data),           enabled: tab === 'mermas' && !!range });
  const { data: finData,    isFetching: fF } = useQuery({ queryKey: ['rep-financiero', params],queryFn: () => api.get('/reportes/financiero', { params }).then(r => r.data.data),       enabled: tab === 'financiero' && !!range });

  const activeData = { ventas: ventasData, inventario: invData, mermas: mermasData, financiero: finData }[tab];
  const isFetching = fV || fI || fM || fF;

  const handleExportPDF   = () => exportPDF(tab, activeData, range);
  const handleExportExcel = () => exportExcel(tab, activeData, range);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reportes</h1>
          <p className="text-gray-500 text-sm mt-0.5">Estadísticas y análisis del negocio</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector período */}
          <div className="relative">
            <button
              onClick={() => setShowPreset(p => !p)}
              className="btn-secondary text-sm gap-2"
            >
              <Calendar size={14} />
              {PRESETS[presetIdx].label}
              <ChevronDown size={13} />
            </button>
            {showPreset && (
              <div className="absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-20 min-w-44 py-1">
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => { setPresetIdx(i); setShowPreset(false); }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${presetIdx === i ? 'text-brand-400 bg-brand-500/10' : 'text-gray-300 hover:bg-gray-800'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isCustom && (
            <div className="flex items-center gap-2">
              <input type="date" className="input py-1.5 text-sm w-36" value={customDesde} onChange={e => setCustomDesde(e.target.value)} />
              <span className="text-gray-600 text-sm">—</span>
              <input type="date" className="input py-1.5 text-sm w-36" value={customHasta} onChange={e => setCustomHasta(e.target.value)} />
            </div>
          )}

          <button onClick={handleExportPDF} disabled={!activeData} className="btn-secondary text-sm gap-2 disabled:opacity-40">
            <FileText size={14} /> PDF
          </button>
          <button onClick={handleExportExcel} disabled={!activeData} className="btn-secondary text-sm gap-2 disabled:opacity-40">
            <Sheet size={14} /> Excel
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-2xl p-1 w-fit">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Período info */}
      {range && (
        <p className="text-xs text-gray-600">
          Período: <span className="text-gray-400">{range.desde}</span> al <span className="text-gray-400">{range.hasta}</span>
          {isFetching && <span className="ml-2 text-brand-500">· Actualizando...</span>}
        </p>
      )}

      {/* Contenido */}
      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
        {tab === 'ventas'     && <ReporteVentas     data={ventasData} />}
        {tab === 'inventario' && <ReporteInventario data={invData} />}
        {tab === 'mermas'     && <ReporteMermas     data={mermasData} />}
        {tab === 'financiero' && <ReporteFinanciero data={finData} />}
      </motion.div>
    </div>
  );
}
