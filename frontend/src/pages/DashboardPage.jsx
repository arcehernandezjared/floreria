import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingBag, Trash2, TrendingUp, DollarSign,
  Package, RotateCcw, Wallet,
  CheckCircle, TrendingDown, ClipboardList
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  LineElement, PointElement, ArcElement,
  Tooltip, Legend, Filler
} from 'chart.js';
import api, { formatMoney, hoyCR } from '../utils/api';
import useAuthStore from '../store/authStore';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

const MOTIVO_LABELS = {
  marchita_tienda: 'Se marchitó en tienda',
  danada_armar: 'Se dañó al armar',
  defecto_proveedor: 'Defecto del proveedor',
  uso_interno: 'Uso interno'
};
const DONUT_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6'];

const fade = () => ({});

// ── Tarjeta grande KPI ────────────────────────────────────────────────────────
function TarjetaGrande({ Icon, titulo, valor, detalle, colorFondo, colorValor, iconBg, iconColor }) {
  return (
    <div className={`rounded-2xl p-6 border ${colorFondo}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-400 leading-snug uppercase tracking-wide">{titulo}</p>
          <p className={`text-3xl font-extrabold mt-2 leading-none tabular-nums ${colorValor}`}>{valor}</p>
          {detalle && <p className="text-sm text-gray-400 mt-2 leading-snug">{detalle}</p>}
        </div>
        <div className={`p-3 rounded-xl flex-shrink-0 ${iconBg}`}>
          <Icon size={20} className={iconColor} />
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data: dash, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data.data),
    refetchInterval: 60000
  });

  const { data: mermasPorMotivo } = useQuery({
    queryKey: ['mermas-motivo'],
    queryFn: () => api.get('/mermas/por-motivo').then(r => r.data.data)
  });

  // ── Ahorro sueldos ──
  const term = dash?.termometro_nomina || {};
  const pct = term.porcentaje_avance || 0;
  const barColor = pct >= 75 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#ef4444';
  const termMensaje =
    pct >= 75 ? '¡Vas muy bien! Ya casi llegas a la meta.' :
    pct >= 40 ? 'Vas por buen camino, sigue así.' :
    'Necesitas ahorrar un poco más esta quincena.';

  // ── Gráfica ventas 7 días ──
  const lineChartData = useMemo(() => {
    const [yr, mo, day] = hoyCR().split('-').map(Number);
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(yr, mo - 1, day - (6 - i));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const map = Object.fromEntries(
      (dash?.ventas_semana || []).map(v => {
        const key = typeof v.dia === 'string' ? v.dia.split('T')[0] : new Date(v.dia).toISOString().split('T')[0];
        return [key, v];
      })
    );
    return {
      labels: last7.map(d => {
        const dt = new Date(d + 'T12:00:00');
        return dt.toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric' });
      }),
      datasets: [{
        data: last7.map(d => parseFloat(map[d]?.ingresos || 0)),
        fill: true,
        backgroundColor: 'rgba(16,185,129,0.07)',
        borderColor: '#10b981',
        borderWidth: 2,
        tension: 0.45,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#111827',
        pointBorderWidth: 2
      }]
    };
  }, [dash?.ventas_semana]);

  const lineOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        borderWidth: 1,
        titleColor: '#9ca3af',
        bodyColor: '#f9fafb',
        padding: 10,
        callbacks: { label: ctx => `  ₡${Number(ctx.raw).toLocaleString('es-CR')}` }
      }
    },
    scales: {
      x: {
        grid: { color: '#1f2937' },
        border: { display: false },
        ticks: { color: '#6b7280', font: { size: 12 } }
      },
      y: {
        grid: { color: '#1f2937' },
        border: { display: false },
        ticks: {
          color: '#6b7280', font: { size: 12 },
          callback: v => v >= 1000 ? `₡${(v / 1000).toFixed(0)}k` : `₡${v}`
        }
      }
    }
  }), []);

  // ── Dona pérdidas ──
  const doughnutData = useMemo(() => ({
    labels: mermasPorMotivo?.map(m => MOTIVO_LABELS[m.motivo] || m.motivo) || [],
    datasets: [{
      data: mermasPorMotivo?.map(m => parseFloat(m.total_perdido)) || [],
      backgroundColor: DONUT_COLORS,
      borderWidth: 0,
      hoverOffset: 8
    }]
  }), [mermasPorMotivo]);

  const doughnutOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        borderWidth: 1,
        titleColor: '#9ca3af',
        bodyColor: '#f9fafb',
        padding: 10,
        callbacks: { label: ctx => `  ₡${Number(ctx.raw).toLocaleString('es-CR')}` }
      }
    }
  }), []);

  const totalMermasMes = useMemo(
    () => (mermasPorMotivo || []).reduce((s, m) => s + parseFloat(m.total_perdido), 0),
    [mermasPorMotivo]
  );

  const maxPerdido = useMemo(
    () => Math.max(1, ...(dash?.top_mermas_semana || []).map(x => parseFloat(x.total_perdido))),
    [dash?.top_mermas_semana]
  );

  const ventasHoyCount = dash?.ventas_hoy?.count ?? 0;
  const ventasHoyMonto = dash?.ventas_hoy?.monto ?? 0;
  const gananciaHoy = dash?.ventas_hoy?.margen ?? 0;
  const utilidadMes = dash?.utilidad_mes ?? 0;
  const mermasHoyMonto = dash?.mermas_hoy?.costo_total ?? 0;
  const mermasHoyCount = dash?.mermas_hoy?.count ?? 0;

  const saludoNombre = user?.nombre?.split(' ')[0] || 'bienvenida';
  const horaActual = new Date().getHours();
  const saludo = horaActual < 12 ? 'Buenos días' : horaActual < 18 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="space-y-6 pb-8">

      {/* ── Bienvenida ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {saludo}, {saludoNombre}
          </h1>
          <p className="text-gray-500 text-sm mt-1 capitalize">
            {new Date().toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => qc.invalidateQueries()}
          className="btn-secondary text-sm px-3 py-2 gap-1.5 flex items-center"
        >
          <RotateCcw size={14} className={isFetching ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {/* ── Tarjetas principales ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <TarjetaGrande
          Icon={ShoppingBag}
          titulo="Ventas de hoy"
          valor={ventasHoyMonto === 0 ? 'Ninguna aún' : formatMoney(ventasHoyMonto)}
          detalle={ventasHoyCount > 0 ? `${ventasHoyCount} ${ventasHoyCount === 1 ? 'venta' : 'ventas'} hoy` : 'El día apenas comienza'}
          colorFondo="bg-emerald-500/10 border-emerald-500/20"
          colorValor="text-emerald-400"
          iconBg="bg-emerald-500/15" iconColor="text-emerald-400"
          delay={0.05}
        />
        <TarjetaGrande
          Icon={DollarSign}
          titulo="Ventas del mes"
          valor={formatMoney(dash?.ventas_mes ?? 0)}
          detalle={`Ingresos totales de ${new Date().toLocaleDateString('es-CR', { month: 'long' })}`}
          colorFondo="bg-blue-500/10 border-blue-500/20"
          colorValor="text-blue-400"
          iconBg="bg-blue-500/15" iconColor="text-blue-400"
          delay={0.1}
        />
        <TarjetaGrande
          Icon={TrendingDown}
          titulo="Gastos del mes"
          valor={formatMoney(dash?.gastos_mes ?? 0)}
          detalle={`Gastos registrados de ${new Date().toLocaleDateString('es-CR', { month: 'long' })}`}
          colorFondo="bg-red-500/10 border-red-500/20"
          colorValor="text-red-400"
          iconBg="bg-red-500/15" iconColor="text-red-400"
          delay={0.15}
        />
        <TarjetaGrande
          Icon={ClipboardList}
          titulo="Pedidos pendientes"
          valor={dash?.pedidos_pendientes?.count > 0 ? `${dash.pedidos_pendientes.count} ${dash.pedidos_pendientes.count === 1 ? 'pedido' : 'pedidos'}` : 'Ninguno'}
          detalle={dash?.pedidos_pendientes?.count > 0 ? 'Pedidos esperando ser entregados' : 'Todo al día'}
          colorFondo={dash?.pedidos_pendientes?.count > 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-gray-800/50 border-gray-700'}
          colorValor={dash?.pedidos_pendientes?.count > 0 ? 'text-yellow-400' : 'text-gray-400'}
          iconBg={dash?.pedidos_pendientes?.count > 0 ? 'bg-yellow-500/15' : 'bg-gray-700/50'}
          iconColor={dash?.pedidos_pendientes?.count > 0 ? 'text-yellow-400' : 'text-gray-500'}
          delay={0.2}
        />
      </div>

      {/* ── Ahorro para sueldos ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="h-1" style={{ background: barColor }} />
        <div className="p-6">
          <div className="flex items-start justify-between mb-4 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Wallet size={16} className="text-gray-500" />
                <h2 className="text-lg font-bold text-white">Ahorro para sueldos</h2>
              </div>
              <p className="text-gray-400 text-sm">{termMensaje}</p>
              <p className="text-gray-500 text-sm mt-1">
                Meta de esta quincena:&nbsp;
                <span className="text-white font-semibold">{formatMoney(term.meta)}</span>
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-4xl font-extrabold leading-none tabular-nums" style={{ color: barColor }}>
                {pct.toFixed(0)}%
              </p>
              <p className="text-sm text-gray-500 mt-1">completado</p>
            </div>
          </div>

          <div className="relative h-5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, pct)}%`, background: `linear-gradient(90deg, ${barColor}88, ${barColor})` }}
            />
            {[25, 50, 75].map(mark => (
              <div key={mark} className="absolute top-0 bottom-0 w-px bg-gray-900/70" style={{ left: `${mark}%` }} />
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-4 border-t border-gray-800">
            <div>
              <p className="text-sm text-gray-500 mb-1">Ya ahorrado</p>
              <p className="text-xl font-bold text-white tabular-nums">{formatMoney(term.acumulado_periodo)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Días que quedan</p>
              <p className="text-xl font-bold text-white tabular-nums">{term.dias_restantes ?? '—'} días</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Necesitas ahorrar por día</p>
              <p className="text-xl font-bold text-white tabular-nums">{formatMoney(term.provision_diaria_promedio)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Gráficas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Ventas últimos 7 días */}
        <div className="card lg:col-span-3">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-gray-500" />
                <h3 className="text-base font-bold text-white">Ventas de los últimos 7 días</h3>
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Total: <span className="text-white font-semibold">{formatMoney(dash?.ventas_semana?.reduce((s, v) => s + parseFloat(v.ingresos), 0) || 0)}</span>
              </p>
            </div>
            <span className="badge badge-green text-sm px-3 py-1">
              {dash?.ventas_semana?.reduce((s, v) => s + parseInt(v.ventas), 0) || 0} ventas
            </span>
          </div>
          <div className="h-52">
            <Line data={lineChartData} options={lineOptions} />
          </div>
        </div>

        {/* Razones de pérdidas */}
        <div className="card lg:col-span-2">
          <div className="mb-4">
            <div className="flex items-center gap-2">
              <Trash2 size={16} className="text-gray-500" />
              <h3 className="text-base font-bold text-white">Por qué se pierden flores</h3>
            </div>
            <p className="text-sm text-gray-400 mt-1">
              Total perdido este mes: <span className="text-red-400 font-semibold">{formatMoney(totalMermasMes)}</span>
            </p>
          </div>

          {(mermasPorMotivo?.length || 0) === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center gap-2">
              <CheckCircle size={28} className="text-green-400" />
              <p className="text-green-400 text-sm font-medium">Sin pérdidas registradas este mes</p>
            </div>
          ) : (
            <>
              <div className="h-44 relative">
                <Doughnut data={doughnutData} options={doughnutOptions} />
              </div>
              <div className="space-y-2 mt-4">
                {mermasPorMotivo?.map((m, i) => (
                  <div key={m.motivo} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: DONUT_COLORS[i] }} />
                      <p className="text-sm text-gray-300">{MOTIVO_LABELS[m.motivo] || m.motivo}</p>
                    </div>
                    <p className="text-sm font-semibold text-white tabular-nums">{formatMoney(m.total_perdido)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Pedidos Pendientes ── */}
      {(dash?.pedidos_pendientes?.count || 0) > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                <ClipboardList size={20} className="text-yellow-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Pedidos pendientes</h3>
                <p className="text-sm text-yellow-400 font-semibold">
                  {dash.pedidos_pendientes.count} {dash.pedidos_pendientes.count === 1 ? 'pedido esperando' : 'pedidos esperando'}
                </p>
              </div>
            </div>
            <button onClick={() => navigate('/pedidos')}
              className="btn-secondary text-xs px-3 py-1.5">
              Ver todos
            </button>
          </div>
          <div className="space-y-2">
            {(dash.pedidos_pendientes.proximos || []).map(p => {
              const fecha = p.fecha
                ? new Date((typeof p.fecha === 'string' ? p.fecha : p.fecha).split('T')[0] + 'T12:00:00')
                    .toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })
                : '—';
              return (
                <div key={p.id} className="flex items-center justify-between bg-yellow-500/5 border border-yellow-500/15 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-yellow-500 tabular-nums">#{p.numero}</span>
                    <span className="text-sm text-white font-medium">{p.cliente_nombre || '(sin nombre)'}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{fecha}</p>
                    {p.hora_entrega && <p className="text-xs text-yellow-400 font-medium">{p.hora_entrega}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Alertas inventario ── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Package size={16} className="text-gray-500" />
          <h3 className="text-base font-bold text-white">Materiales que se están acabando</h3>
          {(dash?.stock_bajo?.length || 0) > 0 && (
            <span className="ml-auto badge badge-yellow text-sm">{dash.stock_bajo.length} alertas</span>
          )}
        </div>

        {(dash?.stock_bajo?.length || 0) === 0 ? (
          <div className="flex items-center gap-3 text-green-400">
            <CheckCircle size={20} />
            <p className="text-sm font-medium">Todo el inventario está bien abastecido</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dash.stock_bajo.slice(0, 6).map(item => {
              const ratio = item.stock_minimo > 0
                ? Math.min(100, (parseFloat(item.stock_actual) / parseFloat(item.stock_minimo)) * 100)
                : 100;
              const isEmpty = parseFloat(item.stock_actual) === 0;
              return (
                <div key={item.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{item.nombre}</p>
                      <p className="text-xs text-gray-500">{item.categoria_nombre}</p>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <p className={`text-sm font-bold tabular-nums ${isEmpty ? 'text-red-400' : 'text-yellow-400'}`}>
                        {parseFloat(item.stock_actual)} {item.unidad}
                      </p>
                      <p className="text-xs text-gray-600">mínimo: {item.stock_minimo}</p>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isEmpty ? 'bg-red-500' : 'bg-yellow-500'}`}
                      style={{ width: `${Math.max(3, ratio)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Pérdidas de esta semana ── */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <Trash2 size={16} className="text-gray-500" />
          <h3 className="text-base font-bold text-white">Flores más perdidas esta semana</h3>
        </div>

        {(dash?.top_mermas_semana?.length || 0) === 0 ? (
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-green-400" />
            <p className="text-sm text-green-400 font-medium">Ninguna pérdida registrada esta semana</p>
          </div>
        ) : (
          <div className="space-y-4">
            {dash.top_mermas_semana.map((m, i) => {
              const pctBar = (parseFloat(m.total_perdido) / maxPerdido) * 100;
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-gray-500 w-5 text-center flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-medium text-white truncate">{m.insumo_nombre}</p>
                      <div className="text-right ml-3 flex-shrink-0">
                        <p className="text-sm font-bold text-red-400 tabular-nums">{formatMoney(m.total_perdido)}</p>
                        <p className="text-xs text-gray-500">{parseFloat(m.total_unidades).toFixed(0)} unidades</p>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500/50 rounded-full" style={{ width: `${pctBar}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
